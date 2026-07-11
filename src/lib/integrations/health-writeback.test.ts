import { describe, expect, it } from 'vitest';

import { buildBodySamples, hashSamples } from '@/lib/integrations/health-writeback';
import type { CheckinEntry, LocalProfile } from '@/lib/store';

const baseProfile: LocalProfile = {
  units: 'metric',
  goals: [],
  compoundSlugs: [],
  onboardingComplete: true,
  sex: 'male',
  height: 180,
};

function checkin(patch: Partial<CheckinEntry>): CheckinEntry {
  return { date: '2026-07-11', updatedAt: '2026-07-11T00:00:00Z', ...patch };
}

describe('buildBodySamples', () => {
  it('mirrors metric weight in kg and waist in cm at local noon', () => {
    const s = buildBodySamples(checkin({ weight: 80, waist: 85 }), baseProfile);
    const weight = s.find((x) => x.metric === 'body.weight');
    const waist = s.find((x) => x.metric === 'body.waist');
    expect(weight).toEqual({ metric: 'body.weight', value: 80, ts: '2026-07-11T12:00:00' });
    expect(waist?.value).toBe(85);
  });

  it('converts imperial weight (lb) to kg and waist (in) to cm', () => {
    const imperial: LocalProfile = { ...baseProfile, units: 'imperial', height: 71 };
    const s = buildBodySamples(checkin({ weight: 176.37, waist: 33.46 }), imperial);
    const weight = s.find((x) => x.metric === 'body.weight');
    const waist = s.find((x) => x.metric === 'body.waist');
    expect(weight?.value).toBeCloseTo(80, 1);
    expect(waist?.value).toBeCloseTo(85, 1);
  });

  it('includes the computed body-fat % when Navy inputs are present', () => {
    const s = buildBodySamples(checkin({ weight: 80, waist: 85, neck: 38 }), baseProfile);
    const bf = s.find((x) => x.metric === 'body.fat_pct');
    expect(bf).toBeDefined();
    expect(bf!.value).toBeGreaterThan(3);
    expect(bf!.value).toBeLessThan(60);
  });

  it('omits body-fat when neck is missing (no honest estimate)', () => {
    const s = buildBodySamples(checkin({ weight: 80, waist: 85 }), baseProfile);
    expect(s.some((x) => x.metric === 'body.fat_pct')).toBe(false);
  });

  it('produces nothing for a check-in with no body data', () => {
    expect(buildBodySamples(checkin({ energy: 4 }), baseProfile)).toEqual([]);
  });
});

describe('hashSamples', () => {
  it('is order-independent and changes when a value changes', () => {
    const a = buildBodySamples(checkin({ weight: 80, waist: 85 }), baseProfile);
    const b = buildBodySamples(checkin({ waist: 85, weight: 80 }), baseProfile);
    expect(hashSamples(a)).toBe(hashSamples(b));
    const c = buildBodySamples(checkin({ weight: 81, waist: 85 }), baseProfile);
    expect(hashSamples(a)).not.toBe(hashSamples(c));
  });
});
