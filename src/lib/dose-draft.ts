/**
 * Dose drawer core (W7-34).
 *
 * The drawer replaces one-tap-to-confirm as the default dose-logging surface, so
 * a dose is now something the user can adjust before it is written: the amount,
 * and the moment it was taken. This module holds the decisions that go with
 * that, kept pure so they are testable without a picker or a store.
 *
 * The delicate one is {@link protocolChangePrompt}. Editing a dose inside a
 * logging flow is ambiguous: "I took 300 today" and "my dose is now 300" look
 * identical at the keyboard. Guessing wrong in either direction is bad, so the
 * rule is: only ask when the number actually differs, default to the
 * non-destructive reading (this dose only), and never let a "yes" reach back
 * into doses already logged.
 */

/** A dose amount the user typed. `null` = empty or unparseable. */
export function parseDoseInput(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!trimmed) return null;
  // Reject anything that is not a plain positive decimal, so "12mg" or "1e5"
  // never silently become a number.
  if (!/^\d*\.?\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Whether a typed dose is valid enough to log. Empty is allowed: some protocol
 *  items carry no dose at all, and logging "I took it" is still a fact. */
export function isDoseInputValid(text: string): boolean {
  return text.trim() === '' || parseDoseInput(text) !== null;
}

/**
 * Builds the ISO timestamp for a dose from a date key and a wall-clock time.
 *
 * Constructed via local Date parts rather than string concatenation so the
 * result is anchored to the user's calendar day, matching `localDateKey`.
 */
export function combineDateTime(dateKey: string, hours: number, minutes: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, hours, minutes, 0, 0).toISOString();
}

/** A dose cannot be taken in the future. Mirrors the check-in's no-future-days
 *  rule and the date picker's `maximumDate`. */
export function isFuture(iso: string, now: Date = new Date()): boolean {
  return new Date(iso).getTime() > now.getTime();
}

/** Clamps a drafted timestamp to "now" when it lands in the future, so a
 *  fat-thumbed picker cannot record a dose that has not happened. */
export function clampToNow(iso: string, now: Date = new Date()): string {
  return isFuture(iso, now) ? now.toISOString() : iso;
}

/**
 * Whether to ask "apply this dose to all future doses?" after logging.
 *
 * Only when the user actually changed the number away from what the protocol
 * says. No protocol dose on file means there is nothing to update, and an
 * unchanged or unparseable value means nothing was decided.
 */
export function protocolChangePrompt(
  typedDose: string,
  protocolDose: number | undefined,
): { ask: boolean; newDose?: number } {
  const parsed = parseDoseInput(typedDose);
  if (parsed === null) return { ask: false };
  if (protocolDose === undefined) return { ask: false };
  if (parsed === protocolDose) return { ask: false };
  return { ask: true, newDose: parsed };
}
