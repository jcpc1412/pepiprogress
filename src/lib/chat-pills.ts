/**
 * When Pepi's suggestion pills are visible (W7-43).
 *
 * The pills answer "what can I even say here?". That question is real on a cold
 * screen and noise in the middle of a conversation, where they sat between the
 * thread and the composer taking up room the user was actively trying to type
 * into.
 *
 * Hiding them the moment a conversation starts would be too blunt though: a
 * user who sends one message and then stalls is back to needing the prompt. So
 * visibility is a function of how recently anything happened, and the pills
 * come back on their own once the exchange goes quiet.
 *
 * This is only about the *suggestion* pills. Chips that are the answer to a
 * question Pepi just asked (micro check-in scales, anomaly mute, typical-day
 * yes/no) are the interaction itself and always render.
 */

/** How long the conversation must be quiet before the pills return. Long
 *  enough not to flicker between turns, short enough that a stalled user gets
 *  the nudge while still looking at the screen. */
export const PILL_IDLE_MS = 10_000;

export function shouldShowPills(state: {
  /** Characters currently in the composer. */
  draftLength: number;
  /** Time since the last message was sent or received. */
  msSinceActivity: number;
  /** Whether the thread has any messages at all. */
  hasConversation: boolean;
}): boolean {
  // Mid-composition: the user has already decided what to say, and the pills
  // are competing with the keyboard for space.
  if (state.draftLength > 0) return false;

  // A cold screen is exactly what the pills are for, no waiting required.
  if (!state.hasConversation) return true;

  // Active back-and-forth: stay out of the way.
  if (state.msSinceActivity < PILL_IDLE_MS) return false;

  // The exchange went quiet with an empty composer. Offer the prompt again.
  return true;
}

/**
 * Milliseconds until the pills would next become visible on their own, or
 * `null` when no timer is needed (they are already showing, or something other
 * than time has to change first).
 *
 * Lets the screen schedule exactly one wake-up instead of polling.
 */
export function msUntilPillsReturn(state: {
  draftLength: number;
  msSinceActivity: number;
  hasConversation: boolean;
}): number | null {
  if (shouldShowPills(state)) return null;
  // A non-empty draft is resolved by the user typing, not by the clock.
  if (state.draftLength > 0) return null;
  return Math.max(0, PILL_IDLE_MS - state.msSinceActivity);
}
