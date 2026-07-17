import type { DatedPoint } from '@/lib/chart-series';
import { daysBetween, shiftDateKey } from '@/lib/dates';

/**
 * Projected trajectory (TRAJ-1, notes-2026-07-16 §7). An honest forward line for
 * a metric, made smarter than a first-to-last straight edge:
 *
 *  - Recency-weighted slope: an exponentially weighted least-squares fit where
 *    recent days dominate, so the projection follows the CURRENT pace, not the
 *    average of a pace that has since changed.
 *  - Plateau flattening: when the recent trend sits inside the fit's own noise,
 *    the projection goes flat instead of promising last month's rate.
 *  - Uncertainty band: widens with distance from today, scaled by the residual
 *    variance of the fit. The band is the honesty; the line is never drawn alone.
 *
 * Pure + deterministic (no RN / i18n / network). `weightForecast` in the verdict
 * engine consumes the same slope so the hero figure and the chart never disagree.
 */

export type ProjectionPoint = {
  dateKey: string;
  value: number;
  /** Lower / upper edge of the widening uncertainty band at this point. */
  lower: number;
  upper: number;
};

export type Projection = {
  /** Recency-weighted units/day, flattened to 0 on a plateau. */
  slopePerDay: number;
  plateau: boolean;
  /** Residual std of the weighted fit (the band's base width). */
  sigma: number;
  lastValue: number;
  lastDateKey: string;
  /** Future points (after the last actual), each carrying its band edges. */
  points: ProjectionPoint[];
};

export type ProjectOptions = {
  /** Recency half-life for the weighted fit (days). Recent points dominate. */
  halfLifeDays?: number;
  /** Spacing of the emitted projection points (days). */
  stepDays?: number;
};

/** Below this many points there is nothing honest to project. */
export const MIN_POINTS = 3;
/** Never project further than a year, no matter the requested horizon. */
export const MAX_HORIZON = 365;
const HALF_LIFE_DAYS = 10;

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/**
 * Project `points` forward `horizonDays`, or null when there is too little data,
 * no time span, or a degenerate fit. The projection anchors at the last actual
 * value so the drawn line connects to the real series.
 */
export function projectSeries(
  points: DatedPoint[],
  horizonDays: number,
  opts: ProjectOptions = {},
): Projection | null {
  const pts = [...points].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  if (pts.length < MIN_POINTS) return null;

  const first = pts[0].dateKey;
  const xs = pts.map((p) => daysBetween(first, p.dateKey)); // day indices, ascending
  const ys = pts.map((p) => p.value);
  const xLast = xs[xs.length - 1];
  if (xLast <= 0) return null; // every point on the same day → no trend

  const H = opts.halfLifeDays ?? HALF_LIFE_DAYS;
  const w = xs.map((x) => Math.pow(0.5, (xLast - x) / H));
  const W = sum(w);

  const xbar = sum(w.map((wi, i) => wi * xs[i])) / W;
  const ybar = sum(w.map((wi, i) => wi * ys[i])) / W;

  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - xbar;
    sxx += w[i] * dx * dx;
    sxy += w[i] * dx * (ys[i] - ybar);
  }
  if (sxx <= 1e-9) return null;

  const slope = sxy / sxx;
  const intercept = ybar - slope * xbar;

  let sse = 0;
  for (let i = 0; i < xs.length; i++) {
    const r = ys[i] - (intercept + slope * xs[i]);
    sse += w[i] * r * r;
  }
  const sigma = Math.sqrt(sse / W);

  // Plateau: the projected move over the next fortnight is smaller than the fit's
  // own noise, so the pace is not distinguishable from flat. Flatten the line.
  const plateau = Math.abs(slope) * 14 < 0.5 * sigma;
  const slopeProj = plateau ? 0 : slope;

  const lastValue = ys[ys.length - 1];
  const lastDateKey = pts[pts.length - 1].dateKey;

  const horizon = Math.min(Math.max(1, Math.round(horizonDays)), MAX_HORIZON);
  const step = Math.max(1, Math.round(opts.stepDays ?? horizon / 6));

  const projPoints: ProjectionPoint[] = [];
  const emit = (d: number) => {
    const value = lastValue + slopeProj * d;
    // Band grows from ~sigma today to ~2·sigma at the horizon (linear in distance).
    const half = sigma * (1 + d / horizon);
    projPoints.push({ dateKey: shiftDateKey(lastDateKey, d), value, lower: value - half, upper: value + half });
  };
  for (let d = step; d < horizon; d += step) emit(d);
  emit(horizon); // always land exactly on the horizon

  return { slopePerDay: slopeProj, plateau, sigma, lastValue, lastDateKey, points: projPoints };
}

/**
 * Honest days-to-target off the recency-weighted slope: only when the trend is
 * actually moving toward `target` at a plateau-free pace, and the ETA lands
 * inside a year. Null otherwise (say nothing rather than guess).
 */
export function daysToTarget(proj: Projection, target: number): number | null {
  const slope = proj.slopePerDay;
  if (!slope) return null; // flat / plateau → no ETA
  const remaining = target - proj.lastValue;
  if (Math.abs(remaining) < 1e-6) return null; // already there
  if (Math.sign(slope) !== Math.sign(remaining)) return null; // moving away
  const days = Math.round(remaining / slope);
  if (days < 1 || days > MAX_HORIZON) return null;
  return days;
}
