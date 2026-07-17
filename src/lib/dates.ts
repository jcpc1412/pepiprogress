/** Date-key helpers. A "date key" is a local YYYY-MM-DD string (see localDateKey). */

/** Local date as YYYY-MM-DD (not UTC — user-facing days are anchored to the local
 *  calendar). Lives here (dependency-free) so integration providers can bucket
 *  daily aggregates onto the same local days the check-in uses; re-exported from
 *  the store for existing importers. */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The current local hour (0-23). Wrapped so callers stay pure at the call site. */
export function localHour(): number {
  return new Date().getHours();
}

/** Shift a YYYY-MM-DD key by N days (local, DST-safe via the Date constructor). */
export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Localized label for a date key, e.g. "Mon, Jun 9". */
export function formatDateKey(key: string, locale: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Whole days between two date keys (b - a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const ms = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.round(ms / 86_400_000);
}
