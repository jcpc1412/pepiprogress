import type { MetricReading } from '@/lib/store';

/**
 * Auto-fill from integration data (spec 06 — "lower the logging burden").
 * Finds the most recent reading for a canonical metric on a given local date,
 * so the daily check-in can offer to fill a field the user would otherwise type.
 */
export function metricForDate(
  readings: MetricReading[],
  metric: string,
  dateKey: string,
): MetricReading | undefined {
  let best: MetricReading | undefined;
  for (const r of readings) {
    if (r.metric !== metric) continue;
    if (r.ts.slice(0, 10) !== dateKey) continue;
    if (!best || r.ts > best.ts) best = r;
  }
  return best;
}

/** kg → the user's unit. Readings are stored canonically in kg (spec 06). */
export function weightInUnits(kg: number, units: 'metric' | 'imperial'): number {
  const v = units === 'imperial' ? kg * 2.20462 : kg;
  return Math.round(v * 10) / 10;
}
