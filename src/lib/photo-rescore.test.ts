import { describe, expect, it } from 'vitest';

import { QUALITY_VERSION } from '@/lib/photo-quality';
import {
  buildPatch,
  isStale,
  planRescore,
  qualityInputFor,
  rescoreFromStored,
  scoreVersionOf,
} from '@/lib/photo-rescore';
import type { PhotoEntry } from '@/lib/store';

function photo(patch: Partial<PhotoEntry> = {}): PhotoEntry {
  return {
    id: 'p1',
    session: 'body',
    uri: 'file:///p1.jpg',
    takenAt: '2026-07-01T10:00:00.000Z',
    ...patch,
  };
}

describe('staleness', () => {
  it('treats an unversioned score as version 1', () => {
    expect(scoreVersionOf(photo({ qualityScore: 80 }))).toBe(1);
  });

  it('flags photos scored under an older formula', () => {
    expect(isStale(photo({ qualityScore: 80 }))).toBe(true);
    expect(isStale(photo({ qualityScore: 80, scoreVersion: QUALITY_VERSION }))).toBe(false);
  });

  it('flags a never-scored photo', () => {
    expect(isStale(photo({ scoreVersion: QUALITY_VERSION }))).toBe(true);
  });
});

describe('qualityInputFor', () => {
  it('prefers the stored axes over the combined magnitude', () => {
    const input = qualityInputFor(photo({ rollDeg: 2, pitchDeg: 18, tilt: 18 }));
    expect(input).toMatchObject({ rollDeg: 2, pitchDeg: 18 });
    expect(input.tiltDeg).toBeUndefined();
  });

  it('falls back to the combined magnitude for pre-axes photos', () => {
    expect(qualityInputFor(photo({ tilt: 15 })).tiltDeg).toBe(15);
  });

  it('drops a zero-confidence fit, which means "could not compare"', () => {
    expect(qualityInputFor(photo({ fit: 'good', fitConfidence: 0 })).fit).toBeUndefined();
    expect(qualityInputFor(photo({ fit: 'good', fitConfidence: 0.9 })).fit).toBe('good');
  });

  it('lets a freshly measured luma override the stored one', () => {
    expect(qualityInputFor(photo({ luma: 0.1 }), { luma: 0.5 }).luma).toBe(0.5);
  });
});

describe('rescoreFromStored', () => {
  it('reproduces the capture-time score from stored signals alone', () => {
    const p = photo({ rollDeg: 1, pitchDeg: 4, luma: 0.5, fit: 'good', fitConfidence: 0.9 });
    const q = rescoreFromStored(p);
    expect(q.criteria).toEqual({ level: 'good', framing: 'good', light: 'good' });
    expect(q.score).toBe(100);
  });

  it('rescues a photo the old formula condemned for ordinary back-lean', () => {
    // The exact regression this whole mechanism exists to repair: 18 degrees of
    // lean scored 'bad' under version 1 and is 'ok' under version 2.
    const q = rescoreFromStored(photo({ rollDeg: 1, pitchDeg: 18 }));
    expect(q.criteria.level).toBe('ok');
    expect(q.displayScore).toBeGreaterThan(30);
  });
});

