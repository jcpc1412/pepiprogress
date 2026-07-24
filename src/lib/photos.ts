import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useEffect, useRef, useState } from 'react';

import { cloudPathFor, resolutionPlan } from '@/lib/photo-cloud';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { PhotoEntry } from '@/lib/store';

const BUCKET = 'progress-photos';

/** Cloud upload size policy (master-plan W1-2). The full-res original stays on
 *  device; the cloud copy is a ~2048px-long-edge JPEG (plenty for cross-device
 *  display + AI analysis, which downscales further to 768px anyway). Cuts
 *  storage + egress roughly 4x vs uploading raw camera output. */
const UPLOAD_MAX_EDGE = 2048;
const UPLOAD_QUALITY = 0.8;
/** Hard client-side guard so a pathological image can never blow up the bucket. */
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Renders a display-quality JPEG for upload: long edge capped at
 * {@link UPLOAD_MAX_EDGE}, never upscaled. Falls back to the original URI if
 * manipulation fails — an oversized upload beats a failed one.
 */
async function compressForUpload(uri: string): Promise<string> {
  try {
    const probe = await ImageManipulator.manipulate(uri).renderAsync();
    const long = Math.max(probe.width, probe.height);
    if (long > UPLOAD_MAX_EDGE) {
      const scale = UPLOAD_MAX_EDGE / long;
      const ctx = ImageManipulator.manipulate(uri);
      ctx.resize({
        width: Math.round(probe.width * scale),
        height: Math.round(probe.height * scale),
      });
      const rendered = await ctx.renderAsync();
      const out = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: UPLOAD_QUALITY });
      return out.uri;
    }
    // Already small enough — still re-encode at q0.8 to normalize oversized encodings.
    const out = await probe.saveAsync({ format: SaveFormat.JPEG, compress: UPLOAD_QUALITY });
    return out.uri;
  } catch {
    return uri;
  }
}

/**
 * Copies a photo from the camera's evictable cache to the app's persistent
 * documents directory. Returns the new persistent URI.
 */
export async function copyPhotoToDocuments(cacheUri: string): Promise<string> {
  const photoDir = new Directory(Paths.document, 'pepi-photos');
  if (!photoDir.exists) photoDir.create();

  const destFile = new File(photoDir, `${Date.now()}.jpg`);
  const src = new File(cacheUri);
  await src.copy(destFile);
  return destFile.uri;
}

/**
 * Uploads a local photo to the private Supabase Storage bucket.
 * Returns the storage path (not a URL — use getSignedUrl to display it).
 * Idempotent: upsert=true so retries are safe.
 */
export async function uploadPhotoToCloud(
  localUri: string,
  userId: string,
  photoId: string,
): Promise<string> {
  // Deterministic by design: recovery probes this exact path when a photo's
  // cloudPath never made it into the synced snapshot (see photo-cloud.ts).
  const path = cloudPathFor(userId, photoId);
  const uploadUri = await compressForUpload(localUri);
  // Read the file's bytes directly rather than `fetch(uri).blob()`: on React
  // Native (Android especially) fetching a file:// URI and calling .blob()
  // often yields an empty or unusable Blob, so the upload silently failed and
  // no photo ever reached the bucket. A Uint8Array is what storage-js wants.
  const bytes = await new File(uploadUri).bytes();
  if (bytes.byteLength > UPLOAD_MAX_BYTES) {
    throw new Error(`photo exceeds upload cap (${bytes.byteLength} > ${UPLOAD_MAX_BYTES} bytes)`);
  }
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  return path;
}

/**
 * Inserts the photo's metadata row into the `photo` table, linking it to the
 * Storage object at `storagePath`. Previously photos only reached the Storage
 * bucket (via {@link uploadPhotoToCloud}) and the normalized `photo` table stayed
 * empty except for the one-time sign-up migration; this closes that gap so every
 * captured photo is a row. Best-effort: the caller ignores failures so capture
 * never blocks on the network. The DB generates the uuid id (local ids are not
 * uuids); rows are written once per photo, guarded by the upload effect.
 */
export async function syncPhotoRow(
  photo: PhotoEntry,
  userId: string,
  storagePath: string,
  consents: { storage: boolean; ai: boolean },
): Promise<void> {
  const { error } = await supabase.from('photo').insert({
    user_id: userId,
    session_type: photo.session,
    captured_at: photo.takenAt,
    storage_path: storagePath,
    capture_meta: {
      part: photo.part ?? null,
      view: photo.view ?? 'front',
      tilt: photo.tilt ?? null,
      luma: photo.luma ?? null,
      distance_proxy: photo.boxRatio ?? null,
    },
    ai_meta:
      photo.driftScore !== undefined
        ? { drift_score: photo.driftScore, comparable: photo.comparable ?? false }
        : null,
    storage_consent: consents.storage,
    ai_consent: consents.ai,
  });
  if (error) throw error;
}

/**
 * Remove a photo everywhere it exists: the local file, the Storage object, and
 * the `photo` row.
 *
 * Best-effort and deliberately order-independent — a failure on any leg must not
 * strand the others, because the user has already said delete. But a *silent*
 * failure on the cloud legs would leave the image sitting in the bucket after
 * the app says it is gone, which is the one outcome that breaks the promise
 * photos are private (CLAUDE.md rule 2). So failures are returned, not swallowed,
 * and the caller decides what to tell the user.
 */
