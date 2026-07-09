import { describe, expect, it } from 'vitest';

import type { MetricReading } from '@/lib/store';
import {
  baselineFor,
  buildTypicalReadings,
  currentTypicalLevel,
  groupDataPointsInWindow,
  groupHasValueForDate,
  hasHigherPrecedence,
  matchTypicalDeviation,
  typicalPromptEligible,
  TYPICAL_SILENT_CONFIDENCE,
  TYPICAL_SOURCE,
  TYPICAL_TAP_CONFIDENCE,
  validateTypicalValue,
  withoutTypicalForDate,
  withoutTypicalForGroup,
  withoutTypicalMetric,
  type TypicalBaseline,
  TYPICAL_GROUPS,
} from '@/lib/typical-day';

const NUTRITION: TypicalBaseline = {
  group: 'nutrition',
  values: { 'nutrition.energy': 2600, 'nutrition.protein': 150 },
  setAt: '2026-07-01T00:00:00.000Z',
  enabled: true,
};

const reading = (over: Partial<MetricReading>): MetricReading => ({
  id: Math.random().toString(36).slice(2),
  metric: 'nutrition.energy',
  value: 2600,
  ts: '2026-07-08T12:00:00.000Z',
  sourceProvider: TYPICAL_SOURCE,
  ...over,
});

describe('validateTypicalValue', () => {
  const cal = TYPICAL_GROUPS.nutrition.metrics[0];
  it('accepts in-range and rounds to 1dp', () => {
    expect(validateTypicalValue(cal, 2633.34)).toBe(2633.3);
  });
  it('rejects out of range + non-finite', () => {
    expect(validateTypicalValue(cal, 100)).toBeNull();
    expect(validateTypicalValue(cal, 20000)).toBeNull();
    expect(validateTypicalValue(cal, NaN)).toBeNull();
  });
});

describe('buildTypicalReadings', () => {
  it('scales the whole group by the level multiplier', () => {
    const more = buildTypicalReadings({
      baseline: NUTRITION,
      dateKey: '2026-07-08',
      level: 'more',
      confidence: TYPICAL_TAP_CONFIDENCE,
      readings: [],
    });
    expect(more).toHaveLength(2);
    const energy = more.find((r) => r.metric === 'nutrition.energy')!;
    const protein = more.find((r) => r.metric === 'nutrition.protein')!;
    expect(energy.value).toBe(3250); // 2600 * 1.25
    expect(protein.value).toBe(187.5); // 150 * 1.25
    expect(energy.sourceProvider).toBe(TYPICAL_SOURCE);
    expect(energy.confidence).toBe(TYPICAL_TAP_CONFIDENCE);
    expect(energy.ts).toBe('2026-07-08T12:00:00.000Z');
  });

  it('less multiplies by 0.75', () => {
    const less = buildTypicalReadings({
      baseline: NUTRITION,
      dateKey: '2026-07-08',
      level: 'less',
      confidence: TYPICAL_TAP_CONFIDENCE,
      readings: [],
    });
    expect(less.find((r) => r.metric === 'nutrition.energy')!.value).toBe(1950);
  });

  it('skips a metric with a manual check-in value (precedence)', () => {
    const out = buildTypicalReadings({
      baseline: NUTRITION,
      dateKey: '2026-07-08',
      level: 'usual',
      confidence: TYPICAL_TAP_CONFIDENCE,
      readings: [],
      checkinValues: { calories: 3000 },
    });
    // energy skipped (manual), protein still written
    expect(out.map((r) => r.metric)).toEqual(['nutrition.protein']);
  });

  it('skips a metric with a synced (non-typical) reading that day', () => {
    const synced = reading({ metric: 'nutrition.protein', value: 200, sourceProvider: 'apple_health' });
    const out = buildTypicalReadings({
      baseline: NUTRITION,
      dateKey: '2026-07-08',
      level: 'usual',
      confidence: TYPICAL_TAP_CONFIDENCE,
      readings: [synced],
    });
    expect(out.map((r) => r.metric)).toEqual(['nutrition.energy']);
  });
});

describe('hasHigherPrecedence', () => {
  it('manual check-in value wins', () => {
    expect(
      hasHigherPrecedence({ metric: 'nutrition.energy', dateKey: '2026-07-08', readings: [], checkinValue: 2500 }),
    ).toBe(true);
  });
  it('typical readings do not count as higher precedence', () => {
    expect(
      hasHigherPrecedence({ metric: 'nutrition.energy', dateKey: '2026-07-08', readings: [reading({})] }),
    ).toBe(false);
  });
  it('synced reading on the same day wins', () => {
    expect(
      hasHigherPrecedence({
        metric: 'nutrition.energy',
        dateKey: '2026-07-08',
        readings: [reading({ sourceProvider: 'apple_health' })],
      }),
    ).toBe(true);
  });
});

