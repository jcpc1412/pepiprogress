import { describe, expect, it } from 'vitest';

import { referenceResolver } from '@/lib/photo-rescore';
import type { PhotoEntry } from '@/lib/store';

function photo(patch: Partial<PhotoEntry> & { id: string }): PhotoEntry {
  return {
    session: 'body',
    uri: `file:///${patch.id}.jpg`,
    takenAt: '2026-07-01T10:00:00.000Z',
    ...patch,
  };
}

describe('referenceResolver', () => {
  it('resolves each track to its own anchor', () => {
    const photos = [
      photo({ id: 'body1', session: 'body', qualityScore: 60 }),
      photo({ id: 'body2', session: 'body', qualityScore: 95 }),
      photo({ id: 'face1', session: 'face', qualityScore: 90 }),
    ];
    const resolve = referenceResolver(photos);
    // Highest quality wins within a track (photo-reference.ts).
    expect(resolve(photos[0])).toBe('body2');
    expect(resolve(photos[1])).toBe('body2');
    // A face photo must never anchor to a body photo.
    expect(resolve(photos[2])).toBe('face1');
  });

  it('keeps custom body parts in separate chains', () => {
    const photos = [
      photo({ id: 'whole', session: 'body', qualityScore: 99 }),
      photo({ id: 'belly1', session: 'body', part: 'belly', qualityScore: 50 }),
    ];
    const resolve = referenceResolver(photos);
    // The belly track must not be compared against a whole-body shot just
    // because it scored higher.
    expect(resolve(photos[1])).toBe('belly1');
    expect(resolve(photos[0])).toBe('whole');
  });

  it('honours the skin-priority soft lock when picking the anchor', () => {
    const photos = [
      photo({ id: 'clothed', qualityScore: 100, coverage: 'clothed' }),
      photo({ id: 'minimal', qualityScore: 40, coverage: 'minimal' }),
    ];
    // Coverage outranks quality, so the rescore compares against the same shot
    // the capture screens ghost against.
    expect(referenceResolver(photos)(photos[0])).toBe('minimal');
  });

  it('returns undefined for a photo whose track has no anchor', () => {
    expect(referenceResolver([])(photo({ id: 'orphan' }))).toBeUndefined();
  });
});
