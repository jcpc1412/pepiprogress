/**
 * Data facade (beta-feedback A-4): the single selector layer every surface reads
 * from, so charts, the verdict, deterministic answers, and AI prompts always see
 * the SAME data assembled by the SAME rules. Before this, each consumer hand-
 * rolled its own view of the store (the insights AI reasoned over a different
 * dataset than the charts rendered, and could frame a move against the user's
 * goal as good because it never received the goal-direction rules).
 *
 * Pure functions over a store slice ({@link FacadeInput}); `today` is a parameter
 * so everything is deterministic + unit-testable. No RN / network imports.
 */

import { compoundBySlug } from '@/data/compound-catalog';
import {
  buildMetricSeries,
  CHART_METRICS,
  DEFAULT_CHART_METRIC_IDS,
  type MetricSeries,
} from '@/lib/chart-series';
import { daysBetween } from '@/lib/dates';
import {
  computeVerdict,
  resolveMetricDirections,
  type MetricFavourDir,
  type Verdict,
} from '@/lib/verdict-engine';
import type { InsightHistory } from '@/lib/ai';
import type {
  CheckinEntry,
  ContextNote,
  DoseEvent,
  LocalProfile,
  MetricReading,
  PhotoEntry,
  PhotoSession,
  ProtocolItem,
  SymptomEvent,
} from '@/lib/store';

/** The store slice the facade reads. Callers pass `useStore()` fields directly. */
export type FacadeInput = {
  entries: Record<string, CheckinEntry>;
  metricReadings: MetricReading[];
  protocolItems: ProtocolItem[];
  photos: PhotoEntry[];
  symptomEvents: SymptomEvent[];
  doseEvents: DoseEvent[];
  profile: LocalProfile;
  /** Context-memory notes (W3-10): explained days leave baselines; the notes
   *  themselves ride into the AI history. Optional so callers adopt gradually. */
  contextNotes?: ContextNote[];
};

const round1 = (v: number): number => Math.round(v * 10) / 10;

/** Today's verdict. Thin wrapper over the engine so every surface computes it the
 *  same way (was duplicated in the useVerdict hook). */
export function selectVerdict(
  input: Pick<FacadeInput, 'entries' | 'metricReadings' | 'protocolItems' | 'photos' | 'profile'>,
  today: string,
): Verdict {
  return computeVerdict({
    entries: input.entries,
    metricReadings: input.metricReadings,
    protocolItems: input.protocolItems,
    photos: input.photos,
    profile: input.profile,
    today,
  });
}

/** Resolved "which way is good" per charted metric, for the user's goals + active
 *  compounds. The one source consumers (incl. AI prompts) share so nothing ever
 *  contradicts the verdict engine. */
export function selectMetricDirections(
  input: Pick<FacadeInput, 'profile' | 'protocolItems'>,
): Record<string, MetricFavourDir> {
  return resolveMetricDirections(input.profile.goals, input.protocolItems);
}

/** Charted trend series over the protocol span (or an explicit window), merging
 *  manual + integration + derived + estimated exactly as the charts render them.
 *  Extracted from the Analysis ChartsSection so charts and any other consumer use
 *  identical series. Returns the protocol-start day keys for the markers too. */
export function selectChartSeries(
  input: Pick<FacadeInput, 'entries' | 'metricReadings' | 'protocolItems' | 'profile' | 'contextNotes'>,
  today: string,
  opts?: { selectedIds?: string[]; window?: 'protocol' | { days: number } },
): { series: MetricSeries[]; startKeys: string[] } {
  const selectedIds =
    opts?.selectedIds ??
    (input.profile.dashboardMetrics?.length ? input.profile.dashboardMetrics : DEFAULT_CHART_METRIC_IDS);

  const startKeys = input.protocolItems
    .map((p) => p.startedAt)
    .filter((s): s is string => !!s)
    .map((s) => s.slice(0, 10))
    .sort();

  let windowStart: string | undefined;
  if (opts?.window && typeof opts.window === 'object') {
    windowStart = shiftBack(today, opts.window.days - 1);
  } else {
    // 'protocol' (default): anchor at the earliest protocol start ("since N weeks").
    windowStart = startKeys[0];
  }

  const series = buildMetricSeries({
    selectedIds,
    entries: input.entries,
    metricReadings: input.metricReadings,
    profile: input.profile,
    windowStart,
    windowEnd: today,
    excludeDates: input.contextNotes?.length
      ? new Set(input.contextNotes.map((n) => n.dateKey))
      : undefined,
  });
  return { series, startKeys };
}

