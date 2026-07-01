import type { CheckinEntry, DoseEvent } from '@/lib/store';

/**
 * Ask Pepi — the query contract (product review, 2026-06-30).
 *
 * Three-stage pipeline: intent → query → answer. The `PepiQuery` type is the
 * stable seam. MVP produces it from a deterministic keyword matcher
 * (`intent.ts`); V2 will produce the same shape from an AI intent parser
 * (falling back to the matcher) and add metric kinds — the pure executor
 * (`execute.ts`) and the answer renderer never change. Keep this contract
 * additive: new metric/aggregation kinds extend the unions, they don't reshape.
 */

/** Numeric check-in fields Ask Pepi can query (all sourced from CheckinEntry). */
export type CheckinMetricField =
  | 'weight'
  | 'sleep_quality'
  | 'wellness'
  | 'appetite'
  | 'energy'
  | 'soreness'
  | 'workout_effort'
  | 'libido'
  | 'protein'
  | 'calories';

export type QueryMetric =
  | { kind: 'checkin'; field: CheckinMetricField }
  // V2 adds: { kind: 'reading'; canonical: string } for integration metrics
  // (steps, HR, HRV, sleep duration) — same executor pattern, new source.
  | { kind: 'dose'; slug?: string };

/** Rolling windows (calendar-week precision is a V2 nicety). */
export type Timeframe = 'today' | 'last_7' | 'prior_7' | 'last_30' | 'this_month' | 'all';

export type Aggregation = 'latest' | 'average' | 'sum' | 'count' | 'max' | 'min';

/** Semantic unit tag; the UI maps it to a localized label (weight honours the
 * user's metric/imperial preference). */
export type UnitTag = 'weight' | 'rating' | 'g' | 'kcal' | 'count';

export type PepiQuery = {
  metric: QueryMetric;
  agg: Aggregation;
  timeframe: Timeframe;
  /** When set, the answer compares `timeframe` against this period. */
  compareTo?: Timeframe;
  /** Original user text (display / future AI phrasing); absent for chip queries. */
  rawText?: string;
};

export type PepiAnswer =
  | {
      kind: 'value';
      metric: QueryMetric;
      value: number;
      unit: UnitTag;
      agg: Aggregation;
      timeframe: Timeframe;
      sampleCount: number;
    }
  | {
      kind: 'compare';
      metric: QueryMetric;
      value: number; // current period
      prior: number; // comparison period
      unit: UnitTag;
      timeframe: Timeframe;
      compareTo: Timeframe;
    }
  | {
      kind: 'extremum';
      metric: QueryMetric;
      value: number;
      unit: UnitTag;
      dir: 'max' | 'min';
      dateKey: string;
      timeframe: Timeframe;
    }
  | { kind: 'insufficient'; metric?: QueryMetric; reason: 'no_data' | 'not_understood' };

/** Everything the executor reads. Pure in → pure out (offline, no AI). */
export type QueryData = {
  entries: Record<string, CheckinEntry>;
  doseEvents: DoseEvent[];
};
