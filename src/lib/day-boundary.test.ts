import { describe, expect, it } from 'vitest';

import { msUntilNextLocalMidnight } from '@/lib/day-boundary';

/** Local wall-clock Date, so these assertions hold in any timezone the suite runs in. */
const at = (y: number, m: number, d: number, hh = 0, mm = 0, ss = 0, ms = 0) =>
  new Date(y, m - 1, d, hh, mm, ss, ms);

describe('msUntilNextLocalMidnight', () => {
  it('lands just after the next midnight, never before it', () => {
    const now = at(2026, 7, 19, 23, 59, 59);
    const fireAt = new Date(now.getTime() + msUntilNextLocalMidnight(now));
    expect(fireAt.getDate()).toBe(20);
    expect(fireAt.getHours()).toBe(0);
  });

  it('is a full day plus the overshoot at exactly midnight', () => {
    const now = at(2026, 7, 19, 0, 0, 0);
    // A tick landing exactly on the boundary must schedule the *next* one, not
    // resolve to zero and spin.
    expect(msUntilNextLocalMidnight(now)).toBe(24 * 60 * 60 * 1000 + 1000);
  });

  it('is always positive, so the timer can never fire in a loop', () => {
    for (const hour of [0, 6, 12, 18, 23]) {
      expect(msUntilNextLocalMidnight(at(2026, 7, 19, hour, 30))).toBeGreaterThan(0);
    }
  });

  it('rolls over month ends', () => {
    const now = at(2026, 1, 31, 22, 0);
    const fireAt = new Date(now.getTime() + msUntilNextLocalMidnight(now));
    expect(fireAt.getMonth()).toBe(1); // February
    expect(fireAt.getDate()).toBe(1);
  });

  it('rolls over year ends', () => {
    const now = at(2026, 12, 31, 23, 0);
    const fireAt = new Date(now.getTime() + msUntilNextLocalMidnight(now));
    expect(fireAt.getFullYear()).toBe(2027);
    expect(fireAt.getMonth()).toBe(0);
    expect(fireAt.getDate()).toBe(1);
  });

  it('handles a leap day', () => {
    const now = at(2028, 2, 28, 20, 0);
    const fireAt = new Date(now.getTime() + msUntilNextLocalMidnight(now));
    expect(fireAt.getDate()).toBe(29);
  });

  it('stays under a setTimeout-safe range', () => {
    // Well below the 2^31-1 ms ceiling where setTimeout wraps and fires immediately.
    expect(msUntilNextLocalMidnight(at(2026, 7, 19, 0, 0, 1))).toBeLessThan(2 ** 31 - 1);
  });
});
