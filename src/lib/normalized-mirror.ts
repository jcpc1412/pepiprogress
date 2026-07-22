import type { PersistedState } from '@/lib/store';

/**
 * F6 · Normalized cloud mirror — pure diff core (MASTER-PLAN §F6).
 *
 * Turns the local state into the exact row payloads the normalized tables want,
 * and diffs them against the hashes of what was last mirrored so only changed
 * rows are written and vanished rows are deleted. Pure and deterministic: no
 * Supabase, no network, no clock. The impure writer (`mirrorEntities` in sync.ts)
 * fetches the slug map, injects `user_id`/`protocol_id`, and runs the upserts +
 * deletes; the `NormalizedMirror` component drives it on a debounce.
 *
 * The mirror is one-way (snapshot stays authoritative), so there is no conflict
 * resolution: a changed row is a plain upsert, a removed row is a hard delete by
 * `client_id`. Idempotency comes from the local store id being carried as
 * `client_id` (or the day's date, for the one-per-day `log_entry`).
 */

/** Compound slug → catalog UUID, as read from the `compound` table. */
export type SlugMap = Map<string, string>;

/** One row to mirror. `key` is the delete key (client_id, or date for log_entry);
 *  `hash` is over `payload`; `payload` holds the column values the writer sends
 *  (minus the parent keys `user_id`/`protocol_id`, which the writer injects). */
export type MirrorRow = { key: string; hash: string; payload: Record<string, unknown> };

/** The full set of rows to mirror for one push, grouped by target table. */
export type MirrorBuild = {
  /** user_profile columns (writer injects `id`). Always present. */
  profile: Record<string, unknown>;
  logEntries: MirrorRow[];
  protocolItems: MirrorRow[];
  doseEvents: MirrorRow[];
  symptomEvents: MirrorRow[];
  inventoryItems: MirrorRow[];
  /** False when the slug map was empty, so no protocol_item could resolve its
   *  (NOT NULL) compound_id. The writer must then skip protocol_item deletes,
   *  or every item would look removed and be wiped. */
  compoundsResolvable: boolean;
};

/** Stable, order-independent hash of a payload (djb2 over sorted-key JSON).
 *  Collisions only cost a redundant upsert, never data loss, so a short hash is
 *  fine. */
export function stableHash(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload, Object.keys(payload).sort());
  let h = 5381;
  for (let i = 0; i < json.length; i++) h = (h * 33) ^ json.charCodeAt(i);
  return (h >>> 0).toString(16);
}

function row(key: string, payload: Record<string, unknown>): MirrorRow {
  return { key, hash: stableHash(payload), payload };
}

/** Builds every mirror row from local state. `locale` is passed in (the writer
 *  reads it from i18next) so this stays pure. */
