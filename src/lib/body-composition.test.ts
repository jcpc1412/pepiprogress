import { describe, expect, it } from 'vitest';

import {
  bodyFatNavy,
  inferBodyComposition,
  usesFemaleFormula,
  BF_ERROR_MARGIN,
} from '@/lib/body-composition';

describe('bodyFatNavy', () => {
  it('estimates a plausible male %BF (no hip) with error bars around it', () => {
    // 180 cm, waist 85, neck 38 → mid-teens body fat.
    const r = bodyFatNavy({ units: 'metric', heightCm: 180, waist: 85, neck: 38 });
    expect(r).not.toBeNull();
    expect(r!.pct).toBeGreaterThan(10);
    expect(r!.pct).toBeLessThan(22);
    expect(r!.high - r!.pct).toBeCloseTo(BF_ERROR_MARGIN, 5);
    expect(r!.pct - r!.low).toBeCloseTo(BF_ERROR_MARGIN, 5);
  });

  it('selects the formula by sex, not by whether a hip was supplied', () => {
    // A man who logs his hips must NOT jump to the women's formula (the old bug).
    const maleNoHip = bodyFatNavy({ units: 'metric', heightCm: 180, waist: 104, neck: 45.5 });
    const maleWithHip = bodyFatNavy({ units: 'metric', heightCm: 180, waist: 104, neck: 45.5, hip: 117 });
    expect(maleWithHip).not.toBeNull();
    expect(maleWithHip!.pct).toBeCloseTo(maleNoHip!.pct, 5); // hip ignored for men

    // The women's formula reads higher for the same circumferences.
    const female = bodyFatNavy({ units: 'metric', heightCm: 180, waist: 104, neck: 45.5, hip: 117, female: true });
    expect(female).not.toBeNull();
    expect(female!.pct).toBeGreaterThan(maleWithHip!.pct);
  });

  it('needs a hip for the women formula (null without it)', () => {
    expect(bodyFatNavy({ units: 'metric', heightCm: 165, waist: 75, neck: 32, female: true })).toBeNull();
    expect(bodyFatNavy({ units: 'metric', heightCm: 165, waist: 75, neck: 32, hip: 98, female: true })).not.toBeNull();
  });

  it('converts imperial inches to cm (same body, same result)', () => {
    const metric = bodyFatNavy({ units: 'metric', heightCm: 180, waist: 85, neck: 38 });
    const imperial = bodyFatNavy({
      units: 'imperial',
      heightCm: 180, // height always passed in cm by the caller
      waist: 85 / 2.54,
      neck: 38 / 2.54,
    });
    expect(imperial!.pct).toBeCloseTo(metric!.pct, 1);
  });

  it('returns null for out-of-domain or missing inputs', () => {
    expect(bodyFatNavy({ units: 'metric', heightCm: 180, waist: 38, neck: 40 })).toBeNull(); // neck > waist
    expect(bodyFatNavy({ units: 'metric', heightCm: 180, waist: 85 })).toBeNull(); // no neck
    expect(bodyFatNavy({ units: 'metric', waist: 85, neck: 38 })).toBeNull(); // no height
  });

  it('clamps to a sane 3–60% range', () => {
    const r = bodyFatNavy({ units: 'metric', heightCm: 150, waist: 150, neck: 30, hip: 160, female: true });
    expect(r!.pct).toBeLessThanOrEqual(60);
    expect(r!.low).toBeGreaterThanOrEqual(3);
  });
});

describe('usesFemaleFormula', () => {
  it('follows hormones: female + mtf use the female formula; male/ftm/unknown do not', () => {
    expect(usesFemaleFormula('female')).toBe(true);
    expect(usesFemaleFormula('mtf')).toBe(true);
    expect(usesFemaleFormula('male')).toBe(false);
    expect(usesFemaleFormula('ftm')).toBe(false);
    expect(usesFemaleFormula(undefined)).toBe(false);
  });
});

describe('inferBodyComposition', () => {
  it('bands male body fat', () => {
    expect(inferBodyComposition(10, false)).toBe('lean');
    expect(inferBodyComposition(16, false)).toBe('fit');
    expect(inferBodyComposition(22, false)).toBe('average');
    expect(inferBodyComposition(30, false)).toBe('higher');
  });

  it('uses higher healthy thresholds for women', () => {
    // 24% reads as "average" for men but "fit" for women.
    expect(inferBodyComposition(24, false)).toBe('average');
    expect(inferBodyComposition(24, true)).toBe('fit');
  });
});
