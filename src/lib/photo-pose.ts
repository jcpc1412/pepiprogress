import type { PhotoEntry, PhotoSession } from '@/lib/store';

/**
 * Photo reel poses (W6-25, beta-notes §1.3). The reel lets a user shoot or dump a
 * pile of photos; the library groups itself by pose. Only REQUIRED check-in
 * photos are locked to the canonical relaxed set (front/side face, front/side
 * body) and feed the scientific compare; casual reel photos are freeform (`other`
 * or untagged) and never feed analysis.
 *
 * Pure + deterministic: pose assignment is manual in phase 1 (chips at save) and
 * gains Haiku auto-classification in phase 2. This module owns the pose taxonomy,
 * the capture → pose derivation, and the reel grouping.
 */

export const CANONICAL_POSES = ['front_relaxed', 'side_relaxed', 'front_face', 'side_profile', 'other'] as const;
export type CanonicalPose = (typeof CANONICAL_POSES)[number];

/** Only the four locked poses feed the comparability track; `other` is casual. */
export const REQUIRED_POSES: CanonicalPose[] = ['front_face', 'side_profile', 'front_relaxed', 'side_relaxed'];

/** Stable display order for reel groups; casual `other` last. */
export const POSE_ORDER: CanonicalPose[] = ['front_face', 'side_profile', 'front_relaxed', 'side_relaxed', 'other'];

/** Untagged photos sort first in the reel so they're easy to triage. */
export type PoseKey = CanonicalPose | 'unsorted';

/**
 * The canonical pose an in-app capture lands in, from its session + angle. In-app
 * captures use the locked-pose flow (ghost + measurement), so their pose is
 * derived deterministically, never guessed.
 */
export function poseFromCapture(session: PhotoSession, view?: 'front' | 'side'): CanonicalPose {
  if (session === 'face') return view === 'side' ? 'side_profile' : 'front_face';
  return view === 'side' ? 'side_relaxed' : 'front_relaxed';
}

/**
 * The session track a pose belongs to — the inverse of {@link poseFromCapture}.
 * Reel-centric capture (W6-26c) no longer asks Face vs Body upfront: the guided
 * pose choice picks the camera, and a casual shot's classified pose decides which
 * track it joins. Face poses → the face track; everything else → the body track
 * (casual `other` shots are mirror/body pics by default).
 */
export function sessionForPose(pose: CanonicalPose): PhotoSession {
  return pose === 'front_face' || pose === 'side_profile' ? 'face' : 'body';
}

/** The capture angle a pose implies (side profiles/relaxed → 'side'). */
export function viewForPose(pose: CanonicalPose): 'front' | 'side' {
  return pose === 'side_profile' || pose === 'side_relaxed' ? 'side' : 'front';
}

/**
 * Auto-classified poses at or above this confidence are treated as good and
 * apply silently; below it the reel asks the user to confirm (W6-26 §1.3
 * human-in-the-loop). A manually confirmed pose carries no `poseConfidence`.
 */
export const POSE_CONFIRM_THRESHOLD = 0.75;

/** True when a photo carries a low-confidence auto-suggested pose the user hasn't
 *  confirmed yet (so the reel can surface a one-tap confirm). */
export function needsPoseConfirm(photo: PhotoEntry): boolean {
  return (
    photo.pose !== undefined &&
    photo.poseConfidence !== undefined &&
    photo.poseConfidence < POSE_CONFIRM_THRESHOLD
  );
}

export type PoseGroup = { pose: PoseKey; photos: PhotoEntry[] };

/**
 * Group photos into the reel by pose: untagged first (they need triage), then
 * POSE_ORDER. Newest-first within a group; empty groups omitted.
 */
export function groupPhotosByPose(photos: PhotoEntry[]): PoseGroup[] {
  const byPose = new Map<PoseKey, PhotoEntry[]>();
  for (const p of photos) {
    const key: PoseKey = p.pose ?? 'unsorted';
    const arr = byPose.get(key) ?? [];
    arr.push(p);
    byPose.set(key, arr);
  }
  const order: PoseKey[] = ['unsorted', ...POSE_ORDER];
  const groups: PoseGroup[] = [];
  for (const key of order) {
    const arr = byPose.get(key);
    if (!arr || arr.length === 0) continue;
    arr.sort((a, b) => b.takenAt.localeCompare(a.takenAt));
    groups.push({ pose: key, photos: arr });
  }
  return groups;
}
