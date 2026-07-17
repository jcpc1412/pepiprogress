import { compoundBySlug, marketCategoryOf } from '@/data/compound-catalog';

/**
 * Expectation timelines (spec positioning §3.2, W4-15). Per compound effect
 * class, the onset / build / peak / plateau phases that users COMMONLY REPORT by
 * week N, shown against the user's own week position. Turns the verdict from
 * "something changed" into "this is on schedule, or it is early yet."
 *
 * Sources ride the spec-05 sourcing ladder: this curated table is the
 * labeled-unverified stopgap (commonly reported, not cited); curated
 * `compound_fact` rows and community percentiles supersede it later.
 *
 * Posture (spec 05): controlled compounds are TRACK-ONLY, so no reference
 * timeline is pushed for them (resolveTimeline returns null). The user's own
 * progression still shows elsewhere; we simply never push commonly-reported
 * phase expectations for controlled compounds.
 *
 * Pure + deterministic. Weeks are 1-indexed to match cycleWeek elsewhere.
 */

export type TimelineGroup =
  | 'fat_loss'
  | 'healing'
  | 'skin'
  | 'gh_recovery'
  | 'sleep'
  | 'cognition';

export type TimelinePhase = {
  /** Stable key for the i18n label + description (expectation.phase.<group>.<key>). */
  key: string;
  /** 1-indexed inclusive start week. */
  startWeek: number;
  /** 1-indexed inclusive end week; omitted = open-ended (plateau / ongoing). */
  endWeek?: number;
};

/**
 * Curated commonly-reported phase tables. Deliberately coarse and hedged: these
 * are "what people report", not physiology claims. Phase copy lives in i18n.
 */
const TIMELINES: Record<TimelineGroup, TimelinePhase[]> = {
  fat_loss: [
    { key: 'onset', startWeek: 1, endWeek: 2 },
    { key: 'early_loss', startWeek: 2, endWeek: 8 },
    { key: 'continued', startWeek: 8, endWeek: 16 },
    { key: 'plateau', startWeek: 16 },
  ],
  healing: [
    { key: 'onset', startWeek: 1, endWeek: 2 },
    { key: 'peak', startWeek: 2, endWeek: 6 },
    { key: 'taper', startWeek: 6 },
  ],
  skin: [
    { key: 'settling', startWeek: 1, endWeek: 4 },
    { key: 'visible', startWeek: 4, endWeek: 8 },
    { key: 'maintained', startWeek: 8 },
  ],
  gh_recovery: [
    { key: 'sleep_recovery', startWeek: 1, endWeek: 2 },
    { key: 'water', startWeek: 1, endWeek: 4 },
    { key: 'body_comp', startWeek: 6, endWeek: 12 },
    { key: 'plateau', startWeek: 12 },
  ],
  sleep: [
    { key: 'onset', startWeek: 1, endWeek: 1 },
    { key: 'settled', startWeek: 1, endWeek: 4 },
  ],
  cognition: [
    { key: 'onset', startWeek: 1, endWeek: 2 },
    { key: 'settled', startWeek: 2, endWeek: 8 },
  ],
};

/**
 * Resolve a compound to its timeline group by effect tags (priority-ordered so
 * the most defining effect wins). Returns null when no curated timeline fits or
 * the compound is track-only (controlled); the card then stays hidden.
 */
export function resolveTimelineGroup(slug: string): TimelineGroup | null {
  const compound = compoundBySlug(slug);
  if (!compound) return null;
  if (marketCategoryOf(compound) === 'controlled') return null;

  const tags = new Set(compound.effectTags);
  // Priority order: the effect people track a protocol *for*.
  if (tags.has('fat_loss')) return 'fat_loss';
  if (tags.has('skin')) return 'skin';
  if (tags.has('healing') || tags.has('gut')) return 'healing';
  if (tags.has('muscle') || tags.has('recovery')) return 'gh_recovery';
  if (tags.has('sleep')) return 'sleep';
  if (tags.has('cognition')) return 'cognition';
  return null;
}

export type ResolvedTimeline = {
  group: TimelineGroup;
  phases: TimelinePhase[];
  /** Index into phases of the phase the user's week falls in, or -1 if before/after. */
  currentPhaseIndex: number;
};

/** True when `week` (1-indexed) falls inside a phase's [start, end] range. */
function phaseContains(phase: TimelinePhase, week: number): boolean {
  if (week < phase.startWeek) return false;
  if (phase.endWeek !== undefined && week > phase.endWeek) return false;
  return true;
}

/**
 * The timeline for a compound plus which phase the user is currently in.
 * `weeksIn` is 1-indexed (week 1 = first week on it). Returns null when there is
 * no curated timeline (unknown effect class or controlled/track-only).
 */
export function resolveTimeline(slug: string, weeksIn: number): ResolvedTimeline | null {
  const group = resolveTimelineGroup(slug);
  if (!group) return null;
  const phases = TIMELINES[group];

  // Last phase is open-ended; pick the phase containing the week, else the last
  // one the user has passed into (so late weeks land on the plateau phase).
  let currentPhaseIndex = phases.findIndex((p) => phaseContains(p, weeksIn));
  if (currentPhaseIndex === -1) {
    const passed = phases.filter((p) => weeksIn >= p.startWeek);
    currentPhaseIndex = passed.length ? phases.indexOf(passed[passed.length - 1]) : -1;
  }
  return { group, phases, currentPhaseIndex };
}
