import { describe, expect, it } from 'vitest';

import {
  buildInsightHistory,
  selectMetricDirections,
  selectPhotoDigest,
  selectProtocolContext,
} from '@/lib/data-facade';
import type { CheckinEntry, LocalProfile, MetricReading, PhotoEntry } from '@/lib/store';

const profile = (over: Partial<LocalProfile> = {}): LocalProfile => ({
  units: 'metric',
  goals: [],
  compoundSlugs: [],
  onboardingComplete: true,
  addedFields: [],
  removedFields: [],
  estimatedMetricsMode: 'fill',
  ...over,
});

const baseInput = (over: Partial<Parameters<typeof buildInsightHistory>[0]> = {}) => ({
  entries: {},
  metricReadings: [],
  protocolItems: [],
  doseEvents: [],
  symptomEvents: [],
  photos: [] as PhotoEntry[],
  profile: profile(),
  ...over,
});

describe('selectMetricDirections (A-1: shared goal-direction rule)', () => {
  it('male fat-loss: body-comp is down-good, so rising hips is never a good sign', () => {
    const dirs = selectMetricDirections({
      protocolItems: [],
      profile: profile({ goals: ['weight_loss'], sex: 'male' }),
    } as never);
    expect(dirs.hips).toBe('down_good');
    expect(dirs.waist).toBe('down_good');
    expect(dirs.body_fat_pct).toBe('down_good');
    expect(dirs.weight).toBe('down_good');
    expect(dirs.caloric_balance).toBe('down_good');
    expect(dirs.energy).toBe('up_good');
    expect(dirs.soreness).toBe('up_good'); // `soreness` id = Recovery, up_good (A1)
  });

  it('no goals: context metrics are neutral (no decisive intent)', () => {
    const dirs = selectMetricDirections({ protocolItems: [], profile: profile() } as never);
    expect(dirs.weight).toBe('neutral');
    expect(dirs.hips).toBe('neutral');
    // Subjective metrics keep an inherent direction.
    expect(dirs.energy).toBe('up_good');
  });
});

describe('buildInsightHistory (A-3 + A-1)', () => {
  const today = '2026-07-10';

  it('annotates charted metrics with their goal direction', () => {
    const entries: Record<string, CheckinEntry> = {
      '2026-07-09': { date: '2026-07-09', weight: 120, updatedAt: '2026-07-09T12:00:00.000Z' },
      '2026-07-08': { date: '2026-07-08', weight: 121, updatedAt: '2026-07-08T12:00:00.000Z' },
      '2026-07-07': { date: '2026-07-07', weight: 122, updatedAt: '2026-07-07T12:00:00.000Z' },
    };
    const h = buildInsightHistory(
      baseInput({ entries, profile: profile({ goals: ['weight_loss'] }) }),
      today,
    );
    const weightRows = h.metrics.filter((m) => m.metric.startsWith('weight'));
    expect(weightRows.length).toBeGreaterThan(0);
    expect(weightRows.every((m) => m.metric.includes('goal: lower is better'))).toBe(true);
  });

  it('feeds the AI the derived series (integration/derived data), not just manual check-ins', () => {
    // Nutrition + weight readings → the engine derives caloric_balance, which the
    // charts show but the old hand-rolled history never sent.
    const metricReadings: MetricReading[] = [
      { id: 'a', metric: 'nutrition.energy', value: 2600, ts: `${today}T12:00:00.000Z`, sourceProvider: 'typical' },
      { id: 'b', metric: 'body.weight', value: 120, ts: `${today}T07:00:00.000Z`, sourceProvider: 'apple_health' },
    ];
    const h = buildInsightHistory(
      baseInput({ metricReadings, profile: profile({ goals: ['weight_loss'] }) }),
      today,
    );
    // Derived caloric_balance appears as a labelled trend row...
    expect(h.metrics.some((m) => m.metric.startsWith('caloric balance'))).toBe(true);
    // ...and the raw integration reading is still present.
    expect(h.metrics.some((m) => m.metric === 'nutrition.energy')).toBe(true);
  });

  it('maps doses/symptoms/protocol starts', () => {
    const h = buildInsightHistory(
      baseInput({
        doseEvents: [{ id: 'd', takenAt: `${today}T09:00:00.000Z`, compoundSlug: 'bpc-157', dose: 250, doseUnit: 'mcg' }],
        symptomEvents: [{ id: 's', type: 'headache', onsetAt: `${today}T10:00:00.000Z`, severity: 2 }],
        protocolItems: [{ id: 'p', compoundSlug: 'bpc-157', startedAt: '2026-06-01' }],
      }),
      today,
    );
    expect(h.doses[0].date).toBe(today);
    expect(h.symptoms[0].type).toBe('headache');
    expect(h.protocolStarts[0].startedAt).toBe('2026-06-01');
  });
});

describe('selectProtocolContext', () => {
  it('computes the cycle week from the earliest start', () => {
    const ctx = selectProtocolContext(
      baseInput({ protocolItems: [{ id: 'p', compoundSlug: 'bpc-157', startedAt: '2026-07-01' }] }) as never,
      '2026-07-15',
    );
    expect(ctx.earliestStart).toBe('2026-07-01');
    expect(ctx.cycleWeek).toBe(3); // day 14 → week 3
    expect(ctx.compounds).toHaveLength(1);
  });

  it('no protocol: no cycle week', () => {
    const ctx = selectProtocolContext(baseInput() as never, '2026-07-15');
    expect(ctx.cycleWeek).toBeUndefined();
  });
});

describe('selectPhotoDigest', () => {
  it('groups by session+part and returns the latest per track', () => {
    const photos: PhotoEntry[] = [
      { id: '1', session: 'face', uri: 'a', takenAt: '2026-07-01T12:00:00.000Z' },
      { id: '2', session: 'face', uri: 'b', takenAt: '2026-07-08T12:00:00.000Z', comparable: true, driftScore: 0.2 },
      { id: '3', session: 'body', part: 'belly', uri: 'c', takenAt: '2026-07-05T12:00:00.000Z' },
    ];
    const digest = selectPhotoDigest(baseInput({ photos } as never) as never);
    const face = digest.find((d) => d.session === 'face' && !d.part)!;
    expect(face.count).toBe(2);
    expect(face.lastCaptureDate).toBe('2026-07-08');
    expect(face.comparable).toBe(true);
    expect(digest.find((d) => d.part === 'belly')?.count).toBe(1);
  });

  it('carries the hedged change note into the insights payload (P-3)', () => {
    const photos: PhotoEntry[] = [
      { id: '1', session: 'face', uri: 'a', takenAt: '2026-07-08T12:00:00.000Z', comparable: true, changeNote: 'jawline appears slightly sharper' },
    ];
    const h = buildInsightHistory(baseInput({ photos }), '2026-07-10');
    expect(h.photos?.[0].track).toBe('face');
    expect(h.photos?.[0].note).toBe('jawline appears slightly sharper');
    expect(h.photos?.[0].comparable).toBe(true);
  });
});