export function buildMirrorRows(
  state: PersistedState,
  slugMap: SlugMap,
  locale: string,
): MirrorBuild {
  const { profile } = state;

  const profilePayload: Record<string, unknown> = {
    units: profile.units,
    goals: profile.goals,
    locale,
    date_of_birth: profile.dobISO ? profile.dobISO.slice(0, 10) : null,
    photo_storage_consent: profile.consentPhotoStorage ?? false,
    photo_ai_opt_in: profile.consentPhotoAI ?? false,
    community_opt_in: profile.consentCommunity ?? false,
  };

  // ── log_entry (one per day; natural key = date) ──────────────────────────
  const logEntries = Object.values(state.entries).map((e) =>
    row(e.date, {
      date: e.date,
      weight: e.weight ?? null,
      sleep_quality: e.sleep_quality ?? null,
      wellness: e.wellness ?? null,
      appetite: e.appetite ?? null,
      energy: e.energy ?? null,
      soreness: e.soreness ?? null,
      workout_effort: e.workout_effort ?? null,
      libido: e.libido ?? null,
      protein: e.protein ?? null,
      calories: e.calories ?? null,
      skin_notes: e.skin_notes ?? null,
      measurements: e.measurements ?? null,
      waist: e.waist ?? null,
      hips: e.hips ?? null,
      neck: e.neck ?? null,
      chest: e.chest ?? null,
      arms: e.arms ?? null,
      thighs: e.thighs ?? null,
      extra_measurement_key: e.extraMeasurementKey ?? null,
      extra_measurement_value: e.extraMeasurementValue ?? null,
      note: e.note ?? null,
      updated_at: e.updatedAt,
    }),
  );

  // ── protocol_item (compound_id NOT NULL → skip unresolvable slugs) ────────
  const protocolItems: MirrorRow[] = [];
  for (const p of state.protocolItems) {
    const compoundId = slugMap.get(p.compoundSlug);
    if (!compoundId) continue; // unknown compound: can't satisfy NOT NULL
    protocolItems.push(
      row(p.id, {
        client_id: p.id,
        compound_id: compoundId,
        dose: p.dose ?? null,
        dose_unit: p.doseUnit ?? null,
        route: p.route ?? null,
        frequency: p.frequency ? { kind: p.frequency } : null,
        dose_days: p.doseDays ?? null,
        started_at: p.startedAt ?? null,
        schedule_anchor: p.scheduleAnchor ?? null,
        concentration: p.concentration ?? null,
        updated_at: p.updatedAt ?? null,
      }),
    );
  }

  // Local protocol-item id → slug, so a dose logged against an item resolves its
  // compound even when the dose itself carries no slug.
  const itemSlug = new Map(state.protocolItems.map((p) => [p.id, p.compoundSlug]));

  // ── dose_event ───────────────────────────────────────────────────────────
  const doseEvents = state.doseEvents.map((d) => {
    const slug = d.compoundSlug ?? (d.protocolItemId ? itemSlug.get(d.protocolItemId) : undefined);
    const compoundId = slug ? (slugMap.get(slug) ?? null) : null;
    return row(d.id, {
      client_id: d.id,
      taken_at: d.takenAt,
      dose: d.dose ?? null,
      dose_unit: d.doseUnit ?? null,
      site: d.site ?? null,
      slot_key: d.slotKey ?? null,
      extra: d.extra ?? null,
      compound_id: compoundId,
      updated_at: d.updatedAt ?? d.takenAt,
    });
  });

  // ── symptom_event ────────────────────────────────────────────────────────
  const symptomEvents = state.symptomEvents.map((s) =>
    row(s.id, {
      client_id: s.id,
      type: s.type,
      onset_at: s.onsetAt,
      duration: s.durationMinutes ? `${s.durationMinutes} minutes` : null,
      severity: s.severity ?? null,
      note: s.note ?? null,
      updated_at: s.updatedAt ?? s.onsetAt,
    }),
  );

  // ── inventory_item ───────────────────────────────────────────────────────
  const inventoryItems = state.inventory.map((i) =>
    row(i.id, {
      client_id: i.id,
      kind: i.kind,
      compound_id: i.compoundSlug ? (slugMap.get(i.compoundSlug) ?? null) : null,
      label: i.label ?? null,
      concentration: i.concentration ?? null,
      amount_remaining: i.amountRemaining ?? null,
      amount_initial: i.amountInitial ?? null,
      unit: i.unit ?? null,
      low_threshold: i.lowThreshold ?? null,
      expiry: i.expiry ?? null,
      vendor: i.vendor ?? null,
      updated_at: i.updatedAt ?? null,
    }),
  );

  return {
    profile: profilePayload,
    logEntries,
    protocolItems,
    doseEvents,
    symptomEvents,
    inventoryItems,
    compoundsResolvable: slugMap.size > 0,
  };
}

/** The result of diffing one entity's current rows against prior hashes. */
export type EntityDiff = {
  /** Rows whose hash changed (or are new): upsert these. */
  upserts: MirrorRow[];
  /** Delete keys present last time but gone now. */
  deleteKeys: string[];
  /** The entity's current key → hash slice (namespaced), for the next round. */
  next: Record<string, string>;
};

/**
 * Diffs one entity's rows against the flat prior-hash map. `entity` namespaces
 * the keys (`entity:key`) so one shared map holds every table. Rows with an
 * unchanged hash are skipped; keys that were mirrored before and are absent now
 * are returned for deletion.
 */
export function diffEntity(
  entity: string,
  rows: MirrorRow[],
  prevHashes: Record<string, string>,
): EntityDiff {
  const prefix = `${entity}:`;
  const currentKeys = new Set(rows.map((r) => r.key));

  const upserts = rows.filter((r) => prevHashes[`${prefix}${r.key}`] !== r.hash);

  const deleteKeys: string[] = [];
  for (const namespaced of Object.keys(prevHashes)) {
    if (!namespaced.startsWith(prefix)) continue;
    const key = namespaced.slice(prefix.length);
    if (!currentKeys.has(key)) deleteKeys.push(key);
  }

  const next: Record<string, string> = {};
  for (const r of rows) next[`${prefix}${r.key}`] = r.hash;

  return { upserts, deleteKeys, next };
}

/** Carries a skipped entity's prior hashes forward unchanged, so skipping (e.g.
 *  protocol_item when the slug map was empty) never looks like a deletion next
 *  round. */
export function carryEntity(
  entity: string,
  prevHashes: Record<string, string>,
): Record<string, string> {
  const prefix = `${entity}:`;
  const carried: Record<string, string> = {};
  for (const [k, v] of Object.entries(prevHashes)) {
    if (k.startsWith(prefix)) carried[k] = v;
  }
  return carried;
}