function shiftBack(dateKey: string, days: number): string {
  const t = new Date(`${dateKey}T00:00:00.000Z`).getTime() - days * 24 * 60 * 60 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Compact protocol context: earliest start, weeks-in, and the active compounds. */
export function selectProtocolContext(
  input: FacadeInput,
  today: string,
): {
  earliestStart?: string;
  cycleWeek?: number;
  compounds: { slug: string; name: string; startedAt?: string; controlled: boolean }[];
} {
  const starts = input.protocolItems
    .map((p) => p.startedAt)
    .filter((s): s is string => !!s)
    .sort();
  const earliestStart = starts[0];
  const cycleWeek = earliestStart
    ? Math.max(1, Math.floor(daysBetween(earliestStart, today) / 7) + 1)
    : undefined;
  const compounds = input.protocolItems.map((p) => {
    const c = compoundBySlug(p.compoundSlug);
    return {
      slug: p.compoundSlug,
      name: c?.canonicalName ?? p.compoundSlug,
      startedAt: p.startedAt,
      controlled: !!c?.controlled,
    };
  });
  return { earliestStart, cycleWeek, compounds };
}

/** One digest entry per (session, part) photo track: the latest capture + its AI
 *  comparability signals. Powers P-3 (letting Pepi see photo results). The hedged
 *  change-note text is not persisted yet, so only the stored metadata is exposed. */
export type PhotoDigestEntry = {
  session: PhotoSession;
  part?: string;
  lastCaptureDate: string;
  count: number;
  comparable?: boolean;
  driftScore?: number;
  lighting?: PhotoEntry['lighting'];
  /** The latest hedged change note from the vision service, if analyzed. */
  changeNote?: string;
};

export function selectPhotoDigest(input: Pick<FacadeInput, 'photos'>): PhotoDigestEntry[] {
  const groups = new Map<string, PhotoEntry[]>();
  for (const p of input.photos) {
    const key = `${p.session}|${p.part ?? ''}`;
    const arr = groups.get(key);
    if (arr) arr.push(p);
    else groups.set(key, [p]);
  }
  const out: PhotoDigestEntry[] = [];
  for (const arr of groups.values()) {
    const sorted = [...arr].sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1));
    const latest = sorted[0];
    out.push({
      session: latest.session,
      part: latest.part,
      lastCaptureDate: latest.takenAt.slice(0, 10),
      count: arr.length,
      comparable: latest.comparable,
      driftScore: latest.driftScore,
      lighting: latest.lighting,
      changeNote: latest.changeNote,
    });
  }
  return out.sort((a, b) => (a.lastCaptureDate < b.lastCaptureDate ? 1 : -1));
}

/**
 * A short English direction hint appended to a metric label in AI payloads, so the
 * model never frames a move against the user's goal as good (A-1). Data hint, not
 * user-facing copy: the model reads it and still replies in the user's locale.
 */
function directionSuffix(dir: MetricFavourDir): string {
  if (dir === 'down_good') return ' (goal: lower is better)';
  if (dir === 'up_good') return ' (goal: higher is better)';
  return '';
}

/**
 * Assemble the compact history sent to the insights edge action (A-3 + A-1). Unlike
 * the old hand-rolled version, the `metrics` list now carries the SAME derived +
 * integration + body-composition trend series the charts render (energy, recovery,
 * caloric balance, waist/hips, body-fat %, etc.), each annotated with its goal
 * direction. The deployed function already renders `history.metrics` generically,
 * so this lands without an edge redeploy: the AI stops being blind to integration
 * and derived trends, and stops framing goal-adverse moves as good.
 */
export function buildInsightHistory(
  input: Pick<
    FacadeInput,
    | 'entries'
    | 'metricReadings'
    | 'protocolItems'
    | 'profile'
    | 'doseEvents'
    | 'symptomEvents'
    | 'photos'
    | 'contextNotes'
  >,
  today: string,
): InsightHistory {
  const name = (slug?: string) =>
    (slug ? compoundBySlug(slug)?.canonicalName : undefined) ?? slug ?? 'unknown';

  const checkinList = Object.values(input.entries).sort((a, b) => b.date.localeCompare(a.date));
  const directions = selectMetricDirections(input);

  // Flatten every charted series into direction-annotated metric rows.
  const { series } = selectChartSeries(input, today, { selectedIds: CHART_METRICS.map((m) => m.id) });
  const seriesRows: InsightHistory['metrics'] = [];
  for (const s of series) {
    const label = metricLabelFromKey(s.labelKey) + directionSuffix(directions[s.id] ?? 'neutral');
    for (const p of [...s.primary, ...s.estimated]) {
      seriesRows.push({ date: p.dateKey, metric: label, value: round1(p.value) });
    }
  }
  seriesRows.sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first, so the edge cap keeps recent

  const rawRows: InsightHistory['metrics'] = input.metricReadings.map((m) => ({
    date: m.ts.slice(0, 10),
    metric: m.metric,
    value: m.value,
    unit: m.unit,
  }));

  return {
    checkins: checkinList.map((e) => ({
      date: e.date,
      weight: e.weight,
      wellness: e.wellness,
      energy: e.energy,
      sleepQuality: e.sleep_quality,
      soreness: e.soreness,
    })),
    doses: input.doseEvents.map((d) => ({
      date: d.takenAt.slice(0, 10),
      compound: name(d.compoundSlug),
      dose: d.dose,
      unit: d.doseUnit,
    })),
    symptoms: input.symptomEvents.map((s) => ({
      date: s.onsetAt.slice(0, 10),
      type: s.type,
      severity: s.severity,
    })),
    metrics: [...seriesRows, ...rawRows],
    protocolStarts: input.protocolItems
      .filter((p) => p.startedAt)
      .map((p) => ({ compound: name(p.compoundSlug), startedAt: p.startedAt as string })),
    photos: selectPhotoDigest({ photos: input.photos ?? [] }).map((d) => ({
      track: d.part ? `${d.session}/${d.part}` : d.session,
      date: d.lastCaptureDate,
      count: d.count,
      comparable: d.comparable,
      note: d.changeNote,
    })),
    // Context memory (W3-10): the user's own explanations of off days, so the
    // model can attribute deviations instead of reasoning from raw numbers only.
    context: (input.contextNotes ?? []).map((n) => ({
      date: n.dateKey,
      note: n.explanation,
      metric: n.metric,
    })),
  };
}

/**
 * The metric label used in AI payloads. The chart labelKey is an i18n key
 * ("fields.energy"); the AI history is an English data structure, so we derive a
 * stable readable token from the key rather than pulling in i18n. Falls back to
 * the raw key tail.
 */
function metricLabelFromKey(labelKey: string): string {
  const tail = labelKey.includes('.') ? labelKey.slice(labelKey.lastIndexOf('.') + 1) : labelKey;
  return tail.replace(/_/g, ' ');
}
