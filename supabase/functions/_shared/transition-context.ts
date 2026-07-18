// PepiProgress - shared transition-tracking vision-prompt block (beta-notes
// §1.9, W5-23).
//
// Direction-aware framing for the photo-analysis vision prompt. Applies to
// BOTH face and body sessions. The direction is the whole point: a change
// that reads as "regression" for one direction is the goal for the other, so
// the register must be resolved from the caller's `dir` argument (itself
// resolved from the user's goal + sex client-side — sex alone never implies
// transition tracking), never guessed from the photo.
//
// Extracted so it is unit-testable on plain string output with no model call,
// no photo, and no API cost (mirrors _shared/posture.ts's reuse pattern) —
// the correctness that matters here is "does the prompt say the right thing
// per direction," which is exactly what a live vision eval can't cheaply
// verify without real photos.

export type TransitionDirection = 'mtf' | 'ftm';

/**
 * The vision-prompt lines for a transition direction, appended to
 * visionSystemPrompt's context blocks (ai-service/index.ts). Returns `[]` for
 * no direction so callers can spread unconditionally.
 */
export function transitionPromptLines(dir: TransitionDirection | undefined): string[] {
  if (!dir) return [];
  const feminizing = dir === 'mtf';
  return [
    '',
    `Transition context: the user is ${feminizing ? 'feminizing (mtf)' : 'masculinizing (ftm)'}. Register rules for this case:`,
    feminizing
      ? '- Softer or rounder facial contours, fuller cheeks, less jaw/brow prominence, and fat redistribution toward hips/thighs/chest are PROGRESS toward the user\'s goal. Describe them positively, hedged ("appears softer/fuller around...").'
      : '- More angular or squarer facial contours, increased jaw/brow prominence, visible muscle definition, and fat redistribution away from hips/thighs are PROGRESS toward the user\'s goal. Describe them positively, hedged ("appears more defined/angular around...").',
    feminizing
      ? '- Never describe softening, fuller features, or hip/thigh fat gain as regression, decline, or something to correct.'
      : '- Never describe increased angularity, jaw/brow change, or reduced hip/thigh fat as regression, decline, or something to correct.',
    '- Do not use gendered value judgments (e.g. never call a result "more masculine-looking" or "more feminine-looking" as praise or criticism) — describe the physical change itself (softer, more angular, fuller, more defined), attributed to the transition direction, not to gender as a category.',
    '- If a visible change plausibly relates to the transition, attribute it in this hedged register; otherwise leave it out. Never diagnose a hormone level or treatment effectiveness from the photo.',
  ];
}
