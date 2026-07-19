import type { PhotoEntry } from '@/lib/store';

/**
 * Cross-device photo restore (W7-32).
 *
 * The Android beta surfaced the failure this module exists to prevent: a second
 * device restored a snapshot reporting 7 photos and rendered none of them. The
 * snapshot carries `PhotoEntry.uri`, a local file path that means nothing on
 * another device, so display has to fall back to the cloud copy.
 *
 * Two things made that fallback unreachable:
 *   1. `cloudPath` was only ever written by an effect inside the Photos tab, so
 *      a user who signed in and never opened that tab uploaded nothing.
 *   2. When `cloudPath` was missing, resolution gave up and returned the dead
 *      local URI, which renders as a permanently broken image.
 *
 * The recovery leans on upload paths being deterministic: a photo always lives
 * at `<userId>/<photoId>.jpg`. So even with no `cloudPath` recorded we can probe
 * that path, and heal the entry when the object is really there.
 *
 * Everything here is pure so the decision table is testable without a
 * filesystem, a network, or a signed-in user.
 */

/** Where a photo's cloud object lives. Deterministic by construction, which is
 *  what makes recovery from a missing `cloudPath` possible. */
export function cloudPathFor(userId: string, photoId: string): string {
  return `${userId}/${photoId}.jpg`;
}

/** True when a photo still owes the cloud a copy. */
export function photoNeedsUpload(photo: PhotoEntry): boolean {
  return !photo.cloudPath;
}

/**
 * How to display one photo.
 *
 * - `local`  the file is on this device; use it, no network.
 * - `signed` we know the cloud path; sign it.
 * - `probe`  no recorded path, but the deterministic one may exist; try it, and
 *            write `cloudPath` back if it resolves.
 * - `none`   nothing displayable (signed out, or never uploaded). The caller
 *            shows a placeholder rather than a broken frame.
 */
export type PhotoResolution =
  | { kind: 'local'; uri: string }
  | { kind: 'signed'; path: string }
  | { kind: 'probe'; path: string }
  | { kind: 'none' };

export function resolutionPlan(
  photo: PhotoEntry,
  userId: string | null,
  localExists: boolean,
): PhotoResolution {
  if (localExists) return { kind: 'local', uri: photo.uri };
  if (photo.cloudPath) return { kind: 'signed', path: photo.cloudPath };
  // No recorded path. The object may still exist from an upload whose
  // `cloudPath` write never made it into the synced snapshot, so it is worth
  // one probe at the deterministic location.
  if (userId) return { kind: 'probe', path: cloudPathFor(userId, photo.id) };
  return { kind: 'none' };
}

/** Photos that still need uploading, newest first so the most-looked-at
 *  images become available on other devices soonest. */
export function pendingUploads(photos: PhotoEntry[]): PhotoEntry[] {
  return photos
    .filter(photoNeedsUpload)
    .slice()
    .sort((a, b) => (a.takenAt < b.takenAt ? 1 : a.takenAt > b.takenAt ? -1 : 0));
}