describe('planRescore', () => {
  const ref = (id?: string) => () => id;

  it('ignores a current-version photo with nothing left to measure', () => {
    // No reference in this track, so there is no framing check to be had.
    const p = photo({ qualityScore: 90, scoreVersion: QUALITY_VERSION, luma: 0.5 });
    expect(planRescore([p], ref(undefined)).work).toEqual([]);
  });

  it('still includes a current-version photo that never got a brightness read', () => {
    const p = photo({ qualityScore: 90, scoreVersion: QUALITY_VERSION });
    const plan = planRescore([p], ref(undefined));
    expect(plan.lumaCount).toBe(1);
    expect(plan.freeCount).toBe(1);
  });

  it('counts a stale photo with every signal present as free work', () => {
    const p = photo({ qualityScore: 50, rollDeg: 1, pitchDeg: 2, luma: 0.5 });
    const plan = planRescore([p], ref(undefined));
    expect(plan.freeCount).toBe(1);
    expect(plan.lumaCount).toBe(0);
    expect(plan.fitCount).toBe(0);
  });

  it('skips a photo that is current AND fully measured', () => {
    const p = photo({
      qualityScore: 90,
      scoreVersion: QUALITY_VERSION,
      rollDeg: 1,
      pitchDeg: 2,
      luma: 0.5,
      fit: 'good',
      fitConfidence: 0.9,
      fitReferenceId: 'ref1',
    });
    expect(planRescore([p], ref('ref1')).work).toEqual([]);
  });

  it('still offers the AI upgrade to a photo already on the current version', () => {
    // The free pass stamps the version. Without this, choosing "free now" would
    // permanently forfeit the framing check on those photos.
    const p = photo({ qualityScore: 85, scoreVersion: QUALITY_VERSION, rollDeg: 1, pitchDeg: 2, luma: 0.5 });
    const plan = planRescore([p], ref('ref1'));
    expect(plan.fitCount).toBe(1);
    // ...but a second free pass would rewrite the identical number, so it is
    // not offered as free work.
    expect(plan.freeCount).toBe(0);
  });

  it('flags a missing brightness reading', () => {
    const plan = planRescore([photo({ qualityScore: 50 })], ref(undefined));
    expect(plan.lumaCount).toBe(1);
  });

  it('reuses a stored fit measured against the SAME reference', () => {
    const p = photo({ qualityScore: 50, luma: 0.5, fit: 'good', fitConfidence: 0.9, fitReferenceId: 'ref1' });
    expect(planRescore([p], ref('ref1')).fitCount).toBe(0);
  });

  it('re-runs the fit when the reference has changed', () => {
    // The stored verdict describes a comparison against a photo that is no
    // longer the anchor, so reusing it would bake in a stale framing call.
    const p = photo({ qualityScore: 50, luma: 0.5, fit: 'good', fitConfidence: 0.9, fitReferenceId: 'old' });
    expect(planRescore([p], ref('ref1')).fitCount).toBe(1);
  });

  it('never asks a photo to be compared against itself', () => {
    const p = photo({ id: 'ref1', qualityScore: 50, luma: 0.5 });
    expect(planRescore([p], ref('ref1')).fitCount).toBe(0);
  });

  it('needs no fit call when the track has no reference at all', () => {
    const p = photo({ qualityScore: 50, luma: 0.5 });
    const plan = planRescore([p], ref(undefined));
    expect(plan.fitCount).toBe(0);
    expect(plan.freeCount).toBe(1);
  });

  it('reports the vision-call count separately, since that is the one that costs', () => {
    const photos = [
      photo({ id: 'a', qualityScore: 50, luma: 0.5 }),
      photo({ id: 'b', qualityScore: 50 }),
      photo({ id: 'c', qualityScore: 50, luma: 0.5 }),
    ];
    const plan = planRescore(photos, () => 'ref1');
    expect(plan.work).toHaveLength(3);
    expect(plan.fitCount).toBe(3);
    expect(plan.lumaCount).toBe(1);
  });
});

describe('buildPatch', () => {
  it('stamps the current version so the photo stops being stale', () => {
    const patch = buildPatch(photo({ rollDeg: 1, pitchDeg: 2, luma: 0.5 }), {});
    expect(patch.scoreVersion).toBe(QUALITY_VERSION);
    expect(patch.qualityScore).toBe(100);
  });

  it('folds in a freshly measured brightness', () => {
    const patch = buildPatch(photo({ rollDeg: 1, pitchDeg: 2 }), { luma: 0.02 });
    expect(patch.luma).toBe(0.02);
    expect(patch.qualityScore).toBeLessThan(100);
  });

  it('records the fit together with the reference it was measured against', () => {
    const patch = buildPatch(photo({ rollDeg: 1, pitchDeg: 2, luma: 0.5 }), {
      fit: { fit: 'poor', confidence: 0.8 },
      referenceId: 'ref1',
    });
    expect(patch).toMatchObject({ fit: 'poor', fitConfidence: 0.8, fitReferenceId: 'ref1' });
    // Without the reference id the verdict could not be reused on a later run.
    expect(patch.fitReferenceId).toBe('ref1');
  });

  it('keeps a stored luma when none was gathered', () => {
    expect(buildPatch(photo({ rollDeg: 1, pitchDeg: 2, luma: 0.44 }), {}).luma).toBe(0.44);
  });

  it('omits luma entirely when there is none to record', () => {
    expect('luma' in buildPatch(photo({ rollDeg: 1, pitchDeg: 2 }), {})).toBe(false);
  });
});
