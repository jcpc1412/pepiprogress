import { describe, expect, it } from 'vitest';

import { cloudPathFor, pendingUploads, photoNeedsUpload, resolutionPlan } from '@/lib/photo-cloud';
import type { PhotoEntry } from '@/lib/store';

const photo = (over: Partial<PhotoEntry> = {}): PhotoEntry =>
  ({
    id: 'p1',
    uri: 'file:///docs/pepi-photos/1.jpg',
    session: 'body',
    takenAt: '2026-07-18T10:00:00.000Z',
    ...over,
  }) as PhotoEntry;

describe('cloudPathFor', () => {
  it('is deterministic per user + photo', () => {
    expect(cloudPathFor('u1', 'p1')).toBe('u1/p1.jpg');
    expect(cloudPathFor('u1', 'p1')).toBe(cloudPathFor('u1', 'p1'));
  });

  it('scopes by user so two users cannot collide', () => {
    expect(cloudPathFor('u1', 'p1')).not.toBe(cloudPathFor('u2', 'p1'));
  });
});

describe('photoNeedsUpload', () => {
  it('is true until a cloudPath is recorded', () => {
    expect(photoNeedsUpload(photo())).toBe(true);
    expect(photoNeedsUpload(photo({ cloudPath: 'u1/p1.jpg' }))).toBe(false);
  });
});

describe('resolutionPlan', () => {
  it('prefers the local file, avoiding a network round-trip', () => {
    expect(resolutionPlan(photo({ cloudPath: 'u1/p1.jpg' }), 'u1', true)).toEqual({
      kind: 'local',
      uri: 'file:///docs/pepi-photos/1.jpg',
    });
  });

  it('signs the recorded path when the local file is gone', () => {
    expect(resolutionPlan(photo({ cloudPath: 'u1/p1.jpg' }), 'u1', false)).toEqual({
      kind: 'signed',
      path: 'u1/p1.jpg',
    });
  });

  it('probes the deterministic path when cloudPath never synced', () => {
    // The reported bug: restored entries carried a dead local URI and no
    // cloudPath, so display gave up. The object may still be in the bucket.
    expect(resolutionPlan(photo(), 'u1', false)).toEqual({ kind: 'probe', path: 'u1/p1.jpg' });
  });

  it('gives up cleanly when signed out with no local file', () => {
    expect(resolutionPlan(photo(), null, false)).toEqual({ kind: 'none' });
  });

  it('still uses the local file when signed out', () => {
    expect(resolutionPlan(photo(), null, true).kind).toBe('local');
  });

  it('never returns the dead local uri as displayable when the file is missing', () => {
    // Guards the exact regression: a missing file must not resolve to `local`.
    for (const userId of ['u1', null]) {
      const plan = resolutionPlan(photo(), userId, false);
      expect(plan.kind).not.toBe('local');
    }
  });
});

describe('pendingUploads', () => {
  it('returns only un-uploaded photos, newest first', () => {
    const list = [
      photo({ id: 'old', takenAt: '2026-07-01T00:00:00.000Z' }),
      photo({ id: 'done', takenAt: '2026-07-10T00:00:00.000Z', cloudPath: 'u1/done.jpg' }),
      photo({ id: 'new', takenAt: '2026-07-18T00:00:00.000Z' }),
    ];
    expect(pendingUploads(list).map((p) => p.id)).toEqual(['new', 'old']);
  });

  it('does not mutate the input order', () => {
    const list = [
      photo({ id: 'a', takenAt: '2026-07-01T00:00:00.000Z' }),
      photo({ id: 'b', takenAt: '2026-07-18T00:00:00.000Z' }),
    ];
    pendingUploads(list);
    expect(list.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('is empty when everything is uploaded', () => {
    expect(pendingUploads([photo({ cloudPath: 'u1/p1.jpg' })])).toEqual([]);
  });
});
