import { compoundBySlug } from '@/data/compound-catalog';
import { daysBetween } from '@/lib/dates';
import type { CheckinEntry, MetricReading, ProtocolItem } from '@/lib/store';

/**
 * Per-compound attribution (spec positioning §3.1 / §5.1, W4-14). The single
 * highest-leverage compound feature: for each active protocol item with a start
 * date, compare each relevant outcome metric's pre-start baseline against its
 * post-start window and, crucially, RANK COMPETING EXPLANATIONS rather than
 * crediting the compound by temporal coincidence.
 *
 * The honest, hard-to-copy version: a weight drop that coincides with a
 * retatrutide start AND a calorie-intake drop is attributed to the deficit
 * first, with the compound "possibly contributing". The compound's own strength
 * is the RESIDUAL left after concurrent nutrition/training shifts are accounted
 * for, so it only leads when nothing else moved.
 *
 * Pure + deterministic (no AI, no network): `today` is a parameter. Observational
 * only, hedged, never a dosing or efficacy claim (spec 05/11).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 14; // pre and post window on each side of the start
const MIN_POINTS = 3; // per side, to say anything
const MIN_WEEKS_IN = 1; // need at least a week on it before attributing

export type AttributionFactor = 'compound' | 'nutrition' | 'training';

/** One metric's move since a compound start, with ranked explanations. */
export type MetricAttribution = {
  metricId: OutcomeMetric;
  /** post-window mean minus pre-window mean, in the metric's own units. */
  delta: number;
  /** true when the move is in the compound's intended/favourable direction. */
  favourable: boolean;
  pointsPre: number;
  pointsPost: number;
  /** 0..1: share of sample sufficiency (min side / a comfortable target). */
  confidence: number;
  /** Ranked explanations, strongest first. Always includes 'compound'. */
  factors: { factor: AttributionFactor; strength: number }[];
};

export type CompoundAttribution = {
  slug: string;
  name: string;
  startedAt: string;
  weeksIn: number;
  metrics: MetricAttribution[];
};

type OutcomeMetric =
  | 'weight'
  | 'waist'
  | 'hips'
  | 'energy'
  | 'sleep_quality'
  | 'soreness';

/** Which outcome metrics a compound's effect tags plausibly touch. Keeps the
 *  readout relevant (a GLP-1 attributes weight, not sleep) and honest. */
const EFFECT_METRICS: Record<string, OutcomeMetric[]> = {
  fat_loss: ['weight', 'waist', 'hips'],
  appetite: ['weight', 'waist'],
  muscle: ['weight'],
  recovery: ['soreness', 'energy', 'sleep_quality'],
  sleep: ['sleep_quality', 'energy'],
  healing: ['soreness'],
  mood: ['energy'],
  cognition: ['energy'],
  libido: [],
  skin: [],
  gut: [],
  hormonal: ['energy'],
};

/** Direction that counts as favourable for the compound's goal. A 1-5 subjective
 *  metric is higher-is-better except soreness (lower is better); body measures
 *  depend on the effect (fat_loss wants them down). Resolved per compound below. */
const HIGHER_IS_BETTER: Record<OutcomeMetric, boolean> = {
  weight: false, // resolved per effect; default fat-loss framing
  waist: false,
  hips: false,
  energy: true,
  sleep_quality: true,
  soreness: false,
};

/** Meaningful-move threshold in the metric's own units (below this, no attribution). */
const DELTA_THRESHOLD: Record<OutcomeMetric, number> = {
  weight: 0, // relative; handled specially (>=1%)
  waist: 1,
  hips: 1,
  energy: 0.5,
  sleep_quality: 0.5,
  soreness: 0.5,
};

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Daily series (one value per day, averaged) for an outcome or driver metric,
 *  merging manual check-in fields with matching integration readings. */
function dailySeries(
  entries: Record<string, CheckinEntry>,
  readings: MetricReading[],
  pick: {
    checkinKey?: keyof CheckinEntry;
    canonicalMetric?: string;
  },
): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const add = (key: string, v: unknown) => {
    if (typeof v !== 'number' || Number.isNaN(v)) return;
    const arr = out.get(key);
    if (arr) arr.push(v);
    else out.set(key, [v]);
  };
  if (pick.checkinKey) {
    for (const e of Object.values(entries)) add(e.date, e[pick.checkinKey]);
  }
  if (pick.canonicalMetric) {
    for (const r of readings) if (r.metric === pick.canonicalMetric) add(r.ts.slice(0, 10), r.value);
  }
  return out;
}

/** Mean of a series over [startKey, endKey) (half-open), and the day count. */
function windowMean(
  series: Map<string, number[]>,
  startKey: string,
  endKey: string,
): { value: number | null; points: number } {
  const start = new Date(`${startKey}T00:00:00.000Z`).getTime();
  const end = new Date(`${endKey}T00:00:00.000Z`).getTime();
  const vals: number[] = [];
  for (const [k, xs] of series) {
    const t = new Date(`${k}T00:00:00.000Z`).getTime();
    if (t >= start && t < end && xs.length) vals.push(mean(xs));
  }
  return { value: vals.length ? mean(vals) : null, points: vals.length };
}

