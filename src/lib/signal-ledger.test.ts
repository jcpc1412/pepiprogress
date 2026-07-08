import { describe, expect, it } from 'vitest';

import { extractLedger, metricExplainerKey } from '@/lib/signal-ledger';
import type { CheckinEntry, DoseEvent, SymptomEvent } from '@/lib/store';

const entry = (date: string, o: Partial<CheckinEntry>): CheckinEntry => ({ date, updatedAt: `${date}T12:00:00Z`, ...o });

describe('signal ledger (deterministic)', () => {
  const entries: Record<string, CheckinEntry> = {
    '2026-07-01': entry('2026-07-01', { workout_effort: 5 }), // hard workout
    '2026-07-02': entry('2026-07-02', { workout_effort: 1 }), // rest day
    '2026-07-03': entry('2026-07-03', { sleep_quality: 2 }), // poor sleep
    '2026-06-01': entry('2026-06-01', { workout_effort: 5 }), // outside window
  };
  const symptoms: SymptomEvent[] = [{ id: 'sy1', type: 'headache', onsetAt: '2026-07-02T08:00:00Z' }];
  const doses: DoseEvent[] = [{ id: 'd1', compoundSlug: 'semaglutide', takenAt: '2026-07-03T09:00:00Z' }];

  const base = { entries, symptomEvents: symptoms, doseEvents: doses, windowStart: '2026-06-25', windowEnd: '2026-07-05' };

  it('extracts real in-window events, newest first, excluding out-of-window', () => {
    const led = extractLedger({ metricId: 'energy', ...base });
    const kinds = led.map((e) => e.kind);
    expect(kinds).toContain('workout');
    expect(kinds).toContain('rest');
    expect(kinds).toContain('poor_sleep');
    expect(kinds).toContain('symptom');
    expect(kinds).toContain('dose');
    // Newest first.
    expect(led[0].ts >= led[led.length - 1].ts).toBe(true);
    // The June workout is outside the window.
    expect(led.find((e) => e.id === 'w-2026-06-01')).toBeUndefined();
  });

  it('gives lifestyle events an impact but never doses', () => {
    const led = extractLedger({ metricId: 'energy', ...base });
    const workout = led.find((e) => e.kind === 'workout')!;
    const dose = led.find((e) => e.kind === 'dose')!;
    expect(typeof workout.impact).toBe('number');
    expect(workout.impact).toBeLessThan(0); // a hard workout drops same-day energy
    expect(dose.impact).toBeUndefined(); // context row, no efficacy claim
  });

  it('omits impacts for body-composition metrics (too noisy to attribute)', () => {
    const led = extractLedger({ metricId: 'waist', ...base });
    for (const e of led) if (e.kind !== 'dose') expect(e.impact).toBeUndefined();
  });

  it('maps explainer keys with a default fallback', () => {
    expect(metricExplainerKey('energy')).toBe('signal.explain.energy');
    expect(metricExplainerKey('cv_strain')).toBe('signal.explain.default');
  });
});
