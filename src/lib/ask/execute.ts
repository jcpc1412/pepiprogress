import { shiftDateKey } from '@/lib/dates';
import { localDateKey } from '@/lib/store';

import type {
  Aggregation,
  PepiAnswer,
  PepiQuery,
  QueryData,
  QueryMetric,
  Timeframe,
  UnitTag,
} from './types';

function unitFor(metric: QueryMetric): UnitTag {
  if (metric.kind === 'dose') return 'count';
  if (metric.field === 'weight') return 'weight';
  if (metric.field === 'protein') return 'g';
  if (metric.field === 'calories') return 'kcal';
  return 'rating';
}

/** A date-key predicate for a rolling window, relative to `today`. */
function inWindow(tf: Timeframe, today: string): (key: string) => boolean {
  switch (tf) {
    case 'today':
      return (k) => k === today;
    case 'last_7':
      return (k) => k > shiftDateKey(today, -7) && k <= today;
    case 'prior_7':
      return (k) => k > shiftDateKey(today, -14) && k <= shiftDateKey(today, -7);
    case 'last_30':
      return (k) => k > shiftDateKey(today, -30) && k <= today;
    case 'this_month':
      return (k) => k.slice(0, 7) === today.slice(0, 7);
    case 'all':
      return () => true;
  }
}

/** Collect { dateKey, value } samples for a metric within a window. */
function samples(
  metric: QueryMetric,
  data: QueryData,
  within: (key: string) => boolean,
): { dateKey: string; value: number }[] {
  if (metric.kind === 'dose') {
    // One sample per dose event (value 1); aggregation counts/sums them.
    const out: { dateKey: string; value: number }[] = [];
    for (const d of data.doseEvents) {
      if (metric.slug && d.compoundSlug !== metric.slug) continue;
      const key = localDateKey(new Date(d.takenAt));
      if (!within(key)) continue;
      out.push({ dateKey: key, value: 1 });
    }
    return out;
  }
  const out: { dateKey: string; value: number }[] = [];
  for (const [key, entry] of Object.entries(data.entries)) {
    if (!within(key)) continue;
    const v = entry[metric.field];
    if (typeof v === 'number' && Number.isFinite(v)) out.push({ dateKey: key, value: v });
  }
  return out;
}

function aggregate(values: number[], agg: Aggregation): number {
  if (agg === 'sum' || agg === 'count') return values.reduce((a, b) => a + b, 0);
  if (agg === 'average') return values.reduce((a, b) => a + b, 0) / values.length;
  if (agg === 'max') return Math.max(...values);
  if (agg === 'min') return Math.min(...values);
  return values[values.length - 1]; // latest handled by caller ordering
}

function round(value: number, unit: UnitTag): number {
  if (unit === 'rating') return Math.round(value * 10) / 10;
  if (unit === 'weight') return Math.round(value * 10) / 10;
  return Math.round(value);
}

/**
 * Pure, offline, deterministic. Given a query and the local store data, produce
 * a structured answer. Never throws; missing data returns an `insufficient`
 * answer. Reused verbatim in V2 (the AI only phrases the result on top).
 */
export function executeQuery(query: PepiQuery, data: QueryData, today: string): PepiAnswer {
  const { metric } = query;
  const unit = unitFor(metric);

  // Comparison: aggregate both windows (average unless the query asked to sum).
  if (query.compareTo) {
    const agg: Aggregation = query.agg === 'sum' || query.agg === 'count' ? query.agg : 'average';
    const cur = samples(metric, data, inWindow(query.timeframe, today)).map((s) => s.value);
    const prev = samples(metric, data, inWindow(query.compareTo, today)).map((s) => s.value);
    if (cur.length === 0 || prev.length === 0) {
      return { kind: 'insufficient', metric, reason: 'no_data' };
    }
    return {
      kind: 'compare',
      metric,
      value: round(aggregate(cur, agg), unit),
      prior: round(aggregate(prev, agg), unit),
      unit,
      timeframe: query.timeframe,
      compareTo: query.compareTo,
    };
  }

  const found = samples(metric, data, inWindow(query.timeframe, today)).sort((a, b) =>
    a.dateKey < b.dateKey ? -1 : 1,
  );
  if (found.length === 0) return { kind: 'insufficient', metric, reason: 'no_data' };

  // Extremum: return the peak/low value and the day it happened.
  if (query.agg === 'max' || query.agg === 'min') {
    let best = found[0];
    for (const s of found) {
      if (query.agg === 'max' ? s.value > best.value : s.value < best.value) best = s;
    }
    return {
      kind: 'extremum',
      metric,
      value: round(best.value, unit),
      unit,
      dir: query.agg,
      dateKey: best.dateKey,
      timeframe: query.timeframe,
    };
  }

  // Value: latest / average / sum / count.
  const values = found.map((s) => s.value);
  const raw = query.agg === 'latest' ? values[values.length - 1] : aggregate(values, query.agg);
  return {
    kind: 'value',
    metric,
    value: round(raw, unit),
    unit,
    agg: query.agg,
    timeframe: query.timeframe,
    sampleCount: found.length,
  };
}
