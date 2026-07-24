import { describe, expect, it } from 'vitest';

import {
  DEFAULT_WINDOW_END_HOUR,
  learnRoutineWindow,
  routineWindowPassed,
} from '@/lib/routine-window';
import type { MetricReading } from '@/lib/store';

const NOW = new Date('2026-07-24T21:00:00');

/** A reading `daysAgo` days back at the given local hour. */
function reading(daysAgo: number, hour: number, metric = 'activity.workout_min'): MetricReading {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return {
    id: `${metric}-${daysAgo}-${hour}`,
    metric,
    value: 45,
    ts: d.toISOString(),
    sourceProvider: 'apple_health',
  };
}

describe('learnRoutineWindow', () => {
  it('returns null below the minimum sample count', () => {
    const readings = [reading(1, 18), reading(2, 19), reading(3, 18)];
    expect(learnRoutineWindow(readings, ['activity.workout_min'], NOW)).toBeNull();
  });

  it('learns an evening window from a consistent trainer', () => {
    const readings = [reading(1, 18), reading(2, 19), reading(3, 18), reading(4, 19)];
    const w = learnRoutineWindow(readings, ['activity.workout_min'], NOW);
    expect(w).toEqual({ startHour: 18, endHour: 20, samples: 4 });
  });

  it('counts one sample per day, using the latest session of that day', () => {
    // A morning walk plus an evening lift on the same day is one training day
    // that ends in the evening, not two days split across the clock.
    const readings = [
      reading(1, 7),
      reading(1, 19),
      reading(2, 7),
      reading(2, 19),
      reading(3, 7),
      reading(3, 19),
      reading(4, 7),
      reading(4, 19),
    ];
    const w = learnRoutineWindow(readings, ['activity.workout_min'], NOW);
    expect(w?.samples).toBe(4);
    expect(w?.startHour).toBe(19);
  });

  it('trims a lone early outlier out of the band', () => {
    const readings = [
      reading(1, 5),
      reading(2, 18),
      reading(3, 18),
      reading(4, 19),
      reading(5, 18),
      reading(6, 19),
    ];
    const w = learnRoutineWindow(readings, ['activity.workout_min'], NOW);
    expect(w?.startHour).toBe(18);
  });

  it('ignores readings older than the lookback and other metrics', () => {
    const readings = [
      reading(1, 18),
      reading(2, 18),
      reading(3, 18),
      reading(40, 18),
      reading(41, 18),
      reading(1, 6, 'sleep.duration'),
    ];
    expect(learnRoutineWindow(readings, ['activity.workout_min'], NOW)).toBeNull();
  });

  it('never produces an end hour past midnight', () => {
    const readings = [reading(1, 23), reading(2, 23), reading(3, 23), reading(4, 23)];
    expect(learnRoutineWindow(readings, ['activity.workout_min'], NOW)?.endHour).toBe(24);
  });
});

describe('routineWindowPassed', () => {
  it('falls back to a fixed evening hour with no learned window', () => {
    expect(routineWindowPassed(null, DEFAULT_WINDOW_END_HOUR - 1)).toBe(false);
    expect(routineWindowPassed(null, DEFAULT_WINDOW_END_HOUR)).toBe(true);
  });

  it('uses the learned end hour when one exists', () => {
    const w = { startHour: 6, endHour: 8, samples: 10 };
    // A morning trainer is asked in the morning, long before the default hour.
    expect(routineWindowPassed(w, 8)).toBe(true);
    expect(routineWindowPassed(w, 7)).toBe(false);
  });
});
