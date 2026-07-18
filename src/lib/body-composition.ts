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
 * The two formulas are calibrated to different populations and are NOT
 * interchangeable, so the choice is keyed to the user's sex (via {@link
 * usesFemaleFormula}), never to whether a hip was typed. The men's formula never
 * uses hip; the women's requires it (returns null when it's missing). This fixes
 * the earlier bug where a man who logged his hips got the women's formula and a
 * wildly inflated number.
 */

/** Navy method standard error of the estimate (absolute % body fat). */
export const BF_ERROR_MARGIN = 4;

const IN_TO_CM = 2.54;
const toCm = (v: number, units: 'metric' | 'imperial') => (units === 'imperial' ? v * IN_TO_CM : v);
const clampPct = (v: number) => Math.min(60, Math.max(3, v));

export type BodyFatEstimate = { pct: number; low: number; high: number };

/** Which Navy formula a user's sex selects. Fat distribution follows hormones, so
 *  MTF reads with the female formula and FTM with the male one (matches the
 *  verdict engine's `fatPatternSex`). Unknown sex falls back to the male formula,
 *  which needs no hip and never over-inflates. */
export function usesFemaleFormula(sex: string | undefined): boolean {
  return sex === 'female' || sex === 'mtf';
}

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
  /** Selects the formula. From the caller via {@link usesFemaleFormula}. */
  female?: boolean;
}): BodyFatEstimate | null {
  const { units } = opts;
  const height = opts.heightCm;
  if (!height || height <= 0) return null;
  if (opts.waist == null || opts.neck == null) return null;

  const waist = toCm(opts.waist, units);
  const neck = toCm(opts.neck, units);
  const hip = opts.hip != null ? toCm(opts.hip, units) : undefined;

  let raw: number;
  if (opts.female) {
    // Women's formula requires hip; without it there is no honest estimate.
    if (hip == null || hip <= 0) return null;
    const inner = waist + hip - neck;
    if (inner <= 0) return null;
    raw = 495 / (1.29579 - 0.35004 * Math.log10(inner) + 0.221 * Math.log10(height)) - 450;
  } else {
    // Men's formula never uses hip (a logged hip is ignored here).
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

export type FFMIBand = { low: number; high: number };

/**
 * Fat-free mass index band (W5-22, beta-notes §1.8) — a lean-mass-relative
 * strength/size number gainers care about, derived from height + weight + the
 * Navy body-fat *band*. Because body fat is a range, FFMI is returned as a range
 * too, and shown hedged (same rules as body fat). Never a lean-mass figure from
 * a photo. Uses the normalized FFMI (adjusted to a 1.8 m reference) so it is
 * comparable across heights. Weight in kg, height in cm.
 */
export function ffmiBand(opts: { weightKg?: number; heightCm?: number; bf: BodyFatEstimate }): FFMIBand | null {
  const { weightKg, heightCm, bf } = opts;
  if (!weightKg || weightKg <= 0 || !heightCm || heightCm <= 0) return null;
  const hM = heightCm / 100;
  const ffmiAt = (bfPct: number) => {
    const lean = weightKg * (1 - bfPct / 100);
    return lean / (hM * hM) + 6.1 * (1.8 - hM); // normalized to 1.8 m
  };
  // Lower body-fat → more lean mass → higher FFMI, so the band inverts bf's.
  const high = ffmiAt(bf.low);
  const low = ffmiAt(bf.high);
  return { low: Math.round(low * 10) / 10, high: Math.round(high * 10) / 10 };
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
