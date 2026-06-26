import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/lib/auth';
import { useStore } from '@/lib/store';
import { isSupabaseConfigured } from '@/lib/supabase';
import { pushSnapshot } from '@/lib/sync';

/** Debounce window: coalesce bursts of edits into one cloud write. */
const DEBOUNCE_MS = 2500;

/** Cloud backup status, surfaced to the UI via {@link useSyncStatus}.
 *  'off' = not applicable (signed out or Supabase unconfigured) — show nothing. */
export type SyncStatus = 'off' | 'syncing' | 'synced' | 'error';

const SyncStatusContext = createContext<SyncStatus>('off');

/** Read the current cloud-sync status. 'off' when there's nothing to show. */
export function useSyncStatus(): SyncStatus {
  return useContext(SyncStatusContext);
}

/**
 * Continuous cloud backup + sync-status provider. Mounted once under the store +
 * auth providers, wrapping the app. While a user is signed in, mirrors the local
 * state to `user_state` (debounced) on every change, flushes immediately when the
 * app backgrounds, and publishes a status the UI can show.
 *
 * Interim mechanism (snapshot blob) — the normalized per-entity sync engine with
 * field-level conflict resolution is Polish-tier (spec 10).
 */
export function CloudSync({ children }: { children?: ReactNode }) {
  const { user } = useAuth();
  const { ready, exportState } = useStore();
  const state = exportState();

  // Signed-in users start as "synced" (sign-in restores from cloud); edits move it
  // through syncing → synced/error. Derived to 'off' below when sync isn't applicable.
  const [status, setStatus] = useState<SyncStatus>('synced');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Skip the first push after a fresh sign-in/hydrate so a pull-then-push loop
  // doesn't immediately re-upload what we just restored.
  const lastPushed = useRef<string | null>(null);

  const active = isSupabaseConfigured && !!user;

  const flush = async (serialized: string, userId: string) => {
    setStatus('syncing');
    const res = await pushSnapshot(JSON.parse(serialized), userId);
    lastPushed.current = serialized;
    setStatus(res.ok ? 'synced' : 'error');
  };

  // Debounced push on every state change while signed in.
  useEffect(() => {
    if (!active || !ready || !user) return;
    const serialized = JSON.stringify(state);
    if (serialized === lastPushed.current) return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flush(serialized, user.id);
    }, DEBOUNCE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state, user, ready, active]);

  // Flush immediately on background/inactive so a pending edit is durable.
  useEffect(() => {
    if (!active || !user) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        const serialized = JSON.stringify(state);
        if (serialized !== lastPushed.current) void flush(serialized, user.id);
      }
    });
    return () => sub.remove();
  }, [state, user, active]);

  return (
    <SyncStatusContext.Provider value={active ? status : 'off'}>{children}</SyncStatusContext.Provider>
  );
}
