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

export type ReconSuggestion = {
  /** BAC water to add, mL. */
  waterMl: number;
  concentrationMgPerMl: number;
  /** Volume drawn per dose, mL. */
  perDoseVolumeMl: number;
  /** Same, in U-100 syringe units. */
  perDoseUnits: number;
};

/**
 * Auto-suggest a reconstitution that makes each dose a round, comfortable draw
 * (P-03). Targets a clean units-per-dose in [10,50] and derives the water from
 * it: water = unitsPerDose × dosesPerVial / 100. Worked example: 30 mg vial,
 * 3 mg dose → 10 doses → 30 units → 3 mL → 10 mg/mL.
 *
 * `doseMg`/`vialMg` are in mg. Returns null only for non-positive inputs.
 */
export function suggestReconstitution(vialMg: number, doseMg: number): ReconSuggestion | null {
  if (!(vialMg > 0) || !(doseMg > 0) || doseMg > vialMg) return null;

  const dosesPerVial = vialMg / doseMg;
  // Comfortable, round units-per-dose in preference order.
  const candidates = [25, 30, 20, 40, 50, 15, 35, 45, 10];

  const make = (units: number): ReconSuggestion => {
    const waterMl = (units * dosesPerVial) / 100;
    const concentrationMgPerMl = vialMg / waterMl;
    return {
      waterMl: roundTo(waterMl, 2),
      concentrationMgPerMl: roundTo(concentrationMgPerMl, 2),
      perDoseVolumeMl: roundTo(units / UNITS_PER_ML, 3),
      perDoseUnits: units,
    };
  };

  const inRange = candidates
    .map((u) => ({ u, water: (u * dosesPerVial) / 100 }))
    .filter(({ water }) => water >= 0.5 && water <= 5);

  if (inRange.length === 0) {
    // Extreme ratio — fall back to a fixed 1 mg/mL concentration; never show nothing.
    const waterMl = vialMg / 1;
    return {
      waterMl: roundTo(waterMl, 2),
      concentrationMgPerMl: 1,
      perDoseVolumeMl: roundTo(doseMg / 1, 3),
      perDoseUnits: roundTo((doseMg / 1) * UNITS_PER_ML, 1),
    };
  }

  // Prefer a candidate whose water lands on a 0.5 mL grid; else the first in-range.
  const onGrid = inRange.find(({ water }) => Math.abs(water * 2 - Math.round(water * 2)) < 1e-9);
  return make((onGrid ?? inRange[0]).u);
}
