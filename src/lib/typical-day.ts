/**
 * Typical-day baselines (spec 15): pure, deterministic core.
 *
 * When a repetitive metric (nutrition, sleep) barely gets logged but is roughly
 * the same every day, the user sets a one-time baseline and the daily log
 * collapses to three chips: usual / less than usual / more than usual. Each chip
 * writes ordinary {@link MetricReading}s tagged `sourceProvider: 'typical'` at low
 * confidence, so charts + the verdict engine treat them as estimated, lower-
 * priority data (the "still considered, never dominant" contract).
 *
 * No RN / i18n / network imports here; this module only holds the group
 * definitions, eligibility rule, multiplier math, precedence resolver, reading
 * builder, and the deterministic free-text deviation matcher. Surfaces + the
 * store wire it up.
 *
 * Legal (rung 1): recording only. Nothing here suggests eating/sleeping more or
 * less; the chips describe what happened, the baseline states what is normal.
 */

import type { MetricReading } from '@/lib/store';

export type TypicalGroup = 'nutrition' | 'sleep';
export type TypicalLevel = 'usual' | 'less' | 'more';
export type TypicalPromptStatus = 'notified' | 'asked' | 'declined' | 'active';

/** One canonical metric inside a group, with validation bounds + the check-in
 *  field a manual number would land in (for precedence). */
export type TypicalMetricDef = {
  /** Canonical metric key (see integrations/types.ts). */
  metric: string;
  /** Inclusive validation range for the typical daily value. */
  min: number;
  max: number;
  /** i18n key for the unit suffix. */
  unitKey: string;
  /** i18n key for the metric's short label. */
  labelKey: string;
  /** The `CheckinEntry` field a manual exact entry writes to, if any, used by the
   *  precedence resolver so a typed number always beats a typical estimate. */
  checkinField?: 'calories' | 'protein';
};

export type TypicalGroupDef = {
  group: TypicalGroup;
  metrics: TypicalMetricDef[];
};

/** Tag on every reading this feature writes, so it can be identified, excluded
 *  from community aggregates, and cleared as a batch. */
export const TYPICAL_SOURCE = 'typical';

/** Fixed 25% deviation step (decision 5): usual ×1.0, less ×0.75, more ×1.25. */
export const TYPICAL_MULTIPLIER: Record<TypicalLevel, number> = {
  usual: 1,
  less: 0.75,
  more: 1.25,
};

/** Explicit chip tap vs silent "usual" fill (decision 7). */
export const TYPICAL_TAP_CONFIDENCE = 0.6;
export const TYPICAL_SILENT_CONFIDENCE = 0.3;

/** The two groups shipped in v1 (decision 3). Generic primitive: adding a group
 *  is one entry here plus its i18n + baseline UI, no engine change. */
export const TYPICAL_GROUPS: Record<TypicalGroup, TypicalGroupDef> = {
  nutrition: {
    group: 'nutrition',
    metrics: [
      { metric: 'nutrition.energy', min: 800, max: 10000, unitKey: 'units.kcal', labelKey: 'fields.calories', checkinField: 'calories' },
      { metric: 'nutrition.protein', min: 20, max: 500, unitKey: 'units.g', labelKey: 'fields.protein', checkinField: 'protein' },
    ],
  },
  sleep: {
    group: 'sleep',
    metrics: [
      { metric: 'sleep.duration', min: 3, max: 14, unitKey: 'units.hours', labelKey: 'typical.sleepDuration' },
    ],
  },
};

export const TYPICAL_GROUP_ORDER: TypicalGroup[] = ['nutrition', 'sleep'];

/** One stored baseline (rides the profile / user_state snapshot). */
export type TypicalBaseline = {
  group: TypicalGroup;
  /** Canonical metric key → typical daily value. */
  values: Record<string, number>;
  setAt: string; // ISO
  enabled: boolean;
};

