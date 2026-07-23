import { describe, expect, it } from 'vitest';

import { resolveBodyIntent, resolveStrengthTrend } from './strength-context';

const WINDOW = { from: '2026-06-01', to: '2026-06-30' };

describe('resolveBodyIntent', () => {
  it('maps the cutting/bulking pair to a single label', () => {
    expect(resolveBodyIntent(true, false)).toBe('cut');
    expect(resolveBodyIntent(false, true)).toBe('gain');
    expect(resolveBodyIntent(true, true)).toBe('recomp');
    expect(resolveBodyIntent(false, false)).toBe('maintain');
  });
});

describe('resolveStrengthTrend — reported chips (primary)', () => {
  it('reads a run of "same" as held', () => {
    const felt = [
      { date: '2026-06-05', felt: 'same' as const },
      { date: '2026-06-12', felt: 'same' as const },
      { date: '2026-06-20', felt: 'same' as const },
    ];
    expect(resolveStrengthTrend({ felt, sessions: [], ...WINDOW })).toEqual({
      trend: 'held',
      source: 'reported',
      samples: 3,
    });
  });

  it('reads mostly-harder as down and mostly-easier as up', () => {
    const down = [
      { date: '2026-06-05', felt: 'harder' as const },
      { date: '2026-06-12', felt: 'harder' as const },
    ];
    expect(resolveStrengthTrend({ felt: down, sessions: [], ...WINDOW }).trend).toBe('down');

    const up = [
      { date: '2026-06-05', felt: 'easier' as const },
      { date: '2026-06-12', felt: 'easier' as const },
    ];
    expect(resolveStrengthTrend({ felt: up, sessions: [], ...WINDOW }).trend).toBe('up');
  });

  it('one bad day inside a good run does not flip the trend', () => {
    const felt = [
      { date: '2026-06-05', felt: 'same' as const },
      { date: '2026-06-08', felt: 'harder' as const },
      { date: '2026-06-12', felt: 'same' as const },
      { date: '2026-06-19', felt: 'same' as const },
    ];
    expect(resolveStrengthTrend({ felt, sessions: [], ...WINDOW }).trend).toBe('held');
  });

  it('a single chip day is not enough to claim a trend', () => {
    const felt = [{ date: '2026-06-05', felt: 'harder' as const }];
    expect(resolveStrengthTrend({ felt, sessions: [], ...WINDOW })).toEqual({
      trend: 'unknown',
      source: 'sessions',
      samples: 0,
    });
  });

  it('ignores chips outside the photo window', () => {
    const felt = [
      { date: '2026-05-01', felt: 'harder' as const },
      { date: '2026-05-02', felt: 'harder' as const },
      { date: '2026-07-15', felt: 'harder' as const },
    ];
    expect(resolveStrengthTrend({ felt, sessions: [], ...WINDOW }).trend).toBe('unknown');
  });
});

describe('resolveStrengthTrend — logged sessions (fallback)', () => {
  const sess = (date: string, exercise: string, weight: number, reps: number) => ({
    date,
    exercise,
    sets: [{ weight, reps }],
  });

  it('rising estimated 1RM reads as up', () => {
    const sessions = [sess('2026-06-02', 'squat', 100, 5), sess('2026-06-25', 'squat', 110, 5)];
    expect(resolveStrengthTrend({ felt: [], sessions, ...WINDOW })).toEqual({
      trend: 'up',
      source: 'sessions',
      samples: 1,
    });
  });

  it('flat estimated 1RM reads as held, and a drop reads as down', () => {
    const flat = [sess('2026-06-02', 'bench', 80, 5), sess('2026-06-25', 'bench', 80, 5)];
    expect(resolveStrengthTrend({ felt: [], sessions: flat, ...WINDOW }).trend).toBe('held');

    const dropped = [sess('2026-06-02', 'bench', 80, 5), sess('2026-06-25', 'bench', 70, 5)];
    expect(resolveStrengthTrend({ felt: [], sessions: dropped, ...WINDOW }).trend).toBe('down');
  });

  it('an exercise present in only one half carries no trend', () => {
    const sessions = [sess('2026-06-02', 'squat', 100, 5), sess('2026-06-25', 'deadlift', 140, 5)];
    expect(resolveStrengthTrend({ felt: [], sessions, ...WINDOW }).trend).toBe('unknown');
  });

  it('the chip overrides logged sessions that disagree', () => {
    const sessions = [sess('2026-06-02', 'squat', 100, 5), sess('2026-06-25', 'squat', 130, 5)];
    const felt = [
      { date: '2026-06-20', felt: 'harder' as const },
      { date: '2026-06-24', felt: 'harder' as const },
    ];
    expect(resolveStrengthTrend({ felt, sessions, ...WINDOW })).toEqual({
      trend: 'down',
      source: 'reported',
      samples: 2,
    });
  });

  it('reps count toward the estimate, not just load', () => {
    const sessions = [sess('2026-06-02', 'row', 60, 5), sess('2026-06-25', 'row', 60, 10)];
    expect(resolveStrengthTrend({ felt: [], sessions, ...WINDOW }).trend).toBe('up');
  });
});
