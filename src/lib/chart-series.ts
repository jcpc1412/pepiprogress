import { bodyFatNavy } from '@/lib/body-composition';
import { deriveMetrics, type DerivedMetricKey, type DerivedProfile } from '@/lib/derived-metrics';
import type { CheckinEntry, MetricReading } from '@/lib/store';

/**
 * Single source of truth for the trend charts shown on the Today dashboard and the
 * Insights tab. Both surfaces used to build their series independently and drifted
 * (the Insights charts silently ignored integration + derived data); this module
 * merges the three data sources once so they can't diverge again:
 *   1. manual check-in entries (always win),
 *   2. integration metricReadings (Apple Health etc. — fill days with no check-in),
 *   3. wearable-derived estimates (deriveMetrics — the dashed overlay).
 */

export type ChartMetricConfig = {
  /** Stable id used for selection + persistence (profile.dashboardMetrics). */
  id: string;
  labelKey: string;
  unitKey?: string;
  /** Manual check-in field. Omit for wearable-only insight metrics. */
  checkinKey?: keyof CheckinEntry;
  /** Canonical integration metric that supplements the manual series. */
  canonicalMetric?: string;
  /** Derived metric key (deriveMetrics output). */
  derivedKey?: DerivedMetricKey;
  /** Computed-from-checkin metric (multiple fields + profile). Currently only the
   *  sex-aware body-fat estimate (R2-B). */
  computed?: 'body_fat_pct';
};

/** The full chart catalog. The first four are the core subjective/weight trends;
 *  the rest are opt-in wearable-only insight metrics (no manual entry). */
export const CHART_METRICS: ChartMetricConfig[] = [
  { id: 'weight',        labelKey: 'fields.weight',        checkinKey: 'weight',        canonicalMetric: 'body.weight' },
  // Body-composition signals (R2-B). body_fat_pct is the sex-aware primary; waist/hips are
  // sex-weighted proxies. All three are sparse (only days with measurements logged).
  { id: 'body_fat_pct',  labelKey: 'fields.body_fat_pct',  computed: 'body_fat_pct' },
  { id: 'waist',         labelKey: 'measurements.waist',   checkinKey: 'waist' },
  { id: 'hips',          labelKey: 'measurements.hips',    checkinKey: 'hips' },
  { id: 'energy',        labelKey: 'fields.energy',        checkinKey: 'energy',        derivedKey: 'energy' },
  { id: 'sleep_quality', labelKey: 'fields.sleep_quality', checkinKey: 'sleep_quality', derivedKey: 'sleep_quality' },
  { id: 'soreness',      labelKey: 'fields.soreness',      checkinKey: 'soreness',      derivedKey: 'soreness' },
  { id: 'sleep_deep_pct',     labelKey: 'fields.sleep_deep_pct',     derivedKey: 'sleep_deep_pct' },
  { id: 'sleep_rem_pct',      labelKey: 'fields.sleep_rem_pct',      derivedKey: 'sleep_rem_pct' },
  { id: 'protein_adequacy',   labelKey: 'fields.protein_adequacy',   derivedKey: 'protein_adequacy' },
  { id: 'caloric_balance',    labelKey: 'fields.caloric_balance',    derivedKey: 'caloric_balance' },
  { id: 'body_comp_velocity', labelKey: 'fields.body_comp_velocity', derivedKey: 'body_comp_velocity' },
  { id: 'cv_strain',          labelKey: 'fields.cv_strain',          derivedKey: 'cv_strain' },
  { id: 'inflammation',       labelKey: 'fields.inflammation',       derivedKey: 'inflammation' },
];

/** Charts shown by default (the original four); insight metrics are opt-in. */
export const DEFAULT_CHART_METRIC_IDS = ['weight', 'energy', 'sleep_quality', 'soreness'];

export type DatedPoint = { dateKey: string; value: number };

export type MetricSeries = ChartMetricConfig & {
  /** Solid line: manual + integration (or derived, for insight-only metrics). */
  primary: DatedPoint[];
  /** Dashed overlay: wearable-derived estimate. Empty for insight-only metrics. */
  estimated: DatedPoint[];
  /** True when the metric has no manual equivalent (renders derived as primary). */
  insightOnly: boolean;
};

export type ChartProfile = DerivedProfile & {
  estimatedMetricsMode?: 'off' | 'fill' | 'always';
  /** Height in cm (already converted from the user's units), for body_fat_pct. */
  heightCm?: number;
  /** Unit system for interpreting measurement checkin fields (waist/neck/hips). */
  units?: 'metric' | 'imperial';
  /** Selects the Navy body-fat formula by sex (see usesFemaleFormula). */
  female?: boolean;
  /** Onboarding body-fat baseline (%). Lowest-priority source in the body_fat_pct
   *  chain, so the metric is never invisible when a value exists somewhere. */
  bodyFatPct?: number;
};

/** Latest date-key across manual entries + integration readings (for anchoring a
 *  trailing window). Returns undefined when there's no data at all. */
export function latestDataDate(
  entries: Record<string, CheckinEntry>,
  metricReadings: MetricReading[],
): string | undefined {
  let max = '';
  for (const d of Object.keys(entries)) if (d > max) max = d;
  for (const r of metricReadings) {
    const d = r.ts.slice(0, 10);
    if (d > max) max = d;
  }
  return max || undefined;
}

/**
 * Build the merged series for the selected metrics, optionally clipped to an
 * inclusive [windowStart, windowEnd] date-key window (YYYY-MM-DD; string-comparable).
 */
