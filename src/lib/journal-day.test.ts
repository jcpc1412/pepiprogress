import { describe, expect, it } from 'vitest';

import {
  checkinFieldSource,
  completeness,
  dayHasData,
  dosesForDay,
  metricReadingSource,
  photosForDay,
  symptomsForDay,
} from '@/lib/journal-day';
import type { CheckinEntry, DoseEvent, MetricReading, PhotoEntry, SymptomEvent } from '@/lib/store';

// A local-day mapper good enough for tests: the ISO strings below are authored so
// slice(0,10) is the intended local day (no TZ edge cases in the fixtures).
const dayKeyOf = (iso: string) => iso.slice(0, 10);

const dose = (id: string, takenAt: string): DoseEvent => ({ id, takenAt });
const symptom = (id: string, onsetAt: string): SymptomEvent => ({ id, type: 'nausea', onsetAt });
const photo = (id: string, takenAt: string): PhotoEntry => ({ id, session: 'body', uri: `f://${id}`, takenAt });

describe('per-day filtering', () => {
  it('returns only the day’s doses, earliest first', () => {
    const doses = [dose('a', '2026-07-20T09:00:00Z'), dose('b', '2026-07-21T21:00:00Z'), dose('c', '2026-07-21T08:00:00Z')];
    expect(dosesForDay(doses, '2026-07-21', dayKeyOf).map((d) => d.id)).toEqual(['c', 'b']);
  });

  it('filters symptoms and photos by day', () => {
    expect(symptomsForDay([symptom('s', '2026-07-21T10:00:00Z')], '2026-07-21', dayKeyOf)).toHaveLength(1);
    expect(symptomsForDay([symptom('s', '2026-07-20T10:00:00Z')], '2026-07-21', dayKeyOf)).toHaveLength(0);
    expect(photosForDay([photo('p', '2026-07-21T10:00:00Z')], '2026-07-21', dayKeyOf)).toHaveLength(1);
  });
});

describe('dayHasData', () => {
  const empty = { entries: {} as Record<string, CheckinEntry>, doses: [], symptoms: [], photos: [] };

  it('is false when nothing was logged', () => {
    expect(dayHasData('2026-07-21', empty, dayKeyOf)).toBe(false);
  });

  it('is true for a check-in, a dose, a symptom, or a photo', () => {
    const entry: CheckinEntry = { date: '2026-07-21', updatedAt: '2026-07-21T00:00:00Z' };
    expect(dayHasData('2026-07-21', { ...empty, entries: { '2026-07-21': entry } }, dayKeyOf)).toBe(true);
    expect(dayHasData('2026-07-21', { ...empty, doses: [dose('a', '2026-07-21T09:00:00Z')] }, dayKeyOf)).toBe(true);
    expect(dayHasData('2026-07-21', { ...empty, symptoms: [symptom('s', '2026-07-21T09:00:00Z')] }, dayKeyOf)).toBe(true);
    expect(dayHasData('2026-07-21', { ...empty, photos: [photo('p', '2026-07-21T09:00:00Z')] }, dayKeyOf)).toBe(true);
  });
});

describe('checkinFieldSource', () => {
  it('returns health only for autofilled fields, undefined otherwise', () => {
    const entry: CheckinEntry = { date: '2026-07-21', updatedAt: 'x', weight: 83, energy: 4, autoFilled: ['weight'] };
    expect(checkinFieldSource(entry, 'weight')).toBe('health');
    expect(checkinFieldSource(entry, 'energy')).toBeUndefined();
    expect(checkinFieldSource(undefined, 'weight')).toBeUndefined();
  });
});

describe('metricReadingSource', () => {
  const reading = (provider: string): MetricReading => ({ id: 'r', metric: 'sleep.duration', value: 7, ts: 'x', sourceProvider: provider });
  it('maps typical vs a real device', () => {
    expect(metricReadingSource(reading('typical'))).toBe('typical');
    expect(metricReadingSource(reading('apple_health'))).toBe('health');
  });
});

describe('completeness', () => {
  it('counts present tracked fields, ignoring blanks', () => {
    const entry: CheckinEntry = { date: '2026-07-21', updatedAt: 'x', weight: 83, energy: 4, skin_notes: '' };
    expect(completeness(entry, ['weight', 'energy', 'sleep_quality', 'skin_notes'])).toEqual({ filled: 2, total: 4 });
  });

  it('is 0 of N with no entry', () => {
    expect(completeness(undefined, ['weight', 'energy'])).toEqual({ filled: 0, total: 2 });
  });
});
