/**
 * Menstrual-cycle resolution — the single definition of "where in the cycle is
 * this user today" (MASTER-PLAN cycle track, piece A).
 *
 * Why this module exists: the phase test was written three times with three
 * different rules (the photo path used `day >= length - 14`, the encouragement
 * path a near-copy, and the verdict engine `day >= length / 2`). They agree only
 * at a 28-day cycle and diverge everywhere else — at 35 days they sit 3.5 days
 * apart, so the charts and the photos could attribute the same day differently.
 * Every consumer now resolves through `resolveCycle`.
 *
 * The physiology behind the rule: the LUTEAL phase is roughly fixed at ~14 days
 * regardless of total cycle length; it is the follicular phase that varies. So
 * luteal is counted BACK from the next expected period, never as a fraction of
 * the cycle. That makes the old `length / 2` test wrong for anyone who is not
 * exactly 28 days.
 *
 * Everything here is pure and unit-tested. Sensitive by design: menstrual data
 * stays local — it is never mirrored to the normalized tables and never reaches
 * community aggregation.
 */

export type CyclePhase = 'menstrual' | 'follicular' | 'luteal';

/** Where the day-in-cycle came from. Surfaced so the UI can say "from Health". */
export type CycleSource = 'synced' | 'manual';

export type CycleState = {
  /** 1-based day of the current cycle (day 1 = first day of the last period). */
  dayInCycle: number;
  phase: CyclePhase;
  /** The cycle length used — observed when we have enough history, else the
   *  user's stated value, else the default. */
  cycleLength: number;
  /** Whether `cycleLength` was measured from real period starts or assumed. */
  lengthObserved: boolean;
  source: CycleSource;
  /** ISO date (YYYY-MM-DD) of the period start this is counted from. */
  startedOn: string;
};

/** Luteal phase length in days — near-constant across cycle lengths. */
export const LUTEAL_DAYS = 14;
/** Days of bleeding treated as the menstrual phase. */
export const MENSTRUAL_DAYS = 5;
/** Fallback when nothing better is known. */
export const DEFAULT_CYCLE_LENGTH = 28;
/** Physiologically plausible bounds; anything outside is noise, not a cycle. */
export const MIN_CYCLE_LENGTH = 21;
export const MAX_CYCLE_LENGTH = 40;
/** A gap this long between flow days starts a NEW period rather than continuing
 *  the current one (spotting and skipped logging leave one- and two-day holes). */
const FLOW_GAP_DAYS = 3;
/** Cycle-to-cycle gaps beyond this are a missed log, not a real cycle, and must
 *  not drag the median. */
const MAX_PLAUSIBLE_GAP = 60;
/** Gaps needed before an observed length beats the user's stated one. */
const MIN_GAPS_FOR_OBSERVED = 2;

const DAY_MS = 86400000;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toUtcDay(key: string): number {
  return new Date(`${key}T00:00:00.000Z`).getTime();
}

/** Whole days from `a` to `b`, both YYYY-MM-DD. Negative when b precedes a. */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcDay(b) - toUtcDay(a)) / DAY_MS);
}

/** A menstrual-flow reading: one day on which flow was recorded. */
export type FlowReading = { ts: string };

/**
 * Collapse flow days into period START dates, oldest first.
 *
 * A period is a run of flow days; a gap of {@link FLOW_GAP_DAYS} or more opens a
 * new one. Bridging small gaps matters — a user who skips logging on day 3 must
 * not be recorded as having had two periods that month, which would halve their
 * observed cycle length.
 */
export function derivePeriodStarts(flow: FlowReading[]): string[] {
  const days = Array.from(new Set(flow.map((f) => f.ts.slice(0, 10)))).sort();
  const starts: string[] = [];
  let prev: string | undefined;
  for (const day of days) {
    if (prev === undefined || daysBetween(prev, day) >= FLOW_GAP_DAYS) starts.push(day);
    prev = day;
  }
  return starts;
}

/**
 * Median gap between consecutive period starts, or null when there is not enough
 * history. Median rather than mean so one missed month cannot skew the estimate.
 */
export function observedCycleLength(starts: string[]): number | null {
  const gaps: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    const gap = daysBetween(starts[i - 1], starts[i]);
    // Out-of-range gaps are missed logs, not cycles. Dropping them is safer than
    // averaging them in, which would silently inflate everyone's cycle length.
    if (gap >= MIN_CYCLE_LENGTH && gap <= MAX_PLAUSIBLE_GAP) gaps.push(gap);
  }
  if (gaps.length < MIN_GAPS_FOR_OBSERVED) return null;
  const sorted = [...gaps].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return clampLength(Math.round(median));
}

