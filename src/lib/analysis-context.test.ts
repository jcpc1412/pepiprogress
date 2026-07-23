import { describe, expect, it } from 'vitest';

import { buildAnalysisContext, type ContextEntry } from '@/lib/analysis-context';

const entry = (date: string, over: Partial<ContextEntry> = {}): ContextEntry => ({ date, ...over });

const PHOTO_AT = '2026-07-15T09:00:00Z';
const BASELINE_AT = '2026-07-01T09:00:00Z';

describe('buildAnalysisContext', () => {
  it('computes the window length', () => {
    const ctx = buildAnalysisContext({ entries: [], doses: [], photoAt: PHOTO_AT, baselineAt: BASELINE_AT });
    expect(ctx.windowDays).toBe(14);
  });

  it('is 0 days with no baseline', () => {
    expect(buildAnalysisContext({ entries: [], doses: [], photoAt: PHOTO_AT }).windowDays).toBe(0);
  });

  describe('weight anchoring', () => {
    it('anchors each end to the nearest weight at or before it', () => {
      const ctx = buildAnalysisContext({
        entries: [entry('2026-06-30', { weight: 84 }), entry('2026-07-14', { weight: 82.5 })],
        doses: [],
        photoAt: PHOTO_AT,
        baselineAt: BASELINE_AT,
      });
      expect(ctx.weight).toEqual({ start: 84, end: 82.5, delta: -1.5 });
    });

    it('claims no trend when both ends resolve to the same reading', () => {
      // One weigh-in mid-window would anchor both ends — that is one data
      // point, not a trend.
      const ctx = buildAnalysisContext({
        entries: [entry('2026-06-28', { weight: 84 })],
        doses: [],
        photoAt: PHOTO_AT,
        baselineAt: BASELINE_AT,
      });
      expect(ctx.weight).toBeUndefined();
    });

    it('ignores weights older than the lookback', () => {
      const ctx = buildAnalysisContext({
        entries: [entry('2026-06-01', { weight: 90 }), entry('2026-07-14', { weight: 82 })],
        doses: [],
        photoAt: PHOTO_AT,
        baselineAt: BASELINE_AT,
      });
      expect(ctx.weight).toBeUndefined();
    });

    it('never reports weight without a baseline', () => {
      const ctx = buildAnalysisContext({
        entries: [entry('2026-07-10', { weight: 83 }), entry('2026-07-14', { weight: 82 })],
        doses: [],
        photoAt: PHOTO_AT,
      });
      expect(ctx.weight).toBeUndefined();
    });
  });

  describe('habit averages', () => {
    it('averages nutrition and sleep over the 14 days before the photo', () => {
      const ctx = buildAnalysisContext({
        entries: [
          entry('2026-07-10', { protein: 140, calories: 2200, sleep_quality: 4 }),
          entry('2026-07-12', { protein: 160, sleep_quality: 3 }),
          // Outside the window — must not count.
          entry('2026-06-20', { protein: 20, calories: 500, sleep_quality: 1 }),
        ],
        doses: [],
        photoAt: PHOTO_AT,
        baselineAt: BASELINE_AT,
      });
      expect(ctx.nutrition).toEqual({ avgProtein: 150, avgCalories: 2200, daysLogged: 2 });
      expect(ctx.avgSleepQuality).toBe(3.5);
    });

    it('omits habits entirely when nothing was logged', () => {
      const ctx = buildAnalysisContext({ entries: [], doses: [], photoAt: PHOTO_AT, baselineAt: BASELINE_AT });
      expect(ctx.nutrition).toBeUndefined();
      expect(ctx.avgSleepQuality).toBeUndefined();
    });
  });

  describe('recent doses', () => {
    it('reports the most recent dose per compound inside the horizon', () => {
      const ctx = buildAnalysisContext({
        entries: [],
        doses: [
          { label: 'Semaglutide', takenAt: '2026-07-14T09:00:00Z' }, // 24h before
          { label: 'Semaglutide', takenAt: '2026-07-08T09:00:00Z' }, // older — superseded
          { label: 'BPC-157', takenAt: '2026-07-15T03:00:00Z' }, // 6h before
        ],
        photoAt: PHOTO_AT,
      });
      expect(ctx.recentDoses).toEqual([
        { label: 'BPC-157', hoursBefore: 6 },
        { label: 'Semaglutide', hoursBefore: 24 },
      ]);
    });

    it('excludes doses beyond the horizon and doses after the photo', () => {
      const ctx = buildAnalysisContext({
        entries: [],
        doses: [
          { label: 'Old', takenAt: '2026-07-10T09:00:00Z' }, // 120h — out
          { label: 'Future', takenAt: '2026-07-15T12:00:00Z' }, // after the photo — out
        ],
        photoAt: PHOTO_AT,
      });
      expect(ctx.recentDoses).toBeUndefined();
    });
  });
  describe('intent + strength (2b.2)', () => {
    it('carries a body intent through, and drops "maintain"', () => {
      const base = { entries: [], doses: [], photoAt: PHOTO_AT, baselineAt: BASELINE_AT };
      expect(buildAnalysisContext({ ...base, intent: 'cut' }).intent).toBe('cut');
      expect(buildAnalysisContext({ ...base, intent: 'maintain' }).intent).toBeUndefined();
      expect(buildAnalysisContext(base).intent).toBeUndefined();
    });

    it('resolves the strength trend from the reported chip inside the window', () => {
      const ctx = buildAnalysisContext({
        entries: [
          entry('2026-07-03', { strength_felt: 'same' }),
          entry('2026-07-09', { strength_felt: 'same' }),
          entry('2026-06-20', { strength_felt: 'harder' }), // before the baseline
        ],
        doses: [],
        photoAt: PHOTO_AT,
        baselineAt: BASELINE_AT,
      });
      expect(ctx.strength).toEqual({ trend: 'held', source: 'reported', samples: 2 });
    });

    it('reports unknown rather than omitting, so the prompt knows to ask', () => {
      const ctx = buildAnalysisContext({
        entries: [entry('2026-07-03', { weight: 80 })],
        doses: [],
        photoAt: PHOTO_AT,
        baselineAt: BASELINE_AT,
      });
      expect(ctx.strength?.trend).toBe('unknown');
    });

    it('asks nothing about strength when there is no baseline window', () => {
      const ctx = buildAnalysisContext({
        entries: [entry('2026-07-03', { strength_felt: 'harder' })],
        doses: [],
        photoAt: PHOTO_AT,
      });
      expect(ctx.strength).toBeUndefined();
    });
  });
});