export function buildMetricSeries(opts: {
  selectedIds: string[];
  entries: Record<string, CheckinEntry>;
  metricReadings: MetricReading[];
  profile: ChartProfile;
  windowStart?: string;
  windowEnd?: string;
  /** Explained-anomalous day keys (W3-10): excluded from derived baselines. */
  excludeDates?: Set<string>;
}): MetricSeries[] {
  const { selectedIds, entries, metricReadings, profile, windowStart, windowEnd, excludeDates } = opts;

  // Integration readings: metric → dateKey → value (most recent reading per day;
  // addMetricReadings stores newest-first, so the first write per day wins).
  const readingsByMetric = new Map<string, Map<string, number>>();
  for (const r of metricReadings) {
    if (typeof r.value !== 'number') continue;
    let byDate = readingsByMetric.get(r.metric);
    if (!byDate) { byDate = new Map(); readingsByMetric.set(r.metric, byDate); }
    const dk = r.ts.slice(0, 10);
    if (!byDate.has(dk)) byDate.set(dk, r.value);
  }

  const estMode = profile.estimatedMetricsMode ?? 'fill';
  const derived = estMode === 'off'
    ? null
    : deriveMetrics(metricReadings, { dobISO: profile.dobISO, sex: profile.sex }, excludeDates);

  const inWindow = (dk: string) =>
    (windowStart === undefined || dk >= windowStart) &&
    (windowEnd === undefined || dk <= windowEnd);
  const byDateAsc = (a: DatedPoint, b: DatedPoint) => a.dateKey.localeCompare(b.dateKey);

  const entryDates = Object.keys(entries);

  return CHART_METRICS.filter((m) => selectedIds.includes(m.id)).map((m) => {
    // Computed body-fat %: per-day sex-aware Navy estimate from that day's tape
    // measurements + height. Sparse; the engine's MIN_POINTS gate hides it until
    // enough days carry measurements. bodyFatNavy returns null for incomplete days.
    if (m.computed === 'body_fat_pct') {
      // Source-of-truth priority chain per day (Track A2): a real device reading
      // (Health `body.fat_pct`) wins; else the sex-aware Navy estimate from that
      // day's tape + height; else, if nothing resolved at all, the onboarding
      // baseline as a single anchor point so the metric is never invisible.
      const primary: DatedPoint[] = [];
      const seen = new Set<string>();

      const measured = readingsByMetric.get('body.fat_pct');
      if (measured) {
        for (const [d, v] of measured) {
          if (!inWindow(d)) continue;
          primary.push({ dateKey: d, value: v });
          seen.add(d);
        }
      }

      for (const d of entryDates) {
        if (!inWindow(d) || seen.has(d)) continue;
        const e = entries[d];
        if (!e) continue;
        const est = bodyFatNavy({
          units: profile.units ?? 'metric',
          heightCm: profile.heightCm,
          waist: typeof e.waist === 'number' ? e.waist : undefined,
          neck: typeof e.neck === 'number' ? e.neck : undefined,
          hip: typeof e.hips === 'number' ? e.hips : undefined,
          female: profile.female,
        });
        if (est) {
          primary.push({ dateKey: d, value: est.pct });
          seen.add(d);
        }
      }

      if (primary.length === 0 && typeof profile.bodyFatPct === 'number') {
        const anchor = windowEnd ?? entryDates.slice().sort().at(-1);
        if (anchor) primary.push({ dateKey: anchor, value: profile.bodyFatPct });
      }

      primary.sort(byDateAsc);
      return { ...m, primary, estimated: [], insightOnly: false };
    }

    const derivedForMetric = m.derivedKey ? derived?.[m.derivedKey] : undefined;
    const insightOnly = !m.checkinKey && !!m.derivedKey;
    const byDate = m.canonicalMetric ? readingsByMetric.get(m.canonicalMetric) : undefined;

    // Insight-only: derived data IS the primary (solid) series, no manual equivalent.
    if (insightOnly) {
      const primary = derivedForMetric
        ? [...derivedForMetric.values()]
            .filter((pt) => inWindow(pt.dateKey))
            .map((pt) => ({ dateKey: pt.dateKey, value: pt.value }))
            .sort(byDateAsc)
        : [];
      return { ...m, primary, estimated: [], insightOnly: true };
    }

    // Primary = manual (wins) ∪ integration, over the union of their dates.
    const dateSet = new Set<string>(entryDates);
    if (byDate) for (const d of byDate.keys()) dateSet.add(d);
    const primary: DatedPoint[] = [];
    for (const d of dateSet) {
      if (!inWindow(d)) continue;
      const manual = m.checkinKey ? entries[d]?.[m.checkinKey] : undefined;
      const value = typeof manual === 'number' ? manual : byDate?.get(d);
      if (typeof value === 'number') primary.push({ dateKey: d, value });
    }
    primary.sort(byDateAsc);

    // Estimated overlay (dashed). 'fill' hides it where a manual value exists.
    const estimated: DatedPoint[] = [];
    if (derivedForMetric) {
      for (const [d, pt] of derivedForMetric) {
        if (!inWindow(d)) continue;
        const hasManual = m.checkinKey ? typeof entries[d]?.[m.checkinKey] === 'number' : false;
        if (estMode === 'fill' && hasManual) continue;
        estimated.push({ dateKey: d, value: pt.value });
      }
      estimated.sort(byDateAsc);
    }
    return { ...m, primary, estimated, insightOnly: false };
  });
}
