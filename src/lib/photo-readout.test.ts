import { describe, expect, it } from 'vitest';

import { quickReadout } from '@/lib/photo-readout';

describe('quickReadout', () => {
  it('reads a low tilt delta as comparable', () => {
    expect(quickReadout({ tiltDelta: 2 }).comparability).toBe('comparable');
  });

  it('degrades to partial then low as the tilt delta grows', () => {
    expect(quickReadout({ tiltDelta: 9 }).comparability).toBe('partial');
    expect(quickReadout({ tiltDelta: 20 }).comparability).toBe('low');
  });

  it('is partial (not falsely confident) when tilt is unknown', () => {
    expect(quickReadout({}).comparability).toBe('partial');
  });

  it('surfaces measurement changes above the noise floor, dropping tiny ones', () => {
    const r = quickReadout({
      tiltDelta: 1,
      measurementDelta: { waist: -1.5, hips: 0.05, extra: { key: 'thighs', delta: 0.8 } },
    });
    expect(r.changes.map((c) => c.metricKey)).toEqual(['measurements.waist', 'measurements.thighs']);
    expect(r.changes[0].delta).toBe(-1.5);
  });

  it('returns no changes when there is no measurement delta', () => {
    expect(quickReadout({ tiltDelta: 1 }).changes).toEqual([]);
  });
});
