import { describe, expect, it } from 'vitest';

import { hasMonitoringGap, selectCompoundMonitoring } from './lab-monitoring';
import type { CheckinEntry, ProtocolItem } from './store';

const TODAY = '2026-07-17';

function checkin(date: string, labValues: Record<string, number>): CheckinEntry {
  return { date, labValues, updatedAt: `${date}T00:00:00.000Z` } as CheckinEntry;
}

describe('selectCompoundMonitoring', () => {
  it('lists testosterone bloodwork markers (hematocrit, estradiol, lipids)', () => {
    const markers = selectCompoundMonitoring('testosterone', {}, TODAY);
    expect(markers.map((m) => m.marker).sort()).toEqual(['estradiol', 'hematocrit', 'lipids']);
    expect(markers.every((m) => m.status === 'never')).toBe(true);
  });

  it('excludes symptom-monitoring tags (appetite/nausea are not lab markers)', () => {
    // tirzepatide monitoring tags are appetite + nausea + glucose; only glucose is a lab.
    const markers = selectCompoundMonitoring('tirzepatide', {}, TODAY);
    expect(markers.map((m) => m.marker)).toEqual(['glucose']);
  });

  it('surfaces the latest imported value and marks it recent when fresh', () => {
    const entries = {
      '2026-07-01': checkin('2026-07-01', { hematocrit: 48, estradiol: 30 }),
      '2026-06-01': checkin('2026-06-01', { hematocrit: 45 }),
    };
    const markers = selectCompoundMonitoring('testosterone', entries, TODAY);
    const hct = markers.find((m) => m.marker === 'hematocrit')!;
    expect(hct.value).toBe(48); // newest wins
    expect(hct.date).toBe('2026-07-01');
    expect(hct.status).toBe('recent');
    // lipids never imported
    expect(markers.find((m) => m.marker === 'lipids')!.status).toBe('never');
  });

  it('flags a value older than the stale threshold as stale', () => {
    const entries = { '2026-01-01': checkin('2026-01-01', { hematocrit: 44 }) };
    const hct = selectCompoundMonitoring('testosterone', entries, TODAY).find((m) => m.marker === 'hematocrit')!;
    expect(hct.status).toBe('stale');
    expect(hct.daysAgo).toBeGreaterThan(90);
  });

  it('returns nothing for a compound with no bloodwork monitoring tags', () => {
    expect(selectCompoundMonitoring('bpc-157', {}, TODAY)).toEqual([]);
  });
});

describe('hasMonitoringGap', () => {
  const testItem = { id: 'p1', compoundSlug: 'testosterone', frequency: 'weekly' } as ProtocolItem;

  it('is true when a watched marker was never checked', () => {
    expect(hasMonitoringGap([testItem], {}, TODAY)).toBe(true);
  });

  it('is false when every watched marker is recent', () => {
    const entries = {
      '2026-07-01': checkin('2026-07-01', { hematocrit: 48, estradiol: 30, lipids: 180 }),
    };
    expect(hasMonitoringGap([testItem], entries, TODAY)).toBe(false);
  });
});
