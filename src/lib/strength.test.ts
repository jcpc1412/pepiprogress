import { describe, expect, it } from 'vitest';

import { bestE1RM, epley1RM, tonnage, totalReps } from './strength';

describe('tonnage', () => {
  it('sums weight × reps across sets', () => {
    expect(tonnage([{ weight: 100, reps: 5 }, { weight: 100, reps: 5 }])).toBe(1000);
  });
  it('ignores negative inputs', () => {
    expect(tonnage([{ weight: -50, reps: 5 }, { weight: 60, reps: 3 }])).toBe(180);
  });
  it('is zero for no sets', () => {
    expect(tonnage([])).toBe(0);
  });
});

describe('epley1RM', () => {
  it('returns the weight unchanged for a true single', () => {
    expect(epley1RM(140, 1)).toBe(140);
  });
  it('estimates a higher 1RM for multi-rep sets (Epley)', () => {
    // 100 × (1 + 5/30) = 116.67
    expect(epley1RM(100, 5)).toBeCloseTo(116.67, 1);
  });
  it('is zero for non-positive input', () => {
    expect(epley1RM(0, 5)).toBe(0);
    expect(epley1RM(100, 0)).toBe(0);
  });
});

describe('bestE1RM', () => {
  it('picks the heaviest comparable single across sets', () => {
    // 120×3 → 132, 100×8 → 126.7, 140×1 → 140 (best)
    const best = bestE1RM([{ weight: 120, reps: 3 }, { weight: 100, reps: 8 }, { weight: 140, reps: 1 }]);
    expect(best).toBe(140);
  });
  it('is zero for no sets', () => {
    expect(bestE1RM([])).toBe(0);
  });
});

describe('totalReps', () => {
  it('sums reps (a bodyweight-work volume proxy)', () => {
    expect(totalReps([{ weight: 0, reps: 20 }, { weight: 0, reps: 15 }])).toBe(35);
  });
});
