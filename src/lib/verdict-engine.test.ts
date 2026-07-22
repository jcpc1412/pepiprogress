import { describe, expect, it } from 'vitest';

import {
  computeSignalTone,
  computeVerdict,
  levelBand,
  resolveMetricDirections,
  type VerdictInput,
} from '@/lib/verdict-engine';
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

describe('contextual signal tone (R2-C C2)', () => {
  it('reads absolute level: up-good high vs down-good inverts', () => {
    expect(levelBand('energy', 4.2, 'up_good')).toBe('high');
    expect(levelBand('energy', 2.0, 'up_good')).toBe('low');
    // `soreness` id = Recovery (up_good): high = well-recovered = good place (A1).
    expect(levelBand('soreness', 4.2, 'up_good')).toBe('high');
    expect(levelBand('soreness', 1.5, 'up_good')).toBe('low');
    expect(levelBand('weight', 80, 'down_good')).toBe('none'); // no absolute band
  });

  it('does NOT paint a high 4/5 metric red for a small dip (the reported bug)', () => {
    const tone = computeSignalTone({ band: 'high', favourSign: -1, trend: 'down', normDev: 0.2, explained: false });
    expect(tone).toBe('good');
  });

  it('escalates a material adverse move by band', () => {
    expect(computeSignalTone({ band: 'high', favourSign: -1, trend: 'down', normDev: 0.8, explained: false })).toBe('watch');
    expect(computeSignalTone({ band: 'mid', favourSign: -1, trend: 'down', normDev: 0.8, explained: false })).toBe('bad');
    expect(computeSignalTone({ band: 'mid', favourSign: -1, trend: 'down', normDev: 0.8, explained: true })).toBe('watch');
    expect(computeSignalTone({ band: 'low', favourSign: -1, trend: 'down', normDev: 0.8, explained: false })).toBe('bad');
  });

  it('favourable move is good, except still-low reads watch; flat is neutral', () => {
    // Improving from a mid/high level = good; improving but still clinically low =
    // watch, not an all-clear (A3 — e.g. a low REM % ticking up).
    expect(computeSignalTone({ band: 'high', favourSign: 1, trend: 'up', normDev: 0.9, explained: false })).toBe('good');
    expect(computeSignalTone({ band: 'low', favourSign: 1, trend: 'up', normDev: 0.9, explained: false })).toBe('watch');
    expect(computeSignalTone({ band: 'mid', favourSign: 0, trend: 'flat', normDev: 0, explained: false })).toBe('neutral');
  });

  it('attaches a tone to every signal', () => {
    const entries = entriesOf(6, (o) => ({ weight: 79 + o * 0.3, energy: 4 }));
    const v = computeVerdict(makeInput({ entries, profile: { goals: ['weight_loss'], units: 'metric' } }));
    for (const s of v.signals) expect(['good', 'watch', 'bad', 'neutral']).toContain(s.tone);
  });
});

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

  it('weights hips higher for a female pattern than a male one (sex layer)', () => {
    // Weight flat, hips moving; only the sex multiplier should differ.
    const entries = entriesOf(6, (o) => ({ weight: 80, hips: 100 + o * 0.4 }));
    const female = computeVerdict(
      makeInput({ entries, profile: { goals: ['weight_loss'], units: 'metric', sex: 'female' } }),
    );
    const male = computeVerdict(
      makeInput({ entries, profile: { goals: ['weight_loss'], units: 'metric', sex: 'male' } }),
    );
    const fh = female.signals.find((s) => s.metricId === 'hips');
    const mh = male.signals.find((s) => s.metricId === 'hips');
    expect(fh && mh).toBeTruthy();
    expect(fh!.weight).toBeGreaterThan(mh!.weight); // gluteofemoral fat matters more for women
  });

  it('does not sex-weight goal-driven metrics (recovery → sleep is identical)', () => {
    const entries = entriesOf(6, (o) => ({ sleep_quality: 4 - o * 0.2, soreness: 3 }));
    const female = computeVerdict(
      makeInput({ entries, profile: { goals: ['recovery'], units: 'metric', sex: 'female' } }),
    );
    const male = computeVerdict(
      makeInput({ entries, profile: { goals: ['recovery'], units: 'metric', sex: 'male' } }),
    );
    const fs = female.signals.find((s) => s.metricId === 'sleep_quality');
    const ms = male.signals.find((s) => s.metricId === 'sleep_quality');
    expect(fs!.weight).toBeCloseTo(ms!.weight, 10);
  });

  it('maps trans users by hormones: mtf → female pattern, ftm → male', () => {
    const entries = entriesOf(6, (o) => ({ weight: 80, hips: 100 + o * 0.4 }));
    const mtf = computeVerdict(makeInput({ entries, profile: { goals: ['weight_loss'], units: 'metric', sex: 'mtf' } }));
    const ftm = computeVerdict(makeInput({ entries, profile: { goals: ['weight_loss'], units: 'metric', sex: 'ftm' } }));
    const female = computeVerdict(makeInput({ entries, profile: { goals: ['weight_loss'], units: 'metric', sex: 'female' } }));
    const male = computeVerdict(makeInput({ entries, profile: { goals: ['weight_loss'], units: 'metric', sex: 'male' } }));
    const hips = (v: typeof mtf) => v.signals.find((s) => s.metricId === 'hips')!.weight;
    expect(hips(mtf)).toBeCloseTo(hips(female), 10);
    expect(hips(ftm)).toBeCloseTo(hips(male), 10);
  });

  it('computes body-fat % as a signal and reads a drop as favourable on a cut', () => {
    // neck fixed, waist shrinking → Navy body-fat drops. Needs height for the formula.
    const entries = entriesOf(6, (o) => ({ neck: 38, waist: 88 + o * 0.5 }));
    const v = computeVerdict(
      makeInput({ entries, profile: { goals: ['weight_loss'], units: 'metric', sex: 'male', height: 180 } }),
    );
    const bf = v.signals.find((s) => s.metricId === 'body_fat_pct');
    expect(bf).toBeTruthy();
    expect(bf!.favour).toBe('good');
  });

  it('flags a plateau and hands the hero to a moving tape signal', () => {
    // Weight dead flat for 12 days (span 11) while waist keeps dropping.
    const entries = entriesOf(12, (o) => ({ weight: 100, waist: 86 + o * 0.3 }));
    const v = computeVerdict(
      makeInput({ entries, profile: { goals: ['weight_loss'], units: 'metric', sex: 'male' } }),
    );
    expect(v.explanation.key).toBe('verdict.explanation.plateau');
    expect(v.hero?.kind === 'metric' && v.hero.metricId).toBe('waist');
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

  it('names the dragging signal when the read is mixed (H-2)', () => {
    // Weight barely moves (near-neutral) while energy slides — a mixed read that
    // should name what is pulling against the rest rather than a generic line.
    const entries = entriesOf(8, (o) => ({
      weight: 79 + o * 0.05,
      energy: 4.6 - o * 0.3, // today lowest → down = bad
    }));
    const v = computeVerdict(makeInput({ entries, profile: { goals: ['weight_loss'], units: 'metric' } }));
    if (v.state === 'watch' && v.signals.some((s) => s.role === 'drags')) {
      expect(['verdict.explanation.watchMixed', 'verdict.explanation.watchMixed2']).toContain(v.explanation.key);
      const drag = v.explanation.params?.drag;
      expect(typeof drag).toBe('string');
      expect((drag as string).includes('.')).toBe(true); // an i18n label key, resolved by the UI
    } else {
      expect(v.explanation.key.startsWith('verdict.explanation.')).toBe(true);
    }
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
  it('explains a recovery dip by recent heavy training instead of counting it as failure', () => {
    const entries = entriesOf(6, (o) => ({
      weight: 79 + o * 0.3, // good, drives an overall-positive verdict
      energy: 4.6 - o * 0.25, // good
      // `soreness` id = Recovery (up_good): today lowest → falling → drags (A1).
      soreness: 4.0 + o * 0.25,
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

describe('transition-direction (beta-notes §1.9)', () => {
  it('reads hips as up_good for an mtf user with the transition goal', () => {
    const dirs = resolveMetricDirections(['gender_transition'], [], 'mtf');
    expect(dirs.hips).toBe('up_good');
  });

  it('reads hips as down_good for an ftm user with the transition goal', () => {
    const dirs = resolveMetricDirections(['gender_transition'], [], 'ftm');
    expect(dirs.hips).toBe('down_good');
  });

  it('does not apply transition direction without the goal, even for mtf/ftm sex', () => {
    // sex alone must not assume intent — some trans users are here for peptides only.
    const dirs = resolveMetricDirections([], [], 'mtf');
    expect(dirs.hips).toBe('neutral');
  });

  it('does not apply transition direction for a cis user who somehow has the goal', () => {
    const dirs = resolveMetricDirections(['gender_transition'], [], 'male');
    expect(dirs.hips).toBe('neutral');
  });

  it('transition direction for hips overrides a co-selected cutting goal', () => {
    // weight_loss alone would read hips as down_good (fat leaving the body);
    // the transition goal for an mtf user should win for hips specifically.
    const dirs = resolveMetricDirections(['weight_loss', 'gender_transition'], [], 'mtf');
    expect(dirs.hips).toBe('up_good');
    // weight_loss's own direction (weight down_good) is untouched.
    expect(dirs.weight).toBe('down_good');
  });

  it('rising hips read as a supporting (not dragging) signal for an mtf transition user', () => {
    const entries = entriesOf(6, (o) => ({ hips: 96 - o * 0.4, weight: 70 }));
    const v = computeVerdict(
      makeInput({
        entries,
        profile: { goals: ['gender_transition'], units: 'metric', sex: 'mtf' },
      }),
    );
    const hipsSignal = v.signals.find((s) => s.metricId === 'hips');
    expect(hipsSignal).toBeDefined();
    expect(hipsSignal!.favour).toBe('good');
  });
});
