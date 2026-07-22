import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/lib/auth';
import { useStore } from '@/lib/store';
import { isSupabaseConfigured } from '@/lib/supabase';
import { mirrorEntities, type MirrorHashes } from '@/lib/sync';

/** Debounce window for the mirror. Wider than the snapshot's (it runs several
 *  queries), so a burst of edits coalesces into one reconciliation. */
const MIRROR_DEBOUNCE_MS = 4000;

/**
 * F6 · Normalized cloud mirror driver (MASTER-PLAN §F6).
 *
 * Mounted once beside {@link CloudSync}. While signed in, it debounce-mirrors the
 * community-aggregation entities into the normalized tables (best-effort,
 * idempotent), flushing on background so a pending edit is durable. The snapshot
 * blob stays authoritative for restore; this exists so the normalized tables
 * (which community aggregation reads) actually reflect current data, instead of
 * only the one-time sign-up upload.
 *
 * The consent gate lives at aggregation, not here: rows are owner-only RLS and
 * the mirror always runs; `consentCommunity` governs what aggregation may read.
 * Renders nothing.
 */
export function NormalizedMirror() {
  const { user } = useAuth();
  const { ready, exportState } = useStore();
  const state = exportState();

  // In-memory record of what was last mirrored, so a push only writes changed
  // rows. Reset when the signed-in user changes (new bucket of rows).
  const hashes = useRef<MirrorHashes>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Skip re-running when the serialized state is byte-identical to the last run.
  const lastSerialized = useRef<string | null>(null);
  const draining = useRef(false);

  const active = isSupabaseConfigured && !!user;

  const lastUser = useRef<string | null>(null);
  useEffect(() => {
    if (lastUser.current !== (user?.id ?? null)) {
      hashes.current = {};
      lastSerialized.current = null;
      lastUser.current = user?.id ?? null;
    }
  }, [user?.id]);

  const flush = async (serialized: string, userId: string) => {
    if (draining.current) return;
    draining.current = true;
    try {
      const parsed = JSON.parse(serialized);
      const { nextHashes } = await mirrorEntities(parsed, userId, hashes.current);
      hashes.current = nextHashes;
      lastSerialized.current = serialized;
    } catch {
      // Best-effort: leave hashes untouched so the next pass retries. The
      // snapshot backup (CloudSync) is the durable copy regardless.
    } finally {
      draining.current = false;
    }
  };

  // Debounced reconcile on every state change while signed in.
  useEffect(() => {
    if (!active || !ready || !user) return;
    const serialized = JSON.stringify(state);
    if (serialized === lastSerialized.current) return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flush(serialized, user.id);
    }, MIRROR_DEBOUNCE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
     
  }, [state, user, ready, active]);

  // Flush immediately on background so a pending edit reaches the tables.
  useEffect(() => {
    if (!active || !user) return;
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' && timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        const serialized = JSON.stringify(state);
        if (serialized !== lastSerialized.current) void flush(serialized, user.id);
      }
    });
    return () => sub.remove();
     
  }, [state, user, active]);

  return null;
}
