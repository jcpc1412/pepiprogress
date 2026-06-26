-- M1 · Schema part 2 — user-scoped tables + RLS (owner-only)
-- Spec: docs/spec/08-data-model.md, 02 (goals/consent), 03 (logging/inventory),
--       04 (photo), 06 (metrics/integrations), 11 (consent/age).
-- Every user-scoped table is isolated by RLS to auth.uid(). Server uses real auth
-- users; anonymous local-first data (spec 10) lives on-device until sign-up.

-- ── Enums ──────────────────────────────────────────────────────────────────
create type units_system as enum ('metric', 'imperial');
create type goal as enum ('weight_loss', 'skin', 'body_comp', 'sleep', 'recovery', 'wellness');
create type protocol_status as enum ('active', 'paused', 'ended');
create type dose_route as enum ('subq', 'im', 'oral', 'nasal', 'topical', 'other');
create type inventory_kind as enum ('vial', 'consumable');
create type photo_session as enum ('face', 'body');
create type lab_source as enum ('manual', 'ai_parsed');
create type integration_status as enum ('pending', 'connected', 'disconnected', 'error');

-- ── updated_at trigger helper ──────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── user_profile (1:1 with auth.users) ─────────────────────────────────────
create table public.user_profile (
  id                     uuid primary key references auth.users (id) on delete cascade,
  locale                 text not null default 'en',
  units                  units_system not null default 'metric',
  goals                  goal[] not null default '{}',
  date_of_birth          date,                       -- age gate (spec 11)
  community_opt_in       boolean not null default false,
  photo_storage_consent  boolean not null default false,
  photo_ai_opt_in        boolean not null default false,
  created_at             timestamptz not null default now()
);

-- ── protocol + items ───────────────────────────────────────────────────────
create table public.protocol (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  status      protocol_status not null default 'active',
  started_at  date,
  ended_at    date,
  notes       text,
  created_at  timestamptz not null default now()
);
create index protocol_user_idx on public.protocol (user_id);

create table public.protocol_item (
  id           uuid primary key default gen_random_uuid(),
  protocol_id  uuid not null references public.protocol (id) on delete cascade,
  compound_id  uuid not null references public.compound (id),
  dose         numeric,
  dose_unit    text,
  ester        text,
  route        dose_route,
  frequency    jsonb,        -- { kind: 'daily' | 'eod' | 'custom', ... }
  created_at   timestamptz not null default now()
);
create index protocol_item_protocol_idx on public.protocol_item (protocol_id);

-- ── inventory + dose events ────────────────────────────────────────────────
create table public.inventory_item (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  kind              inventory_kind not null,
  compound_id       uuid references public.compound (id),
  concentration     numeric,
  amount_remaining  numeric,
  unit              text,
  low_threshold     numeric,
  expiry            date,
  vendor            text,     -- PRIVATE; never surfaced on shared protocols (spec 14)
  created_at        timestamptz not null default now()
);
create index inventory_item_user_idx on public.inventory_item (user_id);

create table public.dose_event (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  protocol_item_id  uuid references public.protocol_item (id) on delete set null,
  taken_at          timestamptz not null default now(),
  dose              numeric,
  site              text,     -- injection-site rotation
  created_at        timestamptz not null default now()
);
create index dose_event_user_idx on public.dose_event (user_id, taken_at desc);

-- ── logging: rolling daily check-in + discrete symptom events ──────────────
create table public.log_entry (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  date           date not null,
  weight         numeric,
  sleep_quality  smallint check (sleep_quality between 1 and 5),
  wellness       smallint check (wellness between 1 and 5),
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, date)      -- one rolling check-in per day (spec 03)
);
create trigger log_entry_set_updated_at
  before update on public.log_entry
  for each row execute function public.set_updated_at();

