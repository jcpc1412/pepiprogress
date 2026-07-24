import { useEffect, useRef } from 'react';

import { buildBodySamples, hashSamples } from '@/lib/integrations/health-writeback';
import { allProviders } from '@/lib/integrations/registry';
import { useStore } from '@/lib/store';

/** Debounce so a burst of check-in edits mirrors once, not per keystroke. */
const DEBOUNCE_MS = 2500;

/**
 * Health write-back (owner request): mirror each check-in's weight, body-fat %
 * (computed Navy estimate) and waist into any connected provider that accepts
 * writes and has write-back enabled (Apple Health today). Per-day hashes in the
 * provider's connection state mean an unchanged day is never re-written (no
 * duplicate Health samples); the hashes are seeded when the user enables the
 * toggle, so only days logged/edited *after* enabling mirror — data imported
 * *from* the store is never echoed back. Renders nothing; no-op on web.
 */
export function HealthWriteBack() {
  const { entries, profile, integrations, setIntegration } = useStore();
  const runningRef = useRef(false);

  // Live snapshots read inside the async run without re-subscribing it.
  const latest = useRef({ entries, profile, integrations });
  useEffect(() => {
    latest.current = { entries, profile, integrations };
  }, [entries, profile, integrations]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void mirror();
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);

    async function mirror() {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const state = latest.current;
        for (const provider of allProviders()) {
          if (!provider.push || !provider.isAvailable() || !provider.nativeReady) continue;
          const conn = state.integrations[provider.id];
          if (!conn?.connectedAt || !conn.writeEnabled) continue;

          const written = conn.writtenHashes ?? {};
          const nextHashes: Record<string, string> = { ...written };
          const toWrite = [];
          for (const checkin of Object.values(state.entries)) {
            // Drop metrics this store cannot hold BEFORE hashing, or the day
            // hashes as written and a later provider change would never resend.
            const samples = buildBodySamples(checkin, state.profile).filter(
              (s) => provider.writeMetrics?.includes(s.metric) ?? true,
            );
            if (samples.length === 0) continue;
            const h = hashSamples(samples);
            if (written[checkin.date] === h) continue;
            toWrite.push(...samples);
            nextHashes[checkin.date] = h;
          }
          if (toWrite.length === 0) continue;

          try {
            const res = await provider.push(toWrite);
            // Only record hashes we actually wrote; a total failure retries next run.
            if (res.written > 0) setIntegration(provider.id, { writtenHashes: nextHashes });
          } catch {
            // Permission revoked / module unavailable — retry on the next change.
          }
        }
      } finally {
        runningRef.current = false;
      }
    }
    // Re-run whenever the debounced deps change; the async body reads live refs.
  }, [entries, profile, integrations, setIntegration]);

  return null;
}
