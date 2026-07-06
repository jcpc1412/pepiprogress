/**
 * Body-fat estimation (redesign §4A) — the US Navy circumference method, plus a
 * coarse body-composition inference used to calibrate the vision AI.
 *
 * Pure and deterministic (offline, testable). **Observational estimate only**,
 * never a medical measurement: the Navy method carries a standard error of
 * roughly ±3.5% body fat, so every result is returned with error bars and must
 * be shown hedged (spec 04/05, legal rung 1). No diagnosis, no dosing.
 *
 * Formula (metric, all lengths in cm, log base 10):
 *   men:   %BF = 495 / (1.0324 − 0.19077·log10(waist − neck) + 0.15456·log10(height)) − 450
 *   women: %BF = 495 / (1.29579 − 0.35004·log10(waist + hip − neck) + 0.22100·log10(height)) − 450
 *
 * We select the women's formula whenever a hip circumference is supplied (it is
 * required there and omitted in the men's), which sidesteps encoding identity and
 * keys purely off the measurement the user actually took.
 */

/** Navy method standard error of the estimate (absolute % body fat). */
export const BF_ERROR_MARGIN = 4;

const IN_TO_CM = 2.54;
const toCm = (v: number, units: 'metric' | 'imperial') => (units === 'imperial' ? v * IN_TO_CM : v);
const clampPct = (v: number) => Math.min(60, Math.max(3, v));

export type BodyFatEstimate = { pct: number; low: number; high: number };

/**
 * Estimate body-fat %. Measurements are in the user's `units` (cm or in) and
 * converted internally. Returns null when inputs are missing or out of the
 * formula's valid domain (e.g. neck >= waist), so callers can hide the readout
 * rather than show a garbage number.
 */
export function bodyFatNavy(opts: {
  units: 'metric' | 'imperial';
  heightCm?: number; // always cm (from profile.height, converted by caller if needed)
  waist?: number;
  neck?: number;
  hip?: number;
}): BodyFatEstimate | null {
  const { units } = opts;
  const height = opts.heightCm;
  if (!height || height <= 0) return null;
  if (opts.waist == null || opts.neck == null) return null;

  const waist = toCm(opts.waist, units);
  const neck = toCm(opts.neck, units);
  const hip = opts.hip != null ? toCm(opts.hip, units) : undefined;

  let raw: number;
  if (hip != null && hip > 0) {
    const inner = waist + hip - neck;
    if (inner <= 0) return null;
    raw = 495 / (1.29579 - 0.35004 * Math.log10(inner) + 0.221 * Math.log10(height)) - 450;
  } else {
    const inner = waist - neck;
    if (inner <= 0) return null; // neck must be smaller than waist
    raw = 495 / (1.0324 - 0.19077 * Math.log10(inner) + 0.15456 * Math.log10(height)) - 450;
  }

  if (!Number.isFinite(raw)) return null;
  const pct = clampPct(raw);
  return {
    pct: Math.round(pct * 10) / 10,
    low: Math.round(clampPct(pct - BF_ERROR_MARGIN) * 10) / 10,
    high: Math.round(clampPct(pct + BF_ERROR_MARGIN) * 10) / 10,
  };
}

export type BodyComposition = 'lean' | 'fit' | 'average' | 'higher';

/**
 * Coarse body-composition band from a body-fat %, used to calibrate the vision
 * AI (replacing the manual body-type chip as the primary input; the chip stays a
 * cold-start fallback). `female` selects the higher healthy-range thresholds.
 */
export function inferBodyComposition(bfPct: number, female: boolean): BodyComposition {
  const t = female ? [21, 25, 32] : [14, 18, 25];
  if (bfPct < t[0]) return 'lean';
  if (bfPct < t[1]) return 'fit';
  if (bfPct < t[2]) return 'average';
  return 'higher';
}
