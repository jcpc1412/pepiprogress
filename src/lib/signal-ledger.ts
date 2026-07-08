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

import type { CheckinEntry, DoseEvent, SymptomEvent } from '@/lib/store';

export type LedgerEventKind = 'workout' | 'rest' | 'poor_sleep' | 'symptom' | 'dose';

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
 * Heuristic impact of an event kind on a metric, in that metric's own units
 * (subjective 1–5 points). Deliberately coarse; the AI pass refines it later.
 * Body-composition metrics have no lifestyle heuristic (too noisy to attribute),
 * so their ledger is dose context + the chart + the explainer.
 */
const IMPACT: Record<string, Partial<Record<LedgerEventKind, number>>> = {
  energy: { workout: -1, rest: 0.5, poor_sleep: -1.5, symptom: -0.5 },
  soreness: { workout: 1.5, rest: -1 }, // higher soreness = worse
  cv_strain: { workout: 1, rest: -0.5 },
  sleep_quality: { poor_sleep: -1.5, symptom: -0.5 },
  inflammation: { workout: 0.5, symptom: 0.5 },
};

function heuristicImpact(kind: LedgerEventKind, metricId: string): number | undefined {
  if (kind === 'dose') return undefined; // context row, never an impact number
  return IMPACT[metricId]?.[kind];
}

const inWindow = (dk: string, start: string, end: string) => dk >= start && dk <= end;

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
  /** Resolve a compound slug to a display name (kept out so this stays pure). */
  compoundName?: (slug: string) => string | undefined;
}): LedgerEvent[] {
  const { metricId, entries, symptomEvents, doseEvents, windowStart, windowEnd, compoundName } = opts;
  const events: LedgerEvent[] = [];

  // Check-in derived events: notable training + sleep days only (not every day).
  for (const [date, e] of Object.entries(entries)) {
    if (!inWindow(date, windowStart, windowEnd)) continue;
    const ts = `${date}T12:00:00.000Z`;
    if (typeof e.workout_effort === 'number' && e.workout_effort >= 4) {
      events.push({ id: `w-${date}`, ts, kind: 'workout', labelKey: 'signal.event.workout', impact: heuristicImpact('workout', metricId) });
    } else if (typeof e.workout_effort === 'number' && e.workout_effort <= 1) {
      events.push({ id: `r-${date}`, ts, kind: 'rest', labelKey: 'signal.event.rest', impact: heuristicImpact('rest', metricId) });
    }
    if (typeof e.sleep_quality === 'number' && e.sleep_quality <= 2) {
      events.push({ id: `s-${date}`, ts, kind: 'poor_sleep', labelKey: 'signal.event.poorSleep', impact: heuristicImpact('poor_sleep', metricId) });
    }
  }

  // Symptom events.
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

  // Dose events — context rows only, never an impact number (legal gate).
  for (const d of doseEvents) {
    const dk = d.takenAt.slice(0, 10);
    if (!inWindow(dk, windowStart, windowEnd)) continue;
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
