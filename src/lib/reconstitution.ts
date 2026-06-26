/**
 * Reconstitution + dose→volume math (spec 03, table-stakes).
 *
 * Peptides ship as a lyophilized powder (mg per vial). You add bacteriostatic
 * water (mL) to dissolve it, giving a concentration (mg/mL). To draw a dose you
 * convert the desired dose → volume → insulin-syringe units.
 *
 * Units convention: a U-100 insulin syringe has 100 "units" per mL, so
 * 1 unit = 0.01 mL. This is the syringe marking users actually read.
 */

export const UNITS_PER_ML = 100; // U-100 insulin syringe

/** Concentration in mg/mL from vial strength (mg) and added water (mL). */
export function concentrationMgPerMl(vialMg: number, waterMl: number): number | null {
  if (!(vialMg > 0) || !(waterMl > 0)) return null;
  return vialMg / waterMl;
}

export type DoseUnit = 'mg' | 'mcg';

/** Normalize a dose to mg. */
function doseToMg(dose: number, unit: DoseUnit): number {
  return unit === 'mcg' ? dose / 1000 : dose;
}

export type DrawResult = {
  /** Volume to draw, in mL. */
  volumeMl: number;
  /** Same volume expressed in U-100 syringe units. */
  syringeUnits: number;
};

/**
 * Volume to draw for a desired dose, given concentration (mg/mL).
 * Returns null for non-positive / invalid inputs.
 */
export function doseToDraw(
  dose: number,
  doseUnit: DoseUnit,
  concentrationMgPerMl: number,
): DrawResult | null {
  if (!(dose > 0) || !(concentrationMgPerMl > 0)) return null;
  const volumeMl = doseToMg(dose, doseUnit) / concentrationMgPerMl;
  return {
    volumeMl,
    syringeUnits: volumeMl * UNITS_PER_ML,
  };
}

/** Round for display without implying false precision. */
export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
