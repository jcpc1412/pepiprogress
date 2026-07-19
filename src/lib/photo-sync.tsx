import { useEffect, useRef } from 'react';

import { useAuth } from '@/lib/auth';
import { pendingUploads } from '@/lib/photo-cloud';
import { syncPhotoRow, uploadPhotoToCloud } from '@/lib/photos';
import { useStore } from '@/lib/store';
import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * Photo upload backfill (W7-32).
 *
 * Uploading used to be an effect inside the Photos tab, which meant a signed-in
 * user who never opened that tab uploaded nothing, and their photos could not
 * possibly appear on a second device. Hoisting it here, mounted once beside
 * CloudSync, makes "signed in" the only condition for a photo reaching the
 * cloud.
 *
 * Best-effort by design: a failed upload leaves `cloudPath` unset so the photo
 * is simply picked up on a later pass. Nothing here blocks capture or display.
 */
export function PhotoSync() {
  const { user } = useAuth();
  const { ready, photos, profile, updatePhoto } = useStore();

  // Photos attempted this session, so a transient failure doesn't spin.
  const attempted = useRef<Set<string>>(new Set());
  // Guards against a second pass starting while one is mid-flight (the effect
  // re-runs on every photo change, and each upload causes one).
  const draining = useRef(false);

  // A new user means a new bucket namespace; forget what we tried as the
  // previous one so their backlog is attempted fresh.
  const lastUser = useRef<string | null>(null);
  useEffect(() => {
    if (lastUser.current !== (user?.id ?? null)) {
      attempted.current.clear();
      lastUser.current = user?.id ?? null;
    }
  }, [user?.id]);

  useEffect(() => {
    if (!isSupabaseConfigured || !ready || !user) return;

    if (draining.current) return;
    const queue = pendingUploads(photos).filter((p) => !attempted.current.has(p.id));
    if (queue.length === 0) return;

    let cancelled = false;
    // Sequential: photos are megabytes and a fresh sign-in can carry a whole
    // backlog, so this stays polite with the connection and the battery.
    const drain = async () => {
      draining.current = true;
      try {
        for (const photo of queue) {
          if (cancelled) return;
          attempted.current.add(photo.id);
          try {
            const cloudPath = await uploadPhotoToCloud(photo.uri, user.id, photo.id);
            if (cancelled) return;
            await syncPhotoRow(photo, user.id, cloudPath, {
              storage: profile.consentPhotoStorage ?? false,
              ai: profile.consentPhotoAI ?? false,
            }).catch(() => {});
            // Recording the path is what makes the photo reachable elsewhere.
            updatePhoto(photo.id, { cloudPath });
          } catch {
            // Local file gone (imported then cleaned up) or offline. Allow a
            // retry on a later pass rather than burning the id permanently.
            attempted.current.delete(photo.id);
          }
        }
      } finally {
        draining.current = false;
      }
    };

    void drain();
    return () => {
      cancelled = true;
    };
    // Consents are read at upload time; re-running on their change would only
    // re-attempt work already guarded by cloudPath + `attempted`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, user, ready, updatePhoto]);

  return null;
}
