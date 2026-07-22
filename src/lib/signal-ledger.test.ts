import { describe, expect, it } from 'vitest';

import { extractLedger, metricExplainer, metricExplainerKey } from '@/lib/signal-ledger';
import type { CheckinEntry, DoseEvent, MetricReading, SymptomEvent } from '@/lib/store';

const entry = (date: string, o: Partial<CheckinEntry>): CheckinEntry => ({ date, updatedAt: `${date}T12:00:00Z`, ...o });
const reading = (metric: string, date: string, value: number): MetricReading => ({
  id: `${metric}-${date}`,
  metric,
  value,
  ts: `${date}T12:00:00.000Z`,
  sourceProvider: 'apple_health',
});

// Effect tags for the test compounds (injected, so no catalog dependency).
const EFFECT_TAGS: Record<string, string[]> = {
  semaglutide: ['fat_loss', 'appetite'], // fat-loss only → irrelevant to energy/sleep
  'bpc-157': ['healing', 'recovery'], // recovery → touches energy/soreness
  hcg: ['hormonal'], // never a fat-loss driver
};

describe('signal ledger (deterministic)', () => {
  const entries: Record<string, CheckinEntry> = {
    '2026-07-01': entry('2026-07-01', { workout_effort: 5 }), // hard workout
    '2026-07-02': entry('2026-07-02', { workout_effort: 1 }), // rest day
    '2026-07-03': entry('2026-07-03', { sleep_quality: 2 }), // poor sleep
    '2026-06-01': entry('2026-06-01', { workout_effort: 5 }), // outside window
  };
  const symptoms: SymptomEvent[] = [{ id: 'sy1', type: 'headache', onsetAt: '2026-07-02T08:00:00Z' }];
  const doses: DoseEvent[] = [
    { id: 'd1', compoundSlug: 'bpc-157', takenAt: '2026-07-03T09:00:00Z' },
    { id: 'd2', compoundSlug: 'semaglutide', takenAt: '2026-07-03T09:00:00Z' },
    { id: 'd3', compoundSlug: 'hcg', takenAt: '2026-07-03T09:00:00Z' },
  ];
  const readings: MetricReading[] = [
    reading('activity.workout_min', '2026-07-04', 45), // a real cardio session
    reading('activity.steps', '2026-07-04', 15000), // a step spike
    reading('activity.workout_min', '2026-06-01', 60), // outside window
  ];

  const base = {
    entries,
    symptomEvents: symptoms,
    doseEvents: doses,
    metricReadings: readings,
    windowStart: '2026-06-25',
    windowEnd: '2026-07-05',
    compoundEffectTags: (slug: string) => EFFECT_TAGS[slug],
  };

  it('extracts real in-window lifestyle events on a responsive metric, newest first', () => {
    const led = extractLedger({ metricId: 'energy', ...base });
    const kinds = led.map((e) => e.kind);
    expect(kinds).toContain('workout');
    expect(kinds).toContain('rest');
    expect(kinds).toContain('poor_sleep');
    expect(kinds).toContain('symptom');
    expect(led[0].ts >= led[led.length - 1].ts).toBe(true); // newest first
    expect(led.find((e) => e.id === 'w-2026-06-01')).toBeUndefined(); // out of window
  });

  it('relevance-filters doses by effect tag (Track C §4e)', () => {
    // Energy responds to recovery + hormonal, not fat-loss: the fat-loss-only
    // compound is filtered out, the recovery one stays.
    const energy = extractLedger({ metricId: 'energy', ...base });
    const energyDoses = energy.filter((e) => e.kind === 'dose').map((e) => e.labelParams?.compound);
    expect(energyDoses).toContain('bpc-157');
    expect(energyDoses).not.toContain('semaglutide');

    // A fat chart shows the fat-loss compound, never hCG (the owner's exact bug).
    const waist = extractLedger({ metricId: 'waist', ...base });
    const waistDoses = waist.filter((e) => e.kind === 'dose').map((e) => e.labelParams?.compound);
    expect(waistDoses).toContain('semaglutide');
    expect(waistDoses).not.toContain('hcg');
  });

  it('drops lifestyle rows a metric does not respond to (no "poor sleep" on body fat)', () => {
    const led = extractLedger({ metricId: 'waist', ...base });
    const kinds = led.map((e) => e.kind);
    expect(kinds).not.toContain('poor_sleep');
    expect(kinds).not.toContain('workout');
    expect(kinds).not.toContain('symptom');
  });

  it('surfaces integration movers: cardio + step spike (Track C §4e)', () => {
    // Body composition: cardio + steps as CONTEXT rows (no quantified impact).
    const waist = extractLedger({ metricId: 'waist', ...base });
    const cardio = waist.find((e) => e.kind === 'cardio')!;
    const steps = waist.find((e) => e.kind === 'steps')!;
    expect(cardio).toBeDefined();
    expect(cardio.impact).toBeUndefined();
    expect(steps).toBeDefined();
    expect(steps.impact).toBeUndefined();

    // Subjective metric: cardio carries a heuristic impact.
    const energy = extractLedger({ metricId: 'energy', ...base });
    const energyCardio = energy.find((e) => e.kind === 'cardio')!;
    expect(energyCardio).toBeDefined();
    expect(typeof energyCardio.impact).toBe('number');
  });

  it('gives lifestyle events an impact but never doses', () => {
    const led = extractLedger({ metricId: 'energy', ...base });
    const workout = led.find((e) => e.kind === 'workout')!;
    const dose = led.find((e) => e.kind === 'dose')!;
    expect(typeof workout.impact).toBe('number');
    expect(workout.impact).toBeLessThan(0);
    expect(dose.impact).toBeUndefined();
  });

  it('maps explainer keys with a default fallback', () => {
    expect(metricExplainerKey('energy')).toBe('signal.explain.energy');
    expect(metricExplainerKey('cv_strain')).toBe('signal.explain.default');
  });

  it('adds a goal-aware clause keyed to the resolved direction (Track C §4d)', () => {
    expect(metricExplainer('weight', 'down_good').goalKey).toBe('signal.goal.lower');
    expect(metricExplainer('weight', 'up_good').goalKey).toBe('signal.goal.higher');
    expect(metricExplainer('weight', 'neutral').goalKey).toBeUndefined();
    expect(metricExplainer('energy', 'up_good').explainKey).toBe('signal.explain.energy');
  });
});
