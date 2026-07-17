import { describe, expect, it } from 'vitest';

import type { DatedPoint } from './chart-series';
import { daysToTarget, MAX_HORIZON, projectSeries } from './trajectory';

/** Build a daily series ending at `end`, one point per day, from `values`. */
function daily(values: number[], end = '2026-07-17'): DatedPoint[] {
  const endMs = new Date(`${end}T00:00:00.000Z`).getTime();
  return values.map((value, i) => {
    const d = new Date(endMs - (values.length - 1 - i) * 86400000);
    return { dateKey: d.toISOString().slice(0, 10), value };
  });
}

describe('projectSeries', () => {
  it('returns null below the minimum point count', () => {
    expect(projectSeries(daily([80, 79]), 14)).toBeNull();
  });

  it('returns null when every point is on the same day', () => {
    const same = [
      { dateKey: '2026-07-17', value: 80 },
      { dateKey: '2026-07-17', value: 79 },
      { dateKey: '2026-07-17', value: 78 },
    ];
    expect(projectSeries(same, 14)).toBeNull();
  });

  it('projects a steady decline forward at roughly the observed pace', () => {
    // -0.2/day for 15 days.
    const values = Array.from({ length: 15 }, (_, i) => 80 - 0.2 * i);
    const proj = projectSeries(values.map((v, i) => ({ dateKey: daily(values)[i].dateKey, value: v })), 14)!;
    expect(proj).not.toBeNull();
    expect(proj.slopePerDay).toBeCloseTo(-0.2, 1);
    expect(proj.plateau).toBe(false);
    // Ends below the last value, and the band widens with distance.
    const last = proj.points[proj.points.length - 1];
    expect(last.value).toBeLessThan(proj.lastValue);
    expect(last.upper - last.lower).toBeGreaterThan(proj.points[0].upper - proj.points[0].lower);
  });

  it('flattens the projection on a plateau (recent trend within noise)', () => {
    // Small noise around 80, no real trend.
    const values = [80, 80.1, 79.9, 80.05, 79.95, 80, 80.1, 79.9, 80, 80.02, 79.98, 80.01];
    const proj = projectSeries(daily(values), 14)!;
    expect(proj.plateau).toBe(true);
    expect(proj.slopePerDay).toBe(0);
    // A flat line: horizon value equals the last value.
    expect(proj.points[proj.points.length - 1].value).toBeCloseTo(proj.lastValue, 5);
  });

  it('weights recent days more heavily than old ones', () => {
    // Flat for 10 days, then a sharp drop over the last 5 — recent pace should win.
    const values = [80, 80, 80, 80, 80, 80, 79.5, 79, 78.5, 78, 77.5];
    const proj = projectSeries(daily(values), 10)!;
    // Recency-weighted slope is steeper than the naive first-to-last slope (-0.25).
    expect(proj.slopePerDay).toBeLessThan(-0.25);
  });

  it('caps the horizon at a year', () => {
    const values = Array.from({ length: 20 }, (_, i) => 80 - 0.05 * i);
    const proj = projectSeries(daily(values), 100000)!;
    const spanDays = Math.round(
      (new Date(`${proj.points[proj.points.length - 1].dateKey}T00:00:00.000Z`).getTime() -
        new Date(`${proj.lastDateKey}T00:00:00.000Z`).getTime()) /
        86400000,
    );
    expect(spanDays).toBe(MAX_HORIZON);
  });
});

describe('daysToTarget', () => {
  const declining = () => projectSeries(daily(Array.from({ length: 15 }, (_, i) => 80 - 0.2 * i)), 30)!;

  it('estimates days when moving toward the target', () => {
    const proj = declining();
    // last ~77.2, target 75 → ~11 days at -0.2/day.
    const days = daysToTarget(proj, 75);
    expect(days).not.toBeNull();
    expect(days!).toBeGreaterThan(5);
    expect(days!).toBeLessThan(20);
  });

  it('says nothing when the target is the wrong side of the trend', () => {
    const proj = declining();
    expect(daysToTarget(proj, 85)).toBeNull(); // trend is down, target is up
  });

  it('says nothing on a plateau', () => {
    const flat = projectSeries(daily([80, 80.1, 79.9, 80, 79.95, 80.05, 80, 79.98]), 30)!;
    expect(daysToTarget(flat, 75)).toBeNull();
  });
});
