import { usesFemaleFormula } from '@/lib/body-composition';
import { shiftDateKey } from '@/lib/dates';
import { metricForDate } from '@/lib/integrations/autofill';
import { projectSeries } from '@/lib/trajectory';
import type { CheckinEntry, LocalProfile, MetricReading } from '@/lib/store';

/**
 * Energy-balance calibration (TRAJ-2, notes-2026-07-16 §7). A personal TDEE loop
 * run off the data we already have — logged intake + the weight trend — instead
 * of a food-logger's own model:
 *
 *  - Personal maintenance (TDEE): weight doesn't lie over a window, so observed
 *    weight change (in kcal, ~7700/kg) subtracted from average intake solves for
 *    actual expenditure. No device estimate needed.
 *  - Device calibration: when Apple/Health active-energy is flowing, the solved
 *    maintenance vs the device's reported burn is a personal bias multiplier
 *    ("your watch overreports by ~18%").
 *  - Disagreement as insight: the pace your logged intake implies vs the pace the
 *    scale actually shows. A gap means underlogged intake or metabolic adaptation.
 *  - Graceful degradation: with intake + weight it reports maintenance; the
 *    device-calibration + implied-pace layer activates only when activity data
 *    flows. Returns null when there is too little to say honestly.
 *
 * Pure + deterministic (no RN / i18n / network); `today` is a parameter. Reuses
 * TRAJ-1's `projectSeries` for the observed slope so nothing can disagree.
 */

/** Energy in one kilogram of body-mass change (mixed tissue, the standard proxy). */
export const KCAL_PER_KG = 7700;
const WINDOW_DAYS = 14;
const MIN_INTAKE_DAYS = 5;
/** A daily deficit/surplus gap below this (kcal) reads as measurement noise, not signal. */
const ALIGNED_KCAL = 150;

export type EbDisagreement = 'aligned' | 'slower' | 'faster';

export type EnergyBalance = {
  /** Solved personal maintenance (kcal/day). */
  maintenanceKcal: number;
  avgIntakeKcal: number;
  /** Observed weight trend over the window (kg/day; negative = losing). */
  observedSlopeKgPerDay: number;
  days: number;
  intakeDays: number;
  /** Device-reported total burn (kcal/day), when activity data is present. */
  deviceBurnKcal?: number;
  /** solvedMaintenance / deviceBurn: <1 means the device overreports. */
  deviceBias?: number;
  /** Pace the reference expenditure implies (kg/day), when a reference exists. */
  impliedSlopeKgPerDay?: number;
  /** Observed vs implied pace, once a reference expenditure exists. */
  disagreement?: EbDisagreement;
  /** Recent intake shift (last ~4 days vs the window) — a leading, proactive hook. */
  intakeShift?: 'lower' | 'higher' | 'steady';
};

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Age in years from an ISO DOB, or a neutral default when unknown. */
function ageFrom(dobISO: string | undefined, today: string): number {
  if (!dobISO) return 35;
  const years = (new Date(`${today}T00:00:00.000Z`).getTime() - new Date(dobISO).getTime()) / (365.25 * 86400000);
  return years > 0 && years < 120 ? years : 35;
}

/** Mifflin-St Jeor basal metabolic rate (kcal/day). Sex follows hormones, like
 *  the body-composition formulas. Height in cm, weight in kg. */
function basalMetabolicRate(weightKg: number, heightCm: number, age: number, female: boolean): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return female ? base - 161 : base + 5;
}

/** Per-day weight in kg over the window (manual check-in weight preferred, else a
 *  Health `body.weight` reading). Manual weight is stored in the user's unit.
 *  Kept kg-native on purpose: this TDEE math needs kilograms, whereas the canonical
 *  resolver (resolveMetricSeries) returns weight in display units. The merge rule
 *  here (manual wins, else integration) matches the resolver's. */
