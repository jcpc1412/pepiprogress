import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { allProviders } from '@/lib/integrations/registry';
import { useStore } from '@/lib/store';

/** Don't re-pull a provider more often than this (incremental pulls are cheap,
 * but foregrounding the app repeatedly shouldn't hammer HealthKit). */
const MIN_SYNC_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Passive integration sync (spec 06 — "lower the logging burden"). Pulls
 * readings from every connected, platform-available, native-ready provider on
 * mount and whenever the app returns to the foreground, then feeds them into the
 * canonical `metricReadings` store so the daily check-in autofills without the
 * user tapping "Sync now". Incremental (since `lastSyncAt`), rate-limited, and a
 * no-op on web (no provider `isAvailable()`s there). Renders nothing.
 */
export function IntegrationSync() {
  const { integrations, setIntegration, addMetricReadings } = useStore();
  // Guard against overlapping runs (foreground + mount firing together).
  const runningRef = useRef(false);
  // Latest connection state, read inside the async loop without re-subscribing.
  const integrationsRef = useRef(integrations);
  useEffect(() => {
    integrationsRef.current = integrations;
  }, [integrations]);

  useEffect(() => {
    let cancelled = false;

    const syncAll = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        for (const provider of allProviders()) {
          if (!provider.isAvailable() || !provider.nativeReady) continue;
          const conn = integrationsRef.current[provider.id];
          if (!conn?.connectedAt) continue;
          if (conn.lastSyncAt && Date.now() - new Date(conn.lastSyncAt).getTime() < MIN_SYNC_INTERVAL_MS) {
            continue;
          }
          try {
            const readings = await provider.pull({ since: conn.lastSyncAt, connection: conn });
            if (cancelled) return;
            if (readings.length) addMetricReadings(readings);
            setIntegration(provider.id, { lastSyncAt: new Date().toISOString() });
          } catch {
            // Provider unavailable / permission revoked — skip, try again next foreground.
          }
        }
      } finally {
        runningRef.current = false;
      }
    };

    // Initial sync on mount.
    void syncAll();

    // Re-sync whenever the app returns to the foreground.
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') void syncAll();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => {
      cancelled = true;
      sub.remove();
    };
    // Mount-only: the async loop reads live state via integrationsRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
