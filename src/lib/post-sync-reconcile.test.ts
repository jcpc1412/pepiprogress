import { describe, expect, it } from 'vitest';

import type { CheckinField } from '@/lib/field-surfacing';
import { answerModeFor, reconcileAfterSync, type ReconcileInput } from '@/lib/post-sync-reconcile';
import type { CheckinEntry, MetricReading } from '@/lib/store';

const DATE = '2026-07-24';

/** Built from a LOCAL time so the fixture means the same thing in any timezone. */
function reading(metric: string, value: number, hour = 12): MetricReading {
  return {
    id: `${metric}-${hour}`,
    metric,
    value,
    ts: new Date(2026, 6, 24, hour).toISOString(),
    sourceProvider: 'apple_health',
  };
}

function entry(patch: Partial<CheckinEntry> = {}): CheckinEntry {
  return { date: DATE, updatedAt: `${DATE}T12:00:00.000Z`, ...patch };
}

const SURFACED: CheckinField[] = ['weight', 'calories', 'protein', 'workout_effort'];

function input(patch: Partial<ReconcileInput> = {}): ReconcileInput {
  return {
    surfacedFields: SURFACED,
    entry: undefined,
    readings: [],
    dateKey: DATE,
    units: 'metric',
    hour: 21,
    routineWindow: null,
    hasConnectedSource: true,
    ...patch,
  };
}

describe('reconcileAfterSync', () => {
  it('fills every field a source now covers', () => {
    const r = reconcileAfterSync(
      input({
        readings: [
          reading('body.weight', 82.34),
          reading('nutrition.energy', 2410.6),
          reading('nutrition.protein', 171.2),
        ],
      }),
    );
    expect(r.fill).toEqual({ weight: 82.3, calories: 2411, protein: 171 });
    expect(r.filled).toEqual(['weight', 'calories', 'protein']);
    expect(r.ask).toEqual(['workout_effort']);
  });

  it('converts weight into the user unit', () => {
    const r = reconcileAfterSync(input({ readings: [reading('body.weight', 80)], units: 'imperial' }));
    expect(r.fill.weight).toBe(176.4);
  });

  it('maps a 1-10 effort score onto the 1-5 field', () => {
    const r = reconcileAfterSync(input({ readings: [reading('activity.effort', 7)] }));
    expect(r.fill.workout_effort).toBe(4);
  });

  it('never overwrites a value the user typed', () => {
    const r = reconcileAfterSync(
      input({
        surfacedFields: ['calories'],
        entry: entry({ calories: 1800 }),
        readings: [reading('nutrition.energy', 2400)],
      }),
    );
    expect(r.fill).toEqual({});
    expect(r.ask).toEqual([]);
  });

  it('tracks a later re-sync of a field it filled itself', () => {
    const r = reconcileAfterSync(
      input({
        entry: entry({ calories: 1200, autoFilled: ['calories'] }),
        readings: [reading('nutrition.energy', 2400, 20)],
      }),
    );
    expect(r.fill).toEqual({ calories: 2400 });
  });

  it('asks only for fields a source was expected to cover', () => {
    // wellness has no integration source at all, so it stays the scheduled
    // micro check-in's job and never appears here.
    const r = reconcileAfterSync(input({ surfacedFields: ['wellness', 'calories'] }));
    expect(r.ask).toEqual(['calories']);
  });

  it('ignores fields the user does not have surfaced', () => {
    const r = reconcileAfterSync(input({ surfacedFields: ['calories'] }));
    expect(r.ask).toEqual(['calories']);
  });

  it('does not re-queue a field it already asked about today', () => {
    const r = reconcileAfterSync(input({ alreadyAsked: ['calories', 'protein'] }));
    expect(r.ask).toEqual(['weight', 'workout_effort']);
  });

  it('never asks when no health source is connected', () => {
    const r = reconcileAfterSync(input({ hasConnectedSource: false }));
    expect(r.ask).toEqual([]);
  });

  it('still fills from readings with no source connected (a manual import)', () => {
    const r = reconcileAfterSync(
      input({ hasConnectedSource: false, readings: [reading('nutrition.energy', 2000)] }),
    );
    expect(r.fill).toEqual({ calories: 2000 });
  });

  it('holds a routine-gated ask until the usual window has passed', () => {
    const morning = reconcileAfterSync(
      input({ hour: 10, routineWindow: { startHour: 18, endHour: 20, samples: 8 } }),
    );
    expect(morning.ask).not.toContain('workout_effort');

    const evening = reconcileAfterSync(
      input({ hour: 20, routineWindow: { startHour: 18, endHour: 20, samples: 8 } }),
    );
    expect(evening.ask).toContain('workout_effort');
  });

  it('asks a morning trainer in the morning', () => {
    const r = reconcileAfterSync(
      input({ hour: 9, routineWindow: { startHour: 6, endHour: 8, samples: 12 } }),
    );
    expect(r.ask).toContain('workout_effort');
  });
});

describe('answerModeFor', () => {
  it('knows which fields take chips and which take a typed number', () => {
    expect(answerModeFor('workout_effort')).toBe('scale');
    expect(answerModeFor('calories')).toBe('number');
    expect(answerModeFor('wellness')).toBeNull();
  });
});
