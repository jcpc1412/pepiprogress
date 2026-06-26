import { compoundBySlug } from '@/data/compound-catalog';
import type { Enums } from '@/types/database';

export type Goal = Enums<'goal'>;

/**
 * Canonical check-in fields that can surface in the daily log.
 * Photo capture (face/body) is M4 (camera) — surfaced as a flag here, captured later.
 */
export type CheckinField =
  | 'weight'
  | 'sleep_quality'
  | 'wellness'
  | 'appetite'
  | 'energy'
  | 'soreness'
  | 'workout_effort'
  | 'libido'
  | 'protein'
  | 'calories'
  | 'skin_notes'
  | 'measurements'
  | 'face_photo'
  | 'body_photo'
  | 'note';

/** Deterministic display order, independent of how fields were unioned in. */
const FIELD_ORDER: CheckinField[] = [
  'weight',
  'sleep_quality',
  'wellness',
  'energy',
  'appetite',
  'soreness',
  'workout_effort',
  'libido',
  'protein',
  'calories',
  'skin_notes',
  'measurements',
  'face_photo',
  'body_photo',
  'note',
];

/** Goal → fields (spec 02 "Goal → log-field mapping" table). */
const GOAL_FIELDS: Record<Goal, CheckinField[]> = {
  weight_loss: ['weight', 'appetite', 'calories'],
  skin: ['face_photo', 'skin_notes'],
  body_comp: ['body_photo', 'weight', 'measurements', 'protein', 'calories'],
  sleep: ['sleep_quality'],
  recovery: ['soreness', 'energy', 'workout_effort'],
  wellness: ['wellness', 'energy'],
};

/** Compound effect-tag → fields (the outcomes a compound should move, spec 02). */
const EFFECT_TAG_FIELDS: Record<string, CheckinField[]> = {
  fat_loss: ['weight', 'appetite', 'calories'],
  muscle: ['workout_effort', 'weight', 'protein', 'calories'],
  recovery: ['soreness', 'energy'],
  healing: ['soreness'],
  skin: ['skin_notes', 'face_photo'],
  sleep: ['sleep_quality'],
  cognition: ['energy'],
  libido: ['libido'],
  appetite: ['appetite'],
  mood: ['wellness'],
};

/** Compound monitoring-tag → fields (what to watch). Bloodwork markers are handled
 * separately as a watch list (see {@link monitoringMarkersFor}); only tags that map
 * to a daily-log field appear here. */
const MONITORING_TAG_FIELDS: Record<string, CheckinField[]> = {
  appetite: ['appetite'],
  nausea: ['wellness'],
};

/** Monitoring tags that are bloodwork markers rather than daily-log fields. */
export type BloodworkMarker =
  | 'hematocrit'
  | 'estradiol'
  | 'lipids'
  | 'glucose'
  | 'testosterone_total';

const BLOODWORK_MARKERS = new Set<string>([
  'hematocrit',
  'estradiol',
  'lipids',
  'glucose',
  'testosterone_total',
]);

/** Minimal default when the user declares no goals and no compounds (spec 02). */
const MINIMAL_DEFAULT: CheckinField[] = ['weight', 'wellness', 'body_photo'];

/** A free note + symptom events are always available, every goal (spec 02/03). */
const ALWAYS: CheckinField[] = ['note'];

export type SurfacedFields = {
  fields: CheckinField[];
  /** Bloodwork markers to prompt for (TRT/anabolics etc., spec 02/06). */
  bloodworkMarkers: BloodworkMarker[];
};

/**
 * Sporadic ("as needed") compound handling (spec 02/03): a slug listed in
 * `sporadicSlugs` only contributes its tags on days it was actually used —
 * i.e. when it's also in `activeSporadicSlugs` (a dose logged within the surfacing
 * window). This stops infrequent peptides (e.g. MOTS-c) from cluttering the log
 * on days they weren't taken.
 */
export type SurfaceOptions = {
  sporadicSlugs?: string[];
  activeSporadicSlugs?: string[];
};

/**
 * The full set of fields/metrics surfaced in the daily check-in:
 *   goals (explicit) ∪ compound effect-tags ∪ compound monitoring-tags
 * (spec 02, locked). Deterministic and data-driven — no personas.
 */
export function surfaceFields(
  goals: Goal[],
  compoundSlugs: string[],
  options: SurfaceOptions = {},
): SurfacedFields {
  const fields = new Set<CheckinField>(ALWAYS);
  const markers = new Set<string>();
  const sporadic = new Set(options.sporadicSlugs ?? []);
  const activeSporadic = new Set(options.activeSporadicSlugs ?? []);

  for (const goal of goals) {
    for (const f of GOAL_FIELDS[goal] ?? []) fields.add(f);
  }

  for (const slug of compoundSlugs) {
    // Sporadic compound not used recently → don't surface its fields today.
    if (sporadic.has(slug) && !activeSporadic.has(slug)) continue;
    const compound = compoundBySlug(slug);
    if (!compound) continue;
    for (const tag of compound.effectTags) {
      for (const f of EFFECT_TAG_FIELDS[tag] ?? []) fields.add(f);
    }
    for (const tag of compound.monitoringTags) {
      for (const f of MONITORING_TAG_FIELDS[tag] ?? []) fields.add(f);
      if (BLOODWORK_MARKERS.has(tag)) markers.add(tag);
    }
  }

  // No goals and no recognized compound signal → minimal default so they still start.
  if (goals.length === 0 && markers.size === 0 && fields.size === ALWAYS.length) {
    for (const f of MINIMAL_DEFAULT) fields.add(f);
  }

  return {
    fields: FIELD_ORDER.filter((f) => fields.has(f)),
    bloodworkMarkers: [...markers].sort() as BloodworkMarker[],
  };
}

/** Fields a user can manually toggle in "customize what I log" (spec 02).
 * Excludes photos (M4 capture) and the always-on note. */
export type CustomizableField = Exclude<CheckinField, 'face_photo' | 'body_photo' | 'note'>;

export const CUSTOMIZABLE_FIELDS: CustomizableField[] = [
  'weight',
  'sleep_quality',
  'wellness',
  'appetite',
  'energy',
  'soreness',
  'workout_effort',
  'libido',
  'protein',
  'calories',
  'skin_notes',
  'measurements',
];

/** Apply manual add/remove overrides to a surfaced field set (spec 02 — power
 * users must not feel boxed in). `note` always stays. */
export function applyFieldCustomization(
  base: CheckinField[],
  added: CheckinField[],
  removed: CheckinField[],
): CheckinField[] {
  const set = new Set<CheckinField>(base);
  for (const f of added) set.add(f);
  for (const f of removed) set.delete(f);
  set.add('note');
  return FIELD_ORDER.filter((f) => set.has(f));
}