function weightSeriesKg(
  entries: Record<string, CheckinEntry>,
  metricReadings: MetricReading[],
  units: 'metric' | 'imperial',
  windowStart: string,
  today: string,
): { dateKey: string; value: number }[] {
  const toKg = (v: number) => (units === 'imperial' ? v / 2.20462 : v);
  const out: { dateKey: string; value: number }[] = [];
  for (const e of Object.values(entries)) {
    if (e.date < windowStart || e.date > today) continue;
    if (typeof e.weight === 'number') out.push({ dateKey: e.date, value: toKg(e.weight) });
  }
  // Fill days with no manual weight from a Health reading (already kg).
  const covered = new Set(out.map((p) => p.dateKey));
  for (let d = windowStart; d <= today; d = shiftDateKey(d, 1)) {
    if (covered.has(d)) continue;
    const r = metricForDate(metricReadings, 'body.weight', d);
    if (r) out.push({ dateKey: d, value: r.value });
  }
  return out.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

/** Per-day intake kcal over the window (manual calories preferred, else a Health
 *  `nutrition.energy` reading). */
function intakeSeries(
  entries: Record<string, CheckinEntry>,
  metricReadings: MetricReading[],
  windowStart: string,
  today: string,
): { dateKey: string; value: number }[] {
  const byDay = new Map<string, number>();
  for (const e of Object.values(entries)) {
    if (e.date < windowStart || e.date > today) continue;
    if (typeof e.calories === 'number') byDay.set(e.date, e.calories);
  }
  for (let d = windowStart; d <= today; d = shiftDateKey(d, 1)) {
    if (byDay.has(d)) continue;
    const r = metricForDate(metricReadings, 'nutrition.energy', d);
    if (r) byDay.set(d, r.value);
  }
  return [...byDay.entries()].map(([dateKey, value]) => ({ dateKey, value })).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

/** Average per-day device active-energy over the window, or null when absent. */
function avgActiveEnergy(metricReadings: MetricReading[], windowStart: string, today: string): number | null {
  const perDay: number[] = [];
  for (let d = windowStart; d <= today; d = shiftDateKey(d, 1)) {
    const r = metricForDate(metricReadings, 'activity.energy', d);
    if (r) perDay.push(r.value);
  }
  return perDay.length ? mean(perDay) : null;
}

export type EnergyBalanceInput = {
  entries: Record<string, CheckinEntry>;
  metricReadings: MetricReading[];
  profile: Pick<LocalProfile, 'units' | 'sex' | 'height' | 'dobISO'>;
  today?: string;
  windowDays?: number;
};

export function computeEnergyBalance(input: EnergyBalanceInput): EnergyBalance | null {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const windowDays = input.windowDays ?? WINDOW_DAYS;
  const windowStart = shiftDateKey(today, -(windowDays - 1));

  const intake = intakeSeries(input.entries, input.metricReadings, windowStart, today);
  if (intake.length < MIN_INTAKE_DAYS) return null; // not enough logged intake to solve

  const weightKg = weightSeriesKg(input.entries, input.metricReadings, input.profile.units, windowStart, today);
  const proj = projectSeries(weightKg, windowDays);
  if (!proj) return null; // TRAJ-1 needs a real weight trend to anchor the balance

  const avgIntake = mean(intake.map((p) => p.value));
  const observedSlope = proj.slopePerDay; // kg/day (plateau-flattened)
  // Solve maintenance: intake − dailyEnergyBalance = expenditure.
  const maintenanceKcal = Math.round(avgIntake - observedSlope * KCAL_PER_KG);

  const out: EnergyBalance = {
    maintenanceKcal,
    avgIntakeKcal: Math.round(avgIntake),
    observedSlopeKgPerDay: observedSlope,
    days: windowDays,
    intakeDays: intake.length,
  };

  // Recent intake shift (last 4 logged days vs the window) — a leading signal the
  // scale has not caught up to yet.
  if (intake.length >= 6) {
    const recent = mean(intake.slice(-4).map((p) => p.value));
    const deltaK = recent - avgIntake;
    out.intakeShift = deltaK < -ALIGNED_KCAL ? 'lower' : deltaK > ALIGNED_KCAL ? 'higher' : 'steady';
  }

  // Device calibration + implied pace, when a reference expenditure exists.
  const active = avgActiveEnergy(input.metricReadings, windowStart, today);
  const lastWeightKg = weightKg[weightKg.length - 1]?.value;
  if (active !== null && typeof input.profile.height === 'number' && typeof lastWeightKg === 'number') {
    const heightCm = input.profile.units === 'imperial' ? input.profile.height * 2.54 : input.profile.height;
    const bmr = basalMetabolicRate(lastWeightKg, heightCm, ageFrom(input.profile.dobISO, today), usesFemaleFormula(input.profile.sex));
    const deviceBurn = Math.round(bmr + active); // active energy sits on top of basal
    out.deviceBurnKcal = deviceBurn;
    out.deviceBias = Math.round((maintenanceKcal / deviceBurn) * 100) / 100;

    const impliedSlope = (avgIntake - deviceBurn) / KCAL_PER_KG;
    out.impliedSlopeKgPerDay = impliedSlope;
    const diffKcal = (observedSlope - impliedSlope) * KCAL_PER_KG; // >0: losing slower than implied
    out.disagreement = Math.abs(diffKcal) < ALIGNED_KCAL ? 'aligned' : diffKcal > 0 ? 'slower' : 'faster';
  }

  return out;
}
