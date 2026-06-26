-- M1 · Schema part 3 — community aggregates + auto-provision profile on signup
-- Spec: docs/spec/07 (community), 08, 10 (auth)

-- ── community_aggregate (materialized from opted-in data; populated V2) ─────
create table public.community_aggregate (
  id            uuid primary key default gen_random_uuid(),
  compound_id   uuid references public.compound (id) on delete cascade,
  goal          goal,
  cohort_key    text,         -- includes co-administered stack (spec 07)
  metric        text,
  summary       jsonb,
  n             integer,
  confidence    numeric,
  refreshed_at  timestamptz not null default now()
);
comment on table public.community_aggregate is
  'k-anonymity-gated aggregates (min n, spec 07). Access depth (basic vs deep) '
  'is enforced app-side by contribution + plan (spec 07/12).';

alter table public.community_aggregate enable row level security;
create policy "community_aggregate: read for authenticated"
  on public.community_aggregate for select to authenticated using (true);
-- Writes only via service role (aggregate materialization job).

-- ── auto-create user_profile when an auth user is created ──────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profile (id, locale)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'locale', 'en'))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
