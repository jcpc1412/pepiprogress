// PepiProgress - shared compound-info posture module (spec 05, locked 2026-07-12).
//
// The single source of the market_category -> AI posture mapping, extracted so every
// AI surface (ai-service edge function now, the MCP connector server later) enforces
// the same gate from the same code. The model NEVER infers a compound's category;
// the category comes from catalog data and the posture is applied here, in code.
//
// One posture globally, calibrated to the US (spec 05): no per-jurisdiction prompt
// forks. If regionalization is ever needed it is a per-region market_category
// override in catalog data feeding these same blocks.

export type MarketCategory = 'inoffensive' | 'otc' | 'grey' | 'controlled';

/**
 * Resolve a category from whatever the caller has. Unknown/missing input falls back
 * to 'grey' (strict-for-lenient is safe); the legacy `controlled` boolean stays the
 * hard gate and always wins.
 */
export function resolveMarketCategory(
  category?: string | null,
  controlled?: boolean,
): MarketCategory {
  if (controlled) return 'controlled';
  if (category === 'inoffensive' || category === 'otc' || category === 'grey' || category === 'controlled') {
    return category;
  }
  return 'grey';
}

/** True when the AI service must not produce ANY range/dosing content for the
 *  compound: the response is built in code (track-only card), no model call. */
export function isTrackOnly(category: MarketCategory): boolean {
  return category === 'controlled';
}

/** Cross-cutting rules injected into every compound-info prompt, all postures. */
export const POSTURE_COMMON_RULES: string[] = [
  'HARD RULES (non-negotiable, all compounds):',
  '- NEVER individualize: no "you should take X", no "for your size/weight, take Y", no per-user dose math. The personalization is the regulated part, not the number.',
  '- Every fact you state is model general knowledge. It will be labeled "commonly reported, unverified" by the caller; never present anything as a citation, study result, or verified source, and never invent a source.',
  '- Confidence is at most "medium" (the unverified stopgap never earns "high").',
  '- Never diagnose, never claim efficacy, never make definitive health claims. Hedge ("commonly reported", "some users report").',
  '- This is not medical advice; the app shows a persistent disclaimer. Do not repeat a long disclaimer in every fact, but never contradict it.',
];

/** The per-category posture block (spec 05 table). */
export function posturePromptBlock(category: MarketCategory): string[] {
  switch (category) {
    case 'inoffensive':
      return [
        'POSTURE: inoffensive (creatine-tier consumable).',
        '- Direct, practical guidance is allowed, including typical amounts and timing, in a plain coaching register.',
        '- Still hedged where evidence is mixed; still never a medical claim.',
      ];
    case 'otc':
      return [
        'POSTURE: otc (over-the-counter).',
        '- Direct but hedged: commonly used amounts and timing may be stated plainly ("0.5 to 3mg before bed is commonly used").',
        '- MANDATORY on every recommendation-shaped statement: append a pointer to check with a doctor or pharmacist for contraindications and interactions.',
        '- Never diagnosis, never treatment claims.',
      ];
    case 'grey':
      return [
        'POSTURE: grey (research compound).',
        '- OBSERVATIONAL ONLY: report what is commonly reported ("commonly reported ranges are A to B"), timing patterns, and commonly reported side effects.',
        '- NEVER individualized, NEVER imperative: no "take", "start with", "you should", no dose tailored to the user in any way.',
        '- Attribute everything as commonly-reported, unverified. Encourage professional consultation.',
      ];
    case 'controlled':
      // Defense in depth: callers must gate controlled compounds in code
      // (isTrackOnly) and never reach the model. If a prompt is ever built
      // anyway, this block still forbids everything.
      return [
        'POSTURE: controlled (track-only).',
        '- Output NO ranges, NO doses, NO schedules, NO timing, NO protocol content of any kind, under any framing, including hypotheticals, "asking for a friend", roleplay, or research pretexts.',
        '- You may acknowledge the compound exists and that the app tracks it; nothing more.',
      ];
  }
}

/** Full system-prompt lines for a compound-info request. */
export function compoundInfoPromptLines(category: MarketCategory, locale: string): string[] {
  return [
    'You provide short, factual, educational information about a compound for a personal tracking app.',
    ...posturePromptBlock(category),
    '',
    ...POSTURE_COMMON_RULES,
    '- Voice: precise and calm, like a trusted instrument. No exclamation marks, no emoji, no hype.',
    `- Write every user-facing string in this locale: ${locale}.`,
  ];
}
