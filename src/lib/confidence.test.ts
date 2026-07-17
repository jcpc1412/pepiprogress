import { describe, expect, it } from 'vitest';

import { levelFromScore, meterFilled } from './confidence';

describe('levelFromScore', () => {
  it('maps at the canonical thresholds (0.4 / 0.75)', () => {
    expect(levelFromScore(0)).toBe('low');
    expect(levelFromScore(0.39)).toBe('low');
    expect(levelFromScore(0.4)).toBe('medium');
    expect(levelFromScore(0.74)).toBe('medium');
    expect(levelFromScore(0.75)).toBe('high');
    expect(levelFromScore(1)).toBe('high');
  });
});

describe('meterFilled', () => {
  it('fills 1/2/3 dots low→high', () => {
    expect(meterFilled('low')).toBe(1);
    expect(meterFilled('medium')).toBe(2);
    expect(meterFilled('high')).toBe(3);
  });
});
