import { describe, expect, it } from 'vitest';

import {
  cyclePromptEligible,
  DEFAULT_CYCLE_LENGTH,
  derivePeriodStarts,
  observedCycleLength,
  phaseForDay,
  resolveCycle,
} from './cycle';

const flow = (...days: string[]) => days.map((ts) => ({ ts }));

describe('derivePeriodStarts', () => {
  it('collapses a run of flow days into one start', () => {
    expect(derivePeriodStarts(flow('2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04'))).toEqual([
      '2026-03-01',
    ]);
  });

  it('bridges a one-day logging gap instead of inventing a second period', () => {
    // The bug this guards: a skipped day splitting one period in two would halve
    // the observed cycle length.
    expect(derivePeriodStarts(flow('2026-03-01', '2026-03-02', '2026-03-04'))).toEqual(['2026-03-01']);
  });

  it('opens a new period after a real gap', () => {
    expect(derivePeriodStarts(flow('2026-03-01', '2026-03-02', '2026-03-29', '2026-03-30'))).toEqual([
      '2026-03-01',
      '2026-03-29',
    ]);
  });

  it('is order- and duplicate-insensitive', () => {
    expect(derivePeriodStarts(flow('2026-03-02', '2026-03-01', '2026-03-01'))).toEqual(['2026-03-01']);
  });
});

describe('observedCycleLength', () => {
  it('needs at least two gaps before claiming a length', () => {
    expect(observedCycleLength(['2026-01-01'])).toBeNull();
    expect(observedCycleLength(['2026-01-01', '2026-02-01'])).toBeNull();
  });

  it('takes the median of the observed gaps', () => {
    // 31, 30, 30 -> median 30
    expect(observedCycleLength(['2026-01-01', '2026-02-01', '2026-03-03', '2026-04-02'])).toBe(30);
  });

  it('drops an implausible gap rather than letting a missed month skew it', () => {
    // The 90-day gap is a stretch of unlogged months, not a cycle.
    expect(
      observedCycleLength(['2026-01-01', '2026-02-01', '2026-05-02', '2026-06-01', '2026-07-01']),
    ).toBe(30);
  });

  it('clamps to the plausible range', () => {
    const starts = ['2026-01-01', '2026-01-23', '2026-02-14', '2026-03-08'];
    expect(observedCycleLength(starts)).toBeGreaterThanOrEqual(21);
  });
});

describe('phaseForDay', () => {
  it('counts luteal back from the next period, not as half the cycle', () => {
    // The regression this locks: verdict-engine used day >= length/2, which put a
    // 35-day cycle into luteal on day 18 instead of day 22.
    expect(phaseForDay(18, 35)).toBe('follicular');
    expect(phaseForDay(22, 35)).toBe('luteal');
  });

  it('agrees with the old rule at 28 days', () => {
    expect(phaseForDay(14, 28)).toBe('follicular');
    expect(phaseForDay(15, 28)).toBe('luteal');
  });

  it('marks the bleeding days menstrual', () => {
    expect(phaseForDay(1, 28)).toBe('menstrual');
    expect(phaseForDay(5, 28)).toBe('menstrual');
    expect(phaseForDay(6, 28)).toBe('follicular');
  });
});

