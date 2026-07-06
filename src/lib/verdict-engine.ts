/**
 * The verdict engine (redesign §3) — the core new logic behind the verdict-first
 * Home. Pure, deterministic, offline, and unit-tested in isolation: given the
 * user's logged + derived data it answers the one question the app exists for,
 * "is my suffering producing measurable results?", as a single reading.
 *
 * Hard rules baked in here:
 *  - No RN / i18n / network imports. Emits i18n *keys* (Localizable), never prose,
 *    so it stays testable and locale-agnostic. The screen (Phase 3) formats.
 *  - Descriptive only (legal rung 1): reports measured status, never diagnoses,
 *    prescribes, or implies dosing. A verdict-engine.test asserts this.
 *  - "down" is not inherently good or bad — favourability is resolved against the
 *    user's goals + active-compound intent, never from the raw sign.
 *  - Conservative: a wrong-but-confident verdict is worse than none. Low
 *    confidence is capped at `watch`; too little data yields `building`.
 */

import { buildMetricSeries, CHART_METRICS, type DatedPoint } from '@/lib/chart-series';
import type { Goal } from '@/lib/field-surfacing';
import { compoundBySlug } from '@/data/compound-catalog';
import type {
  CheckinEntry,
  LocalProfile,
  MetricReading,
  PhotoEntry,
  ProtocolItem,
} from '@/lib/store';

// ── Public shapes ───────────────────────────────────────────────────────────

export type VerdictState = 'building' | 'on_track' | 'watch' | 'off_track';
export type Confidence = 'low' | 'medium' | 'high';
/** Whether a movement is favourable for the user's goal (decided here, not by sign). */
export type Favour = 'good' | 'watch' | 'bad';
export type Trend = 'up' | 'down' | 'flat';
export type SignalRole = 'supports' | 'drags' | 'neutral';
/** Canonical unit token; the UI maps it to a localized, unit-system-aware string. */
export type HeroUnit = 'weight' | 'scale5' | 'pct';

/** A translatable message: a key plus params, resolved by the presentation layer. */
export type Localizable = { key: string; params?: Record<string, string | number> };

export type SignalContribution = {
  metricId: string;
  labelKey: string;
  /** Latest value in the window. */
  value: number;
  /** Change of the latest value vs the window baseline (signed, raw units). */
  delta: number;
  trend: Trend;
  favour: Favour;
  /** 0–1 relevance-scaled contribution weight (drives hero pick + ordering). */
  weight: number;
  role: SignalRole;
  /** Chronological points for a sparkline. */
  series: DatedPoint[];
  /** Set when a drag is explained away (training load, cycle, known compound effect). */
  explained?: Localizable;
};

export type VerdictHero =
  | {
      kind: 'metric';
      metricId: string;
      labelKey: string;
      value: number;
      unit: HeroUnit;
      favour: Favour;
      trend: 'up' | 'down'; // hero movement is always resolved to a direction
    }
  | { kind: 'photo'; photoId: string }
  | null;

export type Verdict = {
  state: VerdictState;
  confidence: Confidence;
  hero: VerdictHero;
  /** The weighted signal stack for the decompose screen (most relevant first). */
  signals: SignalContribution[];
  reconciliation?: Localizable;
  /** Optional mild goal-timeline forecast. Unpopulated until a target is modeled. */
  forecast?: Localizable;
  /** One-sentence template summary; the AI prose layer may replace it (Phase 3). */
  explanation: Localizable;
  explanationKey: 'template' | 'ai';
};

export type VerdictInput = {
  entries: Record<string, CheckinEntry>;
  metricReadings: MetricReading[];
  protocolItems: ProtocolItem[];
  photos: PhotoEntry[];
  profile: Pick<
    LocalProfile,
    'goals' | 'sex' | 'dobISO' | 'units' | 'estimatedMetricsMode' | 'lastPeriodDate' | 'cycleLength'
  >;
  /** Reference "today" (YYYY-MM-DD) for a deterministic window. Defaults to now. */
  today?: string;
};

// ── Tuning constants ────────────────────────────────────────────────────────

const WINDOW_DAYS = 14;
const MIN_POINTS = 3; // a signal needs this many points in the window to count
const FLAT_EPS = 1e-6;
const BASE_RELEVANCE = 0.15; // any logged metric counts a little, even off-goal
const STATE_THRESHOLD = 0.34; // |score| beyond this leaves the neutral "watch" band
const DAY_MS = 24 * 60 * 60 * 1000;

