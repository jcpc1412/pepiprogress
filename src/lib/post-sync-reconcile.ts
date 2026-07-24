import type { CheckinField } from '@/lib/field-surfacing';
import { metricForDate, weightInUnits } from '@/lib/integrations/autofill';
import { CanonicalMetric, type CanonicalMetricKey } from '@/lib/integrations/types';
import { routineWindowPassed, type RoutineWindow } from '@/lib/routine-window';
import type { CheckinEntry, MetricReading, UnitsSystem } from '@/lib/store';

/**
 * Post-sync reconciliation (2b.5).
 *
 * The rule the whole thing exists to enforce: **sync first, ask second.** A
 * question the phone could have answered from data it already holds is the most
 * expensive kind of prompt, because the user knows the app had the answer.
 *
 * So on foreground the integration pull runs, and only once it has settled does
 * this decide what is genuinely missing: fill every field a source now covers,
 * and defer-ask only the fields a source was *expected* to cover and didn't.
 *
 * Deliberately narrow on the ask side. Fields with no integration source at all
 * (wellness, libido, appetite) are the scheduled micro check-in's job — asking
 * for them here would double up on the same user in the same hour. This asks
 * only where a source exists but came back empty, which is also the only case
 * where the answer is genuinely unavailable any other way.
 *
 * Reusable by construction: adding a field to the table below is all it takes
 * for it to participate, so strength, nutrition, sleep and steps share one path.
 */

export type ReconcileRule = {
  field: Extract<CheckinField, 'weight' | 'protein' | 'calories' | 'workout_effort'>;
  metric: CanonicalMetricKey;
  /** Canonical value → the value stored on the check-in entry. */
  convert: (value: number, units: UnitsSystem) => number;
  /** Only ask once the user's usual activity window has passed: the answer does
   *  not exist yet before then, so the question is premature, not missing. */
  routineGated?: boolean;
  /** How Pepi takes the answer: 1-5 chips, or a typed number. */
  answer: 'scale' | 'number';
};

/** Effort scores arrive on a 1-10 scale (Apple's `WorkoutEffortScore`); the
 *  check-in field is 1-5, and rounding up a hard session beats rounding down. */
function effortToScale(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value / 2)));
}

export const RECONCILE_RULES: ReconcileRule[] = [
  {
    field: 'weight',
    metric: CanonicalMetric.bodyWeight,
    convert: (v, units) => weightInUnits(v, units),
    answer: 'number',
  },
  {
    field: 'calories',
    metric: CanonicalMetric.nutritionEnergy,
    convert: (v) => Math.round(v),
    answer: 'number',
  },
  {
    field: 'protein',
    metric: CanonicalMetric.nutritionProtein,
    convert: (v) => Math.round(v),
    answer: 'number',
  },
  {
    field: 'workout_effort',
    metric: CanonicalMetric.activityEffort,
    convert: (v) => effortToScale(v),
    routineGated: true,
    answer: 'scale',
  },
];

export type ReconcileInput = {
  surfacedFields: CheckinField[];
  entry: CheckinEntry | undefined;
  readings: MetricReading[];
  dateKey: string;
  units: UnitsSystem;
  /** Local hour, for the routine gate. */
  hour: number;
  /** Learned activity window, or null when the user has no routine yet. */
  routineWindow: RoutineWindow | null;
  /** Whether any health source is connected at all. With none connected there
   *  is no "expected" coverage, so a gap is just an unlogged field and the
   *  ordinary log is the right place for it, not a question. */
  hasConnectedSource: boolean;
  /** Fields Pepi already asked about today. Asked once and let go: a follow-up
   *  the user chose not to answer is an answer, and re-queueing it on the next
   *  foreground would turn one question into a day of them. */
  alreadyAsked?: CheckinField[];
  rules?: ReconcileRule[];
};

export type ReconcileResult = {
  /** Values to write onto today's entry. Empty when nothing changed. */
  fill: Partial<CheckinEntry>;
  /** Fields the fill covered, for the entry's `autoFilled` bookkeeping. */
  filled: CheckinField[];
  /** Fields a source was expected to cover but didn't, in ask order. */
  ask: CheckinField[];
};

export function reconcileAfterSync(input: ReconcileInput): ReconcileResult {
  const { surfacedFields, entry, readings, dateKey, units, hour, routineWindow } = input;
  const rules = input.rules ?? RECONCILE_RULES;
  const autoFilled = new Set(entry?.autoFilled ?? []);
  const asked = new Set(input.alreadyAsked ?? []);

  const fill: Partial<CheckinEntry> = {};
  const filled: CheckinField[] = [];
  const ask: CheckinField[] = [];

  for (const rule of rules) {
    if (!surfacedFields.includes(rule.field)) continue;

    const reading = metricForDate(readings, rule.metric, dateKey);
    const current = entry?.[rule.field];

    if (reading) {
      const value = rule.convert(reading.value, units);
      if (current === undefined) {
        fill[rule.field] = value;
        filled.push(rule.field);
      } else if (autoFilled.has(rule.field) && current !== value) {
        // A previously auto-filled field tracks later re-syncs of the same day,
        // so a partial-day total is never frozen (W1-1). A user-typed value has
        // been taken out of `autoFilled` and is left alone.
        fill[rule.field] = value;
        filled.push(rule.field);
      }
      continue;
    }

    if (current !== undefined || !input.hasConnectedSource || asked.has(rule.field)) continue;
    // Nothing synced and nothing logged. Routine-gated fields wait for the
    // user's usual window to pass before this counts as missing rather than
    // simply not-yet-happened.
    if (rule.routineGated && !routineWindowPassed(routineWindow, hour)) continue;
    ask.push(rule.field);
  }

  return { fill, filled, ask };
}

/** How Pepi should take the answer for a deferred ask. */
export function answerModeFor(field: CheckinField): 'scale' | 'number' | null {
  return RECONCILE_RULES.find((r) => r.field === field)?.answer ?? null;
}
