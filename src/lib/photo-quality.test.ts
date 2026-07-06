import { describe, expect, it } from 'vitest';

import { computeQuality, DISPLAY_OFFSET, RETRY_THRESHOLD } from '@/lib/photo-quality';

describe('computeQuality', () => {
  it('scores a level, well-framed, well-lit shot high and shows real minus offset', () => {
    const q = computeQuality({ tiltDeg: 1, fit: 'good', luma: 0.55 });
    expect(q.criteria).toEqual({ level: 'good', framing: 'good', light: 'good' });
    expect(q.score).toBe(100);
    expect(q.displayScore).toBe(100 - DISPLAY_OFFSET); // 95
    expect(q.belowThreshold).toBe(false);
  });

  it('triggers a retake below the (stricter) real bar while framing is poor', () => {
    const q = computeQuality({ tiltDeg: 1, fit: 'poor', luma: 0.55 });
    expect(q.criteria.framing).toBe('bad');
    expect(q.score).toBeLessThan(RETRY_THRESHOLD);
    expect(q.belowThreshold).toBe(true);
    expect(q.displayScore).toBe(q.score - DISPLAY_OFFSET);
  });

  it('shown number crosses 80 exactly at the trigger point (real 85 -> shown 80)', () => {
    // A shot right at the real bar shows 80; just under it fires the modal.
    expect(RETRY_THRESHOLD - DISPLAY_OFFSET).toBe(80);
  });

  it('penalizes a tilted shot', () => {
    const level = computeQuality({ tiltDeg: 1, fit: 'good' });
    const tilted = computeQuality({ tiltDeg: 15, fit: 'good' });
    expect(tilted.criteria.level).toBe('bad');
    expect(tilted.score).toBeLessThan(level.score);
  });

  it('ignores unavailable signals so a first baseline shot is not penalized', () => {
    const q = computeQuality({ tiltDeg: 1 });
    expect(q.criteria.framing).toBe('unknown');
    expect(q.criteria.light).toBe('unknown');
    expect(q.score).toBe(100);
    expect(q.displayScore).toBe(95);
    expect(q.belowThreshold).toBe(false);
  });

  it('flags bad lighting', () => {
    const dark = computeQuality({ tiltDeg: 1, fit: 'good', luma: 0.05 });
    expect(dark.criteria.light).toBe('bad');
  });
});
