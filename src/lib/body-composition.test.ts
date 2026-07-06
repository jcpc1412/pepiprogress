import { describe, expect, it } from 'vitest';

import { bodyFatNavy, inferBodyComposition, BF_ERROR_MARGIN } from '@/lib/body-composition';

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

  it('uses the women formula when a hip circumference is supplied (higher %BF)', () => {
    const male = bodyFatNavy({ units: 'metric', heightCm: 165, waist: 75, neck: 32 });
    const female = bodyFatNavy({ units: 'metric', heightCm: 165, waist: 75, neck: 32, hip: 98 });
    expect(male).not.toBeNull();
    expect(female).not.toBeNull();
    expect(female!.pct).toBeGreaterThan(male!.pct);
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
    const r = bodyFatNavy({ units: 'metric', heightCm: 150, waist: 150, neck: 30, hip: 160 });
    expect(r!.pct).toBeLessThanOrEqual(60);
    expect(r!.low).toBeGreaterThanOrEqual(3);
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
