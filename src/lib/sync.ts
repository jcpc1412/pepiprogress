import i18next from 'i18next';

import { isEffectivelyEmpty } from '@/lib/merge-states';
import {
  buildMirrorRows,
  carryEntity,
  diffEntity,
  type MirrorRow,
} from '@/lib/normalized-mirror';
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
import type { Json, TablesInsert } from '@/types/database';

export type SyncResult = { ok: boolean; errors: string[] };

/** Alias so callers don't need to import the internal PersistedState version field. */
export type SyncableState = PersistedState;

/** Flat map of `entity:key` → content hash, tracking what the normalized mirror
 *  last wrote so the next push only touches changed rows. Held in memory by
 *  {@link NormalizedMirror} for the session; a fresh session re-mirrors the
 *  whole backlog (idempotent). */
export type MirrorHashes = Record<string, string>;
export type MirrorRunResult = { errors: string[]; nextHashes: MirrorHashes };

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
 * F6 one-way normalized mirror (MASTER-PLAN §F6). Best-effort, idempotent upserts
 * of the community-aggregation entities (profile + check-ins, doses, symptoms,
 * protocol + items, inventory) into the normalized tables, keyed by the local
 * store id (`client_id`) so re-runs never duplicate. Local removals hard-delete
 * by key. `prevHashes` skips unchanged rows; pass `{}` for a full backlog pass
 * (sign-up, or a fresh session). The snapshot blob stays the source of truth for
 * restore/merge, so this never flows back down and needs no conflict resolution.
 *
 * Metric readings, Pepi chat, the ledger, strength/benchmarks, context notes, and
 * the quick-log queue stay snapshot-only (owner decision). Photos have their own
 * per-entity path (`PhotoSync` → `photo` row), so they aren't mirrored here.
 */
