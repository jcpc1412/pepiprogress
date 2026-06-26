-- M1 · Schema part 1 — enums + global reference catalog
-- Spec: docs/spec/08-data-model.md (compound, compound_fact), 05, 07, 11
-- Catalog tables are GLOBAL + read-only to clients (writes only via service role / migrations).

create extension if not exists pgcrypto;

-- ── Catalog enums ──────────────────────────────────────────────────────────
create type compound_type as enum ('peptide', 'glp1', 'hormone', 'ancillary', 'supplement', 'other');
create type compound_fact_type as enum ('dose_range', 'length', 'synergy', 'side_effect');
create type fact_source as enum ('internet', 'community');

-- ── compound (global catalog) ──────────────────────────────────────────────
create table public.compound (
  id              uuid primary key default gen_random_uuid(),
  canonical_name  text not null,
  aliases         text[] not null default '{}',
  common_uses     text[] not null default '{}',
  cautions        text[] not null default '{}',
  type            compound_type not null,
  -- controlled=true (hormone/anabolic) => track-only, no AI dosing (spec 05/08/11).
  controlled      boolean not null default false,
  -- effect/monitoring tags drive which log fields surface (spec 02). No personas.
  effect_tags     text[] not null default '{}',
  monitoring_tags text[] not null default '{}',
  created_at      timestamptz not null default now()
);
comment on table public.compound is
  'Global compound catalog. controlled=true => track-only, no AI dosing (spec 05/08/11). '
  'effect/monitoring tags drive log-field surfacing (spec 02).';

create index compound_type_idx on public.compound (type);
create index compound_effect_tags_idx on public.compound using gin (effect_tags);
create index compound_monitoring_tags_idx on public.compound using gin (monitoring_tags);

-- ── compound_fact (provenance-bearing) ─────────────────────────────────────
create table public.compound_fact (
  id           uuid primary key default gen_random_uuid(),
  compound_id  uuid not null references public.compound (id) on delete cascade,
  type         compound_fact_type not null,
  value        jsonb not null,
  source       fact_source not null,
  citation     text,
  n            integer,
  confidence   numeric,
  updated_at   timestamptz not null default now()
);
comment on table public.compound_fact is
  'Provenance-bearing facts (every value carries source + confidence). '
  'Not generated for controlled compounds — track-only (spec 05).';

create index compound_fact_compound_idx on public.compound_fact (compound_id);

-- ── RLS: catalog is world-readable to authenticated users; no client writes ─
alter table public.compound enable row level security;
alter table public.compound_fact enable row level security;

create policy "compound: read for authenticated"
  on public.compound for select to authenticated using (true);

create policy "compound_fact: read for authenticated"
  on public.compound_fact for select to authenticated using (true);
-- No insert/update/delete policies => only service_role (migrations/seed) can write.
