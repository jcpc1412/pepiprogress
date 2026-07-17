import { shiftDateKey } from '@/lib/dates';
import type { CheckinEntry, MetricReading } from '@/lib/store';

/**
 * Proactive anomaly engine (beta-notes §3.4, W3-10). Detection is deterministic
 * and free: pure functions over the user's own data, zero tokens. AI only ever
 * handles the conversation AFTER the user replies to a templated opener.
 *
 * Explained days (context notes) are excluded from every rolling baseline here,
 * per the owner's point: an anomalous day is expected but is not part of the
 * user's "normal", and knowing why beats blind inference.
 */

export type AnomalyKind = 'sleep_short' | 'sleep_poor' | 'weight_jump' | 'workout_drop';

export type Anomaly = {
  kind: AnomalyKind;
  dateKey: string;
  /** The canonical metric or check-in field involved (for the context note). */
  metric: string;
};

/** A user explanation of an off day. Stored small + structured so future
 *  detector hits, the insights payload, and recurrence inference can use it. */
export type ContextNoteInput = {
  dateKey: string;
  metric?: string;
  explanation: string;
};

const BASELINE_WINDOW_DAYS = 14;
const MIN_BASELINE_POINTS = 4;

/** Mean of a metric over the trailing window ending BEFORE dateKey, skipping
 *  excluded (explained-anomalous) days. Null when too sparse to be honest. */
function trailingMean(
  byDate: Map<string, number>,
  dateKey: string,
  excluded: Set<string>,
): number | null {
  const start = shiftDateKey(dateKey, -BASELINE_WINDOW_DAYS);
  const values: number[] = [];
  for (const [d, v] of byDate) {
    if (d >= dateKey || d < start || excluded.has(d)) continue;
    values.push(v);
  }
  if (values.length < MIN_BASELINE_POINTS) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Latest reading value per local day for one canonical metric. */
function dailySeries(readings: MetricReading[], metric: string): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const r of readings) {
    if (r.metric !== metric || typeof r.value !== 'number') continue;
    const d = r.ts.slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, r.value); // newest-first store order
  }
  return byDate;
}

/** Check-in field per day as a series. */
function entrySeries(
  entries: Record<string, CheckinEntry>,
  field: 'sleep_quality' | 'workout_effort' | 'weight',
): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const [d, e] of Object.entries(entries)) {
    const v = e[field];
    if (typeof v === 'number') byDate.set(d, v);
  }
  return byDate;
}

/**
 * Detect today's anomalies. `excludedDates` = days already explained via a
 * context note (they neither fire again nor pollute the baselines).
 */
export function detectAnomalies(input: {
  entries: Record<string, CheckinEntry>;
  metricReadings: MetricReading[];
  todayKey: string;
  excludedDates: Set<string>;
}): Anomaly[] {
  const { entries, metricReadings, todayKey, excludedDates } = input;
  if (excludedDates.has(todayKey)) return [];
  const out: Anomaly[] = [];

  // Sleep duration: >= 1.5h under the trailing mean.
  const sleepDur = dailySeries(metricReadings, 'sleep.duration');
  const durToday = sleepDur.get(todayKey);
  if (durToday !== undefined) {
    const mean = trailingMean(sleepDur, todayKey, excludedDates);
    if (mean != null && durToday <= mean - 1.5) {
      out.push({ kind: 'sleep_short', dateKey: todayKey, metric: 'sleep.duration' });
    }
  }

  // Sleep quality (1-5): a 2-or-less day against a >= 3.5 baseline.
  const sleepQ = entrySeries(entries, 'sleep_quality');
  const qToday = sleepQ.get(todayKey);
  if (qToday !== undefined && qToday <= 2) {
    const mean = trailingMean(sleepQ, todayKey, excludedDates);
    if (mean != null && mean >= 3.5) {
      out.push({ kind: 'sleep_poor', dateKey: todayKey, metric: 'sleep_quality' });
    }
  }

  // Weight jump: >= 1.5% day-over-baseline move in either direction.
  const weight = new Map([...dailySeries(metricReadings, 'body.weight'), ...entrySeries(entries, 'weight')]);
  const wToday = weight.get(todayKey);
  if (wToday !== undefined) {
    const mean = trailingMean(weight, todayKey, excludedDates);
    if (mean != null && Math.abs(wToday - mean) / mean >= 0.015) {
      out.push({ kind: 'weight_jump', dateKey: todayKey, metric: 'body.weight' });
    }
  }

  // Workout quality: a 2-or-less effort day against a >= 3.5 baseline.
  const effort = entrySeries(entries, 'workout_effort');
  const eToday = effort.get(todayKey);
  if (eToday !== undefined && eToday <= 2) {
    const mean = trailingMean(effort, todayKey, excludedDates);
    if (mean != null && mean >= 3.5) {
      out.push({ kind: 'workout_drop', dateKey: todayKey, metric: 'workout_effort' });
    }
  }

  return out;
}
