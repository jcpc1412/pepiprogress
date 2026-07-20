import { describe, expect, it } from 'vitest';

import {
  parseDeterministic,
  splitSegments,
  type DeterministicVocab,
} from '@/lib/quick-log-deterministic';

const vocab: DeterministicVocab = {
  fields: {
    weight: ['weight', 'peso'],
    sleep_quality: ['sleep quality', 'sleep', 'calidad del sueño'],
    energy: ['energy', 'energía'],
    wellness: ['mood', 'wellness'],
    protein: ['protein', 'proteína'],
    calories: ['calories', 'cals', 'calorías'],
    waist: ['waist', 'cintura'],
    arms: ['arms'],
  },
  compounds: [
    { compoundSlug: 'semaglutide', names: ['semaglutide', 'sema'], dose: 0.5, doseUnit: 'mg' },
    { compoundSlug: 'bpc-157', names: ['bpc-157', 'bpc'], dose: 250, doseUnit: 'mcg' },
    { compoundSlug: 'armodafinil', names: ['armodafinil'] },
  ],
};

const parse = (text: string) => parseDeterministic(text, vocab);

describe('splitSegments', () => {
  it('splits on commas between separate entries', () => {
    expect(splitSegments('weight 80, energy 3')).toEqual(['weight 80', 'energy 3']);
  });

  it('keeps a decimal comma intact: five of six locales write 80,5', () => {
    expect(splitSegments('weight 80,5')).toEqual(['weight 80,5']);
  });

  it('splits on newlines and semicolons', () => {
    expect(splitSegments('weight 80\nenergy 3; sleep 4')).toEqual(['weight 80', 'energy 3', 'sleep 4']);
  });
});

describe('parseDeterministic: the simple cases that should never cost a token', () => {
  it('reads a bare weight', () => {
    expect(parse('weight 120')).toEqual([{ kind: 'weight', confidence: 1, weight: 120 }]);
  });

  it('reads a scale field', () => {
    expect(parse('energy 3')).toEqual([
      { kind: 'checkin', confidence: 1, field: 'energy', value: 3 },
    ]);
  });

  it('reads the "4/5" form the templates produce', () => {
    expect(parse('sleep quality 4/5')).toEqual([
      { kind: 'checkin', confidence: 1, field: 'sleep_quality', value: 4 },
    ]);
  });

  it('accepts a label separator and a unit', () => {
    expect(parse('weight: 83.2 kg')).toEqual([{ kind: 'weight', confidence: 1, weight: 83.2 }]);
  });

  it('accepts the comma decimal', () => {
    expect(parse('peso 80,5')).toEqual([{ kind: 'weight', confidence: 1, weight: 80.5 }]);
  });

  it('reads several entries in one message', () => {
    expect(parse('weight 80, energy 4, protein 150 g')).toHaveLength(3);
  });

  it('works in another locale', () => {
    expect(parse('energía 5')).toEqual([
      { kind: 'checkin', confidence: 1, field: 'energy', value: 5 },
    ]);
  });

  it('is case and whitespace insensitive', () => {
    expect(parse('  WEIGHT   120  ')).toEqual([{ kind: 'weight', confidence: 1, weight: 120 }]);
  });

  it('prefers the longest label so "sleep quality" is not read as "sleep"', () => {
    const items = parse('sleep quality 4');
    expect(items?.[0]).toMatchObject({ field: 'sleep_quality', value: 4 });
  });
});

