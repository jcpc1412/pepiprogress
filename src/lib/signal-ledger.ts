/**
 * Signal drill-down ledger (redesign R2-D) — the deterministic, offline path.
 *
 * Given a metric and the logged data inside the charted window, surface the real
 * events that plausibly moved it, each with a heuristic impact estimate. This is
 * the fallback that ships for beta; the AI pass (ai-service `signal_ledger`)
 * replaces it with contextual copy + rationale when the service is reachable.
 *
 * Legal (rung 1): every row anchors to a REAL logged event — nothing is invented.
 * Impacts are approximate and must render hedged ("≈ estimated"). Dose events are
 * context rows with NO impact number: attributing quantified effects to a compound
 * edges into efficacy claims (spec 05). Lifestyle events carry impact estimates.
 */

import { BODY_COMP_METRICS, doseRelevantToMetric } from '@/lib/metric-relevance';
import type { CheckinEntry, DoseEvent, MetricReading, SymptomEvent } from '@/lib/store';

export type LedgerEventKind =
  | 'workout'
  | 'rest'
  | 'poor_sleep'
  | 'symptom'
  | 'dose'
  | 'cardio'
  | 'steps';

export type LedgerEvent = {
  id: string;
  /** ISO timestamp, for ordering + display. */
  ts: string;
  kind: LedgerEventKind;
  /** i18n key + params for the row label. */
  labelKey: string;
  labelParams?: Record<string, string | number>;
  /** Signed heuristic impact in the metric's own units. Omitted for context rows
   *  (doses) and for metrics with no lifestyle heuristic. Always shown hedged. */
  impact?: number;
};

/** Metrics that get a written explainer; everything else falls to the default. */
const EXPLAINED = new Set([
  'weight',
  'body_fat_pct',
  'waist',
  'hips',
  'energy',
  'sleep_quality',
  'soreness',
]);

/** i18n key for a metric's "about this" explainer. */
export function metricExplainerKey(metricId: string): string {
  return EXPLAINED.has(metricId) ? `signal.explain.${metricId}` : 'signal.explain.default';
}

/**
 * Goal-aware "about this" (Track C §4d): the static explainer PLUS a deterministic
 * clause naming which way is good FOR THIS USER, so the copy stops being goal-blind
 * ("weight went up" reads differently for a bulker than a cutter). `dir` comes from
 * the shared metric-direction resolver, so it never contradicts the verdict.
 */
export function metricExplainer(
  metricId: string,
  dir: 'up_good' | 'down_good' | 'neutral',
): { explainKey: string; goalKey?: string } {
  const explainKey = metricExplainerKey(metricId);
  const goalKey =
    dir === 'down_good' ? 'signal.goal.lower' : dir === 'up_good' ? 'signal.goal.higher' : undefined;
  return { explainKey, goalKey };
}

/**
 * Heuristic impact of an event kind on a metric, in that metric's own units
 * (subjective 1–5 points). Deliberately coarse; the AI pass refines it later.
 * Body-composition metrics have no lifestyle heuristic (too noisy to attribute),
 * so their ledger is dose context + the chart + the explainer.
 */
const IMPACT: Record<string, Partial<Record<LedgerEventKind, number>>> = {
  // Integration cardio mirrors a hard manual workout; a step spike is lighter.
  energy: { workout: -1, rest: 0.5, poor_sleep: -1.5, symptom: -0.5, cardio: -1 },
  // `soreness` id = the Recovery metric (up_good): hard training temporarily lowers
  // recovery, rest raises it (mirrors energy). Signs flipped from the legacy
  // soreness polarity (Track A1).
  soreness: { workout: -1.5, rest: 1, cardio: -1.5 },
  cv_strain: { workout: 1, rest: -0.5, cardio: 1.5, steps: 0.5 },
  sleep_quality: { poor_sleep: -1.5, symptom: -0.5 },
  inflammation: { workout: 0.5, symptom: 0.5 },
};

function heuristicImpact(kind: LedgerEventKind, metricId: string): number | undefined {
  if (kind === 'dose') return undefined; // context row, never an impact number
  return IMPACT[metricId]?.[kind];
}

/**
 * Does this event kind belong on this metric's ledger? Lifestyle + symptom rows
 * appear only where the metric actually responds (so "poor sleep" never lands on a
 * body-fat chart). Integration movers (cardio/steps) also appear on body-comp
 * metrics as CONTEXT rows — the honest fat/recomp drivers — even without a
 * quantified impact.
 */
function kindRelevant(kind: LedgerEventKind, metricId: string): boolean {
  if (kind === 'dose') return true; // dose relevance is handled by effect tags
  if (heuristicImpact(kind, metricId) !== undefined) return true;
  if ((kind === 'cardio' || kind === 'steps') && BODY_COMP_METRICS.has(metricId)) return true;
  return false;
}

const inWindow = (dk: string, start: string, end: string) => dk >= start && dk <= end;

/** A real training/cardio session shows from ~this many logged active minutes. */
const CARDIO_MIN_MINUTES = 25;
/** An unusually active day shows from ~this many steps. */
const STEP_SPIKE = 12000;

