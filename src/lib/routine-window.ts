import type { MetricReading } from '@/lib/store';

/**
 * Invisible routine-window model (2b.5).
 *
 * Workout readings carry a timestamp, so the app can learn *when* this user
 * usually trains and use that purely to time a question: never ask "how did
 * lifting feel?" at 10am when they always train at 7pm and the day simply
 * hasn't happened yet.
 *
 * The model is deliberately invisible. It gates timing only and is never
 * surfaced in copy — no "we noticed you train at 3pm". A user who is told the
 * app is profiling their schedule reads it as surveillance; a user who is
 * simply never asked a premature question reads it as the app being sensible.
 */

export type RoutineWindow = {
  /** Local hour the activity typically starts (0-23). */
  startHour: number;
  /** Local hour by which it is typically finished (1-24, exclusive). */
  endHour: number;
  /** Distinct days that contributed. */
  samples: number;
};

/** How far back to look. Long enough to survive a quiet week, short enough that
 *  someone who moves their training to mornings is followed within a month. */
const LOOKBACK_DAYS = 28;

/** Below this the "usual time" is a coincidence, not a routine. */
const MIN_SAMPLES = 4;

/** Fallback for a user with no learned window: late enough that a normal
 *  training day is over, early enough to still catch them awake. */
export const DEFAULT_WINDOW_END_HOUR = 20;

/** Local hour of an ISO timestamp. Readings carry a real offset, so this is the
 *  user's own clock rather than UTC. */
function localHourOf(ts: string): number {
  return new Date(ts).getHours();
}

function localDayOf(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Learn the window from timestamped readings of the given metrics.
 *
 * One sample per day (the day's *latest* occurrence), so a user who does a
 * morning walk and an evening lift isn't modelled as a morning trainer: the
 * gate cares about when the day's activity is finished, not when it started.
 *
 * The band is trimmed to the 20th-80th percentile so a single 6am outlier does
 * not widen the window backwards, then the end is pushed out one hour to cover
 * the session itself. Returns null below `MIN_SAMPLES`, and callers treat null
 * as "no routine known" rather than inventing one.
 */
export function learnRoutineWindow(
  readings: MetricReading[],
  metrics: string[],
  now: Date = new Date(),
): RoutineWindow | null {
  const wanted = new Set(metrics);
  const cutoff = now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  // Day → latest hour seen that day.
  const perDay = new Map<string, number>();
  for (const r of readings) {
    if (!wanted.has(r.metric)) continue;
    const at = new Date(r.ts).getTime();
    if (!Number.isFinite(at) || at < cutoff || at > now.getTime()) continue;
    const day = localDayOf(r.ts);
    const hour = localHourOf(r.ts);
    const prev = perDay.get(day);
    if (prev === undefined || hour > prev) perDay.set(day, hour);
  }

  const hours = [...perDay.values()].sort((a, b) => a - b);
  if (hours.length < MIN_SAMPLES) return null;

  const lo = hours[Math.floor((hours.length - 1) * 0.2)];
  const hi = hours[Math.ceil((hours.length - 1) * 0.8)];
  return {
    startHour: lo,
    endHour: Math.min(24, hi + 1),
    samples: hours.length,
  };
}

/**
 * Has the user's usual activity window passed for today?
 *
 * With no learned window this falls back to a fixed evening hour, which is the
 * conservative direction: asking too late costs one day of a subjective field,
 * asking too early trains the user that the question is noise.
 */
export function routineWindowPassed(
  window: RoutineWindow | null,
  hour: number,
  fallbackHour: number = DEFAULT_WINDOW_END_HOUR,
): boolean {
  if (!window) return hour >= fallbackHour;
  return hour >= window.endHour;
}
