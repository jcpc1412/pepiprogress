import i18next from 'i18next';

import type {
  CheckinEntry,
  DoseEvent,
  InventoryItem,
  LocalProfile,
  PersistedState,
  PhotoEntry,
  ProtocolItem,
  SymptomEvent,
} from '@/lib/store';
import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database';

export type SyncResult = { ok: boolean; errors: string[] };

/** Alias so callers don't need to import the internal PersistedState version field. */
export type SyncableState = PersistedState;

async function fetchSlugMap(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('compound').select('id, slug');
  if (error || !data) return new Map();
  return new Map(
    data
      .filter((r): r is { id: string; slug: string } => typeof r.slug === 'string')
      .map((r) => [r.slug, r.id]),
  );
}

/**
 * One-time upload of all local data to Supabase. Called immediately after sign-up.
 * All inserts are best-effort: partial failures are collected in `errors` but do not
 * abort the rest of the migration.
 */
export async function migrateToCloud(
  state: PersistedState,
  userId: string,
): Promise<SyncResult> {
  const errors: string[] = [];

  // 1 — user_profile
  const { error: profileErr } = await supabase.from('user_profile').upsert({
    id: userId,
    units: state.profile.units,
    goals: state.profile.goals,
    locale: i18next.language ?? 'en',
    date_of_birth: state.profile.dobISO ? state.profile.dobISO.slice(0, 10) : null,
    photo_storage_consent: state.profile.consentPhotoStorage ?? false,
    photo_ai_opt_in: state.profile.consentPhotoAI ?? false,
    community_opt_in: state.profile.consentCommunity ?? false,
  });
  if (profileErr) errors.push(`profile: ${profileErr.message}`);

  const slugMap = await fetchSlugMap();

  // 2 — log_entry (daily check-ins)
  const logRows = Object.values(state.entries).map((e) => ({
    user_id: userId,
    date: e.date,
    weight: e.weight ?? null,
    sleep_quality: e.sleep_quality ?? null,
    wellness: e.wellness ?? null,
    appetite: e.appetite ?? null,
    energy: e.energy ?? null,
    soreness: e.soreness ?? null,
    workout_effort: e.workout_effort ?? null,
    libido: e.libido ?? null,
    skin_notes: e.skin_notes ?? null,
    measurements: e.measurements ?? null,
    note: e.note ?? null,
    updated_at: e.updatedAt,
  }));
  if (logRows.length) {
    const { error } = await supabase
      .from('log_entry')
      .upsert(logRows, { onConflict: 'user_id,date' });
    if (error) errors.push(`log_entries: ${error.message}`);
  }

  // 3 — symptom_event
  const symptomRows = state.symptomEvents.map((s) => ({
    user_id: userId,
    type: s.type,
    onset_at: s.onsetAt,
    duration: s.durationMinutes ? `${s.durationMinutes} minutes` : null,
    severity: s.severity ?? null,
    note: s.note ?? null,
  }));
  if (symptomRows.length) {
    const { error } = await supabase.from('symptom_event').insert(symptomRows);
    if (error) errors.push(`symptom_events: ${error.message}`);
  }

  // 4 — protocol + items (group all local items under one "Default Protocol" row)
  const itemsWithCompound = state.protocolItems.filter((p) => slugMap.has(p.compoundSlug));
  if (itemsWithCompound.length) {
    const { data: proto, error: protoErr } = await supabase
      .from('protocol')
      .insert({ user_id: userId, status: 'active', notes: 'Migrated from local' })
      .select('id')
      .single();
    if (protoErr || !proto) {
      errors.push(`protocol: ${protoErr?.message ?? 'no id returned'}`);
    } else {
      const itemRows = itemsWithCompound.map((p) => ({
        protocol_id: proto.id,
        compound_id: slugMap.get(p.compoundSlug)!,
        dose: p.dose ?? null,
        dose_unit: p.doseUnit ?? null,
        route: p.route ?? null,
        frequency: p.frequency ? { kind: p.frequency } : null,
      }));
      const { error } = await supabase.from('protocol_item').insert(itemRows);
      if (error) errors.push(`protocol_items: ${error.message}`);
    }
  }

  // 5 — dose_event
  const doseRows = state.doseEvents.map((d) => ({
    user_id: userId,
    taken_at: d.takenAt,
    dose: d.dose ?? null,
    dose_unit: d.doseUnit ?? null,
    site: d.site ?? null,
    compound_id: d.compoundSlug ? (slugMap.get(d.compoundSlug) ?? null) : null,
  }));
  if (doseRows.length) {
    const { error } = await supabase.from('dose_event').insert(doseRows);
    if (error) errors.push(`dose_events: ${error.message}`);
  }

  // 6 — inventory_item
  const inventoryRows = state.inventory.map((i) => ({
    user_id: userId,
    kind: i.kind,
    compound_id: i.compoundSlug ? (slugMap.get(i.compoundSlug) ?? null) : null,
    label: i.label ?? null,
    concentration: i.concentration ?? null,
    amount_remaining: i.amountRemaining ?? null,
    unit: i.unit ?? null,
    low_threshold: i.lowThreshold ?? null,
    expiry: i.expiry ?? null,
    vendor: i.vendor ?? null,
  }));
  if (inventoryRows.length) {
    const { error } = await supabase.from('inventory_item').insert(inventoryRows);
    if (error) errors.push(`inventory: ${error.message}`);
  }

  // 7 — photo metadata (local URI as placeholder until bucket upload lands)
  const photoRows = state.photos.map((p) => ({
    user_id: userId,
    session_type: p.session,
    captured_at: p.takenAt,
    // Prefer the uploaded bucket path so the row points at the real Storage
    // object; fall back to the local uri only if the upload hasn't run yet.
    storage_path: p.cloudPath ?? p.uri,
    capture_meta: { view: p.view ?? 'front', tilt: p.tilt ?? null, luma: p.luma ?? null, distance_proxy: p.boxRatio ?? null },
    ai_meta:
      p.driftScore !== undefined
        ? { drift_score: p.driftScore, comparable: p.comparable ?? false }
        : null,
    storage_consent: state.profile.consentPhotoStorage ?? false,
    ai_consent: state.profile.consentPhotoAI ?? false,
  }));
  if (photoRows.length) {
    const { error } = await supabase.from('photo').insert(photoRows);
    if (error) errors.push(`photos: ${error.message}`);
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Continuous-backup push: mirror the full local state into `user_state` as a
 * single JSON blob, upserted by user. Idempotent (one row per user), so it can
 * run on every debounced local change while signed in. This is the interim
 * continuous-sync mechanism; the normalized per-entity engine with field-level
 * conflict resolution is Polish-tier (spec 10). The normalized tables are still
 * populated on sign-up via {@link migrateToCloud} for community aggregates.
 */
export async function pushSnapshot(state: PersistedState, userId: string): Promise<SyncResult> {
  const { error } = await supabase.from('user_state').upsert(
    { user_id: userId, state: state as unknown as Json, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  return error ? { ok: false, errors: [error.message] } : { ok: true, errors: [] };
}

/**
 * Restore the latest snapshot blob for a user. Preferred over {@link pullFromCloud}
 * on sign-in because it round-trips the exact local state (including fields not
 * yet mapped into the normalized schema). Returns null when no snapshot exists.
 */
export async function pullSnapshot(userId: string): Promise<PersistedState | null> {
  const { data, error } = await supabase
    .from('user_state')
    .select('state')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data?.state) return null;
  return data.state as unknown as PersistedState;
}

/**
 * Fetch all cloud data for a signed-in user and return it as local state.
 * Called on sign-in so the device is hydrated from the authoritative cloud copy.
 */
export async function pullFromCloud(userId: string): Promise<PersistedState | null> {
  // Reverse map: compound UUID → slug (for converting cloud ids back to local slugs)
  const { data: compounds } = await supabase.from('compound').select('id, slug');
  const idToSlug = new Map<string, string>(
    (compounds ?? [])
      .filter((c): c is { id: string; slug: string } => typeof c.slug === 'string')
      .map((c) => [c.id, c.slug]),
  );

  const [profileRes, logsRes, symptomsRes, protocolsRes, dosesRes, inventoryRes, photosRes] =
    await Promise.all([
      supabase.from('user_profile').select('*').eq('id', userId).single(),
      supabase.from('log_entry').select('*').eq('user_id', userId),
      supabase.from('symptom_event').select('*').eq('user_id', userId),
      supabase
        .from('protocol')
        .select('id, protocol_item(id, compound_id, dose, dose_unit, route, frequency)')
        .eq('user_id', userId),
      supabase
        .from('dose_event')
        .select('id, taken_at, dose, dose_unit, site, compound_id, protocol_item_id')
        .eq('user_id', userId),
      supabase
        .from('inventory_item')
        .select('id, kind, compound_id, label, concentration, amount_remaining, unit, low_threshold, expiry, vendor')
        .eq('user_id', userId),
      supabase
        .from('photo')
        .select('id, session_type, captured_at, storage_path, capture_meta, ai_meta')
        .eq('user_id', userId),
    ]);

  if (profileRes.error || !profileRes.data) return null;
  const p = profileRes.data;

  // Rebuild entries dict
  const entries: Record<string, CheckinEntry> = {};
  for (const row of logsRes.data ?? []) {
    entries[row.date] = {
      date: row.date,
      weight: row.weight ?? undefined,
      sleep_quality: row.sleep_quality ?? undefined,
      wellness: row.wellness ?? undefined,
      appetite: (row as Record<string, unknown>).appetite as number | undefined,
      energy: (row as Record<string, unknown>).energy as number | undefined,
      soreness: (row as Record<string, unknown>).soreness as number | undefined,
      workout_effort: (row as Record<string, unknown>).workout_effort as number | undefined,
      libido: (row as Record<string, unknown>).libido as number | undefined,
      skin_notes: (row as Record<string, unknown>).skin_notes as string | undefined,
      measurements: (row as Record<string, unknown>).measurements as string | undefined,
      note: row.note ?? undefined,
      updatedAt: row.updated_at,
    };
  }

  const symptomEvents: SymptomEvent[] = (symptomsRes.data ?? []).map((s) => ({
    id: s.id,
    type: s.type,
    onsetAt: s.onset_at,
    severity: s.severity ?? undefined,
    note: s.note ?? undefined,
  }));

  const protocolItems: ProtocolItem[] = [];
  type ProtoItemRow = {
    id: string;
    compound_id: string;
    dose: number | null;
    dose_unit: string | null;
    route: string | null;
    frequency: { kind: string } | null;
  };
  type ProtoRow = { id: string; protocol_item: ProtoItemRow[] };
  for (const proto of (protocolsRes.data ?? []) as unknown as ProtoRow[]) {
    for (const item of proto.protocol_item ?? []) {
      const slug = idToSlug.get(item.compound_id) ?? item.compound_id;
      protocolItems.push({
        id: item.id,
        compoundSlug: slug,
        dose: item.dose ?? undefined,
        doseUnit: item.dose_unit ?? undefined,
        route: (item.route as ProtocolItem['route']) ?? undefined,
        frequency: (item.frequency?.kind as ProtocolItem['frequency']) ?? undefined,
      });
    }
  }

  const doseEvents: DoseEvent[] = (dosesRes.data ?? []).map((d) => ({
    id: d.id,
    takenAt: d.taken_at,
    dose: d.dose ?? undefined,
    doseUnit: (d as Record<string, unknown>).dose_unit as string | undefined,
    site: d.site ?? undefined,
    compoundSlug: d.compound_id ? (idToSlug.get(d.compound_id) ?? undefined) : undefined,
    protocolItemId: d.protocol_item_id ?? undefined,
  }));

  const inventory: InventoryItem[] = (inventoryRes.data ?? []).map((i) => ({
    id: i.id,
    kind: i.kind,
    compoundSlug: i.compound_id ? (idToSlug.get(i.compound_id) ?? undefined) : undefined,
    label: (i as Record<string, unknown>).label as string | undefined,
    concentration: i.concentration ?? undefined,
    amountRemaining: i.amount_remaining ?? undefined,
    unit: i.unit ?? undefined,
    lowThreshold: i.low_threshold ?? undefined,
    expiry: i.expiry ?? undefined,
    vendor: i.vendor ?? undefined,
  }));

  const photos: PhotoEntry[] = (photosRes.data ?? []).map((ph) => {
    const meta = ph.capture_meta as Record<string, unknown> | null;
    const aiMeta = ph.ai_meta as Record<string, unknown> | null;
    return {
      id: ph.id,
      session: ph.session_type as 'face' | 'body',
      uri: ph.storage_path,
      takenAt: ph.captured_at,
      tilt: meta?.tilt as number | undefined,
      luma: meta?.luma as number | undefined,
      boxRatio: meta?.distance_proxy as number | undefined,
      driftScore: aiMeta?.drift_score as number | undefined,
      comparable: aiMeta?.comparable as boolean | undefined,
    };
  });

  const compoundSlugs = [...new Set(protocolItems.map((pi) => pi.compoundSlug).filter(Boolean))];

  const profile: LocalProfile = {
    units: p.units,
    goals: (p.goals ?? []) as LocalProfile['goals'],
    compoundSlugs,
    onboardingComplete: true,
    addedFields: [],
    removedFields: [],
    dobISO: p.date_of_birth ? `${p.date_of_birth}T00:00:00.000Z` : undefined,
    isAgeVerified: !!p.date_of_birth,
    consentPhotoStorage: p.photo_storage_consent,
    consentPhotoAI: p.photo_ai_opt_in,
    consentCommunity: p.community_opt_in,
  };

  // metricReadings/integrations aren't in the normalized tables — they ride the
  // user_state snapshot (pullSnapshot is preferred on sign-in). Default empty here.
  return {
    version: 1,
    profile,
    entries,
    symptomEvents,
    protocolItems,
    doseEvents,
    inventory,
    photos,
    metricReadings: [],
    integrations: {},
    customCompounds: [],
    quickLogJobs: [],
    pepiMessages: [],
  };
}

// mergeStates lives in a pure module so it can be unit-tested without the RN/Supabase client.
export { mergeStates } from '@/lib/merge-states';