export function clampLength(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_CYCLE_LENGTH;
  return Math.min(MAX_CYCLE_LENGTH, Math.max(MIN_CYCLE_LENGTH, Math.round(n)));
}

/** Phase for a 1-based day in a cycle of the given length. */
export function phaseForDay(dayInCycle: number, cycleLength: number): CyclePhase {
  if (dayInCycle <= MENSTRUAL_DAYS) return 'menstrual';
  // Counted back from the NEXT period, not as a fraction of the cycle.
  return dayInCycle > cycleLength - LUTEAL_DAYS ? 'luteal' : 'follicular';
}

/**
 * Resolve today's cycle state.
 *
 * Precedence (owner decision): a MANUAL date wins while it is still the newest
 * information about the current cycle, so a deliberate correction ("Health says
 * the 1st, it was actually the 3rd") is always respected. Once Health observes a
 * start that begins a LATER cycle, sync takes over. Expressed in the data's own
 * terms rather than an arbitrary "edited in the last N days" window, so it
 * self-heals: a manual date can go stale for at most one cycle, never forever.
 *
 * Returns null when there is nothing to say — no tracking configured, or no
 * usable start date. Callers must treat null as "no cycle context", never as a
 * default phase.
 */
export function resolveCycle(opts: {
  /** User-entered first day of their last period (YYYY-MM-DD). */
  manualStart?: string;
  /** User-stated cycle length. */
  statedLength?: number;
  /** Menstrual-flow readings synced from Health. */
  flow?: FlowReading[];
  /** Today, as YYYY-MM-DD local. */
  today: string;
}): CycleState | null {
  const starts = derivePeriodStarts(opts.flow ?? []).filter((s) => s <= opts.today);
  const syncedStart = starts.length > 0 ? starts[starts.length - 1] : undefined;
  const observed = observedCycleLength(starts);

  const manualStart =
    opts.manualStart && opts.manualStart <= opts.today ? opts.manualStart : undefined;

  // Length: measured beats stated beats default, independently of which start
  // date wins — an observed length is good information even when the user has
  // just hand-corrected the current start date.
  const stated = opts.statedLength ? clampLength(opts.statedLength) : undefined;
  const cycleLength = observed ?? stated ?? DEFAULT_CYCLE_LENGTH;

  let startedOn: string | undefined;
  let source: CycleSource = 'manual';
  if (manualStart && syncedStart) {
    // The synced start only supersedes the manual one when it opens a later
    // cycle. Within the same cycle the user's correction stands.
    const newerCycle = daysBetween(manualStart, syncedStart) >= MIN_CYCLE_LENGTH;
    startedOn = newerCycle ? syncedStart : manualStart;
    source = newerCycle ? 'synced' : 'manual';
  } else if (syncedStart) {
    startedOn = syncedStart;
    source = 'synced';
  } else if (manualStart) {
    startedOn = manualStart;
    source = 'manual';
  }

  if (!startedOn) return null;

  const elapsed = daysBetween(startedOn, opts.today);
  if (elapsed < 0) return null;
  // Roll forward through whole cycles. A stale start date still yields a usable
  // phase estimate; it just accumulates error, which is exactly what the synced
  // path exists to prevent.
  const dayInCycle = (elapsed % cycleLength) + 1;

  return {
    dayInCycle,
    phase: phaseForDay(dayInCycle, cycleLength),
    cycleLength,
    lengthObserved: observed !== null,
    source,
    startedOn,
  };
}

/** An inclusive date range (YYYY-MM-DD) during which the user was in the luteal
 *  phase — the window where water retention shows up on the scale. */
export type CycleWindow = { start: string; end: string };

/**
 * The luteal windows overlapping a date range, for shading behind a chart.
 *
 * This is the point of the whole cycle feature made visible: a weight chart that
 * does not mark these windows invites the user to read a predictable water swing
 * as lost progress, which is exactly the misreading the attribution register was
 * built to prevent.
 *
 * Walks backward and forward from the known start rather than only forward, so a
 * chart window that begins before the recorded period start still gets shaded.
 * Returns [] when the cycle is not resolvable — never a guessed window.
 */
