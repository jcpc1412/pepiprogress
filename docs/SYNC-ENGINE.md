# Normalized per-entity sync engine (scoped plan)

> Status: **scoped, not started.** Extends spec [10 platform-architecture](spec/10-platform-architecture.md)
> and [08 data-model](spec/08-data-model.md). The cloud-save loop already works via the `user_state`
> snapshot (see below); this plan is only needed when a *consumer* of the normalized tables goes live
> (community aggregation, the web dashboard, or field-level cross-device merge). Do not build ahead of that.

## 1. Why / current state

Cloud save + restore is **already functional** through a single-row-per-user JSON snapshot:

- `CloudSync` (mounted at root) debounce-writes the whole local state to `user_state` on every change while
  signed in, and flushes on background (`pushSnapshot`).
- On auth, `afterAuth` pulls the snapshot (`pullSnapshot`, falling back to `pullFromCloud`) and
  `mergeStates` unions it with local; a brand-new account seeds the cloud with `migrateToCloud` +
  `pushSnapshot`.

What the snapshot does **not** give:

1. **Relational rows** the normalized tables need. `migrateToCloud` writes them **once, at sign-up**;
   nothing writes them afterward (except `photo`, wired at upload). So `dose_event` / `log_entry` /
   `symptom_event` / `protocol*` / `inventory_item` / `metric_reading` are empty for anyone who logged
   *after* creating their account.
2. **Field-level conflict resolution.** The snapshot is whole-state last-write-wins (with a union merge on
   sign-in). Fine for one person / one active device; not for concurrent multi-device offline edits.

Consumers that force this work: **community aggregation** (needs anonymized rows, not per-user blobs),
the **web analytics dashboard** (relational queries over history), and true multi-device merge.

## 2. Design

Keep the snapshot as the durable backup; add an **outbox-based** normalized mirror alongside it, so the two
are complementary (snapshot = fast restore, normalized = queryable truth). No screen changes: the store
interface is unchanged; sync is a side-effect layer, exactly like `CloudSync` today.

### 2.1 Stable ids (prerequisite, do first)
- `uid()` currently returns `1abc-xyz` (not a uuid); the normalized tables key on `uuid`. Switch new-entity
  id generation to `crypto.randomUUID()` (or `expo-crypto`) so local id == DB id and upserts are idempotent.
- Migrate existing local ids lazily (map on first sync) or accept that pre-switch rows re-key once. Add a
  `schemaVersion` bump in `PersistedState` and a one-time local migration.

### 2.2 Outbox
- New `outbox: OutboxOp[]` in `PersistedState`: `{ id, entity, op: 'upsert'|'delete', pk, payload, updatedAt }`.
- The store repository appends an op on every mutation (add/update/delete of checkin, dose, symptom,
  protocol item, inventory, photo, metric reading, profile). One tiny helper wraps each existing setter.
- A `SyncEngine` component (sibling to `CloudSync`) drains the outbox while signed in: batch by entity,
  `upsert(..., { onConflict: pk })` / `delete().eq(...)`, mark ops acked, drop them. Retries with backoff;
  survives restart because the outbox is persisted.

### 2.3 Pull / merge
- Keep `pullFromCloud` as the relational reconstruction path (already exists) for cross-device restore when
  no snapshot, and as the eventual primary once the snapshot is retired.
- Field-level merge: LWW per column using `updatedAt` (already on most entities; add to any lacking it).
  `mergeStates` stays the in-memory reconcile; the outbox handles push.

### 2.4 Mapping table (local entity → DB table → pk)
| Local | Table | Conflict key |
|---|---|---|
| `CheckinEntry` | `log_entry` | `user_id,date` |
| `DoseEvent` | `dose_event` | `id` |
| `SymptomEvent` | `symptom_event` | `id` |
| `ProtocolItem` | `protocol_item` | `id` |
| `InventoryItem` | `inventory_item` | `id` |
| `PhotoEntry` | `photo` | `id` (uuid) + `storage_path` |
| `MetricReading` | `metric_reading` | `sourceProvider,metric,ts` |
| `LocalProfile` | `user_profile` | `id` |

## 3. Sequencing
| Step | Scope | Gate |
|---|---|---|
| S0 | uuid ids + `schemaVersion` local migration | tsc/lint, existing data intact |
| S1 | outbox model + append hooks in the store repo (pure, unit-tested) | outbox tests green |
| S2 | `SyncEngine` drain loop (batch upsert/delete, retry, ack) | rows appear per entity on device |
| S3 | field-level LWW merge on pull; retire snapshot as primary (keep as backup) | cross-device merge correct |
| S4 | wire community aggregation contribution off the normalized rows (spec 07) | k-anonymity floor holds |

## 4. Out of scope / decisions
- **Snapshot stays** as the belt-and-suspenders backup even after S3; cheap and it de-risks restore.
- No realtime/subscriptions for beta (poll on foreground + push on change, like today).
- Photo **image bytes** stay in Storage (hardening tracked separately in spec 04/11); this plan syncs photo
  **metadata rows** only.
- Trigger `handle_new_user` creates `user_profile` on signup; the engine must tolerate its absence (backfill
  exists) and never assume a profile row before its own upsert.
