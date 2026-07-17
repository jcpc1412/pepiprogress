import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
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
  const path = `${userId}/${photoId}.jpg`;
  const uploadUri = await compressForUpload(localUri);
  const response = await fetch(uploadUri);
  const blob = await response.blob();
  if (blob.size > UPLOAD_MAX_BYTES) {
    throw new Error(`photo exceeds upload cap (${blob.size} > ${UPLOAD_MAX_BYTES} bytes)`);
  }
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
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

/**
 * Resolves the best displayable URI for a photo.
 * If the local file still exists (same device), returns it immediately.
 * Otherwise fetches a signed URL from cloudPath (cross-device restore).
 */
export async function resolvePhotoUri(photo: PhotoEntry): Promise<string> {
  try {
    if (new File(photo.uri).exists) return photo.uri;
  } catch {
    // URI is not a valid local path (e.g. different device after cloud restore)
  }

  if (!photo.cloudPath) return photo.uri; // best-effort: show broken img rather than crash

  const cached = signedUrlCache.get(photo.cloudPath);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;

  const url = await getSignedUrl(photo.cloudPath);
  signedUrlCache.set(photo.cloudPath, { url, expiresAt: Date.now() + 3_600_000 });
  return url;
}

/**
 * Hook: resolves display URIs for an array of photos, falling back to signed
 * URLs when local files are missing (cross-device). Starts with local URIs as
 * a placeholder (fast) then patches in cloud URLs as they resolve.
 */
export function useResolvedUris(photos: PhotoEntry[]): Record<string, string> {
  const [uris, setUris] = useState<Record<string, string>>(() =>
    Object.fromEntries(photos.map((p) => [p.id, p.uri])),
  );

  useEffect(() => {
    let cancelled = false;
    for (const photo of photos) {
      resolvePhotoUri(photo)
        .then((url) => {
          if (cancelled || url === photo.uri) return;
          setUris((prev) => ({ ...prev, [photo.id]: url }));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  // Re-run when the photo list identity changes (new photo added or cloudPath updated).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.map((p) => `${p.id}:${p.cloudPath ?? ''}`).join(',')]);

  return uris;
}
