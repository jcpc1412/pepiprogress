/**
 * Strength-training math (W5-21). Pure + deterministic — sport-agnostic, no
 * assumptions about program or lifts. Two things the training log needs from a
 * logged session: total work moved (tonnage) and an estimated one-rep max
 * (e1RM), the comparable strength number across different rep ranges.
 */

export type StrengthSet = { weight: number; reps: number };

/** Total work: the sum of weight × reps across every set (in the user's weight
 *  unit; the caller labels kg vs lb). */
export function tonnage(sets: StrengthSet[]): number {
  return sets.reduce((total, s) => total + Math.max(0, s.weight) * Math.max(0, s.reps), 0);
}

/**
 * Epley estimated one-rep max: weight × (1 + reps/30). A single rep is already a
 * true 1RM, so it returns the weight unchanged. Non-positive input → 0.
 */
export function epley1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

/** The best estimated 1RM across a session's sets (heaviest comparable single). */
export function bestE1RM(sets: StrengthSet[]): number {
  return sets.reduce((best, s) => Math.max(best, epley1RM(s.weight, s.reps)), 0);
}

/** Total reps across the session (a simple volume proxy for bodyweight work). */
export function totalReps(sets: StrengthSet[]): number {
  return sets.reduce((n, s) => n + Math.max(0, s.reps), 0);
}
