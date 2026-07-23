/**
 * Strength-held signal + body intent (MASTER-PLAN 2b.2).
 *
 * The hinge of the 2b coaching logic: "measurements dropping across the board
 * late in a cycle" reads as muscle loss ONLY when strength did not hold. Without
 * this signal the analysis has to hedge into uselessness or alarm without cause.
 *
 * Owner decision: the SUBJECTIVE chip is primary and is the override. Most users
 * never log full sessions, so "lifting felt same / harder / easier" is the ground
 * truth. Logged strength sessions are the fallback, not the authority, and passive
 * device fill (2b.4) will only ever be a suggestion layer on top of the chip.
 *
 * Pure and unit-tested.
 */

/** The standing daily chip: how lifting felt relative to the user's normal. */
export type StrengthFelt = 'easier' | 'same' | 'harder';

/** Resolved direction of strength over a window. `unknown` is a first-class
 *  answer: no data must never be read as "strength dropped". */
export type StrengthTrend = 'up' | 'held' | 'down' | 'unknown';

/** Which evidence produced the trend, so the prompt can weight it honestly. */
export type StrengthSource = 'reported' | 'sessions';

export type StrengthSignal = {
  trend: StrengthTrend;
  source: StrengthSource;
  /** How many data points backed it (chip days, or exercises compared). */
  samples: number;
};

/** What the user is training toward. Drives which coaching branch applies. */
export type BodyIntent = 'cut' | 'gain' | 'recomp' | 'maintain';

/**
 * Map the verdict engine's cutting/bulking booleans to a single intent label.
 * Both true = deliberate recomposition (the arrows carry that story, weight will
 * not); neither = no body intent, so the coaching layer stays quiet.
 */
export function resolveBodyIntent(cutting: boolean, bulking: boolean): BodyIntent {
  if (cutting && bulking) return 'recomp';
  if (cutting) return 'cut';
  if (bulking) return 'gain';
  return 'maintain';
}

export type FeltReport = { date: string; felt: StrengthFelt };
export type StrengthSetLike = { weight: number; reps: number };
export type SessionLike = { date: string; exercise: string; sets: StrengthSetLike[] };

/** Chip days needed before the subjective signal is trusted at all. One "harder"
 *  day is a bad night's sleep, not a trend. */
const MIN_REPORTS = 2;
/** Mean chip score beyond this reads as a direction rather than "held". */
const FELT_BAND = 0.34;
/** Relative e1RM change beyond this reads as a direction rather than "held". */
const SESSION_BAND = 0.02;

const FELT_SCORE: Record<StrengthFelt, number> = { easier: 1, same: 0, harder: -1 };

/** Epley one-rep-max estimate. Unit-agnostic: only the ratio is ever used. */
function e1rm(set: StrengthSetLike): number {
  return set.weight * (1 + set.reps / 30);
}

function bandTrend(value: number, band: number): StrengthTrend {
  if (value > band) return 'up';
  if (value < -band) return 'down';
  return 'held';
}

/**
 * Resolve the strength trend across a window (inclusive YYYY-MM-DD bounds).
 *
 * Reported chips win outright when there are enough of them. The session
 * fallback compares each exercise's best estimated 1RM in the first half of the
 * window against the second half, and only counts exercises present in both —
 * a movement someone started mid-window carries no trend information.
 */
export function resolveStrengthTrend(opts: {
  felt: FeltReport[];
  sessions: SessionLike[];
  from: string;
  to: string;
}): StrengthSignal {
  const inWindow = <T extends { date: string }>(x: T) => x.date >= opts.from && x.date <= opts.to;

  const reports = opts.felt.filter(inWindow);
  if (reports.length >= MIN_REPORTS) {
    const mean = reports.reduce((a, r) => a + FELT_SCORE[r.felt], 0) / reports.length;
    return { trend: bandTrend(mean, FELT_BAND), source: 'reported', samples: reports.length };
  }

  const sessions = opts.sessions.filter(inWindow).filter((s) => s.sets.length > 0);
  if (sessions.length === 0) return { trend: 'unknown', source: 'sessions', samples: 0 };

  // Split by date rather than by count so an uneven logging cadence does not
  // silently compare "this month" against "this month".
  const dates = sessions.map((s) => s.date).sort();
  const mid = dates[Math.floor(dates.length / 2)];

  const best = new Map<string, { early?: number; late?: number }>();
  for (const s of sessions) {
    const top = Math.max(...s.sets.map(e1rm));
    if (!Number.isFinite(top) || top <= 0) continue;
    const slot = best.get(s.exercise) ?? {};
    const half = s.date < mid ? 'early' : 'late';
    if (slot[half] === undefined || top > (slot[half] as number)) slot[half] = top;
    best.set(s.exercise, slot);
  }

  const ratios: number[] = [];
  for (const { early, late } of best.values()) {
    if (early === undefined || late === undefined) continue;
    ratios.push(late / early - 1);
  }
  if (ratios.length === 0) return { trend: 'unknown', source: 'sessions', samples: 0 };

  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  return { trend: bandTrend(mean, SESSION_BAND), source: 'sessions', samples: ratios.length };
}
