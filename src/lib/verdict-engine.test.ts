import { describe, expect, it } from 'vitest';

import { computeVerdict, type VerdictInput } from '@/lib/verdict-engine';
import type { CheckinEntry, PhotoEntry, ProtocolItem } from '@/lib/store';

const TODAY = '2026-07-06';
const DAY_MS = 24 * 60 * 60 * 1000;

function shift(dateKey: string, delta: number): string {
  return new Date(new Date(`${dateKey}T00:00:00.000Z`).getTime() + delta * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Build `days` of check-ins ending today; `fn(offset)` returns fields, where
 *  offset 0 = today, 1 = yesterday, … so a rising "today" value trends up. */
function entriesOf(
  days: number,
  fn: (offset: number) => Partial<CheckinEntry>,
): Record<string, CheckinEntry> {
  const out: Record<string, CheckinEntry> = {};
  for (let i = 0; i < days; i++) {
    const date = shift(TODAY, -i);
    out[date] = { date, updatedAt: `${date}T12:00:00.000Z`, ...fn(i) };
  }
  return out;
}

function makeInput(over: Partial<VerdictInput>): VerdictInput {
  return {
    entries: {},
    metricReadings: [],
    protocolItems: [],
    photos: [],
    profile: { goals: [], units: 'metric' },
    today: TODAY,
    ...over,
  };
}

const protocol = (slug: string): ProtocolItem => ({ id: slug, compoundSlug: slug });

describe('computeVerdict — cold start', () => {
  it('returns building with no hero when there is no data at all', () => {
    const v = computeVerdict(makeInput({ profile: { goals: ['weight_loss'], units: 'metric' } }));
    expect(v.state).toBe('building');
    expect(v.hero).toBeNull();
    expect(v.signals).toHaveLength(0);
    expect(v.explanation.key).toBe('verdict.explanation.building');
  });

  it('falls back to the latest photo as hero while building', () => {
    const photo: PhotoEntry = {
      id: 'p2',
      session: 'body',
      uri: 'file://p2',
      takenAt: `${shift(TODAY, -1)}T09:00:00.000Z`,
    };
    const older: PhotoEntry = { ...photo, id: 'p1', uri: 'file://p1', takenAt: `${shift(TODAY, -5)}T09:00:00.000Z` };
    const v = computeVerdict(makeInput({ photos: [older, photo] }));
    expect(v.state).toBe('building');
    expect(v.hero).toEqual({ kind: 'photo', photoId: 'p2' });
  });

  it('stays building when a signal has fewer than the minimum points', () => {
    const entries = entriesOf(2, () => ({ weight: 80 }));
    const v = computeVerdict(makeInput({ entries, profile: { goals: ['weight_loss'], units: 'metric' } }));
    expect(v.state).toBe('building');
  });
});

describe('computeVerdict — hero selection & intent', () => {
  it('picks weight as hero and reads a loss as favourable on a cut', () => {
    // today = lowest weight; older days higher → downward trend.
    const entries = entriesOf(6, (o) => ({ weight: 79 + o * 0.3 }));
    const v = computeVerdict(makeInput({ entries, profile: { goals: ['weight_loss'], units: 'metric' } }));
    expect(v.hero?.kind).toBe('metric');
    if (v.hero?.kind === 'metric') {
      expect(v.hero.metricId).toBe('weight');
      expect(v.hero.unit).toBe('weight');
      expect(v.hero.trend).toBe('down');
      expect(v.hero.favour).toBe('good');
    }
  });

  it('exposes the signed window delta on the metric hero (the figure Home shows)', () => {
    const entries = entriesOf(6, (o) => ({ weight: 79 + o * 0.3 }));
    const v = computeVerdict(makeInput({ entries, profile: { goals: ['weight_loss'], units: 'metric' } }));
    if (v.hero?.kind === 'metric') {
      expect(v.hero.delta).toBeLessThan(0); // today is lighter than the window baseline
      expect(v.hero.windowDays).toBeGreaterThan(0);
    } else {
      throw new Error('expected a metric hero');
    }
  });

  it('emits a hedged days-to-target forecast only when a goal weight is set', () => {
    const entries = entriesOf(6, (o) => ({ weight: 79 + o * 0.3 })); // losing ~0.3/day toward a lower target
    const withTarget = computeVerdict(
      makeInput({ entries, profile: { goals: ['weight_loss'], units: 'metric', targetWeight: 75 } }),
    );
    const noTarget = computeVerdict(
      makeInput({ entries, profile: { goals: ['weight_loss'], units: 'metric' } }),
    );
    expect(withTarget.forecast?.key).toBe('verdict.forecast.daysToTarget');
    expect(typeof withTarget.forecast?.params?.n).toBe('number');
    expect(noTarget.forecast).toBeUndefined();
  });

  it('does not project when the trend moves away from the target', () => {
    // Gaining weight, but the target is below current → not moving toward it.
    const entries = entriesOf(6, (o) => ({ weight: 82 - o * 0.3 }));
    const v = computeVerdict(
      makeInput({ entries, profile: { goals: ['body_comp'], units: 'metric', targetWeight: 75 } }),
    );
    expect(v.forecast).toBeUndefined();
  });

  it('reads the same weight loss as NOT favourable when bulking (intent flips)', () => {
    const entries = entriesOf(6, (o) => ({ weight: 79 + o * 0.3 }));
    const cutting = computeVerdict(
      makeInput({ entries, profile: { goals: ['weight_loss'], units: 'metric' } }),
    );
    const bulking = computeVerdict(
      makeInput({ entries, profile: { goals: ['body_comp'], units: 'metric' } }),
    );
    const cw = cutting.signals.find((s) => s.metricId === 'weight');
    const bw = bulking.signals.find((s) => s.metricId === 'weight');
    expect(cw?.favour).toBe('good');
    expect(bw?.favour).toBe('bad'); // losing weight while bulking is unfavourable
  });

  it('derives cutting intent from a fat-loss compound even without a goal', () => {
    const entries = entriesOf(6, (o) => ({ weight: 79 + o * 0.3 }));
    // 'tirzepatide' / 'semaglutide' carry a fat_loss effect tag in the catalog.
    const v = computeVerdict(
      makeInput({ entries, protocolItems: [protocol('semaglutide')], profile: { goals: [], units: 'metric' } }),
    );
    const w = v.signals.find((s) => s.metricId === 'weight');
    expect(w?.favour).toBe('good');
  });
});

describe('computeVerdict — state & confidence tiers', () => {
  it('is capped at watch with only one decisive signal (low confidence)', () => {
    const entries = entriesOf(6, (o) => ({ weight: 79 + o * 0.3 }));
    const v = computeVerdict(makeInput({ entries, profile: { goals: ['weight_loss'], units: 'metric' } }));
    expect(v.confidence).toBe('low');
    expect(v.state).toBe('watch');
  });

  it('reaches on_track / high when several relevant signals agree', () => {
    const entries = entriesOf(6, (o) => ({
      weight: 79 + o * 0.3, // down = good on a cut
      energy: 4.6 - o * 0.25, // today highest → up = good
      sleep_quality: 4.5 - o * 0.2, // up = good
    }));
    const v = computeVerdict(makeInput({ entries, profile: { goals: ['weight_loss'], units: 'metric' } }));
    expect(v.state).toBe('on_track');
    expect(v.confidence).toBe('high');
    // Supporting signals should outrank / not be marked as drags.
    expect(v.signals.every((s) => s.role !== 'drags')).toBe(true);
  });

  it('does not report on_track when signals conflict', () => {
    const entries = entriesOf(6, (o) => ({
      weight: 79 + o * 0.3, // good (down on a cut)
      energy: 3.5 + o * 0.25, // today lowest → down = bad
      sleep_quality: 3.5 + o * 0.2, // down = bad
    }));
    const v = computeVerdict(makeInput({ entries, profile: { goals: ['weight_loss'], units: 'metric' } }));
    expect(v.state).not.toBe('on_track');
  });
});

describe('computeVerdict — reconciliation', () => {
  it('explains rising soreness by recent heavy training instead of counting it as failure', () => {
    const entries = entriesOf(6, (o) => ({
      weight: 79 + o * 0.3, // good, drives an overall-positive verdict
      energy: 4.6 - o * 0.25, // good
      soreness: 4.6 - o * 0.25, // today highest → up; soreness up = bad (drags)
      workout_effort: o < 3 ? 5 : 2, // hard sessions in the last 3 days
    }));
    const v = computeVerdict(makeInput({ entries, profile: { goals: ['recovery', 'weight_loss'], units: 'metric' } }));
    const sore = v.signals.find((s) => s.metricId === 'soreness');
    expect(sore?.role).toBe('drags');
    expect(sore?.explained?.key).toBe('verdict.reconcile.trainingLoad');
    expect(v.reconciliation?.key).toBe('verdict.reconcile.trainingLoad');
  });
});

describe('computeVerdict — legal gate (descriptive only)', () => {
  it('never emits keys outside the descriptive verdict namespace or with prescriptive words', () => {
    const entries = entriesOf(6, (o) => ({
      weight: 79 + o * 0.3,
      energy: 4.6 - o * 0.25,
      soreness: 4.6 - o * 0.25,
      workout_effort: o < 3 ? 5 : 2,
    }));
    const v = computeVerdict(
      makeInput({
        entries,
        protocolItems: [protocol('semaglutide')],
        profile: { goals: ['recovery', 'weight_loss'], units: 'metric' },
      }),
    );

    const keys = [
      v.explanation.key,
      v.reconciliation?.key,
      v.forecast?.key,
      ...v.signals.map((s) => s.explained?.key),
    ].filter(Boolean) as string[];

    const forbidden = /(dose|dosing|\bmg\b|\bmcg\b|\biu\b|increase|decrease your|recommend|prescrib|should take|titrat)/i;
    for (const k of keys) {
      expect(k.startsWith('verdict.')).toBe(true);
      expect(forbidden.test(k)).toBe(false);
    }
    expect(['building', 'on_track', 'watch', 'off_track']).toContain(v.state);
    expect(['low', 'medium', 'high']).toContain(v.confidence);
  });
});
