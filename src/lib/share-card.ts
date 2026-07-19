import { shiftDateKey } from '@/lib/dates';

/**
 * Share cards (W6-27, beta-notes §1.4). A branded stat card the user can export
 * after a milestone or a quality highscore.
 *
 * PRIVACY INVARIANT (deliberate, spec 11): a share card carries **consistency
 * signals only** — streak, days tracked, photo count, and an optional weight
 * delta. It never carries compound names, doses, bloodwork markers, symptoms, or
 * any health inference. A user sharing to social must not be able to leak a
 * controlled-compound protocol with one tap, so those fields are not reachable
 * from this module's input type at all. Widening `ShareCardInput` is a product
 * decision, not a refactor.
 *
 * Pure + deterministic: no RN, no i18n, no network. Emits i18n keys plus
 * preformatted numeric values so the renderer stays dumb.
 */

/** A single stat cell: an i18n label key + an already-formatted value. */
export type ShareStat = { labelKey: ShareStatKey; value: string };

/** The only labels a share card may carry (see the privacy invariant above). */
export type ShareStatKey =
  | 'share.statStreak'
  | 'share.statDays'
  | 'share.statPhotos'
  | 'share.statWeight';

export type ShareCard = {
  stats: ShareStat[];
  /** Render the Pepi wordmark. Defaults differ by surface (card on, photo off). */
  watermark: boolean;
};

export type ShareCardInput = {
  /** Date keys (YYYY-MM-DD) that have a check-in. Order irrelevant. */
  loggedDateKeys: string[];
  /** How many progress photos exist. */
  photoCount: number;
  /** Latest weight minus baseline, in the user's unit. Omit when unknown. */
  weightDelta?: number;
  units: 'metric' | 'imperial';
  todayKey: string;
  watermark: boolean;
};

/** At most this many stat cells fit the card layout without crowding. */
export const MAX_SHARE_STATS = 4;

/**
 * Current logging streak: consecutive days ending at today, or at yesterday when
 * today is not logged yet (a one-day grace so a morning share does not read 0).
 * Returns 0 when neither today nor yesterday is logged.
 */
export function loggingStreak(loggedDateKeys: string[], todayKey: string): number {
  const set = new Set(loggedDateKeys);
  let anchor = todayKey;
  if (!set.has(anchor)) {
    anchor = shiftDateKey(todayKey, -1);
    if (!set.has(anchor)) return 0;
  }
  let streak = 0;
  let cursor = anchor;
  while (set.has(cursor)) {
    streak++;
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}

/** Signed, one-decimal weight delta with its unit, e.g. "-2.4 kg" / "+1.5 lb". */
function formatWeightDelta(delta: number, units: 'metric' | 'imperial'): string {
  const unit = units === 'imperial' ? 'lb' : 'kg';
  const rounded = Math.round(delta * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded} ${unit}`;
}

/**
 * Build the card. Stats are ordered by how much they reward consistency (the
 * behaviour we want to reinforce), and empty/zero signals are omitted rather
 * than shown as a zero.
 */
export function buildShareCard(input: ShareCardInput): ShareCard {
  const stats: ShareStat[] = [];

  const streak = loggingStreak(input.loggedDateKeys, input.todayKey);
  if (streak > 0) stats.push({ labelKey: 'share.statStreak', value: String(streak) });

  if (input.loggedDateKeys.length > 0) {
    stats.push({ labelKey: 'share.statDays', value: String(input.loggedDateKeys.length) });
  }

  if (input.photoCount > 0) {
    stats.push({ labelKey: 'share.statPhotos', value: String(input.photoCount) });
  }

  // A zero delta is noise, not a result; only a real move earns a cell.
  if (input.weightDelta !== undefined && Math.round(input.weightDelta * 10) !== 0) {
    stats.push({
      labelKey: 'share.statWeight',
      value: formatWeightDelta(input.weightDelta, input.units),
    });
  }

  return { stats: stats.slice(0, MAX_SHARE_STATS), watermark: input.watermark };
}