/** ISO local-noon timestamp for a date's typical readings (one per metric/day). */
export function typicalTs(dateKey: string): string {
  return `${dateKey}T12:00:00.000Z`;
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

/** Find the active (enabled) baseline for a group, if any. */
export function baselineFor(
  baselines: TypicalBaseline[] | undefined,
  group: TypicalGroup,
): TypicalBaseline | undefined {
  return (baselines ?? []).find((b) => b.group === group && b.enabled);
}

/** Validate + normalize a proposed baseline value for a metric. Returns null when
 *  out of range or not finite. */
export function validateTypicalValue(def: TypicalMetricDef, value: number): number | null {
  if (!Number.isFinite(value)) return null;
  if (value < def.min || value > def.max) return null;
  return round1(value);
}

/** Whether a metric already has a higher-precedence value on a date than a typical
 *  estimate (decision 8: manual number > synced reading > chip > silent). A
 *  non-typical reading (synced) or a manually-typed check-in field both win. */
export function hasHigherPrecedence(opts: {
  metric: string;
  dateKey: string;
  checkinField?: 'calories' | 'protein';
  readings: MetricReading[];
  checkinValue?: number;
}): boolean {
  const { metric, dateKey, readings, checkinValue } = opts;
  if (typeof checkinValue === 'number' && Number.isFinite(checkinValue)) return true;
  for (const r of readings) {
    if (r.sourceProvider === TYPICAL_SOURCE) continue;
    if (r.metric !== metric) continue;
    if (r.ts.slice(0, 10) !== dateKey) continue;
    return true;
  }
  return false;
}

/** Build the typical readings for a group on a date at a deviation level, honoring
 *  precedence (a metric with a manual/synced value that day is skipped). Pure: the
 *  store assigns ids. Callers must first remove any existing typical readings for
 *  the group's metrics on that date (this only produces the new set). */
export function buildTypicalReadings(opts: {
  baseline: TypicalBaseline;
  dateKey: string;
  level: TypicalLevel;
  confidence: number;
  /** All current readings (to check precedence against synced values). */
  readings: MetricReading[];
  /** Current check-in values keyed by metric's checkinField (manual precedence). */
  checkinValues?: Partial<Record<'calories' | 'protein', number | undefined>>;
}): Omit<MetricReading, 'id'>[] {
  const { baseline, dateKey, level, confidence, readings, checkinValues } = opts;
  const def = TYPICAL_GROUPS[baseline.group];
  const ts = typicalTs(dateKey);
  const out: Omit<MetricReading, 'id'>[] = [];
  const mult = TYPICAL_MULTIPLIER[level];
  for (const m of def.metrics) {
    const base = baseline.values[m.metric];
    if (typeof base !== 'number' || !Number.isFinite(base)) continue;
    const checkinValue = m.checkinField ? checkinValues?.[m.checkinField] : undefined;
    if (hasHigherPrecedence({ metric: m.metric, dateKey, checkinField: m.checkinField, readings, checkinValue })) {
      continue;
    }
    out.push({
      metric: m.metric,
      value: round1(base * mult),
      unit: m.metric.startsWith('nutrition.energy') ? 'kcal' : undefined,
      ts,
      sourceProvider: TYPICAL_SOURCE,
      confidence,
    });
  }
  return out;
}

/** Remove all typical readings for a group's metrics on a specific date. */
export function withoutTypicalForDate(
  readings: MetricReading[],
  group: TypicalGroup,
  dateKey: string,
): MetricReading[] {
  const metrics = new Set(TYPICAL_GROUPS[group].metrics.map((m) => m.metric));
  return readings.filter(
    (r) => !(r.sourceProvider === TYPICAL_SOURCE && metrics.has(r.metric) && r.ts.slice(0, 10) === dateKey),
  );
}

/** Remove every typical reading for a group (the "clear estimated history" action). */
export function withoutTypicalForGroup(
  readings: MetricReading[],
  group: TypicalGroup,
): MetricReading[] {
  const metrics = new Set(TYPICAL_GROUPS[group].metrics.map((m) => m.metric));
  return readings.filter((r) => !(r.sourceProvider === TYPICAL_SOURCE && metrics.has(r.metric)));
}

/** Remove the typical reading for a single canonical metric on a date, used when a
 *  later manual check-in entry supersedes it (decision 8). */
export function withoutTypicalMetric(
  readings: MetricReading[],
  metric: string,
  dateKey: string,
): MetricReading[] {
  return readings.filter(
    (r) => !(r.sourceProvider === TYPICAL_SOURCE && r.metric === metric && r.ts.slice(0, 10) === dateKey),
  );
}

/** The current deviation level for a group on a date, inferred from the typical
 *  reading present (via its ratio to the baseline). Null when no chip is set. */
export function currentTypicalLevel(
  readings: MetricReading[],
  baseline: TypicalBaseline,
  dateKey: string,
): TypicalLevel | null {
  const def = TYPICAL_GROUPS[baseline.group];
  const primary = def.metrics[0];
  const base = baseline.values[primary.metric];
  if (typeof base !== 'number' || base <= 0) return null;
  const reading = readings.find(
    (r) =>
      r.sourceProvider === TYPICAL_SOURCE &&
      r.metric === primary.metric &&
      r.ts.slice(0, 10) === dateKey,
  );
  if (!reading) return null;
  const ratio = reading.value / base;
  if (ratio <= 0.875) return 'less';
  if (ratio >= 1.125) return 'more';
  return 'usual';
}

/** Whether a date already has any value (typical, synced, or manual) for a group:
 *  gates the silent fill (only fill when there's genuinely nothing). */
export function groupHasValueForDate(opts: {
  group: TypicalGroup;
  dateKey: string;
  readings: MetricReading[];
  checkinValues?: Partial<Record<'calories' | 'protein', number | undefined>>;
}): boolean {
  const { group, dateKey, readings, checkinValues } = opts;
  const def = TYPICAL_GROUPS[group];
  for (const m of def.metrics) {
    if (m.checkinField && typeof checkinValues?.[m.checkinField] === 'number') return true;
    for (const r of readings) {
      if (r.metric !== m.metric) continue;
      if (r.ts.slice(0, 10) !== dateKey) continue;
      return true;
    }
  }
  return false;
}

/** Count of distinct days in the trailing window with any value for a group's
 *  metrics (manual or synced, excluding typical). Drives the sparsity gate. */
export function groupDataPointsInWindow(opts: {
  group: TypicalGroup;
  readings: MetricReading[];
  entries: Record<string, { calories?: number; protein?: number }>;
  windowStart: string; // YYYY-MM-DD inclusive
  windowEnd: string; // YYYY-MM-DD inclusive
}): number {
  const { group, readings, entries, windowStart, windowEnd } = opts;
  const def = TYPICAL_GROUPS[group];
  const metrics = new Set(def.metrics.map((m) => m.metric));
  const inWindow = (dk: string) => dk >= windowStart && dk <= windowEnd;
  const days = new Set<string>();
  for (const r of readings) {
    if (r.sourceProvider === TYPICAL_SOURCE) continue;
    if (!metrics.has(r.metric)) continue;
    const dk = r.ts.slice(0, 10);
    if (inWindow(dk)) days.add(dk);
  }
  for (const [dk, e] of Object.entries(entries)) {
    if (!inWindow(dk)) continue;
    for (const m of def.metrics) {
      if (m.checkinField && typeof e[m.checkinField] === 'number') {
        days.add(dk);
        break;
      }
    }
  }
  return days.size;
}

/**
 * Eligibility for the one-time prompt (spec 15 §UX.1), evaluated locally. All
 * must hold:
 *  - relevant: the group's metrics matter to this user (passed in as `relevant`),
 *  - sparse: < 3 data points for the group in the last 14 days,
 *  - established: 7+ days since the first check-in (never onboarding week),
 *  - no connected integration supplying the group's metrics (`integrationSupplies`),
 *  - not already prompted/answered (status undefined).
 */
export function typicalPromptEligible(opts: {
  relevant: boolean;
  status?: TypicalPromptStatus;
  dataPoints: number;
  daysSinceFirstEntry: number;
  integrationSupplies: boolean;
}): boolean {
  if (!opts.relevant) return false;
  if (opts.status !== undefined) return false;
  if (opts.integrationSupplies) return false;
  if (opts.dataPoints >= 3) return false;
  if (opts.daysSinceFirstEntry < 7) return false;
  return true;
}

/** Whether a group's metrics matter to this user (goals + surfaced fields). */
export function typicalGroupRelevant(
  group: TypicalGroup,
  goals: string[],
  surfacedFields: string[],
): boolean {
  if (group === 'nutrition') {
    return (
      goals.includes('weight_loss') ||
      goals.includes('body_comp') ||
      surfacedFields.includes('calories') ||
      surfacedFields.includes('protein')
    );
  }
  return goals.includes('sleep') || surfacedFields.includes('sleep_quality');
}

/**
 * The first group eligible for the one-time prompt, shared by the Pepi opener and
 * the local notification. `allowNotified` lets the opener still show after the
 * notification fired (status 'notified'), while the notification gate stays strict
 * (status must be truly unset).
 */
export function firstEligibleTypicalGroup(opts: {
  goals: string[];
  surfacedFields: string[];
  promptState?: Partial<Record<TypicalGroup, TypicalPromptStatus>>;
  entries: Record<string, { calories?: number; protein?: number }>;
  readings: MetricReading[];
  windowStart: string;
  windowEnd: string;
  daysSinceFirstEntry: number;
  allowNotified: boolean;
}): TypicalGroup | null {
  for (const g of TYPICAL_GROUP_ORDER) {
    let status = opts.promptState?.[g];
    if (opts.allowNotified && status === 'notified') status = undefined;
    const dataPoints = groupDataPointsInWindow({
      group: g,
      readings: opts.readings,
      entries: opts.entries,
      windowStart: opts.windowStart,
      windowEnd: opts.windowEnd,
    });
    if (
      typicalPromptEligible({
        relevant: typicalGroupRelevant(g, opts.goals, opts.surfacedFields),
        status,
        dataPoints,
        daysSinceFirstEntry: opts.daysSinceFirstEntry,
        integrationSupplies: false,
      })
    ) {
      return g;
    }
  }
  return null;
}

/**
 * Deterministic free-text deviation matcher for Pepi (spec 15 §UX.3). Recognizes
 * simple "ate more/less than usual", "light/big eating day", "slept less/more"
 * phrasing without a network call. Only matches groups that have an active
 * baseline. Returns the group + level, or null. English + a few high-frequency
 * localized cues; the AI parse can extend coverage later.
 */
export function matchTypicalDeviation(
  text: string,
  activeGroups: TypicalGroup[],
): { group: TypicalGroup; level: TypicalLevel } | null {
  const s = text.toLowerCase();
  const has = (arr: string[]) => arr.some((w) => s.includes(w));

  const nutritionCue = has(['ate', 'eat', 'eating', 'food', 'meal', 'comí', 'comida', 'mangé', 'gegessen', 'comi', 'ел', 'еда']);
  const sleepCue = has(['slept', 'sleep', 'dormí', 'dormi', 'sommeil', 'dormir', 'geschlafen', 'schlaf', 'спал', 'сон']);
  const moreCue = has(['more', 'big', 'heavy', 'lot', 'extra', 'más', 'mas', 'plus', 'mehr', 'mais', 'больше']);
  const lessCue = has(['less', 'light', 'skip', 'little', 'menos', 'moins', 'weniger', 'meno', 'меньше', 'light day']);

  const level: TypicalLevel | null = moreCue ? 'more' : lessCue ? 'less' : null;
  if (!level) return null;

  if (nutritionCue && activeGroups.includes('nutrition')) return { group: 'nutrition', level };
  if (sleepCue && activeGroups.includes('sleep')) return { group: 'sleep', level };
  return null;
}
