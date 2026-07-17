/**
 * The one confidence register (W4-18, external review 2026-07-16). Everywhere
 * Pepi draws a conclusion — the verdict, a photo read, a per-compound
 * attribution, a compound-info fact, a forecast — it reports how sure it is in
 * the SAME three-level language, rendered by the shared ConfidenceBadge. This
 * is the pure core: the levels, the score→level mapping, and the filled-dot
 * meter. No RN / i18n imports so it stays testable and locale-agnostic.
 */

export type ConfidenceLevel = 'low' | 'medium' | 'high';

/** The canonical thresholds, matching the attribution card's original cut
 *  points so nothing shifts as surfaces adopt the shared register. */
export const CONFIDENCE_HIGH = 0.75;
export const CONFIDENCE_MEDIUM = 0.4;

/** Map a 0–1 confidence score to the shared level. Values outside [0,1] clamp. */
export function levelFromScore(score: number): ConfidenceLevel {
  if (score >= CONFIDENCE_HIGH) return 'high';
  if (score >= CONFIDENCE_MEDIUM) return 'medium';
  return 'low';
}

/** Filled dots out of three for the instrument-style meter (low=1, high=3). */
export function meterFilled(level: ConfidenceLevel): number {
  return level === 'high' ? 3 : level === 'medium' ? 2 : 1;
}