describe('parseDeterministic: escalation is the safe default', () => {
  it('escalates prose that merely contains a keyword', () => {
    expect(parse('weight felt heavy today')).toBeNull();
  });

  it('escalates when any one segment is not understood', () => {
    // The weight half is perfectly readable; it still must not be applied alone.
    expect(parse('weight 80, felt rough after the gym')).toBeNull();
  });

  it('escalates an unknown word entirely', () => {
    expect(parse('had a great day')).toBeNull();
  });

  it('escalates an unrecognised unit rather than ignoring it', () => {
    expect(parse('weight 80 stone')).toBeNull();
  });

  it('escalates a scale value outside 1-5', () => {
    expect(parse('energy 9')).toBeNull();
    expect(parse('energy 2.5')).toBeNull();
  });

  it('escalates a scale value carrying a unit', () => {
    expect(parse('energy 3 kg')).toBeNull();
  });

  it('escalates empty input', () => {
    expect(parse('')).toBeNull();
    expect(parse('   ')).toBeNull();
  });

  it('escalates a template nobody filled in, since there is nothing to write', () => {
    expect(parse('Weight: \nWaist: ')).toBeNull();
  });

  it('escalates exponent and negative forms', () => {
    expect(parse('weight 1e5')).toBeNull();
    expect(parse('weight -80')).toBeNull();
    expect(parse('weight 0')).toBeNull();
  });

  it('escalates a glued unit', () => {
    expect(parse('weight 80kg')).toBeNull();
  });
});

describe('parseDeterministic: partially-filled templates', () => {
  it('logs the filled lines and skips the blank ones', () => {
    const items = parse('Weight: 80\nWaist: \nArms: 38 cm');
    expect(items).toEqual([
      { kind: 'weight', confidence: 1, weight: 80 },
      { kind: 'checkin', confidence: 1, field: 'arms', value: 38 },
    ]);
  });
});

describe('parseDeterministic: doses are held to a higher bar', () => {
  it('logs the protocol dose when the compound is named alone', () => {
    expect(parse('sema')).toEqual([
      { kind: 'dose', confidence: 1, compoundSlug: 'semaglutide', dose: 0.5, doseUnit: 'mg' },
    ]);
  });

  it('logs an explicit amount with an explicit unit', () => {
    expect(parse('bpc 500 mcg')).toEqual([
      { kind: 'dose', confidence: 1, compoundSlug: 'bpc-157', dose: 500, doseUnit: 'mcg' },
    ]);
  });

  it('inherits the protocol unit when only a number is given', () => {
    expect(parse('sema 1')).toEqual([
      { kind: 'dose', confidence: 1, compoundSlug: 'semaglutide', dose: 1, doseUnit: 'mg' },
    ]);
  });

  it('escalates a bare compound with no protocol dose to fall back on', () => {
    // Nothing locally says how much "the usual" is, so guessing is not an option.
    expect(parse('armodafinil')).toBeNull();
  });

  it('escalates a dose in a non-dose unit', () => {
    expect(parse('bpc 500 cm')).toBeNull();
  });

  it('does not let a short name swallow a longer one', () => {
    // "arms" must not be read as the start of "armodafinil", nor the reverse.
    expect(parse('arms 38')).toEqual([
      { kind: 'checkin', confidence: 1, field: 'arms', value: 38 },
    ]);
  });

  it('escalates when two candidates tie on the same name', () => {
    const ambiguous: DeterministicVocab = {
      fields: {},
      compounds: [
        { compoundSlug: 'a-1', names: ['test'], dose: 1, doseUnit: 'mg' },
        { compoundSlug: 'b-2', names: ['test'], dose: 2, doseUnit: 'mg' },
      ],
    };
    expect(parseDeterministic('test', ambiguous)).toBeNull();
  });

  it('mixes a dose and a field in one message', () => {
    expect(parse('sema, weight 80')).toEqual([
      { kind: 'dose', confidence: 1, compoundSlug: 'semaglutide', dose: 0.5, doseUnit: 'mg' },
      { kind: 'weight', confidence: 1, weight: 80 },
    ]);
  });

  it('escalates a dose sentence with anything extra in it', () => {
    expect(parse('took sema this morning')).toBeNull();
  });
});

describe('parseDeterministic: confidence clears the auto-apply bar', () => {
  it('stamps every item as certain, since a literal match is not a guess', () => {
    const items = parse('weight 80, energy 4, sema');
    expect(items?.every((i) => i.confidence === 1)).toBe(true);
  });
});
