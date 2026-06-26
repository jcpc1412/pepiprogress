-- ── user_state snapshot ──────────────────────────────────────────────────────
-- Continuous-backup substrate for the local-first store. Holds the full
-- PersistedState JSON blob, upserted by user on every (debounced) local change
-- while signed in. This is the interim continuous-sync mechanism; the normalized
-- per-entity sync engine with field-level conflict resolution remains Polish-tier
-- (spec 10). The normalized tables (log_entry, dose_event, ...) are still
-- populated on sign-up via migrateToCloud for community aggregates (spec 07).
create table public.user_state (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  state       jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.user_state enable row level security;

create policy "user_state: owner" on public.user_state
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
