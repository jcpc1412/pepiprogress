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
    const tilted = computeQuality({ tiltDeg: 35, fit: 'good' });
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

  describe('roll vs pitch tolerances', () => {
    // Regression: roll and pitch used to be combined into one magnitude judged
    // at the roll bar (>8 deg = bad). Holding a phone at arm's length or
    // propping it up leans it back 10-25 deg every time, so the level criterion
    // — the ONLY signal a baseline shot has — was permanently 'bad' and the
    // readout sat at 30% no matter what the user did.
    it('accepts the back-lean of a normally held phone', () => {
      const q = computeQuality({ rollDeg: 1, pitchDeg: 18 });
      expect(q.criteria.level).toBe('ok');
      expect(q.displayScore).toBeGreaterThan(30);
    });

    it('still rejects a crooked horizon at a few degrees', () => {
      expect(computeQuality({ rollDeg: 12, pitchDeg: 0 }).criteria.level).toBe('bad');
    });

    it('still rejects a phone aimed at the floor', () => {
      expect(computeQuality({ rollDeg: 0, pitchDeg: 55 }).criteria.level).toBe('bad');
    });

    it('takes the worse of the two axes', () => {
      // A clean roll must not excuse a badly aimed phone, or the reverse.
      expect(computeQuality({ rollDeg: 0, pitchDeg: 40 }).criteria.level).toBe('bad');
      expect(computeQuality({ rollDeg: 20, pitchDeg: 0 }).criteria.level).toBe('bad');
      expect(computeQuality({ rollDeg: 1, pitchDeg: 2 }).criteria.level).toBe('good');
    });

    it('is sign-agnostic (leaning forward is the same as leaning back)', () => {
      expect(computeQuality({ rollDeg: -5, pitchDeg: -18 }).criteria.level).toBe(
        computeQuality({ rollDeg: 5, pitchDeg: 18 }).criteria.level,
      );
    });

    it('scores on whichever axis it has when only one is known', () => {
      expect(computeQuality({ rollDeg: 1 }).criteria.level).toBe('good');
      expect(computeQuality({ pitchDeg: 40 }).criteria.level).toBe('bad');
    });

    it('judges a legacy combined tilt at the lean bar, not the roll bar', () => {
      // Photos captured before the axes were recorded separately carry only the
      // combined figure, which is dominated by lean in practice.
      expect(computeQuality({ tiltDeg: 10 }).criteria.level).toBe('good');
      expect(computeQuality({ tiltDeg: 40 }).criteria.level).toBe('bad');
    });
  });

  it('flags bad lighting', () => {
    const dark = computeQuality({ tiltDeg: 1, fit: 'good', luma: 0.05 });
    expect(dark.criteria.light).toBe('bad');
  });

  it('reflects tilt alone when framing was never checked, instead of a fake-good constant', () => {
    // Regression: when the fit check could not run (unreadable ghost), framing
    // used to fail open to 'good', so a tilted floor shot and a level shot both
    // landed on the same score. With framing excluded, tilt must move the score.
    const floor = computeQuality({ tiltDeg: 40 }); // fit omitted = not checked
    const level = computeQuality({ tiltDeg: 1 });
    expect(floor.criteria.framing).toBe('unknown');
    expect(floor.score).toBeLessThan(level.score);
  });
});
