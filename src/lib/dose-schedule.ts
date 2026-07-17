import { daysBetween, shiftDateKey } from '@/lib/dates';

/**
 * Anchored interval schedules (ISSUES P-04 / master-plan W1-3).
 *
 * The old due-calc anchored "due" to the LAST logged dose, so a dose taken a day
 * early silently slid the whole future cadence forward. This module fixes the
 * grid instead: slots are `anchor + N * interval`, a logged dose COMPLETES the
 * nearest slot rather than moving the anchor, and an off-slot dose is surfaced
 * to the user (keep-schedule / shift-schedule / extra-dose) — never silently
 * re-anchored.
 *
 * Pure and deterministic; all dates are local YYYY-MM-DD keys. The weekday
 * (`doseDays`) model is already anchor-stable and does not use this module.
 */

/** Days between slots per legacy interval frequency. `as_needed`/`custom` have
 *  no grid (custom stays "always shown" in the UI, unchanged). */
const INTERVAL_DAYS: Record<string, number> = {
  daily: 1,
  eod: 2,
  twice_weekly: 3,
  weekly: 7,
};

export function intervalFor(frequency?: string): number | null {
  return (frequency && INTERVAL_DAYS[frequency]) || null;
}

/** The schedule anchor for an item: an explicit user/prompt-set anchor wins,
 *  then the protocol start date, then the latest logged dose at or before today
 *  (which reproduces the old sliding behavior exactly at migration time — the
 *  first new on-grid log persists a real anchor). Null = no reference yet. */
export function anchorFor(
  item: { scheduleAnchor?: string; startedAt?: string },
  doseKeysAsc: string[],
  todayKey: string,
): string | null {
  if (item.scheduleAnchor) return item.scheduleAnchor;
  if (item.startedAt) return item.startedAt.slice(0, 10);
  let latest: string | null = null;
  for (const k of doseKeysAsc) {
    if (k <= todayKey && (!latest || k > latest)) latest = k;
  }
  return latest;
}

/** The slot nearest to `dateKey` on the grid. Ties break toward the EARLIER
 *  slot (a dose halfway between slots most plausibly replaces the missed one).
 *  Slot indices are clamped to >= 0 (no slots before the anchor). */
export function nearestSlot(
  anchorKey: string,
  interval: number,
  dateKey: string,
): { index: number; slotKey: string; offsetDays: number } {
  const days = daysBetween(anchorKey, dateKey);
  const lo = Math.max(0, Math.floor(days / interval));
  const hi = Math.max(0, Math.ceil(days / interval));
  const dLo = Math.abs(days - lo * interval);
  const dHi = Math.abs(hi * interval - days);
  const index = dLo <= dHi ? lo : hi;
  const slotKey = shiftDateKey(anchorKey, index * interval);
  return { index, slotKey, offsetDays: daysBetween(slotKey, dateKey) };
}

/** A dose event as this module needs it. `slotKey` = the slot the user (via the
 *  off-slot prompt) explicitly assigned the dose to; `extra` = deliberately
 *  outside the schedule, completes nothing. */
export type ScheduledDose = { dateKey: string; slotKey?: string; extra?: boolean };

/** Slot indices completed by the given doses. Explicit `slotKey` wins; otherwise
 *  the dose completes its nearest slot. `extra` doses complete nothing. */
export function completedSlots(
  anchorKey: string,
  interval: number,
  doses: ScheduledDose[],
): Set<number> {
  const done = new Set<number>();
  for (const d of doses) {
    if (d.extra) continue;
    const ref = d.slotKey ?? d.dateKey;
    done.add(nearestSlot(anchorKey, interval, ref).index);
  }
  return done;
}

/**
 * Whether the item is due on `todayKey`: the most recent slot at or before today
 * is not yet completed. (Overdue keeps showing until logged; slots further back
 * than the latest are considered lapsed — you can't retro-take them.)
 * Returns the due slot's key, or null when nothing is due.
 */
export function dueSlot(
  anchorKey: string,
  interval: number,
  doses: ScheduledDose[],
  todayKey: string,
): { index: number; slotKey: string } | null {
  const days = daysBetween(anchorKey, todayKey);
  if (days < 0) return null; // schedule hasn't started
  const index = Math.floor(days / interval);
  if (completedSlots(anchorKey, interval, doses).has(index)) return null;
  return { index, slotKey: shiftDateKey(anchorKey, index * interval) };
}

/** Classify a just-logged dose against the grid, for the off-slot prompt. */
export function classifyDose(
  anchorKey: string,
  interval: number,
  doseKey: string,
): { onSlot: boolean; slotKey: string; offsetDays: number } {
  const s = nearestSlot(anchorKey, interval, doseKey);
  return { onSlot: s.offsetDays === 0, slotKey: s.slotKey, offsetDays: s.offsetDays };
}

/**
 * Consecutive missed interval slots counting back from the most recent slot
 * strictly before today (ISSUES P-05). Today's still-pending slot doesn't count
 * as missed. 0 = nothing missed (or no past slots yet).
 */
export function missedSlotStreak(
  anchorKey: string,
  interval: number,
  doses: ScheduledDose[],
  todayKey: string,
): number {
  const days = daysBetween(anchorKey, todayKey);
  if (days <= 0) return 0;
  const latestPast = Math.floor((days - 1) / interval); // largest idx with slotKey < today
  if (latestPast < 0) return 0;
  const done = completedSlots(anchorKey, interval, doses);
  let streak = 0;
  for (let idx = latestPast; idx >= 0 && !done.has(idx); idx--) streak++;
  return streak;
}

/**
 * Consecutive missed weekday-schedule days counting back from yesterday
 * (P-05, `doseDays` model). Looks back at most `maxDays` (default 28).
 */
export function missedWeekdayStreak(
  doseDays: number[],
  doseKeys: string[] | Set<string>,
  todayKey: string,
  maxDays = 28,
): number {
  if (doseDays.length === 0) return 0;
  const logged = doseKeys instanceof Set ? doseKeys : new Set(doseKeys);
  const dueSet = new Set(doseDays);
  let streak = 0;
  for (let back = 1; back <= maxDays; back++) {
    const key = shiftDateKey(todayKey, -back);
    const [y, m, d] = key.split('-').map(Number);
    if (!dueSet.has(new Date(y, m - 1, d).getDay())) continue;
    if (logged.has(key)) break;
    streak++;
  }
  return streak;
}
