/**
 * Day-boundary timing (W7-46).
 *
 * Phones do not close apps, they suspend them. A screen left open overnight
 * keeps rendering the day it was mounted on: `localDateKey()` is always correct
 * when called, but nothing re-calls it, so "today's doses" quietly means
 * yesterday's until some unrelated state change forces a re-render.
 *
 * Two things can move the boundary past us: the app sitting in the background
 * across midnight (caught on the next foreground), and the app sitting in the
 * foreground across midnight (caught by a timer). This module holds the timing
 * arithmetic for the second, kept pure so the edge cases are testable without
 * waiting until midnight.
 */

/** A small cushion so the timer fires just *after* the boundary, never a
 *  millisecond before it, where it would recompute the same day and reschedule
 *  in a tight loop. */
const OVERSHOOT_MS = 1000;

/**
 * Milliseconds until the next local midnight, plus a small overshoot.
 *
 * Built from local date parts rather than arithmetic on the epoch so it stays
 * correct across DST transitions, where a calendar day is 23 or 25 hours long.
 */
export function msUntilNextLocalMidnight(now: Date = new Date()): number {
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1, // rolls month/year over on its own
    0,
    0,
    0,
    0,
  );
  return nextMidnight.getTime() - now.getTime() + OVERSHOOT_MS;
}
