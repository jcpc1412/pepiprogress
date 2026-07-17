import { describe, expect, it } from 'vitest';

import { inferCoachingLevel, resolveCoachingLevel } from '@/lib/coaching';

const today = '2026-07-16';
const daysBack = (n: number): string[] => {
  const out: string[] = [];
  const d = new Date(2026, 6, 16);
  for (let i = 0; i < n; i++) {
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    );
    d.setDate(d.getDate() - 1);
  }
  return out;
};

describe('inferCoachingLevel', () => {
  it('gives a meticulous logger the observe level', () => {
    expect(
      inferCoachingLevel({
        entryDates: daysBack(14),
        measurementDates: daysBack(5),
        protocolItemCount: 1,
        todayKey: today,
      }),
    ).toBe('observe');
  });

  it('protocol complexity can substitute for measurement discipline', () => {
    expect(
      inferCoachingLevel({
        entryDates: daysBack(12),
        measurementDates: [],
        protocolItemCount: 3,
        todayKey: today,
      }),
    ).toBe('observe');
  });

  it('defaults sparse loggers to nudge, never coach', () => {
    expect(
      inferCoachingLevel({ entryDates: daysBack(3), measurementDates: [], protocolItemCount: 0, todayKey: today }),
    ).toBe('nudge');
    expect(
      inferCoachingLevel({ entryDates: [], measurementDates: [], protocolItemCount: 5, todayKey: today }),
    ).toBe('nudge');
  });

  it('ignores entries outside the 14-day window', () => {
    expect(
      inferCoachingLevel({
        entryDates: daysBack(30).slice(20), // only old entries
        measurementDates: daysBack(6),
        protocolItemCount: 2,
        todayKey: today,
      }),
    ).toBe('nudge');
  });
});

describe('resolveCoachingLevel', () => {
  const sparse = { entryDates: [], measurementDates: [], protocolItemCount: 0, todayKey: today };

  it('user choice always wins, including coach (never inferred)', () => {
    expect(resolveCoachingLevel('coach', sparse)).toBe('coach');
    expect(resolveCoachingLevel('observe', sparse)).toBe('observe');
  });

  it('falls back to inference when unset', () => {
    expect(resolveCoachingLevel(undefined, sparse)).toBe('nudge');
  });
});