// ── Metric semantics ────────────────────────────────────────────────────────

type Direction = 'up_good' | 'down_good' | 'context';

const METRIC_DIRECTION: Record<string, Direction> = {
  weight: 'context',
  energy: 'up_good',
  sleep_quality: 'up_good',
  soreness: 'down_good',
  sleep_deep_pct: 'up_good',
  sleep_rem_pct: 'up_good',
  protein_adequacy: 'up_good',
  caloric_balance: 'context',
  body_comp_velocity: 'up_good',
  cv_strain: 'down_good',
  inflammation: 'down_good',
};

const METRIC_UNIT: Record<string, HeroUnit> = {
  weight: 'weight',
  sleep_deep_pct: 'pct',
  sleep_rem_pct: 'pct',
};
const unitFor = (metricId: string): HeroUnit => METRIC_UNIT[metricId] ?? 'scale5';

/** Public: the display-unit token for a metric (used to format signal values). */
export const metricHeroUnit = unitFor;

/** Goal → per-metric base relevance. */
const GOAL_METRIC_WEIGHTS: Record<Goal, Record<string, number>> = {
  weight_loss: { weight: 1.0, caloric_balance: 0.6, body_comp_velocity: 0.5, energy: 0.3 },
  body_comp: { body_comp_velocity: 1.0, weight: 0.6, protein_adequacy: 0.6, caloric_balance: 0.4 },
  sleep: { sleep_quality: 1.0, sleep_deep_pct: 0.7, sleep_rem_pct: 0.6, energy: 0.4 },
  recovery: { soreness: 1.0, energy: 0.7, cv_strain: 0.5, sleep_quality: 0.4 },
  wellness: { energy: 0.8, sleep_quality: 0.6, inflammation: 0.4 },
  skin: {}, // photo-driven; no charted numeric signal
};

/** Compound effect/monitoring tag → per-metric relevance. */
const TAG_METRIC_WEIGHTS: Record<string, Record<string, number>> = {
  fat_loss: { weight: 0.9, caloric_balance: 0.5, body_comp_velocity: 0.4 },
  muscle: { body_comp_velocity: 0.9, protein_adequacy: 0.6, weight: 0.4 },
  recovery: { soreness: 0.8, energy: 0.5 },
  healing: { soreness: 0.7, inflammation: 0.5 },
  sleep: { sleep_quality: 0.9, sleep_deep_pct: 0.5 },
  cognition: { energy: 0.6 },
  mood: { energy: 0.4 },
  gut: { inflammation: 0.4 },
  // monitoring tags that map to a daily-trend metric
  hematocrit: { cv_strain: 0.3 },
  lipids: { cv_strain: 0.3 },
};

