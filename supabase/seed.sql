-- Starter compound catalog for local dev (runs on `supabase db reset`).
-- Tags drive log-field surfacing (spec 02). controlled=true => track-only, no AI dosing (spec 05/11).
-- Not exhaustive — a representative spread across types for testing.

insert into public.compound (canonical_name, aliases, type, controlled, effect_tags, monitoring_tags, common_uses) values
  ('BPC-157',        array['bpc','bpc157'],                'peptide',    false, array['healing','recovery','gut'],            array[]::text[],                              array['injury recovery','gut health']),
  ('TB-500',         array['tb500','thymosin beta-4'],     'peptide',    false, array['healing','recovery'],                  array[]::text[],                              array['soft-tissue recovery']),
  ('GHK-Cu',         array['ghk','copper peptide'],        'peptide',    false, array['skin','healing'],                      array[]::text[],                              array['skin','hair']),
  ('Ipamorelin',     array['ipa'],                          'peptide',    false, array['recovery','sleep','muscle'],           array[]::text[],                              array['gh secretagogue']),
  ('CJC-1295',       array['cjc','cjc1295'],               'peptide',    false, array['recovery','muscle'],                   array[]::text[],                              array['gh secretagogue']),
  ('Semaglutide',    array['sema','ozempic','wegovy'],     'glp1',       false, array['fat_loss'],                            array['appetite','nausea'],                   array['weight loss']),
  ('Tirzepatide',    array['tirz','mounjaro','zepbound'],  'glp1',       false, array['fat_loss'],                            array['appetite','nausea','glucose'],         array['weight loss']),
  ('Testosterone',   array['test','trt'],                  'hormone',    true,  array['muscle','libido','mood','recovery'],   array['hematocrit','estradiol','lipids'],     array['TRT','hormone optimization']),
  ('Anastrozole',    array['arimidex','ai','adex'],        'ancillary',  false, array['hormonal'],                            array['estradiol'],                           array['aromatase inhibitor']),
  ('Enclomiphene',   array['enclo'],                        'ancillary',  false, array['hormonal','libido'],                   array['testosterone_total','estradiol'],      array['HPTA support']),
  ('MK-677',         array['ibutamoren','mk677'],          'other',      false, array['muscle','sleep','appetite'],           array['glucose'],                             array['gh secretagogue']),
  ('Creatine',       array['creatine monohydrate'],        'supplement', false, array['muscle','cognition'],                  array[]::text[],                              array['strength','performance']);