export function lutealWindows(opts: {
  manualStart?: string;
  statedLength?: number;
  flow?: FlowReading[];
  /** Inclusive chart bounds, YYYY-MM-DD. */
  from: string;
  to: string;
}): CycleWindow[] {
  // Resolve as of the LATEST date we know about, not the chart's end: a chart
  // showing only last winter must still shade using a start date recorded since,
  // and resolveCycle deliberately ignores start dates in its own future.
  const latestKnown = [opts.to, opts.manualStart ?? '', ...(opts.flow ?? []).map((f) => f.ts.slice(0, 10))]
    .filter(Boolean)
    .sort()
    .pop() as string;
  const state = resolveCycle({
    manualStart: opts.manualStart,
    statedLength: opts.statedLength,
    flow: opts.flow,
    today: latestKnown,
  });
  if (!state) return [];

  const { cycleLength } = state;
  const len = Math.max(MIN_CYCLE_LENGTH, cycleLength);
  const addDays = (key: string, n: number) => new Date(toUtcDay(key) + n * DAY_MS).toISOString().slice(0, 10);

  // Step the anchor back to at or before `from`, then walk forward cycle by
  // cycle. `anchor` is always day 1 of some cycle.
  let anchor = state.startedOn;
  while (daysBetween(opts.from, anchor) > 0) anchor = addDays(anchor, -len);

  const out: CycleWindow[] = [];
  // Luteal runs from day (len - LUTEAL_DAYS + 1) to day len, i.e. the last
  // LUTEAL_DAYS days before the next period.
  for (let a = anchor; daysBetween(a, opts.to) >= 0; a = addDays(a, len)) {
    const start = addDays(a, len - LUTEAL_DAYS);
    const end = addDays(a, len - 1);
    if (end < opts.from) continue; // entirely before the range
    if (start > opts.to) break; // entirely after the range
    // Clip to the chart bounds. All keys are YYYY-MM-DD, so string order is date
    // order and comparing directly is both correct and readable.
    out.push({
      start: start < opts.from ? opts.from : start,
      end: end > opts.to ? opts.to : end,
    });
  }
  return out;
}

/** Bookkeeping for the one-time Pepi setup prompt, mirroring the typical-day
 *  pattern: once declined, never asked again. */
export type CyclePromptState = 'asked' | 'declined' | 'active';

/** What Pepi should do about cycle setup, or null for "say nothing". */
export type CyclePromptKind = 'confirm' | 'ask';

/** Goals where an unattributed luteal water swing actually costs the user
 *  something — the weight readings they are judging progress by. */
const CYCLE_RELEVANT_GOALS = ['weight_loss', 'body_comp'];

/**
 * Whether Pepi should raise cycle setup, and in which form.
 *
 * `confirm` when Health already has flow data: there is nothing to type, only a
 * yes/no. `ask` when it must be entered by hand. Null whenever the question is
 * already answered, was declined, or was never relevant — the prompt is one-time
 * and must never nag.
 *
 * Deliberately gated on sex === 'female': the existing verdict-engine gate uses
 * the same test, and guessing at this from any other signal would be both wrong
 * and intrusive.
 */
export function cyclePromptEligible(opts: {
  sex?: string;
  promptState?: CyclePromptState;
  /** User opted into cycle tracking (e.g. at onboarding) but gave no date. */
  tracking?: boolean;
  hasManualStart: boolean;
  hasSyncedFlow: boolean;
  goals: string[];
}): CyclePromptKind | null {
  if (opts.sex !== 'female') return null;
  if (opts.promptState === 'declined' || opts.promptState === 'active') return null;
  // Already answered: synced data needs no confirmation once tracking is on, and
  // a manual date means the user has already told us.
  if (opts.hasManualStart) return null;
  if (opts.hasSyncedFlow) return opts.tracking ? null : 'confirm';
  // Nothing synced: only worth typing a date for if they opted in, or if their
  // goals mean an unexplained water swing would be misread as regression.
  if (opts.tracking) return 'ask';
  if (opts.promptState === 'asked') return null;
  return opts.goals.some((g) => CYCLE_RELEVANT_GOALS.includes(g)) ? 'ask' : null;
}

/** Today's key in local time, matching the check-in date convention. */
export function todayKey(now: Date = new Date()): string {
  return dayKey(new Date(now.getTime() - now.getTimezoneOffset() * 60000));
}