create table public.symptom_event (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  type        text not null,
  onset_at    timestamptz not null,
  duration    interval,
  severity    smallint check (severity between 1 and 5),
  note        text,
  created_at  timestamptz not null default now()
);
create index symptom_event_user_idx on public.symptom_event (user_id, onset_at desc);

-- ── photos (private by default; hardened bucket handled separately) ────────
create table public.photo (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  session_type     photo_session not null,
  captured_at      timestamptz not null,
  storage_path     text not null,
  capture_meta     jsonb,      -- { luma, tilt, distance_proxy }
  ai_meta          jsonb,      -- { drift_score, change_score, normalized_path } (null until analyzed)
  storage_consent  boolean not null default false,
  ai_consent       boolean not null default false,
  created_at       timestamptz not null default now()
);
create index photo_user_idx on public.photo (user_id, captured_at desc);

-- ── canonical metric readings (spec 06) ────────────────────────────────────
create table public.metric_reading (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  metric           text not null,        -- e.g. body.weight, sleep.duration
  value            numeric,
  unit             text,
  ts               timestamptz not null,
  source_provider  text,
  confidence       numeric,
  raw_ref          jsonb
);
create index metric_reading_user_metric_ts_idx on public.metric_reading (user_id, metric, ts desc);

-- ── labs (spec 06) ─────────────────────────────────────────────────────────
create table public.lab_result (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  drawn_at    date not null,
  source      lab_source not null,
  source_ref  text,
  created_at  timestamptz not null default now()
);
create index lab_result_user_idx on public.lab_result (user_id, drawn_at desc);

create table public.lab_biomarker (
  id             uuid primary key default gen_random_uuid(),
  lab_result_id  uuid not null references public.lab_result (id) on delete cascade,
  marker         text not null,           -- e.g. labs.testosterone_total
  value          numeric,
  unit           text,
  ref_range      text
);
create index lab_biomarker_result_idx on public.lab_biomarker (lab_result_id);

-- ── integrations (spec 06) ─────────────────────────────────────────────────
create table public.integration_connection (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  provider         text not null,
  status           integration_status not null default 'pending',
  scopes           text[] not null default '{}',
  last_sync_at     timestamptz,
  credentials_ref  text,        -- pointer to vault; never raw secrets
  created_at       timestamptz not null default now()
);
create index integration_connection_user_idx on public.integration_connection (user_id);

-- ── RLS: owner-only on every user-scoped table ─────────────────────────────
alter table public.user_profile          enable row level security;
alter table public.protocol              enable row level security;
alter table public.protocol_item         enable row level security;
alter table public.inventory_item        enable row level security;
alter table public.dose_event            enable row level security;
alter table public.log_entry             enable row level security;
alter table public.symptom_event         enable row level security;
alter table public.photo                 enable row level security;
alter table public.metric_reading        enable row level security;
alter table public.lab_result            enable row level security;
alter table public.lab_biomarker         enable row level security;
alter table public.integration_connection enable row level security;

-- user_profile keyed on id = auth.uid()
create policy "user_profile: owner" on public.user_profile
  for all to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- direct user_id ownership
create policy "protocol: owner" on public.protocol
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "inventory_item: owner" on public.inventory_item
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "dose_event: owner" on public.dose_event
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "log_entry: owner" on public.log_entry
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "symptom_event: owner" on public.symptom_event
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "photo: owner" on public.photo
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "metric_reading: owner" on public.metric_reading
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "lab_result: owner" on public.lab_result
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "integration_connection: owner" on public.integration_connection
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- child tables: ownership via parent
create policy "protocol_item: via protocol" on public.protocol_item
  for all to authenticated
  using (exists (select 1 from public.protocol p where p.id = protocol_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.protocol p where p.id = protocol_id and p.user_id = auth.uid()));

create policy "lab_biomarker: via lab_result" on public.lab_biomarker
  for all to authenticated
  using (exists (select 1 from public.lab_result r where r.id = lab_result_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.lab_result r where r.id = lab_result_id and r.user_id = auth.uid()));
