import { describe, expect, it } from 'vitest';

import {
  bodyFatNavy,
  ffmiBand,
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

describe('ffmiBand', () => {
  it('returns a normalized FFMI range that inverts the body-fat band', () => {
    // 80 kg, 180 cm, body-fat 15% (band 11–19). At 1.8 m the normalization is 0.
    const band = ffmiBand({ weightKg: 80, heightCm: 180, bf: { pct: 15, low: 11, high: 19 } })!;
    expect(band).not.toBeNull();
    // low bf → more lean → higher FFMI; ~20.0 to ~22.0.
    expect(band.low).toBeGreaterThan(19);
    expect(band.high).toBeLessThan(23);
    expect(band.high).toBeGreaterThan(band.low);
  });

  it('applies the height normalization for a shorter athlete', () => {
    // 70 kg, 165 cm adds +6.1*(1.8-1.65)=+0.915 to the raw index.
    const band = ffmiBand({ weightKg: 70, heightCm: 165, bf: { pct: 15, low: 12, high: 18 } })!;
    const hM = 1.65;
    const rawHigh = (70 * 0.88) / (hM * hM) + 6.1 * (1.8 - hM);
    expect(band.high).toBeCloseTo(Math.round(rawHigh * 10) / 10, 1);
  });

  it('is null without weight or height', () => {
    expect(ffmiBand({ weightKg: 0, heightCm: 180, bf: { pct: 15, low: 11, high: 19 } })).toBeNull();
    expect(ffmiBand({ weightKg: 80, heightCm: undefined, bf: { pct: 15, low: 11, high: 19 } })).toBeNull();
  });
});
