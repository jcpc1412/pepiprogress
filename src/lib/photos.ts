import { Directory, File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { PhotoEntry } from '@/lib/store';

const BUCKET = 'progress-photos';

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
  const response = await fetch(localUri);
  const blob = await response.blob();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  return path;
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
