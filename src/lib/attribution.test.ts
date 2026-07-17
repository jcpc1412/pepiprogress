import { describe, expect, it } from 'vitest';

import { computeAttributions } from './attribution';
import type { CheckinEntry, MetricReading, ProtocolItem } from './store';

const START = '2026-06-01';
const TODAY = '2026-06-29'; // 4 weeks in

function protocolItem(slug: string, startedAt = START): ProtocolItem {
  return {
    id: `pi-${slug}`,
    compoundSlug: slug,
    startedAt,
    frequency: 'daily',
  } as ProtocolItem;
}

/** Build a run of daily check-ins from a per-field value function. */
function checkins(
  from: string,
  to: string,
  fields: (dateKey: string) => Partial<CheckinEntry>,
): Record<string, CheckinEntry> {
  const out: Record<string, CheckinEntry> = {};
  let t = new Date(`${from}T00:00:00.000Z`).getTime();
  const end = new Date(`${to}T00:00:00.000Z`).getTime();
  while (t <= end) {
    const dateKey = new Date(t).toISOString().slice(0, 10);
    out[dateKey] = { date: dateKey, ...fields(dateKey) } as CheckinEntry;
    t += 24 * 60 * 60 * 1000;
  }
  return out;
}

const NO_READINGS: MetricReading[] = [];

describe('computeAttributions', () => {
  it('attributes a clean weight drop to the compound when nothing else moved', () => {
    // semaglutide (fat_loss): weight falls after start, intake + training flat.
    const entries = checkins('2026-05-15', TODAY, (d) => ({
      weight: d < START ? 90 : 87, // clean 3kg drop at the start boundary
      calories: 2200,
      workout_effort: 3,
    }));
    const res = computeAttributions({
      entries,
      metricReadings: NO_READINGS,
      protocolItems: [protocolItem('semaglutide')],
      today: TODAY,
    });
    expect(res).toHaveLength(1);
    const weight = res[0].metrics.find((m) => m.metricId === 'weight')!;
    expect(weight).toBeDefined();
    expect(weight.delta).toBeLessThan(0);
    expect(weight.favourable).toBe(true); // fat_loss wants weight down
    expect(res[0].weeksIn).toBe(4);
    // No concurrent shift => compound leads.
    expect(weight.factors[0].factor).toBe('compound');
  });

  it('ranks a concurrent calorie deficit ABOVE the compound (competing explanation)', () => {
    // Weight falls, but intake also dropped ~700 kcal at the same time.
    const entries = checkins('2026-05-15', TODAY, (d) => ({
      weight: d < START ? 90 : 87,
      calories: d < START ? 2600 : 1900,
      workout_effort: 3,
    }));
    const res = computeAttributions({
      entries,
      metricReadings: NO_READINGS,
      protocolItems: [protocolItem('semaglutide')],
      today: TODAY,
    });
    const weight = res[0].metrics.find((m) => m.metricId === 'weight')!;
    expect(weight.factors[0].factor).toBe('nutrition');
    const compound = weight.factors.find((f) => f.factor === 'compound')!;
    const nutrition = weight.factors.find((f) => f.factor === 'nutrition')!;
    expect(nutrition.strength).toBeGreaterThan(compound.strength);
  });

  it('only attributes metrics the compound plausibly affects', () => {
    // BPC-157 (healing/recovery/gut): should touch soreness, never weight.
    const entries = checkins('2026-05-15', TODAY, (d) => ({
      weight: d < START ? 90 : 85, // big weight move, but irrelevant to BPC-157
      soreness: d < START ? 4 : 2,
    }));
    const res = computeAttributions({
      entries,
      metricReadings: NO_READINGS,
      protocolItems: [protocolItem('bpc-157')],
      today: TODAY,
    });
    const ids = res[0].metrics.map((m) => m.metricId);
    expect(ids).toContain('soreness');
    expect(ids).not.toContain('weight');
  });

  it('says nothing when there are too few points on one side', () => {
    // Only 2 days before the start: below MIN_POINTS.
    const entries = checkins('2026-05-30', TODAY, (d) => ({
      soreness: d < START ? 4 : 2,
    }));
    const res = computeAttributions({
      entries,
      metricReadings: NO_READINGS,
      protocolItems: [protocolItem('bpc-157')],
      today: TODAY,
    });
    expect(res).toHaveLength(0);
  });

  it('ignores a move below the meaningful threshold', () => {
    // soreness barely moves (0.2 < 0.5 threshold).
    const entries = checkins('2026-05-15', TODAY, (d) => ({
      soreness: d < START ? 3.0 : 2.9,
    }));
    const res = computeAttributions({
      entries,
      metricReadings: NO_READINGS,
      protocolItems: [protocolItem('bpc-157')],
      today: TODAY,
    });
    expect(res).toHaveLength(0);
  });

  it('skips compounds started under a week ago', () => {
    const entries = checkins('2026-05-15', TODAY, (d) => ({ soreness: d < '2026-06-25' ? 4 : 2 }));
    const res = computeAttributions({
      entries,
      metricReadings: NO_READINGS,
      protocolItems: [protocolItem('bpc-157', '2026-06-25')], // 4 days in
      today: TODAY,
    });
    expect(res).toHaveLength(0);
  });

  it('merges integration weight readings with manual check-ins', () => {
    // No manual weight; weight arrives as body.weight readings only.
    const entries = checkins('2026-05-15', TODAY, () => ({ calories: 2200, workout_effort: 3 }));
    const readings: MetricReading[] = [];
    let t = new Date('2026-05-15T00:00:00.000Z').getTime();
    const end = new Date(`${TODAY}T00:00:00.000Z`).getTime();
    while (t <= end) {
      const dateKey = new Date(t).toISOString().slice(0, 10);
      readings.push({
        id: `r-${dateKey}`,
        metric: 'body.weight',
        value: dateKey < START ? 90 : 87,
        ts: `${dateKey}T08:00:00.000Z`,
      } as MetricReading);
      t += 24 * 60 * 60 * 1000;
    }
    const res = computeAttributions({
      entries,
      metricReadings: readings,
      protocolItems: [protocolItem('semaglutide')],
      today: TODAY,
    });
    expect(res[0].metrics.some((m) => m.metricId === 'weight')).toBe(true);
  });
});
