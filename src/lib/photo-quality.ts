/**
 * Progress-photo quality score (redesign §4A) — a composite "how usable is this
 * shot" confidence, shown as a live readout and used to trigger the low-score
 * retry modal (< 80 → prompt to retake with looser clothing).
 *
 * Pure and deterministic. Combines the signals actually available at capture:
 *  - level: device tilt (deg) from the accelerometer,
 *  - framing: fit vs the prior-photo ghost (checkFit result), a distance proxy,
 *  - light: average luma (0–1) when available.
 * Signals that are unavailable (no ghost yet, no luma) are treated as neutral and
 * excluded from the weighting so a first baseline shot is not unfairly penalized.
 *
 * Brightness/blur/pose refinements are native-detection follow-ups; the score is
 * designed to fold them in later without changing this interface.
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
  score: number; // 0–100
  criteria: QualityCriteria;
  /** True when the score is below the recommended bar (triggers the retry modal). */
  belowThreshold: boolean;
};

export const QUALITY_THRESHOLD = 80;

const STATE_VALUE: Record<CriterionState, number> = { good: 100, ok: 70, bad: 35, unknown: 70 };
const WEIGHT: Record<keyof QualityCriteria, number> = { level: 0.3, framing: 0.4, light: 0.3 };

function levelState(tiltDeg?: number): CriterionState {
  if (tiltDeg == null) return 'unknown';
  if (tiltDeg <= 3) return 'good';
  if (tiltDeg <= 8) return 'ok';
  return 'bad';
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

export function computeQuality(input: { tiltDeg?: number; fit?: FitLevel; luma?: number }): PhotoQuality {
  const criteria: QualityCriteria = {
    level: levelState(input.tiltDeg),
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

  return { score, criteria, belowThreshold: score < QUALITY_THRESHOLD };
}
