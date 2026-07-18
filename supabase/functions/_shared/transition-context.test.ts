import { describe, expect, it } from 'vitest';

import { transitionPromptLines } from './transition-context';

/**
 * Prompt-correctness checks for the transition-tracking vision block (W5-23).
 * These verify the PROMPT TEXT the model is given, not live model output — a
 * live vision eval needs real photos (which don't exist for this feature) and
 * would burn API budget without the user's go-ahead. What actually matters at
 * this layer is deterministic and fully checkable offline: did the code emit
 * the right direction's guardrails, and never leak the other direction's.
 */

describe('transitionPromptLines', () => {
  it('returns nothing when no direction is given (no goal/sex match)', () => {
    expect(transitionPromptLines(undefined)).toEqual([]);
  });

  it('mtf: frames softening/hip-thigh fat gain as progress, never regression', () => {
    const text = transitionPromptLines('mtf').join('\n');
    expect(text).toMatch(/feminizing \(mtf\)/);
    expect(text).toMatch(/hips\/thighs/);
    expect(text).toMatch(/PROGRESS/);
    expect(text).toMatch(/never describe softening.*regression/i);
    // Must not contain the ftm-only framing.
    expect(text).not.toMatch(/masculinizing \(ftm\)/);
    expect(text).not.toMatch(/more angular or squarer/i);
  });

  it('ftm: frames angularity/jaw definition as progress, never regression', () => {
    const text = transitionPromptLines('ftm').join('\n');
    expect(text).toMatch(/masculinizing \(ftm\)/);
    expect(text).toMatch(/more angular or squarer/i);
    expect(text).toMatch(/PROGRESS/);
    expect(text).toMatch(/never describe increased angularity.*regression/i);
    // Must not contain the mtf-only framing.
    expect(text).not.toMatch(/feminizing \(mtf\)/);
    expect(text).not.toMatch(/softer or rounder/i);
  });

  it('both directions ban gendered value judgments and diagnosis', () => {
    for (const dir of ['mtf', 'ftm'] as const) {
      const text = transitionPromptLines(dir).join('\n');
      expect(text).toMatch(/gendered value judgments/i);
      expect(text).toMatch(/more masculine-looking.*more feminine-looking/i);
      expect(text).toMatch(/never diagnose a hormone level/i);
    }
  });

  it('both directions require hedged language markers', () => {
    for (const dir of ['mtf', 'ftm'] as const) {
      const text = transitionPromptLines(dir).join('\n');
      expect(text).toMatch(/hedged/);
      expect(text).toMatch(/appears/);
    }
  });
});
