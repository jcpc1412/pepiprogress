import { localDateKey } from '@/lib/dates';
import type { MetricReading } from '@/lib/store';

/**
 * Auto-fill from integration data (spec 06 — "lower the logging burden").
 * Finds the most recent reading for a canonical metric on a given local date,
 * so the daily check-in can offer to fill a field the user would otherwise type.
 *
 * The date match is done in LOCAL time. Providers stamp readings in UTC, and a
 * date key is always a local day, so a prefix comparison silently mismatches by
 * a day for anyone whose evening (or early morning) falls the other side of
 * UTC: the reading is there, the app reports it missing. Harmless when it only
 * meant a field went unfilled; actively wrong now that post-sync reconciliation
 * asks the user for anything a source didn't cover.
 */
export function metricForDate(
  readings: MetricReading[],
  metric: string,
  dateKey: string,
): MetricReading | undefined {
  let best: MetricReading | undefined;
  for (const r of readings) {
    if (r.metric !== metric) continue;
    const at = new Date(r.ts);
    if (Number.isNaN(at.getTime()) || localDateKey(at) !== dateKey) continue;
    if (!best || r.ts > best.ts) best = r;
  }
  return best;
}

/** kg → the user's unit. Readings are stored canonically in kg (spec 06). */
export function weightInUnits(kg: number, units: 'metric' | 'imperial'): number {
  const v = units === 'imperial' ? kg * 2.20462 : kg;
  return Math.round(v * 10) / 10;
}
