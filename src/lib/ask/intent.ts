import type { Aggregation, CheckinMetricField, PepiQuery, QueryMetric, Timeframe } from './types';

/**
 * Deterministic English keyword matcher (MVP). Maps free text to a `PepiQuery`
 * or null (not understood). English-only on purpose: free-text parsing in the
 * other five locales is the V2 upgrade (an AI intent parser emitting the same
 * `PepiQuery`, with this matcher as the offline fast-path). Localized discovery
 * happens through the pre-built suggestion chips below, which bypass the matcher
 * entirely — so the feature is fully usable in every locale today.
 */

const METRIC_KEYWORDS: { re: RegExp; metric: QueryMetric }[] = [
  { re: /\b(body\s?weight|weight|scale|heaviest|lightest)\b/, metric: { kind: 'checkin', field: 'weight' } },
  { re: /\bsleep\b/, metric: { kind: 'checkin', field: 'sleep_quality' } },
  { re: /\benergy\b/, metric: { kind: 'checkin', field: 'energy' } },
  { re: /\b(wellness|wellbeing|well-being|mood)\b/, metric: { kind: 'checkin', field: 'wellness' } },
  { re: /\b(appetite|hunger)\b/, metric: { kind: 'checkin', field: 'appetite' } },
  { re: /\b(soreness|sore)\b/, metric: { kind: 'checkin', field: 'soreness' } },
  { re: /\b(workout|training|effort|session)\b/, metric: { kind: 'checkin', field: 'workout_effort' } },
  { re: /\b(libido|sex\s?drive)\b/, metric: { kind: 'checkin', field: 'libido' } },
  { re: /\bprotein\b/, metric: { kind: 'checkin', field: 'protein' } },
  { re: /\b(calories|calorie|kcal|cals)\b/, metric: { kind: 'checkin', field: 'calories' } },
  { re: /\b(dose|doses|inject|injection|injections|shot|shots)\b/, metric: { kind: 'dose' } },
];

function detectTimeframe(text: string): Timeframe | undefined {
  if (/\btoday\b/.test(text)) return 'today';
  if (/\b(this month)\b/.test(text)) return 'this_month';
  if (/\b(last month|past month|last 30|30 days)\b/.test(text)) return 'last_30';
  if (/\b(last week|previous week)\b/.test(text)) return 'prior_7';
  if (/\b(this week|last 7|past 7|past week|7 days|last seven)\b/.test(text)) return 'last_7';
  if (/\b(all time|all-time|ever|overall)\b/.test(text)) return 'all';
  return undefined;
}

function detectAgg(text: string): Aggregation | undefined {
  if (/\b(average|avg|mean|typical)\b/.test(text)) return 'average';
  if (/\b(most|highest|best|max|peak|heaviest)\b/.test(text)) return 'max';
  if (/\b(least|lowest|worst|min|lightest)\b/.test(text)) return 'min';
  if (/\b(total|sum)\b/.test(text)) return 'sum';
  if (/\b(how many|count|number of)\b/.test(text)) return 'count';
  if (/\b(latest|current|now)\b/.test(text)) return 'latest';
  return undefined;
}

const COMPARE_RE = /\b(vs|versus|compared? to|compare)\b/;

export function matchQuery(input: string): PepiQuery | null {
  const text = input.toLowerCase().trim();
  if (!text) return null;

  const hit = METRIC_KEYWORDS.find((m) => m.re.test(text));
  if (!hit) return null;
  const metric = hit.metric;

  // Comparison: "X this week vs last week" (or any explicit compare phrasing).
  const wantsCompare = COMPARE_RE.test(text) || (/\bthis week\b/.test(text) && /\blast week\b/.test(text));
  if (wantsCompare) {
    return { metric, agg: 'average', timeframe: 'last_7', compareTo: 'prior_7', rawText: input };
  }

  const explicitAgg = detectAgg(text);
  // Doses have no scalar value to average — default to a count.
  const agg: Aggregation = metric.kind === 'dose' ? explicitAgg ?? 'count' : explicitAgg ?? 'latest';

  const explicitTf = detectTimeframe(text);
  // Sensible default window per aggregation when the user didn't name one.
  const defaultTf: Timeframe =
    agg === 'latest' ? 'all' : agg === 'max' || agg === 'min' ? 'last_30' : 'last_7';

  return { metric, agg, timeframe: explicitTf ?? defaultTf, rawText: input };
}

/** Pre-built queries surfaced as tap-to-run chips. Localized display label
 * (`labelKey`) + a fixed query that bypasses the English matcher — so discovery
 * works identically in every locale. */
export const SUGGESTED_QUERIES: { labelKey: string; query: PepiQuery }[] = [
  {
    labelKey: 'ask.sugSleepAvg',
    query: { metric: { kind: 'checkin', field: 'sleep_quality' }, agg: 'average', timeframe: 'last_7' },
  },
  {
    labelKey: 'ask.sugWeightTrend',
    query: { metric: { kind: 'checkin', field: 'weight' }, agg: 'average', timeframe: 'last_7', compareTo: 'prior_7' },
  },
  {
    labelKey: 'ask.sugProteinAvg',
    query: { metric: { kind: 'checkin', field: 'protein' }, agg: 'average', timeframe: 'last_7' },
  },
  {
    labelKey: 'ask.sugEnergyBest',
    query: { metric: { kind: 'checkin', field: 'energy' }, agg: 'max', timeframe: 'last_30' },
  },
  {
    labelKey: 'ask.sugDoses',
    query: { metric: { kind: 'dose' }, agg: 'count', timeframe: 'last_7' },
  },
];

export type { CheckinMetricField };
