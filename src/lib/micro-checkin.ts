import type { CheckinEntry } from '@/lib/store';
import type { CheckinField } from '@/lib/field-surfacing';

/**
 * Micro check-ins + chat controls (beta-notes §4, W3-9). Pure helpers:
 * which scheduled moment is active, which 1-5 fields it should ask, and the
 * lightweight multilingual intent matching for snooze / tone-down / per-check-in
 * control. Zero AI: chips and pattern matches only; free text falls through to
 * the quick-log parser as before.
 */

export type MicroSlot = 'morning' | 'evening';

/** Default reminder times (24h HH:mm). Evening reuses the check-in reminder. */
export const MICRO_MORNING_DEFAULT = '08:30';

/** The slot a chat visit falls into. Morning 5-11, evening 17-23, else none. */
export function activeMicroSlot(hour: number): MicroSlot | null {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 17) return 'evening';
  return null;
}

/** 1-5 scale fields each moment covers (1 to 3 per the decided cadence). */
const SLOT_FIELDS: Record<MicroSlot, CheckinField[]> = {
  morning: ['sleep_quality', 'energy'],
  evening: ['wellness', 'soreness', 'workout_effort'],
};

/** The fields the active micro check-in should ask: the slot's set, filtered to
 *  what field-surfacing exposes and what today's entry hasn't logged yet. */
export function microFieldsFor(
  slot: MicroSlot,
  surfacedFields: CheckinField[],
  entry: CheckinEntry | undefined,
): CheckinField[] {
  const e = entry as Record<string, unknown> | undefined;
  return SLOT_FIELDS[slot]
    .filter((f) => surfacedFields.includes(f))
    .filter((f) => e?.[f] === undefined)
    .slice(0, 3);
}

// ── Chat controls (beta-notes §4.2 + §4.3) ────────────────────────────────────

export type ChatControl =
  | { kind: 'snooze' }
  | { kind: 'toneDown' }
  | { kind: 'toggleCheckin'; slot: MicroSlot; enable: boolean }
  | { kind: 'moveCheckin'; slot: MicroSlot; time: string };

// Lightweight keyword tables per the decided approach ("pattern match before it
// earns a slot in the parse schema"). Deliberately conservative: a miss falls
// through to the normal parser, a false positive would change settings, so the
// verbs are explicit.
const SNOOZE_RE =
  /\b(snooze|ask (me )?later|in an hour|remind me later|m[áa]s tarde|plus tard|sp[äa]ter|mais tarde|позже|через час)\b/i;
const TONE_DOWN_RE =
  /\b(tone (it |them )?down|fewer notifications|less notifications|too many (notifications|pings|reminders)|menos notificaciones|moins de notifications|weniger benachrichtigungen|menos notifica[cç][õo]es|меньше уведомлений)\b/i;
const MORNING_RE = /\b(morning|ma[ñn]ana|matin|morgen|manh[ãa]|утр)/i;
const EVENING_RE = /\b(evening|night|noche|soir|abend|noite|вечер|ночь)/i;
const DISABLE_RE =
  /\b(turn off|disable|stop|remove|desactiva|quita|d[ée]sactive|arr[êe]te|deaktiviere|schalte .{0,12}aus|desativa|отключи|выключи|убери)\b/i;
const ENABLE_RE = /\b(turn on|enable|re-?enable|activa|active|aktiviere|ativa|включи)\b/i;
const CHECKIN_RE = /\b(check-?in|checkin|prompt|reminder|recordatorio|rappel|erinnerung|lembrete|напоминание|чек-?ин)\b/i;
const MOVE_RE = /\b(move|change|set|reschedule|cambia|mueve|d[ée]place|change|verschiebe|[äa]ndere|muda|перенеси|поменяй)\b/i;
const TIME_RE = /\b(\d{1,2})(?:[:h.](\d{2}))?\s*(am|pm)?\b/i;

/** Parse an "HH:mm" out of the message; null when absent/invalid. */
function extractTime(text: string): string | null {
  const m = text.match(TIME_RE);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Match a chat-control intent. Never silently applied by callers: every hit is
 * confirmed back in chat and reversible in settings (§4.3 rule).
 */
export function matchChatControl(text: string): ChatControl | null {
  const slot: MicroSlot | null = MORNING_RE.test(text) ? 'morning' : EVENING_RE.test(text) ? 'evening' : null;

  // Move first: "change my morning check-in to 9" also contains no disable verb,
  // but "set" and a time distinguish it.
  if (slot && CHECKIN_RE.test(text) && MOVE_RE.test(text)) {
    const time = extractTime(text);
    if (time) return { kind: 'moveCheckin', slot, time };
  }
  if (slot && CHECKIN_RE.test(text)) {
    if (DISABLE_RE.test(text)) return { kind: 'toggleCheckin', slot, enable: false };
    if (ENABLE_RE.test(text)) return { kind: 'toggleCheckin', slot, enable: true };
  }
  if (TONE_DOWN_RE.test(text)) return { kind: 'toneDown' };
  // Snooze only for short, imperative-ish messages so "I'll log the rest later"
  // doesn't trigger it.
  if (text.trim().length <= 32 && SNOOZE_RE.test(text)) return { kind: 'snooze' };
  return null;
}
