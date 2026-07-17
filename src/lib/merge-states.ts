import type {
  CheckinEntry,
  DoseEvent,
  IntegrationState,
  Benchmark,
  InventoryItem,
  StrengthSession,
  LocalProfile,
  MetricReading,
  PersistedState,
  PhotoEntry,
  ProtocolItem,
  SymptomEvent,
} from '@/lib/store';

/**
 * Per-entity last-write-wins merge of local + cloud state. Pure (types-only
 * imports) so it is unit-testable without pulling in the Supabase/RN client.
 *
 * Fixes the sign-in bug where replaceState(cloudState) discards all local
 * anonymous data created before sign-in. Uses `updatedAt` timestamps for
 * conflict resolution on all entity types. Called on sign-in in place of
 * replaceState(cloudState).
 */
export function mergeStates(local: PersistedState, cloud: PersistedState): PersistedState {
  // CheckinEntry: keyed by date, LWW on updatedAt
  const entries: Record<string, CheckinEntry> = { ...cloud.entries };
  for (const [date, localEntry] of Object.entries(local.entries)) {
    const cloudEntry = entries[date];
    if (!cloudEntry || (localEntry.updatedAt ?? '') > (cloudEntry.updatedAt ?? '')) {
      entries[date] = localEntry;
    }
  }

  // Generic array merge by id, LWW on updatedAt
  function mergeById<T extends { id: string; updatedAt?: string }>(
    localArr: T[],
    cloudArr: T[],
  ): T[] {
    const merged = new Map<string, T>(cloudArr.map((e) => [e.id, e]));
    for (const item of localArr) {
      const existing = merged.get(item.id);
      if (!existing || (item.updatedAt ?? '') > (existing.updatedAt ?? '')) {
        merged.set(item.id, item);
      }
    }
    return Array.from(merged.values());
  }

  const symptomEvents = mergeById<SymptomEvent>(local.symptomEvents, cloud.symptomEvents);
  const protocolItems = mergeById<ProtocolItem>(local.protocolItems, cloud.protocolItems);
  const doseEvents = mergeById<DoseEvent>(local.doseEvents, cloud.doseEvents);
  const inventory = mergeById<InventoryItem>(local.inventory, cloud.inventory);
  const strengthSessions = mergeById<StrengthSession>(local.strengthSessions ?? [], cloud.strengthSessions ?? []);
  const benchmarks = mergeById<Benchmark>(local.benchmarks ?? [], cloud.benchmarks ?? []);

  // Photos: keyed by takenAt (capture time is immutable; no updatedAt needed)
  const photosByTime = new Map<string, PhotoEntry>(cloud.photos.map((p) => [p.takenAt, p]));
  for (const p of local.photos) {
    if (!photosByTime.has(p.takenAt)) photosByTime.set(p.takenAt, p);
  }
  const photos = Array.from(photosByTime.values()).sort((a, b) =>
    a.takenAt.localeCompare(b.takenAt),
  );

  // MetricReadings: union, deduplicate by provider|metric|ts
  const metricKey = (r: MetricReading) => `${r.sourceProvider}|${r.metric}|${r.ts}`;
  const metricMap = new Map<string, MetricReading>();
  for (const r of [...cloud.metricReadings, ...local.metricReadings]) {
    metricMap.set(metricKey(r), r);
  }
  const metricReadings = Array.from(metricMap.values());

  // Integrations: union, LWW on connectedAt — EXCEPT native health providers,
  // whose "connected" state is device-specific OS authorization that doesn't
  // transfer across installs. Carrying the cloud's connectedAt made a fresh
  // reinstall show Apple Health as already connected while nothing was actually
  // authorized. For those, the local (this-device) state is authoritative.
  const NATIVE_PROVIDERS = new Set(['apple_health', 'health_connect']);
  const integrations: Record<string, IntegrationState> = {};
  for (const [id, cloudInt] of Object.entries(cloud.integrations)) {
    if (!NATIVE_PROVIDERS.has(id)) integrations[id] = cloudInt;
  }
  for (const [id, localInt] of Object.entries(local.integrations)) {
    if (NATIVE_PROVIDERS.has(id)) {
      integrations[id] = localInt; // device truth wins for native health
      continue;
    }
    const cloudInt = integrations[id];
    if (!cloudInt || (localInt.connectedAt ?? '') > (cloudInt.connectedAt ?? '')) {
      integrations[id] = localInt;
    }
  }

  // Profile: cloud is authoritative for auth-linked fields; local wins for
  // device-only prefs (notification times, field customizations when cloud is empty).
  const profile: LocalProfile = {
    ...cloud.profile,
    // Notification prefs are device-local — always keep local values
    notifyCheckinEnabled: local.profile.notifyCheckinEnabled,
    notifyCheckinTime: local.profile.notifyCheckinTime,
    notifyDosesEnabled: local.profile.notifyDosesEnabled,
    notifyDoseTime: local.profile.notifyDoseTime,
    notifyInventoryEnabled: local.profile.notifyInventoryEnabled,
    notifyPhotosEnabled: local.profile.notifyPhotosEnabled,
    inventoryNotifiedOn: local.profile.inventoryNotifiedOn,
    // Typical-day baselines (spec 15) ride the snapshot; prefer whichever side has
    // them so a normalized-reconstruction merge never wipes a local baseline.
    typicalBaselines: cloud.profile.typicalBaselines ?? local.profile.typicalBaselines,
    typicalPromptState: cloud.profile.typicalPromptState ?? local.profile.typicalPromptState,
    // Field customizations: prefer cloud when non-empty (it's synced); fall back to local
    addedFields: (cloud.profile.addedFields?.length
      ? cloud.profile.addedFields
      : local.profile.addedFields) ?? [],
    removedFields: (cloud.profile.removedFields?.length
      ? cloud.profile.removedFields
      : local.profile.removedFields) ?? [],
    // compoundSlugs: derive from merged protocol items (single source of truth)
    compoundSlugs: [
      ...new Set(protocolItems.map((p) => p.compoundSlug).filter((s): s is string => !!s)),
    ],
  };

  return {
    version: cloud.version ?? local.version,
    profile,
    entries,
    // Context notes (W3-10) are id-keyed rows; union by id, local wins on ties.
    contextNotes: mergeContextNotes(local.contextNotes ?? [], cloud.contextNotes ?? []),
    symptomEvents,
    protocolItems,
    doseEvents,
    inventory,
    photos,
    metricReadings,
    integrations,
    // Custom compounds ride the snapshot; preserve whichever side has them.
    customCompounds: cloud.customCompounds?.length ? cloud.customCompounds : local.customCompounds,
    // The quick-log queue is a device-local job list — never restored from cloud.
    quickLogJobs: local.quickLogJobs ?? [],
    // Pepi chat is a light, session-scoped thread — keep whichever side has it,
    // preferring local (the device the user is actively on).
    pepiMessages: local.pepiMessages?.length ? local.pepiMessages : (cloud.pepiMessages ?? []),
    strengthSessions,
    benchmarks,
  };
}

/** Union context notes by id; the local copy wins on id collisions. */
function mergeContextNotes(
  local: PersistedState['contextNotes'],
  cloud: PersistedState['contextNotes'],
): PersistedState['contextNotes'] {
  const byId = new Map(cloud.map((n) => [n.id, n]));
  for (const n of local) byId.set(n.id, n);
  return [...byId.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
