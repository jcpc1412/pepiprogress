import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { localDateKey, localHour } from '@/lib/dates';
import { applyFieldCustomization, surfaceFields } from '@/lib/field-surfacing';
import { CanonicalMetric } from '@/lib/integrations/types';
import { allProviders } from '@/lib/integrations/registry';
import { reconcileAfterSync } from '@/lib/post-sync-reconcile';
import { learnRoutineWindow } from '@/lib/routine-window';
import { useStore } from '@/lib/store';

/** Don't re-pull a provider more often than this (incremental pulls are cheap,
 * but foregrounding the app repeatedly shouldn't hammer HealthKit). */
const MIN_SYNC_INTERVAL_MS = 15 * 60 * 1000;

/** If the pull hasn't settled by now, reconcile with whatever is already in the
 *  store. A provider that hangs must not also cost the user the follow-up: the
 *  fallback fires once, and the real completion is idempotent behind it. */
const RECONCILE_FALLBACK_MS = 8_000;

/** Metrics whose timestamps describe when this user actually trains. */
const ROUTINE_METRICS = [
  CanonicalMetric.activityWorkoutMin,
  CanonicalMetric.activityWorkout,
  CanonicalMetric.activityEffort,
];

/**
 * Passive integration sync (spec 06 — "lower the logging burden"). Pulls
 * readings from every connected, platform-available, native-ready provider on
 * mount and whenever the app returns to the foreground, then feeds them into the
 * canonical `metricReadings` store so the daily check-in autofills without the
 * user tapping "Sync now". Incremental (since `lastSyncAt`), rate-limited, and a
 * no-op on web (no provider `isAvailable()`s there). Renders nothing.
 *
 * Post-sync reconciliation (2b.5) runs *after* the pull settles, never beside
 * it: fill every field a source now covers, and queue a follow-up only for the
 * fields a source was expected to cover and didn't. Sync first, ask second.
 */
export function IntegrationSync() {
  const store = useStore();
  const { integrations, setIntegration, addMetricReadings } = store;
  // Guard against overlapping runs (foreground + mount firing together).
  const runningRef = useRef(false);
  // Latest store state, read inside the async loop without re-subscribing.
  const storeRef = useRef(store);
  useEffect(() => {
    storeRef.current = store;
  });
  const integrationsRef = useRef(integrations);
  useEffect(() => {
    integrationsRef.current = integrations;
  }, [integrations]);

  useEffect(() => {
    let cancelled = false;

    /**
     * Fill what the sync now covers, and queue the follow-up for what it
     * didn't. Idempotent: the fallback timer and the real sync completion both
     * call it, and the second call is a no-op when nothing has changed.
     */
    const reconcile = () => {
      if (cancelled) return;
      const s = storeRef.current;
      const date = localDateKey();
      const base = surfaceFields(s.profile.goals, s.profile.compoundSlugs);
      const fields = applyFieldCustomization(
        base.fields,
        s.profile.addedFields,
        s.profile.removedFields,
      );
      const prev = s.profile.pendingAsks;
      const asked = prev?.date === date ? (prev.asked ?? []) : [];
      const result = reconcileAfterSync({
        surfacedFields: fields,
        entry: s.entries[date],
        readings: s.metricReadings,
        dateKey: date,
        units: s.profile.units,
        hour: localHour(),
        routineWindow: learnRoutineWindow(s.metricReadings, ROUTINE_METRICS),
        hasConnectedSource: Object.values(s.integrations).some((c) => c?.connectedAt),
        alreadyAsked: asked,
      });

      if (result.filled.length) {
        const prevAuto = s.entries[date]?.autoFilled ?? [];
        const autoFilled = [...new Set([...prevAuto, ...result.filled])];
        s.upsertCheckin(date, { ...result.fill, autoFilled });
      }

      // Rebuild the queue every run so a field that just synced drops out of it
      // and yesterday's queue can never be shown today.
      const same =
        prev?.date === date &&
        prev.fields.length === result.ask.length &&
        prev.fields.every((f, i) => f === result.ask[i]);
      if (same) return;
      if (!result.ask.length && !prev) return;
      s.setProfile({
        pendingAsks:
          result.ask.length || asked.length ? { date, fields: result.ask, asked } : undefined,
      });
    };

    const syncAll = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      // The follow-up must never depend on a provider answering.
      const fallback = setTimeout(reconcile, RECONCILE_FALLBACK_MS);
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
        clearTimeout(fallback);
        runningRef.current = false;
        // A microtask so the readings this run added are visible in storeRef.
        setTimeout(reconcile, 0);
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
    // Mount-only: the async loop reads live state via the refs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
