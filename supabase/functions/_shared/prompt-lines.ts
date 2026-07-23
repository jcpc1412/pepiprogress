// PepiProgress - shared cross-surface prompt fragments.
//
// Small, safety-neutral boilerplate that recurs across every AI-service prompt
// builder (and, later, the connector server). Extracted so the wording lives in
// one place instead of drifting per surface (MASTER-PLAN point 3: composable
// modules over a copy-pasted monolith).
//
// Deliberately content-only: these helpers carry NO posture or safety weight.
// The market_category gate stays in posture.ts and the observational/hedging
// rules stay in each builder's HARD RULES block; nothing here can weaken a gate,
// which is exactly why it is safe to share. Unit-testable on plain string output
// with no model call (mirrors posture.ts / transition-context.ts).

/**
 * The trailing "write the output in the user's locale" instruction shared by
 * every prompt builder. `subject` names what to localize (e.g. `the "answer"`);
 * omit it for the bare form. Returns the sentence without a leading bullet so the
 * caller controls list formatting.
 */
export function localeLine(locale: string, subject?: string): string {
  return subject ? `Write ${subject} in this locale: ${locale}.` : `Write in this locale: ${locale}.`;
}
