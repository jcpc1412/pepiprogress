import { describe, expect, it } from 'vitest';

import { metricForDate, weightInUnits } from '@/lib/integrations/autofill';
import type { MetricReading } from '@/lib/store';

function reading(id: string, at: Date, metric = 'body.weight', value = 80): MetricReading {
  return { id, metric, value, ts: at.toISOString(), sourceProvider: 'apple_health' };
}

describe('metricForDate', () => {
  it('takes the latest reading of the day', () => {
    const readings = [
      reading('early', new Date(2026, 6, 24, 7)),
      reading('late', new Date(2026, 6, 24, 19)),
    ];
    expect(metricForDate(readings, 'body.weight', '2026-07-24')?.id).toBe('late');
  });

  it('matches on the local day, not the UTC date prefix', () => {
    // Providers stamp UTC. Late-evening readings west of UTC and early-morning
    // readings east of it land on the neighbouring UTC date, and a string-prefix
    // match would report them missing on the day the user actually logged them.
    const lateEvening = reading('evening', new Date(2026, 6, 24, 23, 30));
    const earlyMorning = reading('morning', new Date(2026, 6, 24, 0, 30));
    expect(metricForDate([lateEvening], 'body.weight', '2026-07-24')?.id).toBe('evening');
    expect(metricForDate([earlyMorning], 'body.weight', '2026-07-24')?.id).toBe('morning');
  });

  it('excludes neighbouring local days', () => {
    const readings = [
      reading('yesterday', new Date(2026, 6, 23, 12)),
      reading('tomorrow', new Date(2026, 6, 25, 12)),
    ];
    expect(metricForDate(readings, 'body.weight', '2026-07-24')).toBeUndefined();
  });

  it('ignores other metrics and unparseable timestamps', () => {
    const readings = [
      reading('other', new Date(2026, 6, 24, 12), 'nutrition.energy'),
      { id: 'bad', metric: 'body.weight', value: 80, ts: 'not-a-date', sourceProvider: 'x' },
    ];
    expect(metricForDate(readings, 'body.weight', '2026-07-24')).toBeUndefined();
  });
});

describe('weightInUnits', () => {
  it('passes kg through and converts to pounds', () => {
    expect(weightInUnits(82.34, 'metric')).toBe(82.3);
    expect(weightInUnits(80, 'imperial')).toBe(176.4);
  });
});