// ── Small helpers ───────────────────────────────────────────────────────────

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function shiftDay(dateKey: string, delta: number): string {
  const t = new Date(`${dateKey}T00:00:00.000Z`).getTime() + delta * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** Protocol intent, read from goals + active-compound effect tags. Drives the
 *  favourable direction of "context" metrics (weight, caloric balance). */
function resolveIntent(input: VerdictInput): { cutting: boolean; bulking: boolean } {
  const goals = new Set(input.profile.goals);
  const tags = new Set<string>();
  for (const item of input.protocolItems) {
    const c = compoundBySlug(item.compoundSlug);
    if (c) for (const t of c.effectTags) tags.add(t);
  }
  const cutting = goals.has('weight_loss') || tags.has('fat_loss');
  const bulking = goals.has('body_comp') || tags.has('muscle');
  return { cutting, bulking };
}

/** Resolve a "context" metric to a concrete good-direction, or null if neutral. */
function contextDirection(
  metricId: string,
  intent: { cutting: boolean; bulking: boolean },
): 'up_good' | 'down_good' | null {
  const decisive = intent.cutting !== intent.bulking; // exactly one → clear intent
  if (!decisive) return null; // recomp / no intent → weight & balance are neutral
  if (metricId === 'weight') return intent.cutting ? 'down_good' : 'up_good';
  if (metricId === 'caloric_balance') return intent.cutting ? 'down_good' : 'up_good';
  return null;
}

/** Sum of goal + compound-tag relevance for a metric, plus a small base. */
function relevanceFor(metricId: string, input: VerdictInput): number {
  let w = BASE_RELEVANCE;
  for (const goal of input.profile.goals) w += GOAL_METRIC_WEIGHTS[goal]?.[metricId] ?? 0;
  for (const item of input.protocolItems) {
    const c = compoundBySlug(item.compoundSlug);
    if (!c) continue;
    for (const tag of [...c.effectTags, ...c.monitoringTags]) {
      w += TAG_METRIC_WEIGHTS[tag]?.[metricId] ?? 0;
    }
  }
  return w;
}

/** Cycle day (0-based) for a female user, or null when not trackable. */
function cycleDay(input: VerdictInput, today: string): number | null {
  const { sex, lastPeriodDate, cycleLength } = input.profile;
  if (sex !== 'female' || !lastPeriodDate) return null;
  const len = cycleLength && cycleLength > 0 ? cycleLength : 28;
  const days = Math.floor(
    (new Date(`${today}T00:00:00.000Z`).getTime() -
      new Date(`${lastPeriodDate}T00:00:00.000Z`).getTime()) /
      DAY_MS,
  );
  if (days < 0) return null;
  return ((days % len) + len) % len;
}

// ── Engine ──────────────────────────────────────────────────────────────────

type Raw = {
  metricId: string;
  labelKey: string;
  series: DatedPoint[];
  latest: number;
  delta: number;
  trend: Trend;
  goodDir: 'up_good' | 'down_good' | null;
  favourSign: -1 | 0 | 1;
  relevance: number;
  normDev: number;
};

export function computeVerdict(input: VerdictInput): Verdict {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const windowStart = shiftDay(today, -(WINDOW_DAYS - 1));
  const intent = resolveIntent(input);

  const series = buildMetricSeries({
    selectedIds: CHART_METRICS.map((m) => m.id),
    entries: input.entries,
    metricReadings: input.metricReadings,
    profile: {
      dobISO: input.profile.dobISO,
      sex: input.profile.sex as 'male' | 'female' | 'ftm' | 'mtf' | undefined,
      estimatedMetricsMode: input.profile.estimatedMetricsMode ?? 'fill',
    },
    windowStart,
    windowEnd: today,
  });

  const raws: Raw[] = [];
  for (const s of series) {
    const points = s.primary.length ? s.primary : s.estimated;
    if (points.length < MIN_POINTS) continue;

    const vals = points.map((p) => p.value);
    const latest = vals[vals.length - 1];
    const prior = vals.slice(0, -1);
    const baseline = mean(prior);
    const delta = latest - baseline;
    const spread = std(vals);
    const trend: Trend =
      Math.abs(delta) <= Math.max(FLAT_EPS, spread * 0.15) ? 'flat' : delta > 0 ? 'up' : 'down';

    const dir = METRIC_DIRECTION[s.id];
    const goodDir = dir === 'context' ? contextDirection(s.id, intent) : dir;
    let favourSign: -1 | 0 | 1 = 0;
    if (trend !== 'flat' && goodDir) {
      const up = trend === 'up';
      favourSign = (goodDir === 'up_good') === up ? 1 : -1;
    }
    const normDev = spread > 0 ? Math.min(1, Math.abs(delta) / (2 * spread)) : 0;

    raws.push({
      metricId: s.id,
      labelKey: s.labelKey,
      series: points,
      latest,
      delta,
      trend,
      goodDir,
      favourSign,
      relevance: relevanceFor(s.id, input),
      normDev,
    });
  }

  // Cold-start: no usable signal → building, hero falls back to the latest photo.
  if (raws.length === 0) {
    return buildingVerdict(input);
  }

  // Verdict score: relevance-weighted mean of favour signs (neutral signals pull toward 0).
  const relSum = raws.reduce((a, r) => a + r.relevance, 0);
  const score = relSum > 0 ? raws.reduce((a, r) => a + r.relevance * r.favourSign, 0) / relSum : 0;

  // Signals that actually take a side (drive confidence).
  const decisive = raws.filter((r) => r.favourSign !== 0);
  const agreement = Math.abs(score);
  let confidence: Confidence = 'low';
  if (decisive.length >= 3 && agreement >= 0.5) confidence = 'high';
  else if (decisive.length >= 2 && agreement >= 0.3) confidence = 'medium';

  let state: VerdictState =
    score >= STATE_THRESHOLD ? 'on_track' : score <= -STATE_THRESHOLD ? 'off_track' : 'watch';
  // Conservative: never claim a firm verdict on thin evidence.
  if (confidence === 'low' && state !== 'watch') state = 'watch';

  // Hero = the most decision-relevant signal today (relevance, boosted by anomaly).
  const heroRaw = [...raws].sort(
    (a, b) => b.relevance * (0.4 + 0.6 * b.normDev) - a.relevance * (0.4 + 0.6 * a.normDev),
  )[0];

  const cday = cycleDay(input, today);
  const luteal = cday !== null && cday >= (input.profile.cycleLength ?? 28) / 2;
  const heavyTraining = recentHeavyTraining(input, today);

  // Build the signal stack + reconciliation.
  const signals: SignalContribution[] = raws
    .map((r) => {
      const scoreSign = score > 0 ? 1 : score < 0 ? -1 : 0;
      let role: SignalRole = 'neutral';
      if (r.favourSign !== 0 && scoreSign !== 0) {
        role = r.favourSign === scoreSign ? 'supports' : 'drags';
      }
      const explained =
        role === 'drags' ? explainDrag(r, { luteal, heavyTraining, input }) : undefined;
      const favour: Favour = r.favourSign > 0 ? 'good' : r.favourSign < 0 ? 'bad' : 'watch';
      return {
        metricId: r.metricId,
        labelKey: r.labelKey,
        value: r.latest,
        delta: r.delta,
        trend: r.trend,
        favour,
        weight: r.relevance * (0.4 + 0.6 * r.normDev),
        role,
        series: r.series,
        explained,
      };
    })
    .sort((a, b) => b.weight - a.weight);

  const reconciliation = pickReconciliation(signals);

  const hero: VerdictHero = {
    kind: 'metric',
    metricId: heroRaw.metricId,
    labelKey: heroRaw.labelKey,
    value: heroRaw.latest,
    unit: unitFor(heroRaw.metricId),
    favour: heroRaw.favourSign > 0 ? 'good' : heroRaw.favourSign < 0 ? 'bad' : 'watch',
    trend: heroRaw.trend === 'flat' ? (heroRaw.delta >= 0 ? 'up' : 'down') : heroRaw.trend,
  };

  return {
    state,
    confidence,
    hero,
    signals,
    reconciliation,
    explanation: {
      key: `verdict.explanation.${state}`,
      params: { metric: heroRaw.labelKey },
    },
    explanationKey: 'template',
  };
}

function buildingVerdict(input: VerdictInput): Verdict {
  const latestPhoto = input.photos.length
    ? [...input.photos].sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1))[0]
    : null;
  return {
    state: 'building',
    confidence: 'low',
    hero: latestPhoto ? { kind: 'photo', photoId: latestPhoto.id } : null,
    signals: [],
    explanation: { key: 'verdict.explanation.building' },
    explanationKey: 'template',
  };
}

