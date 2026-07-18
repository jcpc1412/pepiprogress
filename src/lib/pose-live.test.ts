import { describe, expect, it } from 'vitest';

import {
  MAX_SAMPLES,
  SAMPLE_INTERVAL_MS,
  initialSampleState,
  nextFacePose,
  recordSample,
  shouldSample,
} from './pose-live';

describe('nextFacePose (yaw hysteresis)', () => {
  it('stays front below the enter threshold', () => {
    expect(nextFacePose('front_face', 0)).toBe('front_face');
    expect(nextFacePose('front_face', 29)).toBe('front_face');
    expect(nextFacePose('front_face', -29)).toBe('front_face');
  });

  it('enters side at the enter threshold, either direction', () => {
    expect(nextFacePose('front_face', 30)).toBe('side_profile');
    expect(nextFacePose('front_face', -45)).toBe('side_profile');
  });

  it('holds side inside the hysteresis band (no flapping)', () => {
    // 25° is between exit (20) and enter (30): front stays front, side stays side.
    expect(nextFacePose('front_face', 25)).toBe('front_face');
    expect(nextFacePose('side_profile', 25)).toBe('side_profile');
  });

  it('returns to front at the exit threshold', () => {
    expect(nextFacePose('side_profile', 20)).toBe('front_face');
    expect(nextFacePose('side_profile', -5)).toBe('front_face');
  });
});

describe('sample schedule + stability', () => {
  it('samples immediately on a fresh state, then throttles', () => {
    const s0 = initialSampleState();
    expect(shouldSample(s0, 10_000)).toBe(true);
    const s1 = recordSample(s0, 'front_relaxed', 0.9, 10_000);
    expect(shouldSample(s1, 10_000 + SAMPLE_INTERVAL_MS - 1)).toBe(false);
    expect(shouldSample(s1, 10_000 + SAMPLE_INTERVAL_MS)).toBe(true);
  });

  it('stabilizes on two consecutive confident agreeing reads and stops', () => {
    let s = initialSampleState();
    s = recordSample(s, 'side_relaxed', 0.8, 0);
    expect(s.stable).toBeUndefined();
    s = recordSample(s, 'side_relaxed', 0.8, 3000);
    expect(s.stable).toBe('side_relaxed');
    expect(shouldSample(s, 999_999)).toBe(false);
  });

  it('a different pose restarts the confirmation', () => {
    let s = initialSampleState();
    s = recordSample(s, 'front_relaxed', 0.9, 0);
    s = recordSample(s, 'side_relaxed', 0.9, 3000);
    expect(s.stable).toBeUndefined();
    s = recordSample(s, 'side_relaxed', 0.9, 6000);
    expect(s.stable).toBe('side_relaxed');
  });

  it('low-confidence reads clear the candidate and never stabilize', () => {
    let s = initialSampleState();
    s = recordSample(s, 'front_relaxed', 0.9, 0);
    s = recordSample(s, 'front_relaxed', 0.3, 3000); // ambiguous frame
    expect(s.stable).toBeUndefined();
    s = recordSample(s, 'front_relaxed', 0.9, 6000); // must re-confirm from scratch
    expect(s.stable).toBeUndefined();
    s = recordSample(s, 'front_relaxed', 0.9, 9000);
    expect(s.stable).toBe('front_relaxed');
  });

  it('caps total samples at MAX_SAMPLES', () => {
    let s = initialSampleState();
    for (let i = 0; i < MAX_SAMPLES; i++) {
      // Alternate poses so it never stabilizes.
      s = recordSample(s, i % 2 === 0 ? 'front_relaxed' : 'side_relaxed', 0.9, i * 3000);
    }
    expect(s.stable).toBeUndefined();
    expect(shouldSample(s, 999_999_999)).toBe(false);
  });
});
