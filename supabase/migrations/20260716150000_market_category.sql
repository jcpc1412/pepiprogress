-- market_category: four-way AI-posture key on the catalog (spec 05/08, locked 2026-07-12).
-- Posture is keyed to this column and ENFORCED IN CODE at the AI service; the model
-- never infers a compound's category itself. The default is 'grey' (observational,
-- non-individualized): strict-for-lenient is safe, lenient-for-strict is not, so an
-- uncategorized row can never leak direct guidance.

create type public.market_category as enum ('inoffensive', 'otc', 'grey', 'controlled');

alter table public.compound
  add column market_category public.market_category not null default 'grey';

comment on column public.compound.market_category is
  'AI posture key (spec 05): inoffensive = direct personalized coaching; otc = direct but hedged with a mandatory doctor/pharmacist pointer; grey = observational, attributed, never individualized; controlled = track-only, no ranges. Enforced in code at the AI service.';

-- Backfill. The controlled boolean stays the hard gate; market_category = 'controlled'
-- is its four-way equivalent (spec 05 decision).
update public.compound set market_category = 'controlled' where controlled;

-- Creatine-tier consumables: direct coaching, no compound gate.
update public.compound set market_category = 'inoffensive' where slug = 'creatine';
