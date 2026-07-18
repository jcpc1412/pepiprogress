import { describe, expect, it } from 'vitest';

import { groupPhotosByPose, needsPoseConfirm, poseFromCapture, type CanonicalPose } from './photo-pose';
import type { PhotoEntry } from './store';

const photo = (id: string, takenAt: string, pose?: CanonicalPose): PhotoEntry =>
  ({ id, session: 'body', uri: `file://${id}`, takenAt, pose }) as PhotoEntry;

describe('poseFromCapture', () => {
  it('maps face captures to face poses', () => {
    expect(poseFromCapture('face', 'front')).toBe('front_face');
    expect(poseFromCapture('face', 'side')).toBe('side_profile');
    expect(poseFromCapture('face')).toBe('front_face'); // default front
  });

  it('maps body captures to relaxed poses', () => {
    expect(poseFromCapture('body', 'front')).toBe('front_relaxed');
    expect(poseFromCapture('body', 'side')).toBe('side_relaxed');
    expect(poseFromCapture('body')).toBe('front_relaxed');
  });
});

describe('groupPhotosByPose', () => {
  it('is empty with no photos', () => {
    expect(groupPhotosByPose([])).toEqual([]);
  });

  it('puts untagged photos first, then canonical order', () => {
    const groups = groupPhotosByPose([
      photo('a', '2026-06-01T00:00:00.000Z', 'front_relaxed'),
      photo('b', '2026-06-02T00:00:00.000Z'), // untagged
      photo('c', '2026-06-03T00:00:00.000Z', 'front_face'),
    ]);
    expect(groups.map((g) => g.pose)).toEqual(['unsorted', 'front_face', 'front_relaxed']);
  });

  it('orders photos newest-first within a group', () => {
    const groups = groupPhotosByPose([
      photo('old', '2026-06-01T00:00:00.000Z', 'other'),
      photo('new', '2026-06-05T00:00:00.000Z', 'other'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].photos.map((p) => p.id)).toEqual(['new', 'old']);
  });

  it('omits empty groups', () => {
    const groups = groupPhotosByPose([photo('a', '2026-06-01T00:00:00.000Z', 'side_profile')]);
    expect(groups.map((g) => g.pose)).toEqual(['side_profile']);
  });
});

describe('needsPoseConfirm', () => {
  const p = (over: Partial<PhotoEntry>): PhotoEntry =>
    ({ id: 'x', session: 'body', uri: 'file://x', takenAt: '2026-06-01T00:00:00.000Z', ...over }) as PhotoEntry;

  it('is false for untagged photos', () => {
    expect(needsPoseConfirm(p({}))).toBe(false);
  });

  it('is false for a manually confirmed pose (no confidence)', () => {
    expect(needsPoseConfirm(p({ pose: 'front_relaxed' }))).toBe(false);
  });

  it('is false for a high-confidence auto pose', () => {
    expect(needsPoseConfirm(p({ pose: 'front_relaxed', poseConfidence: 0.9 }))).toBe(false);
  });

  it('is true for a low-confidence auto pose', () => {
    expect(needsPoseConfirm(p({ pose: 'other', poseConfidence: 0.4 }))).toBe(true);
  });
});