export async function deletePhotoEverywhere(
  photo: PhotoEntry,
  userId?: string,
): Promise<{ cloudRemoved: boolean; errors: string[] }> {
  const errors: string[] = [];

  // Local file first: it always exists and never needs the network.
  try {
    if (photo.uri.startsWith('file://')) {
      const file = new File(photo.uri);
      if (file.exists) file.delete();
    }
  } catch (e) {
    errors.push(`local: ${String(e)}`);
  }

  const path = photo.cloudPath ?? (userId ? cloudPathFor(userId, photo.id) : undefined);
  if (!path || !isSupabaseConfigured || !userId) {
    return { cloudRemoved: false, errors };
  }

  let cloudRemoved = true;
  try {
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) throw error;
  } catch (e) {
    cloudRemoved = false;
    errors.push(`storage: ${String(e)}`);
  }
  try {
    const { error } = await supabase.from('photo').delete().eq('user_id', userId).eq('storage_path', path);
    if (error) throw error;
  } catch (e) {
    cloudRemoved = false;
    errors.push(`row: ${String(e)}`);
  }
  return { cloudRemoved, errors };
}

/**
 * Returns a 1-hour signed URL for displaying a cloud photo.
 * Don't persist the URL itself — it expires. Store the cloudPath and call this at render time.
 */
export async function getSignedUrl(cloudPath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(cloudPath, 3600);
  if (error) throw error;
  return data.signedUrl;
}

// In-memory cache: cloudPath → { url, expiresAt }. Cleared on app restart, which is fine.
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/** Signs a storage path, reusing a cached URL while it has life left. */
async function signedUrlCached(path: string): Promise<string> {
  const cached = signedUrlCache.get(path);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;
  const url = await getSignedUrl(path);
  signedUrlCache.set(path, { url, expiresAt: Date.now() + 3_600_000 });
  return url;
}

/** Outcome of resolving one photo for display. `healedPath` is set when a probe
 *  found the object at its deterministic path, so the caller can record it. */
export type ResolvedPhoto = { uri: string | null; healedPath?: string };

/**
 * Resolves the best displayable URI for a photo (W7-32).
 *
 * Local file wins when present. Otherwise the cloud copy is signed, either from
 * the recorded `cloudPath` or, when that never synced, by probing the
 * deterministic upload path. Returns `null` when nothing is displayable so the
 * UI can show a placeholder instead of a broken image.
 */
export async function resolvePhotoUri(
  photo: PhotoEntry,
  userId: string | null,
): Promise<ResolvedPhoto> {
  let localExists = false;
  try {
    localExists = new File(photo.uri).exists;
  } catch {
    // Not a valid local path (e.g. a different device after cloud restore).
  }

  const plan = resolutionPlan(photo, userId, localExists);
  switch (plan.kind) {
    case 'local':
      return { uri: plan.uri };
    case 'signed':
      return { uri: await signedUrlCached(plan.path) };
    case 'probe':
      try {
        // Signing succeeds for a path that exists; a miss throws and we fall
        // through to "nothing to show" rather than rendering a dead URI.
        const uri = await signedUrlCached(plan.path);
        return { uri, healedPath: plan.path };
      } catch {
        return { uri: null };
      }
    case 'none':
      return { uri: null };
  }
}

/**
 * Hook: resolves display URIs for an array of photos, falling back to the cloud
 * when local files are missing (cross-device restore). A photo that resolves to
 * nothing is absent from the map, which the UI renders as a placeholder.
 *
 * When a probe recovers a photo whose `cloudPath` never synced, the entry is
 * healed via `onHeal` so the next render skips straight to the signed path.
 */
export function useResolvedUris(
  photos: PhotoEntry[],
  userId: string | null,
  onHeal?: (photoId: string, cloudPath: string) => void,
): Record<string, string> {
  const [uris, setUris] = useState<Record<string, string>>(() =>
    // Seed with local URIs so same-device rendering is immediate. Entries that
    // turn out to be dead get replaced or dropped as resolution completes.
    Object.fromEntries(photos.map((p) => [p.id, p.uri])),
  );
  // Held in a ref so a caller passing an inline callback doesn't re-trigger
  // resolution on every render.
  const healRef = useRef(onHeal);
  useEffect(() => {
    healRef.current = onHeal;
  }, [onHeal]);

  useEffect(() => {
    let cancelled = false;
    for (const photo of photos) {
      resolvePhotoUri(photo, userId)
        .then(({ uri, healedPath }) => {
          if (cancelled) return;
          if (healedPath) healRef.current?.(photo.id, healedPath);
          setUris((prev) => {
            if (uri === null) {
              if (!(photo.id in prev)) return prev;
              const next = { ...prev };
              delete next[photo.id];
              return next;
            }
            if (prev[photo.id] === uri) return prev;
            return { ...prev, [photo.id]: uri };
          });
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  // Re-run when the photo list identity changes (new photo added or cloudPath updated).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.map((p) => `${p.id}:${p.cloudPath ?? ''}`).join(','), userId]);

  return uris;
}