function shift(dateKey: string, days: number): string {
  return new Date(new Date(`${dateKey}T00:00:00.000Z`).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Normalized 0..1 strength of a driver's own shift between the two windows. */
function driverStrength(
  series: Map<string, number[]>,
  startKey: string,
  today: string,
  scale: number,
): number {
  const pre = windowMean(series, shift(startKey, -WINDOW_DAYS), startKey);
  const postEnd = shift(startKey, WINDOW_DAYS);
  const post = windowMean(series, startKey, postEnd <= today ? postEnd : today);
  if (pre.value === null || post.value === null) return 0;
  if (pre.points < MIN_POINTS || post.points < MIN_POINTS) return 0;
  return Math.min(1, Math.abs(post.value - pre.value) / scale);
}

export function computeAttributions(input: {
  entries: Record<string, CheckinEntry>;
  metricReadings: MetricReading[];
  protocolItems: ProtocolItem[];
  today: string;
}): CompoundAttribution[] {
  const { entries, metricReadings, today } = input;

  // Driver series shared across every compound (concurrent lifestyle shifts).
  const intake = dailySeries(entries, metricReadings, {
    checkinKey: 'calories',
    canonicalMetric: 'nutrition.energy',
  });
  const training = dailySeries(entries, metricReadings, { checkinKey: 'workout_effort' });

  const outcomeSeries: Record<OutcomeMetric, Map<string, number[]>> = {
    weight: dailySeries(entries, metricReadings, { checkinKey: 'weight', canonicalMetric: 'body.weight' }),
    waist: dailySeries(entries, metricReadings, { checkinKey: 'waist' }),
    hips: dailySeries(entries, metricReadings, { checkinKey: 'hips' }),
    energy: dailySeries(entries, metricReadings, { checkinKey: 'energy' }),
    sleep_quality: dailySeries(entries, metricReadings, { checkinKey: 'sleep_quality' }),
    soreness: dailySeries(entries, metricReadings, { checkinKey: 'soreness' }),
  };

  const out: CompoundAttribution[] = [];

  for (const item of input.protocolItems) {
    if (!item.startedAt) continue;
    const startKey = item.startedAt.slice(0, 10);
    const weeksIn = Math.floor(daysBetween(startKey, today) / 7);
    if (weeksIn < MIN_WEEKS_IN) continue;

    const compound = compoundBySlug(item.compoundSlug);
    const effectTags = compound?.effectTags ?? [];
    const relevant = new Set<OutcomeMetric>();
    for (const tag of effectTags) for (const m of EFFECT_METRICS[tag] ?? []) relevant.add(m);
    if (relevant.size === 0) continue;

    // Nutrition/training shifts around this start (shared window math).
    const nutritionStrength = driverStrength(intake, startKey, today, 400); // ~400 kcal move
    const trainingStrength = driverStrength(training, startKey, today, 1.0); // ~1 point on the 1-5 effort scale

    const metrics: MetricAttribution[] = [];
    for (const metricId of relevant) {
      const series = outcomeSeries[metricId];
      const pre = windowMean(series, shift(startKey, -WINDOW_DAYS), startKey);
      const postEnd = shift(startKey, WINDOW_DAYS);
      const post = windowMean(series, startKey, postEnd <= today ? postEnd : today);
      if (pre.value === null || post.value === null) continue;
      if (pre.points < MIN_POINTS || post.points < MIN_POINTS) continue;

      const delta = post.value - pre.value;
      const threshold = metricId === 'weight' ? pre.value * 0.01 : DELTA_THRESHOLD[metricId];
      if (Math.abs(delta) < threshold) continue;

      // Favourable direction: fat-loss compounds want body measures + weight DOWN.
      const wantsLoss = effectTags.includes('fat_loss') || effectTags.includes('appetite');
      const higherBetter =
        metricId === 'weight' || metricId === 'waist' || metricId === 'hips'
          ? !wantsLoss
          : HIGHER_IS_BETTER[metricId];
      const favourable = higherBetter ? delta > 0 : delta < 0;

      // Rank explanations. Compound is the RESIDUAL after concurrent shifts:
      // it leads only when nutrition/training did not also move.
      const compoundStrength = Math.max(0, 1 - nutritionStrength - trainingStrength);
      const factors = (
        [
          { factor: 'compound' as const, strength: compoundStrength },
          { factor: 'nutrition' as const, strength: nutritionStrength },
          { factor: 'training' as const, strength: trainingStrength },
        ]
      )
        .filter((f) => f.strength > 0 || f.factor === 'compound')
        .sort((a, b) => b.strength - a.strength);

      const minSide = Math.min(pre.points, post.points);
      const confidence = Math.min(1, minSide / (WINDOW_DAYS * 0.5));

      metrics.push({ metricId, delta, favourable, pointsPre: pre.points, pointsPost: post.points, confidence, factors });
    }

    if (metrics.length === 0) continue;
    // Strongest, most-confident metric first.
    metrics.sort((a, b) => Math.abs(b.delta) * b.confidence - Math.abs(a.delta) * a.confidence);
    out.push({
      slug: item.compoundSlug,
      name: compound?.canonicalName ?? item.compoundSlug,
      startedAt: startKey,
      weeksIn,
      metrics,
    });
  }

  return out;
}
