-- F6 · Normalized cloud mirror (owner decision 2026-07-21, MASTER-PLAN §F6)
--
-- The one-way mirror makes the normalized tables the community-aggregation
-- source of truth again. `migrateToCloud` ran exactly once at sign-up, so every
-- table but `user_profile` sat empty while all data flowed to the `user_state`
-- snapshot blob. This migration gives the mirror what it needs:
--   1. a stable `client_id` (the local store id) on each per-entity table so
--      writes are idempotent upserts + delete-by-id (never duplicating rows);
--   2. `updated_at` where missing (Option-B / conflict-resolution groundwork);
--   3. the schema gap-fill without which community aggregation over nutrition,
--      structured measurements, and dose schedules is impossible.
--
-- The mirror is one-way: the snapshot stays authoritative for restore/merge, so
-- there is no conflict resolution and tombstones (Option B) are out of scope.
-- Idempotency: unique (user_id, client_id) — existing null-client_id rows (if
-- any) are NULL-distinct and never collide with mirrored rows.

-- ── client_id + updated_at for idempotent upserts ──────────────────────────

-- protocol: one mirrored row per user, keyed by a fixed client_id ('local-default').
alter table public.protocol
  add column if not exists client_id  text,
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists protocol_user_client_idx
  on public.protocol (user_id, client_id);

alter table public.protocol_item
  add column if not exists client_id  text,
  add column if not exists updated_at timestamptz not null default now();
-- Items are scoped by their parent protocol, so uniqueness is per protocol.
create unique index if not exists protocol_item_protocol_client_idx
  on public.protocol_item (protocol_id, client_id);

alter table public.dose_event
  add column if not exists client_id  text,
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists dose_event_user_client_idx
  on public.dose_event (user_id, client_id);

alter table public.symptom_event
  add column if not exists client_id  text,
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists symptom_event_user_client_idx
  on public.symptom_event (user_id, client_id);

alter table public.inventory_item
  add column if not exists client_id  text,
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists inventory_item_user_client_idx
  on public.inventory_item (user_id, client_id);

-- ── schema gap-fill (community aggregation inputs) ─────────────────────────

-- log_entry: nutrition + structured circumference measurements. The free-text
-- `measurements` column stays; these add the machine-readable values the
-- verdict engine and community insights actually aggregate over.
alter table public.log_entry
  add column if not exists protein                 numeric,
  add column if not exists calories                numeric,
  add column if not exists waist                   numeric,
  add column if not exists hips                    numeric,
  add column if not exists neck                    numeric,
  add column if not exists chest                   numeric,
  add column if not exists arms                    numeric,
  add column if not exists thighs                  numeric,
  add column if not exists extra_measurement_key   text,
  add column if not exists extra_measurement_value numeric;

-- dose_event: schedule-slot bookkeeping so aggregation can tell scheduled doses
-- from deliberate extras (P-04).
alter table public.dose_event
  add column if not exists slot_key date,
  add column if not exists extra    boolean;

-- inventory_item: initial amount powers the depletion bar + burn-rate insights.
alter table public.inventory_item
  add column if not exists amount_initial numeric;

-- protocol_item: explicit schedule + concentration so a mirrored protocol
-- reconstructs the real dosing cadence (not just the legacy frequency kind).
alter table public.protocol_item
  add column if not exists dose_days       smallint[],
  add column if not exists started_at      date,
  add column if not exists schedule_anchor date,
  add column if not exists concentration   numeric;
