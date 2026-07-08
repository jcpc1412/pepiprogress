import { describe, expect, it } from 'vitest';

import { EVENING_HOUR, fieldTime, partitionByTime, type CheckinField } from '@/lib/field-surfacing';

describe('fieldTime', () => {
  it('tags morning rituals, evening tallies, and any-time fields', () => {
    expect(fieldTime('sleep_quality')).toBe('morning');
    expect(fieldTime('weight')).toBe('morning');
    expect(fieldTime('workout_effort')).toBe('evening');
    expect(fieldTime('calories')).toBe('evening');
    expect(fieldTime('wellness')).toBe('any');
    expect(fieldTime('note')).toBe('any');
  });
});

describe('partitionByTime', () => {
  const fields: CheckinField[] = [
    'weight',
    'sleep_quality',
    'wellness',
    'energy',
    'workout_effort',
    'note',
  ];

  it('before the evening hour: morning + any primary, evening deferred', () => {
    const { primary, deferred, deferredIsEvening } = partitionByTime(fields, EVENING_HOUR - 1);
    expect(primary).toEqual(['weight', 'sleep_quality', 'wellness', 'energy', 'note']);
    expect(deferred).toEqual(['workout_effort']);
    expect(deferredIsEvening).toBe(true);
  });

  it('at/after the evening hour: evening + any primary, morning deferred', () => {
    const { primary, deferred, deferredIsEvening } = partitionByTime(fields, EVENING_HOUR);
    expect(primary).toEqual(['wellness', 'energy', 'workout_effort', 'note']);
    expect(deferred).toEqual(['weight', 'sleep_quality']);
    expect(deferredIsEvening).toBe(false);
  });

  it('preserves the input order within each set', () => {
    const { primary } = partitionByTime(['note', 'wellness', 'energy'], 9);
    expect(primary).toEqual(['note', 'wellness', 'energy']);
  });
});