describe('reading removal helpers', () => {
  const readings: MetricReading[] = [
    reading({ id: 'a', metric: 'nutrition.energy', ts: '2026-07-08T12:00:00.000Z' }),
    reading({ id: 'b', metric: 'nutrition.protein', ts: '2026-07-08T12:00:00.000Z' }),
    reading({ id: 'c', metric: 'nutrition.energy', ts: '2026-07-07T12:00:00.000Z' }),
    reading({ id: 'd', metric: 'nutrition.energy', ts: '2026-07-08T12:00:00.000Z', sourceProvider: 'apple_health' }),
  ];
  it('withoutTypicalForDate drops only typical rows on that date', () => {
    const out = withoutTypicalForDate(readings, 'nutrition', '2026-07-08');
    expect(out.map((r) => r.id).sort()).toEqual(['c', 'd']);
  });
  it('withoutTypicalForGroup drops all typical nutrition rows', () => {
    const out = withoutTypicalForGroup(readings, 'nutrition');
    expect(out.map((r) => r.id).sort()).toEqual(['d']);
  });
  it('withoutTypicalMetric drops a single metric+date typical row', () => {
    const out = withoutTypicalMetric(readings, 'nutrition.energy', '2026-07-08');
    expect(out.map((r) => r.id).sort()).toEqual(['b', 'c', 'd']);
  });
});

describe('currentTypicalLevel', () => {
  it('infers the level from the ratio to the baseline', () => {
    expect(currentTypicalLevel([reading({ value: 2600 })], NUTRITION, '2026-07-08')).toBe('usual');
    expect(currentTypicalLevel([reading({ value: 1950 })], NUTRITION, '2026-07-08')).toBe('less');
    expect(currentTypicalLevel([reading({ value: 3250 })], NUTRITION, '2026-07-08')).toBe('more');
  });
  it('null when no typical reading present', () => {
    expect(currentTypicalLevel([], NUTRITION, '2026-07-08')).toBeNull();
  });
});

describe('groupHasValueForDate + points in window', () => {
  it('detects manual + synced values', () => {
    expect(
      groupHasValueForDate({ group: 'nutrition', dateKey: '2026-07-08', readings: [], checkinValues: { calories: 2000 } }),
    ).toBe(true);
    expect(
      groupHasValueForDate({ group: 'nutrition', dateKey: '2026-07-08', readings: [reading({ sourceProvider: 'apple_health' })] }),
    ).toBe(true);
    expect(groupHasValueForDate({ group: 'nutrition', dateKey: '2026-07-08', readings: [] })).toBe(false);
  });
  it('counts distinct real-data days, ignoring typical', () => {
    const points = groupDataPointsInWindow({
      group: 'nutrition',
      readings: [
        reading({ ts: '2026-07-08T12:00:00.000Z', sourceProvider: 'apple_health' }),
        reading({ ts: '2026-07-07T12:00:00.000Z' }), // typical → ignored
      ],
      entries: { '2026-07-06': { calories: 2100 } },
      windowStart: '2026-07-01',
      windowEnd: '2026-07-08',
    });
    expect(points).toBe(2); // 07-08 synced + 07-06 manual; 07-07 typical excluded
  });
});

describe('typicalPromptEligible', () => {
  const base = { relevant: true, status: undefined, dataPoints: 0, daysSinceFirstEntry: 10, integrationSupplies: false };
  it('eligible on the happy path', () => {
    expect(typicalPromptEligible(base)).toBe(true);
  });
  it('blocked by each guard', () => {
    expect(typicalPromptEligible({ ...base, relevant: false })).toBe(false);
    expect(typicalPromptEligible({ ...base, status: 'declined' })).toBe(false);
    expect(typicalPromptEligible({ ...base, dataPoints: 3 })).toBe(false);
    expect(typicalPromptEligible({ ...base, daysSinceFirstEntry: 6 })).toBe(false);
    expect(typicalPromptEligible({ ...base, integrationSupplies: true })).toBe(false);
  });
});

describe('matchTypicalDeviation', () => {
  it('matches nutrition more/less when active', () => {
    expect(matchTypicalDeviation('ate way more than usual today', ['nutrition'])).toEqual({ group: 'nutrition', level: 'more' });
    expect(matchTypicalDeviation('light eating day', ['nutrition'])).toEqual({ group: 'nutrition', level: 'less' });
  });
  it('matches sleep when active', () => {
    expect(matchTypicalDeviation('slept less than usual', ['sleep'])).toEqual({ group: 'sleep', level: 'less' });
  });
  it('null when the group is not active or no deviation word', () => {
    expect(matchTypicalDeviation('ate more', ['sleep'])).toBeNull();
    expect(matchTypicalDeviation('normal day', ['nutrition'])).toBeNull();
  });
});

describe('baselineFor + confidences', () => {
  it('returns only enabled baselines', () => {
    expect(baselineFor([NUTRITION], 'nutrition')).toBe(NUTRITION);
    expect(baselineFor([{ ...NUTRITION, enabled: false }], 'nutrition')).toBeUndefined();
  });
  it('confidence constants', () => {
    expect(TYPICAL_TAP_CONFIDENCE).toBeGreaterThan(TYPICAL_SILENT_CONFIDENCE);
  });
});
