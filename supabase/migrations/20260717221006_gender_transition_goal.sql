-- W5-23 · Transition tracking v1 — extend the goal enum with an opt-in,
-- conditional (mtf/ftm only, never preselected) tracking goal.
-- Spec: beta-notes-2026-07-12.md §1.9.

alter type goal add value 'gender_transition';

comment on column public.user_profile.goals is
  'Goal chips the user selected (spec 02). gender_transition is sensitive: '
  'outing risk if this data leaks. It must NEVER be included in any '
  'community_aggregate cohort_key or goal-keyed aggregate materialization '
  'until per-cohort n meets the k-anonymity floor (spec 07). The V2 '
  'aggregation job must explicitly exclude it, not just inherit the default.';
