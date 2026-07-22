import { describe, expect, it } from 'vitest';

import { BODY_COMP_METRICS, doseRelevantToMetric, metricsForEffectTags } from '@/lib/metric-relevance';

describe('metric relevance', () => {
  it('maps effect tags to the metrics they touch (incl. body_fat_pct)', () => {
    const m = metricsForEffectTags(['fat_loss']);
    expect(m.has('weight')).toBe(true);
    expect(m.has('body_fat_pct')).toBe(true);
    expect(m.has('energy')).toBe(false);
  });

  it('a fat-loss compound is relevant to a fat chart, not to sleep', () => {
    expect(doseRelevantToMetric(['fat_loss'], 'waist')).toBe(true);
    expect(doseRelevantToMetric(['fat_loss'], 'sleep_quality')).toBe(false);
  });

  it('unknown/untagged compounds stay visible (never hide a real event)', () => {
    expect(doseRelevantToMetric(undefined, 'waist')).toBe(true);
    expect(doseRelevantToMetric([], 'energy')).toBe(true);
  });

  it('body-composition metrics are the ones with unquantifiable per-event movers', () => {
    expect(BODY_COMP_METRICS.has('body_fat_pct')).toBe(true);
    expect(BODY_COMP_METRICS.has('energy')).toBe(false);
  });
});
