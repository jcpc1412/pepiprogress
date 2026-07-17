import { shiftDateKey } from '@/lib/dates';

/**
 * Adaptive coaching level (beta-notes §3.6, W3-8). How much Pepi weighs in:
 *
 * - `observe`: data in, hedged reads out, no unsolicited suggestions.
 * - `nudge`: anomaly openers, lifestyle coaching when earned, gentle framing.
 * - `coach`: proactive weekly focus, targets, habit follow-ups.
 *
 * The default is INFERRED from commitment signals, never asked on day one, and
 * the inference is invisible (the user only ever sees behavior labels: just log
 * / nudge me / coach me). Asymmetry rule (owner-decided): Pepi may silently
 * land on the QUIETER side; `coach` is never inferred, only chosen by the user
 * or accepted from an explicit offer. A user-set level always wins.
 *
 * Pure + deterministic; UI passes store slices in.
 */

export type CoachingLevel = 'observe' | 'nudge' | 'coach';

export type CommitmentSignals = {
  /** Date keys (YYYY-MM-DD) that have a check-in entry. */
  entryDates: string[];
  /** Date keys of days where a tape measurement (waist/hips/neck) was logged. */
  measurementDates: string[];
  /** Number of active protocol items. */
  protocolItemCount: number;
  todayKey: string;
};

/** Look-back windows for the commitment score. */
const CONSISTENCY_WINDOW_DAYS = 14;
const MEASUREMENT_WINDOW_DAYS = 28;

/** Thresholds for the "meticulous logger" read (observe). */
const OBSERVE_MIN_CONSISTENCY = 0.75; // >= ~11 of the last 14 days logged
const OBSERVE_MIN_MEASUREMENT_DAYS = 4; // tape discipline over the last 28 days

function daysInWindow(dates: string[], todayKey: string, windowDays: number): number {
  const start = shiftDateKey(todayKey, -(windowDays - 1));
  const distinct = new Set(dates.filter((d) => d >= start && d <= todayKey));
  return distinct.size;
}

/**
 * The inferred level from commitment signals. Returns only `observe` or
 * `nudge` (see the asymmetry rule above): a meticulous logger gets the
 * stay-out-of-the-way instrument; everyone else gets the default nudge level.
 */
export function inferCoachingLevel(signals: CommitmentSignals): Exclude<CoachingLevel, 'coach'> {
  const logged = daysInWindow(signals.entryDates, signals.todayKey, CONSISTENCY_WINDOW_DAYS);
  const consistency = logged / CONSISTENCY_WINDOW_DAYS;
  const measured = daysInWindow(signals.measurementDates, signals.todayKey, MEASUREMENT_WINDOW_DAYS);

  const meticulous =
    consistency >= OBSERVE_MIN_CONSISTENCY &&
    (measured >= OBSERVE_MIN_MEASUREMENT_DAYS || signals.protocolItemCount >= 2);
  return meticulous ? 'observe' : 'nudge';
}

/** The effective level: an explicit user choice always wins over inference. */
export function resolveCoachingLevel(
  userLevel: CoachingLevel | undefined,
  signals: CommitmentSignals,
): CoachingLevel {
  return userLevel ?? inferCoachingLevel(signals);
}
