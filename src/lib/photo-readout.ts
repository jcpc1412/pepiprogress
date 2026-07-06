/**
 * Instant, deterministic photo readout (redesign §4A "two-stage analysis"). On
 * submitting a compare, this local, offline summary renders immediately, no
 * fluff, no network, while the deep vision analysis loads in the background.
 *
 * It answers two things from data already on device: how comparable the new shot
 * is to the baseline (from the tilt delta) and the headline measurement changes.
 * Pure and testable. Descriptive only.
 */

export type Comparability = 'comparable' | 'partial' | 'low';

export type MeasureChange = {
  /** i18n key for the measurement label, e.g. "measurements.waist". */
  metricKey: string;
  /** Signed change in the user's unit (negative = smaller). */
  delta: number;
};

export type QuickReadout = {
  comparability: Comparability;
  changes: MeasureChange[];
};

const CHANGE_EPS = 0.1; // ignore sub-0.1 noise in either unit

export function quickReadout(input: {
  /** |latest.tilt − baseline.tilt| in degrees, if both are known. */
  tiltDelta?: number;
  measurementDelta?: { waist?: number; hips?: number; extra?: { key: string; delta: number } };
}): QuickReadout {
  const td = input.tiltDelta;
  const comparability: Comparability =
    td == null ? 'partial' : td <= 5 ? 'comparable' : td <= 12 ? 'partial' : 'low';

  const changes: MeasureChange[] = [];
  const md = input.measurementDelta;
  if (md?.waist != null && Math.abs(md.waist) >= CHANGE_EPS) {
    changes.push({ metricKey: 'measurements.waist', delta: md.waist });
  }
  if (md?.hips != null && Math.abs(md.hips) >= CHANGE_EPS) {
    changes.push({ metricKey: 'measurements.hips', delta: md.hips });
  }
  if (md?.extra && Math.abs(md.extra.delta) >= CHANGE_EPS) {
    changes.push({ metricKey: `measurements.${md.extra.key}`, delta: md.extra.delta });
  }
  return { comparability, changes };
}
