import { describe, expect, it } from 'vitest';

import { computeQuality, QUALITY_THRESHOLD } from '@/lib/photo-quality';

describe('computeQuality', () => {
  it('scores a level, well-framed, well-lit shot high (above threshold)', () => {
    const q = computeQuality({ tiltDeg: 1, fit: 'good', luma: 0.55 });
    expect(q.criteria).toEqual({ level: 'good', framing: 'good', light: 'good' });
    expect(q.score).toBe(100);
    expect(q.belowThreshold).toBe(false);
  });

  it('drops below threshold when framing is poor (fights the ghost)', () => {
    const q = computeQuality({ tiltDeg: 1, fit: 'poor', luma: 0.55 });
    expect(q.criteria.framing).toBe('bad');
    expect(q.score).toBeLessThan(QUALITY_THRESHOLD);
    expect(q.belowThreshold).toBe(true);
  });

  it('penalizes a tilted shot', () => {
    const level = computeQuality({ tiltDeg: 1, fit: 'good' });
    const tilted = computeQuality({ tiltDeg: 15, fit: 'good' });
    expect(tilted.criteria.level).toBe('bad');
    expect(tilted.score).toBeLessThan(level.score);
  });

  it('ignores unavailable signals so a first baseline shot is not penalized', () => {
    // No ghost (fit undefined), no luma: score rests on level alone.
    const q = computeQuality({ tiltDeg: 1 });
    expect(q.criteria.framing).toBe('unknown');
    expect(q.criteria.light).toBe('unknown');
    expect(q.score).toBe(100);
    expect(q.belowThreshold).toBe(false);
  });

  it('flags bad lighting', () => {
    const dark = computeQuality({ tiltDeg: 1, fit: 'good', luma: 0.05 });
    expect(dark.criteria.light).toBe('bad');
  });
});
