import { describe, expect, it } from 'vitest';

import { isNewHighscore, pickReference, type ReferenceCandidate } from '@/lib/photo-reference';

const p = (over: Partial<ReferenceCandidate> & { id: string }): ReferenceCandidate => ({
  takenAt: '2026-07-01T12:00:00.000Z',
  ...over,
});

describe('pickReference', () => {
  it('empty chain has no reference', () => {
    expect(pickReference([])).toBeUndefined();
  });

  it('falls back to most recent when nothing is scored (old "latest" behavior)', () => {
    const ref = pickReference([
      p({ id: 'old', takenAt: '2026-07-01T12:00:00.000Z' }),
      p({ id: 'new', takenAt: '2026-07-08T12:00:00.000Z' }),
    ]);
    expect(ref?.id).toBe('new');
  });

  it('higher quality wins within the same coverage tier', () => {
    const ref = pickReference([
      p({ id: 'lo', qualityScore: 60, coverage: 'clothed' }),
      p({ id: 'hi', qualityScore: 95, coverage: 'clothed' }),
    ]);
    expect(ref?.id).toBe('hi');
  });

  it('skin priority: minimal coverage outranks a higher-quality clothed shot', () => {
    const ref = pickReference([
      p({ id: 'clothedHi', qualityScore: 99, coverage: 'clothed' }),
      p({ id: 'minimalLo', qualityScore: 70, coverage: 'minimal' }),
    ]);
    expect(ref?.id).toBe('minimalLo');
  });

  it('soft lock: once a minimal reference exists, a new clothed shot never displaces it', () => {
    const chain = [
      p({ id: 'minimal', qualityScore: 80, coverage: 'minimal', takenAt: '2026-07-01T12:00:00.000Z' }),
      p({ id: 'clothedLater', qualityScore: 100, coverage: 'clothed', takenAt: '2026-07-10T12:00:00.000Z' }),
    ];
    expect(pickReference(chain)?.id).toBe('minimal');
  });

  it('unknown coverage sits between clothed and partial', () => {
    const ref = pickReference([
      p({ id: 'clothed', qualityScore: 100, coverage: 'clothed' }),
      p({ id: 'unknown', qualityScore: 60 }),
    ]);
    // Unknown (rank 1) beats clothed (rank 0) even at lower quality.
    expect(ref?.id).toBe('unknown');
  });
});

describe('isNewHighscore', () => {
  it('the first-ever photo is never a highscore moment', () => {
    expect(isNewHighscore([p({ id: 'first' })], 'first')).toBe(false);
  });

  it('fires when a new shot becomes the best reference', () => {
    const chain = [
      p({ id: 'baseline', qualityScore: 70, coverage: 'clothed' }),
      p({ id: 'better', qualityScore: 95, coverage: 'minimal' }),
    ];
    expect(isNewHighscore(chain, 'better')).toBe(true);
  });

  it('does not fire when the new shot did not win', () => {
    const chain = [
      p({ id: 'best', qualityScore: 95, coverage: 'minimal' }),
      p({ id: 'meh', qualityScore: 60, coverage: 'clothed' }),
    ];
    expect(isNewHighscore(chain, 'meh')).toBe(false);
  });
});
