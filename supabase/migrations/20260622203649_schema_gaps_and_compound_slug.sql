-- M1 cloud sync — schema gap-fill + compound slug
-- Adds `slug` to compound (used by local→cloud migration to resolve local slugs to UUIDs).
-- Fills schema gaps found during M2 build: log_entry was missing surfaced check-in fields;
-- dose_event and inventory_item were missing fields the local store carries.

-- ── compound: add slug for local→cloud slug resolution ────────────────────
alter table public.compound add column slug text;
update public.compound set slug = lower(canonical_name);
alter table public.compound alter column slug set not null;
create unique index compound_slug_idx on public.compound (slug);

-- ── log_entry: add fields surfaced by the field-surfacing engine (spec 02) ─
-- The original schema only captured weight/sleep_quality/wellness/note.
-- The full set is driven by goals ∪ compound effect/monitoring tags.
alter table public.log_entry
  add column if not exists appetite       smallint check (appetite between 1 and 5),
  add column if not exists energy         smallint check (energy between 1 and 5),
  add column if not exists soreness       smallint check (soreness between 1 and 5),
  add column if not exists workout_effort smallint check (workout_effort between 1 and 5),
  add column if not exists libido         smallint check (libido between 1 and 5),
  add column if not exists skin_notes     text,
  add column if not exists measurements   text;

-- ── dose_event: add dose_unit + optional compound_id ──────────────────────
-- dose_unit was on local DoseEvent but missing from the table.
-- compound_id is nullable — only set for doses logged without a linked protocol_item.
alter table public.dose_event
  add column if not exists dose_unit   text,
  add column if not exists compound_id uuid references public.compound (id);

-- ── inventory_item: add label (for consumables / custom items) ─────────────
alter table public.inventory_item
  add column if not exists label text;