/** Latest reading value per local day for one canonical metric. */
function readingByDay(readings: MetricReading[], metric: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of readings) {
    if (r.metric !== metric || typeof r.value !== 'number') continue;
    const dk = r.ts.slice(0, 10);
    if (!out.has(dk)) out.set(dk, r.value); // newest-first store order
  }
  return out;
}

/**
 * Extract the real events inside [windowStart, windowEnd] that plausibly moved
 * this metric, newest first. Pure + deterministic.
 */
export function extractLedger(opts: {
  metricId: string;
  entries: Record<string, CheckinEntry>;
  symptomEvents: SymptomEvent[];
  doseEvents: DoseEvent[];
  windowStart: string;
  windowEnd: string;
  /** Integration readings, for cardio/step movers (optional; empty = none). */
  metricReadings?: MetricReading[];
  /** Resolve a compound slug to a display name (kept out so this stays pure). */
  compoundName?: (slug: string) => string | undefined;
  /** A compound slug's effect tags, for dose relevance (kept out so this stays
   *  pure). Absent/unknown → the dose is shown (not hidden). */
  compoundEffectTags?: (slug: string) => string[] | undefined;
}): LedgerEvent[] {
  const {
    metricId,
    entries,
    symptomEvents,
    doseEvents,
    windowStart,
    windowEnd,
    metricReadings = [],
    compoundName,
    compoundEffectTags,
  } = opts;
  const events: LedgerEvent[] = [];

  // Check-in derived events: notable training + sleep days only (not every day),
  // and only where the metric actually responds (kindRelevant).
  for (const [date, e] of Object.entries(entries)) {
    if (!inWindow(date, windowStart, windowEnd)) continue;
    const ts = `${date}T12:00:00.000Z`;
    if (typeof e.workout_effort === 'number' && e.workout_effort >= 4 && kindRelevant('workout', metricId)) {
      events.push({ id: `w-${date}`, ts, kind: 'workout', labelKey: 'signal.event.workout', impact: heuristicImpact('workout', metricId) });
    } else if (typeof e.workout_effort === 'number' && e.workout_effort <= 1 && kindRelevant('rest', metricId)) {
      events.push({ id: `r-${date}`, ts, kind: 'rest', labelKey: 'signal.event.rest', impact: heuristicImpact('rest', metricId) });
    }
    if (typeof e.sleep_quality === 'number' && e.sleep_quality <= 2 && kindRelevant('poor_sleep', metricId)) {
      events.push({ id: `s-${date}`, ts, kind: 'poor_sleep', labelKey: 'signal.event.poorSleep', impact: heuristicImpact('poor_sleep', metricId) });
    }
  }

  // Integration movers (Track C §4e): a real cardio session or a step spike — the
  // honest, previously-invisible drivers of body composition + strain. Context
  // rows on body-comp metrics (no quantified per-day fat impact); impact rows on
  // the subjective metrics that respond.
  if (kindRelevant('cardio', metricId)) {
    const workoutMin = readingByDay(metricReadings, 'activity.workout_min');
    for (const [date, min] of workoutMin) {
      if (!inWindow(date, windowStart, windowEnd) || min < CARDIO_MIN_MINUTES) continue;
      events.push({
        id: `cardio-${date}`,
        ts: `${date}T12:00:00.000Z`,
        kind: 'cardio',
        labelKey: 'signal.event.cardio',
        labelParams: { minutes: Math.round(min) },
        impact: heuristicImpact('cardio', metricId),
      });
    }
  }
  if (kindRelevant('steps', metricId)) {
    const steps = readingByDay(metricReadings, 'activity.steps');
    for (const [date, count] of steps) {
      if (!inWindow(date, windowStart, windowEnd) || count < STEP_SPIKE) continue;
      events.push({
        id: `steps-${date}`,
        ts: `${date}T12:00:00.000Z`,
        kind: 'steps',
        labelKey: 'signal.event.steps',
        labelParams: { count: Math.round(count) },
        impact: heuristicImpact('steps', metricId),
      });
    }
  }

  // Symptom events — only where the metric responds.
  if (kindRelevant('symptom', metricId)) {
    for (const sy of symptomEvents) {
      const dk = sy.onsetAt.slice(0, 10);
      if (!inWindow(dk, windowStart, windowEnd)) continue;
      events.push({
        id: `sym-${sy.id}`,
        ts: sy.onsetAt,
        kind: 'symptom',
        labelKey: 'signal.event.symptom',
        labelParams: { name: sy.type },
        impact: heuristicImpact('symptom', metricId),
      });
    }
  }

  // Dose events — context rows only, never an impact number (legal gate), and only
  // for compounds whose effect tags plausibly touch this metric (§4e): a fat chart
  // no longer lists hCG or melanotan.
  for (const d of doseEvents) {
    const dk = d.takenAt.slice(0, 10);
    if (!inWindow(dk, windowStart, windowEnd)) continue;
    if (d.compoundSlug && !doseRelevantToMetric(compoundEffectTags?.(d.compoundSlug), metricId)) continue;
    const name = d.compoundSlug ? compoundName?.(d.compoundSlug) ?? d.compoundSlug : '';
    events.push({
      id: `dose-${d.id}`,
      ts: d.takenAt,
      kind: 'dose',
      labelKey: 'signal.event.dose',
      labelParams: { compound: name },
    });
  }

  return events.sort((a, b) => (a.ts < b.ts ? 1 : -1)); // newest first
}