/** True if the last 3 days show a hard session (high effort or rising CV strain). */
function recentHeavyTraining(input: VerdictInput, today: string): boolean {
  for (let i = 0; i < 3; i++) {
    const e = input.entries[shiftDay(today, -i)];
    if (e && typeof e.workout_effort === 'number' && e.workout_effort >= 4) return true;
  }
  return false;
}

/** Annotate a dragging signal if a known driver explains it away (§3.3). */
function explainDrag(
  r: Raw,
  ctx: { luteal: boolean; heavyTraining: boolean; input: VerdictInput },
): Localizable | undefined {
  if (['soreness', 'energy', 'cv_strain'].includes(r.metricId) && ctx.heavyTraining) {
    return { key: 'verdict.reconcile.trainingLoad', params: { metric: r.labelKey } };
  }
  if (r.metricId === 'weight' && ctx.luteal) {
    return { key: 'verdict.reconcile.cycle', params: { metric: r.labelKey } };
  }
  if (['weight', 'caloric_balance'].includes(r.metricId)) {
    const hasFatLoss = ctx.input.protocolItems.some((it) =>
      compoundBySlug(it.compoundSlug)?.effectTags.includes('fat_loss'),
    );
    if (hasFatLoss) {
      return { key: 'verdict.reconcile.compound', params: { metric: r.labelKey } };
    }
  }
  return undefined;
}

/** The single most-weighted explained drag becomes the reconciliation line. */
function pickReconciliation(signals: SignalContribution[]): Localizable | undefined {
  const explained = signals.filter((s) => s.role === 'drags' && s.explained);
  return explained.length ? explained[0].explained : undefined;
}
