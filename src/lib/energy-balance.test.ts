import { describe, expect, it } from 'vitest';

import { computeEnergyBalance, KCAL_PER_KG } from './energy-balance';
import type { CheckinEntry, LocalProfile, MetricReading } from './store';

const TODAY = '2026-07-17';
const PROFILE = { units: 'metric', sex: 'male', height: 180, dobISO: '1990-01-01T00:00:00.000Z' } as Pick<
  LocalProfile,
  'units' | 'sex' | 'height' | 'dobISO'
>;

/** Build `n` daily entries ending TODAY with the given weight (kg) + calories. */
function series(n: number, weightAt: (i: number) => number, calAt: (i: number) => number | undefined): Record<string, CheckinEntry> {
  const endMs = new Date(`${TODAY}T00:00:00.000Z`).getTime();
  const out: Record<string, CheckinEntry> = {};
  for (let i = 0; i < n; i++) {
    const date = new Date(endMs - (n - 1 - i) * 86400000).toISOString().slice(0, 10);
    const cal = calAt(i);
    out[date] = { date, updatedAt: `${date}T00:00:00.000Z`, weight: weightAt(i), ...(cal !== undefined ? { calories: cal } : {}) } as CheckinEntry;
  }
  return out;
}

function activityReadings(days: number, kcalPerDay: number): MetricReading[] {
  const endMs = new Date(`${TODAY}T00:00:00.000Z`).getTime();
  return Array.from({ length: days }, (_, i) => {
    const ts = new Date(endMs - (days - 1 - i) * 86400000).toISOString();
    return { id: `a${i}`, metric: 'activity.energy', value: kcalPerDay, ts, sourceProvider: 'apple_health' };
  });
}

describe('computeEnergyBalance', () => {
  it('returns null without enough logged intake', () => {
    const entries = series(14, (i) => 80 - 0.05 * i, (i) => (i < 3 ? 2000 : undefined));
    expect(computeEnergyBalance({ entries, metricReadings: [], profile: PROFILE, today: TODAY })).toBeNull();
  });

  it('returns null without a weight trend to anchor', () => {
    const entries = series(14, () => 80, () => 2000); // weight present but flat single value repeated → projectSeries still fits (flat)
    // Only 2 distinct... actually all same value over 14 days => projectSeries returns a flat fit, not null.
    const eb = computeEnergyBalance({ entries, metricReadings: [], profile: PROFILE, today: TODAY });
    // Flat weight + 2000 intake → maintenance ≈ intake (slope 0).
    expect(eb?.maintenanceKcal).toBe(2000);
  });

  it('solves maintenance from intake minus the weight-change energy', () => {
    // -0.1 kg/day over 14 days at 2000 kcal/day → maintenance ≈ 2000 + 0.1*7700 = 2770.
    const entries = series(14, (i) => 82 - 0.1 * i, () => 2000);
    const eb = computeEnergyBalance({ entries, metricReadings: [], profile: PROFILE, today: TODAY })!;
    expect(eb).not.toBeNull();
    expect(eb.observedSlopeKgPerDay).toBeCloseTo(-0.1, 1);
    expect(eb.maintenanceKcal).toBeGreaterThan(2000 + 0.08 * KCAL_PER_KG);
    expect(eb.maintenanceKcal).toBeLessThan(2000 + 0.12 * KCAL_PER_KG);
    // No activity data → no device calibration.
    expect(eb.deviceBias).toBeUndefined();
    expect(eb.disagreement).toBeUndefined();
  });

  it('flags a recent intake drop the scale has not caught up to', () => {
    // Steady weight + 2200 kcal for 10 days, then 1600 for the last 4.
    const entries = series(14, (i) => 80 - 0.005 * i, (i) => (i < 10 ? 2200 : 1600));
    const eb = computeEnergyBalance({ entries, metricReadings: [], profile: PROFILE, today: TODAY })!;
    expect(eb.intakeShift).toBe('lower');
  });

  it('calibrates device burn and surfaces a bias multiplier when activity flows', () => {
    // Solved maintenance ~2770; device reports a high active burn → bias < 1 (overreport).
    const entries = series(14, (i) => 82 - 0.1 * i, () => 2000);
    const eb = computeEnergyBalance({
      entries,
      metricReadings: activityReadings(14, 1200), // big active burn on top of BMR
      profile: PROFILE,
      today: TODAY,
    })!;
    expect(eb.deviceBurnKcal).toBeGreaterThan(0);
    expect(eb.deviceBias).toBeDefined();
    expect(eb.disagreement).toBeDefined();
  });

  it('reads "slower" when the scale moves less than the logged deficit implies', () => {
    // Intake 1800, device burn high (implies fast loss), but weight barely moves.
    const entries = series(14, (i) => 80 - 0.01 * i, () => 1800);
    const eb = computeEnergyBalance({
      entries,
      metricReadings: activityReadings(14, 1000),
      profile: PROFILE,
      today: TODAY,
    })!;
    // Implied slope is a real loss; observed is ~flat → losing slower than implied.
    expect(eb.disagreement).toBe('slower');
  });
});
