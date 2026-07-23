import { describe, expect, it } from 'vitest';

import { localeLine } from './prompt-lines';

describe('localeLine', () => {
  it('renders with a subject', () => {
    expect(localeLine('es', 'the "answer"')).toBe('Write the "answer" in this locale: es.');
  });

  it('renders the bare form with no subject', () => {
    expect(localeLine('fr')).toBe('Write in this locale: fr.');
  });

  it("reproduces each builder's exact wording (behavior-preservation guard)", () => {
    // These are the exact strings the ai-service builders emitted inline before
    // the composer refactor (MASTER-PLAN point 3). If a caller drifts, this bites.
    expect(
      localeLine('en', 'every user-facing string (change, observation notes and region labels, hypothesis, watchNext)'),
    ).toBe(
      'Write every user-facing string (change, observation notes and region labels, hypothesis, watchNext) in this locale: en.',
    );
    expect(localeLine('de', 'all text')).toBe('Write all text in this locale: de.');
    expect(localeLine('pt', 'any descriptive text')).toBe('Write any descriptive text in this locale: pt.');
  });
});
