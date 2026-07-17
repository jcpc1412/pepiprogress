import { describe, expect, it } from 'vitest';

import { detectAnomalies } from '@/lib/anomaly';
import type { CheckinEntry, MetricReading } from '@/lib/store';

const today = '2026-07-16';

const reading = (metric: string, dateKey: string, value: number): MetricReading => ({
  id: `${metric}-${dateKey}`,
  metric,
  value,
  ts: `${dateKey}T00:00:00.000Z`,
  sourceProvider: 'apple_health',
});

const entry = (date: string, patch: Partial<CheckinEntry>): CheckinEntry => ({
  date,
  updatedAt: `${date}T20:00:00Z`,
  ...patch,
});

const days = (n: number, from = 15): string[] =>
  Array.from({ length: n }, (_, i) => `2026-07-${String(from - i).padStart(2, '0')}`);

describe('detectAnomalies', () => {
  it('flags a short sleep night against a stable baseline', () => {
    const readings = [
      ...days(7).map((d) => reading('sleep.duration', d, 7.5)),
      reading('sleep.duration', today, 5.2),
    ];
    const out = detectAnomalies({ entries: {}, metricReadings: readings, todayKey: today, excludedDates: new Set() });
    expect(out).toEqual([{ kind: 'sleep_short', dateKey: today, metric: 'sleep.duration' }]);
  });

  it('stays quiet without enough baseline', () => {
    const readings = [reading('sleep.duration', '2026-07-15', 7.5), reading('sleep.duration', today, 5)];
    expect(
      detectAnomalies({ entries: {}, metricReadings: readings, todayKey: today, excludedDates: new Set() }),
    ).toEqual([]);
  });

  it('explained days are excluded from the baseline AND never re-fire', () => {
    const readings = [
      ...days(7).map((d) => reading('sleep.duration', d, 7.5)),
      reading('sleep.duration', today, 5.2),
    ];
    // Today already explained: nothing fires.
    expect(
      detectAnomalies({ entries: {}, metricReadings: readings, todayKey: today, excludedDates: new Set([today]) }),
    ).toEqual([]);
    // A wild explained day inside the window does not drag the baseline.
    const withOutlier = [...readings.filter((r) => r.ts.slice(0, 10) !== '2026-07-12'), reading('sleep.duration', '2026-07-12', 2)];
    const out = detectAnomalies({
      entries: {},
      metricReadings: withOutlier,
      todayKey: today,
      excludedDates: new Set(['2026-07-12']),
    });
    expect(out.map((a) => a.kind)).toContain('sleep_short');
  });

  it('flags poor sleep quality and workout drops only against good baselines', () => {
    const entries: Record<string, CheckinEntry> = {};
    for (const d of days(7)) entries[d] = entry(d, { sleep_quality: 4, workout_effort: 4 });
    entries[today] = entry(today, { sleep_quality: 2, workout_effort: 2 });
    const out = detectAnomalies({ entries, metricReadings: [], todayKey: today, excludedDates: new Set() });
    expect(out.map((a) => a.kind).sort()).toEqual(['sleep_poor', 'workout_drop']);

    // A chronically low baseline never flags (nothing anomalous about it).
    for (const d of days(7)) entries[d] = entry(d, { sleep_quality: 2 });
    const quiet = detectAnomalies({ entries, metricReadings: [], todayKey: today, excludedDates: new Set() });
    expect(quiet.map((a) => a.kind)).not.toContain('sleep_poor');
  });

  it('flags a >= 1.5% weight jump in either direction', () => {
    const readings = [
      ...days(7).map((d) => reading('body.weight', d, 80)),
      reading('body.weight', today, 81.5),
    ];
    const out = detectAnomalies({ entries: {}, metricReadings: readings, todayKey: today, excludedDates: new Set() });
    expect(out).toEqual([{ kind: 'weight_jump', dateKey: today, metric: 'body.weight' }]);
  });
});