describe('resolveCycle', () => {
  it('returns null when nothing is configured', () => {
    expect(resolveCycle({ today: '2026-03-15' })).toBeNull();
  });

  it('uses the manual start when there is no synced data', () => {
    const s = resolveCycle({ manualStart: '2026-03-01', statedLength: 28, today: '2026-03-15' });
    expect(s).toMatchObject({ dayInCycle: 15, phase: 'luteal', source: 'manual', lengthObserved: false });
  });

  it('prefers an observed length over the stated one', () => {
    const s = resolveCycle({
      manualStart: '2026-03-01',
      statedLength: 28,
      flow: flow('2026-01-01', '2026-01-31', '2026-03-02'),
      today: '2026-03-15',
    });
    expect(s?.cycleLength).toBe(30);
    expect(s?.lengthObserved).toBe(true);
  });

  it('lets a manual correction beat sync within the same cycle', () => {
    // Health recorded the 1st; the user says it was actually the 3rd. Their
    // correction stands for this cycle.
    const s = resolveCycle({
      manualStart: '2026-03-03',
      flow: flow('2026-03-01', '2026-03-02'),
      today: '2026-03-10',
    });
    expect(s).toMatchObject({ startedOn: '2026-03-03', source: 'manual' });
  });

  it('hands over to sync once a later cycle begins', () => {
    // The stale-data failure this whole module exists to fix: the manual date is
    // a month old and Health has seen a new period start.
    const s = resolveCycle({
      manualStart: '2026-03-03',
      flow: flow('2026-03-01', '2026-04-02'),
      today: '2026-04-10',
    });
    expect(s).toMatchObject({ startedOn: '2026-04-02', source: 'synced', dayInCycle: 9 });
  });

  it('falls back to the default length with no history and no stated value', () => {
    const s = resolveCycle({ manualStart: '2026-03-01', today: '2026-03-02' });
    expect(s?.cycleLength).toBe(DEFAULT_CYCLE_LENGTH);
  });

  it('rolls a stale manual date forward instead of returning a nonsense day', () => {
    const s = resolveCycle({ manualStart: '2026-01-01', statedLength: 28, today: '2026-03-01' });
    expect(s?.dayInCycle).toBeGreaterThan(0);
    expect(s?.dayInCycle).toBeLessThanOrEqual(28);
  });

  it('ignores start dates in the future', () => {
    expect(resolveCycle({ manualStart: '2026-04-01', today: '2026-03-15' })).toBeNull();
    const s = resolveCycle({
      manualStart: '2026-03-01',
      flow: flow('2026-12-01'),
      today: '2026-03-15',
    });
    expect(s?.source).toBe('manual');
  });

  it('works from synced data alone, with no manual date ever entered', () => {
    const s = resolveCycle({ flow: flow('2026-03-04', '2026-03-05'), today: '2026-03-10' });
    expect(s).toMatchObject({ startedOn: '2026-03-04', source: 'synced', dayInCycle: 7 });
  });
});

describe('cyclePromptEligible', () => {
  const base = {
    sex: 'female',
    hasManualStart: false,
    hasSyncedFlow: false,
    goals: ['weight_loss'],
  };

  it('confirms rather than asks when Health already has flow data', () => {
    expect(cyclePromptEligible({ ...base, hasSyncedFlow: true })).toBe('confirm');
  });

  it('asks for a date when nothing is synced but the goals make it matter', () => {
    expect(cyclePromptEligible(base)).toBe('ask');
  });

  it('stays silent for goals where a water swing costs nothing', () => {
    expect(cyclePromptEligible({ ...base, goals: ['sleep'] })).toBeNull();
  });

  it('never asks twice after a decline', () => {
    expect(cyclePromptEligible({ ...base, promptState: 'declined' })).toBeNull();
    expect(cyclePromptEligible({ ...base, hasSyncedFlow: true, promptState: 'declined' })).toBeNull();
  });

  it('stops asking once answered', () => {
    expect(cyclePromptEligible({ ...base, hasManualStart: true })).toBeNull();
    expect(cyclePromptEligible({ ...base, promptState: 'active' })).toBeNull();
  });

  it('asks an opted-in user for their date even off-goal', () => {
    expect(cyclePromptEligible({ ...base, goals: ['sleep'], tracking: true })).toBe('ask');
  });

  it('does not re-confirm sync for someone who already opted in', () => {
    expect(cyclePromptEligible({ ...base, hasSyncedFlow: true, tracking: true })).toBeNull();
  });

  it('only asks once when the ask went unanswered', () => {
    expect(cyclePromptEligible({ ...base, promptState: 'asked' })).toBeNull();
  });

  it('never raises this for anyone but a female user', () => {
    expect(cyclePromptEligible({ ...base, sex: 'male' })).toBeNull();
    expect(cyclePromptEligible({ ...base, sex: undefined })).toBeNull();
  });
});
