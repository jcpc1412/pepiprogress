/**
 * Progress-photo quality score (redesign §4A) — a composite "how usable is this
 * shot" confidence, shown as a live readout and used to trigger the low-score
 * retry modal (< 80 → prompt to retake with looser clothing).
 *
 * Pure and deterministic. Combines the signals actually available at capture:
 *  - level: device tilt (deg) from the accelerometer,
 *  - framing: fit vs the prior-photo ghost (checkFit result), a distance proxy,
 *  - light: average luma (0–1), decoded on device (see `png-luma.ts`).
 * Signals that are unavailable are treated as neutral and excluded from the
 * weighting so a first baseline shot is not unfairly penalized. In practice that
 * means framing only counts from the second shot of a track onward, since there
 * is no reference to compare the first one against.
 *
 * Blur and pose remain native-detection follow-ups; the score folds them in the
 * same way, without changing this interface.
 */

export type CriterionState = 'good' | 'ok' | 'bad' | 'unknown';
/** Matches the checkFit result (`FitCheck.fit`). */
export type FitLevel = 'good' | 'acceptable' | 'poor';

export type QualityCriteria = {
  level: CriterionState;
  framing: CriterionState;
  light: CriterionState;
};

export type PhotoQuality = {
  /** The true internal score (0–100), used for the retry decision. */
  score: number;
  /** The number shown to the user: `score − DISPLAY_OFFSET`, clamped (owner
   *  2026-07-06). We prompt a retake a little stricter than the shown bar
   *  suggests, so the displayed number still crosses 80 exactly at the trigger. */
  displayScore: number;
  criteria: QualityCriteria;
  /** True when the real score is below the retry bar (triggers the retry modal). */
  belowThreshold: boolean;
};

/** Real-score bar for prompting a retake. Stricter than the displayed 80 so the
 *  detector is "picky" (owner §4A): retry fires at real < 85, i.e. shown < 80. */
export const RETRY_THRESHOLD = 85;
/** Shown score is the real score minus this offset. */
export const DISPLAY_OFFSET = 5;

const STATE_VALUE: Record<CriterionState, number> = { good: 100, ok: 70, bad: 35, unknown: 70 };
const WEIGHT: Record<keyof QualityCriteria, number> = { level: 0.3, framing: 0.4, light: 0.3 };

/**
 * Roll (camera rotated in its own plane) and pitch (leaning back or forward)
 * are NOT the same defect and must not share a tolerance.
 *
 * Roll is the one that ruins a progress photo: it rotates the horizon, so the
 * body sits at a different angle than in the baseline and nothing lines up.
 * A few degrees is all that's tolerable.
 *
 * Pitch is normal. Holding a phone at arm's length for a selfie, or propping it
 * against something to fit a full body in frame, leans it back 10-25° every
 * single time; the resulting photo is perfectly usable. Judging it at the roll
 * bar meant real captures scored 'bad' on the one signal a baseline shot has,
 * so the readout sat at 30% permanently and stopped carrying any information.
 * Only a genuinely off-axis phone (aimed at the floor or the ceiling) is bad.
 */
const ROLL_GOOD_DEG = 3;
const ROLL_OK_DEG = 8;
const PITCH_GOOD_DEG = 12;
const PITCH_OK_DEG = 25;

function band(deg: number, good: number, ok: number): CriterionState {
  if (deg <= good) return 'good';
  if (deg <= ok) return 'ok';
  return 'bad';
}

const WORST: CriterionState[] = ['good', 'ok', 'bad'];
function worse(a: CriterionState, b: CriterionState): CriterionState {
  return WORST.indexOf(a) >= WORST.indexOf(b) ? a : b;
}

function levelState(input: { tiltDeg?: number; rollDeg?: number; pitchDeg?: number }): CriterionState {
  const { rollDeg, pitchDeg } = input;
  if (rollDeg != null || pitchDeg != null) {
    // The shot is only as level as its worse axis: a clean roll doesn't excuse
    // a phone pointed at the floor, and vice versa.
    const r = rollDeg != null ? band(Math.abs(rollDeg), ROLL_GOOD_DEG, ROLL_OK_DEG) : 'unknown';
    const p = pitchDeg != null ? band(Math.abs(pitchDeg), PITCH_GOOD_DEG, PITCH_OK_DEG) : 'unknown';
    if (r === 'unknown') return p;
    if (p === 'unknown') return r;
    return worse(r, p);
  }
  // Fallback for callers with only the combined magnitude (and for photos
  // captured before the axes were recorded separately). Judged at the pitch
  // bar: the combined figure is dominated by lean in practice, so the tight
  // roll bar would condemn ordinary shots.
  if (input.tiltDeg == null) return 'unknown';
  return band(Math.abs(input.tiltDeg), PITCH_GOOD_DEG, PITCH_OK_DEG);
}

function framingState(fit?: FitLevel): CriterionState {
  if (!fit) return 'unknown';
  return fit === 'good' ? 'good' : fit === 'acceptable' ? 'ok' : 'bad';
}

function lightState(luma?: number): CriterionState {
  if (luma == null) return 'unknown';
  if (luma >= 0.35 && luma <= 0.85) return 'good';
  if (luma >= 0.2 && luma <= 0.92) return 'ok';
  return 'bad';
}

export function computeQuality(input: {
  /** Combined tilt magnitude. Kept for stored metadata and older callers; when
   *  `rollDeg`/`pitchDeg` are supplied they take precedence. */
  tiltDeg?: number;
  /** Camera rotation in its own plane (deg). Tight tolerance. */
  rollDeg?: number;
  /** Lean back/forward (deg). Wide tolerance: normal and unavoidable. */
  pitchDeg?: number;
  fit?: FitLevel;
  luma?: number;
}): PhotoQuality {
  const criteria: QualityCriteria = {
    level: levelState(input),
    framing: framingState(input.fit),
    light: lightState(input.luma),
  };

  // Weighted mean over the criteria we actually have a reading for. If every
  // signal is unknown (rare), fall back to the neutral value rather than divide
  // by zero.
  let weighted = 0;
  let weightSum = 0;
  (Object.keys(criteria) as (keyof QualityCriteria)[]).forEach((k) => {
    if (criteria[k] === 'unknown') return;
    weighted += STATE_VALUE[criteria[k]] * WEIGHT[k];
    weightSum += WEIGHT[k];
  });
  const score = weightSum > 0 ? Math.round(weighted / weightSum) : STATE_VALUE.unknown;
  const displayScore = Math.min(100, Math.max(0, score - DISPLAY_OFFSET));

  return { score, displayScore, criteria, belowThreshold: score < RETRY_THRESHOLD };
}