export async function mirrorEntities(
  state: PersistedState,
  userId: string,
  prevHashes: MirrorHashes,
): Promise<MirrorRunResult> {
  // Guard (2026-07-24 incident): a state this empty arriving while this
  // session was already tracking real mirrored rows (prevHashes non-empty)
  // would otherwise diff away every one of those rows as "deleted". Skip the
  // whole run and carry the prior hashes forward untouched instead — this is
  // almost certainly a client-side race, not an intentional mass-delete, and
  // the next real edit re-triggers a normal mirror pass.
  if (isEffectivelyEmpty(state) && Object.keys(prevHashes).length > 0) {
    return {
      errors: ['mirror skipped: local state is empty but cloud has tracked data — refusing to delete'],
      nextHashes: prevHashes,
    };
  }

  const errors: string[] = [];
  const slugMap = await fetchSlugMap();
  const build = buildMirrorRows(state, slugMap, i18next.language ?? 'en');
  const next: MirrorHashes = {};

  // Injects the parent key onto each payload and casts to the table's Insert
  // type — the payloads are built with the exact snake_case columns, so the cast
  // is safe (payloads are dynamic Records the generated types can't infer).
  const withUser = <T>(rows: MirrorRow[]) =>
    rows.map((r) => ({ user_id: userId, ...r.payload })) as T[];

  // ── user_profile — always upserted (keeps goals/consent fresh for aggregation) ─
  {
    const { error } = await supabase
      .from('user_profile')
      .upsert({ id: userId, ...build.profile } as TablesInsert<'user_profile'>);
    if (error) errors.push(`profile: ${error.message}`);
  }

  // ── log_entry (natural key user_id,date) ─────────────────────────────────
  {
    const diff = diffEntity('log_entry', build.logEntries, prevHashes);
    let failed = false;
    if (diff.upserts.length) {
      const { error } = await supabase
        .from('log_entry')
        .upsert(withUser<TablesInsert<'log_entry'>>(diff.upserts), { onConflict: 'user_id,date' });
      if (error) {
        errors.push(`log_entry: ${error.message}`);
        failed = true;
      }
    }
    if (!failed && diff.deleteKeys.length) {
      const { error } = await supabase
        .from('log_entry')
        .delete()
        .eq('user_id', userId)
        .in('date', diff.deleteKeys);
      if (error) errors.push(`log_entry delete: ${error.message}`);
    }
    Object.assign(next, failed ? carryEntity('log_entry', prevHashes) : diff.next);
  }

  // ── protocol + protocol_item ─────────────────────────────────────────────
  // Items live under one mirrored protocol per user (client_id 'local-default').
  // Resolve/create it only when there is something to mirror or clean up, and
  // skip entirely when compounds couldn't resolve (else every item looks gone).
  {
    const hadItems = Object.keys(prevHashes).some((k) => k.startsWith('protocol_item:'));
    const shouldRun = build.compoundsResolvable && (build.protocolItems.length > 0 || hadItems);
    if (!shouldRun) {
      Object.assign(next, carryEntity('protocol_item', prevHashes));
    } else {
      const { data: proto, error: protoErr } = await supabase
        .from('protocol')
        .upsert(
          {
            user_id: userId,
            client_id: 'local-default',
            status: 'active',
            notes: 'Local mirror',
            updated_at: new Date().toISOString(),
          } as TablesInsert<'protocol'>,
          { onConflict: 'user_id,client_id' },
        )
        .select('id')
        .single();
      if (protoErr || !proto) {
        errors.push(`protocol: ${protoErr?.message ?? 'no id returned'}`);
        Object.assign(next, carryEntity('protocol_item', prevHashes));
      } else {
        const protocolId = proto.id;
        const diff = diffEntity('protocol_item', build.protocolItems, prevHashes);
        let failed = false;
        if (diff.upserts.length) {
          const rows = diff.upserts.map(
            (r) => ({ protocol_id: protocolId, ...r.payload }) as TablesInsert<'protocol_item'>,
          );
          const { error } = await supabase
            .from('protocol_item')
            .upsert(rows, { onConflict: 'protocol_id,client_id' });
          if (error) {
            errors.push(`protocol_item: ${error.message}`);
            failed = true;
          }
        }
        if (!failed && diff.deleteKeys.length) {
          const { error } = await supabase
            .from('protocol_item')
            .delete()
            .eq('protocol_id', protocolId)
            .in('client_id', diff.deleteKeys);
          if (error) errors.push(`protocol_item delete: ${error.message}`);
        }
        Object.assign(next, failed ? carryEntity('protocol_item', prevHashes) : diff.next);
      }
    }
  }

  // ── dose_event / symptom_event / inventory_item (key user_id,client_id) ───
  const byClientId: {
    entity: 'dose_event' | 'symptom_event' | 'inventory_item';
    rows: MirrorRow[];
  }[] = [
    { entity: 'dose_event', rows: build.doseEvents },
    { entity: 'symptom_event', rows: build.symptomEvents },
    { entity: 'inventory_item', rows: build.inventoryItems },
  ];
  for (const { entity, rows } of byClientId) {
    const diff = diffEntity(entity, rows, prevHashes);
    let failed = false;
    if (diff.upserts.length) {
      const { error } = await supabase
        // Table name is a checked literal union member; payloads are pre-shaped.
        .from(entity)
        .upsert(withUser<never>(diff.upserts), { onConflict: 'user_id,client_id' });
      if (error) {
        errors.push(`${entity}: ${error.message}`);
        failed = true;
      }
    }
    if (!failed && diff.deleteKeys.length) {
      const { error } = await supabase
        .from(entity)
        .delete()
        .eq('user_id', userId)
        .in('client_id', diff.deleteKeys);
      if (error) errors.push(`${entity} delete: ${error.message}`);
    }
    Object.assign(next, failed ? carryEntity(entity, prevHashes) : diff.next);
  }

  return { errors, nextHashes: next };
}

/**
 * Full backlog upload of local data to the normalized tables. Called after
 * sign-up (and social first-sign-in). Delegates to the idempotent
 * {@link mirrorEntities} with no prior hashes, so it is safe to re-run and shares
 * one code path with the continuous mirror.
 */
export async function migrateToCloud(
  state: PersistedState,
  userId: string,
): Promise<SyncResult> {
  const { errors } = await mirrorEntities(state, userId, {});
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
  // Guard (2026-07-24 incident): refuse to replace an existing non-empty
  // snapshot with an empty one. A brand new account correctly has nothing to
  // protect (no existing row, or an existing-but-already-empty one), so this
  // never blocks first sign-up — it only stops a race (store not yet
  // hydrated, a bad merge) from silently erasing real cloud backup.
  if (isEffectivelyEmpty(state)) {
    const existing = await pullSnapshot(userId);
    if (existing && !isEffectivelyEmpty(existing)) {
      return {
        ok: false,
        errors: ['snapshot skipped: local state is empty but cloud snapshot has data — refusing to overwrite'],
      };
    }
  }
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
    // Context notes ride the user_state snapshot only (not normalized tables).
    contextNotes: [],
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
    // Strength/benchmarks ride the user_state snapshot only (not normalized tables).
    strengthSessions: [],
    benchmarks: [],
  };
}

// mergeStates lives in a pure module so it can be unit-tested without the RN/Supabase client.
export { mergeStates } from '@/lib/merge-states';
