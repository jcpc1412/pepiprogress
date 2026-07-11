/**
 * Pure helpers for mirroring a check-in's body metrics back to a health store.
 *
 * Canonical write units (see HealthWriteSample): weight kg, `body.fat_pct` a
 * percentage number, waist cm. Check-in values are stored in the user's display
 * units (kg/lb, cm/in), so we convert here; body-fat is the computed Navy
 * estimate (no separate logged value exists). Deterministic + offline-testable.
 */

import { bodyFatNavy, usesFemaleFormula } from '@/lib/body-composition';
import type { CheckinEntry, LocalProfile } from '@/lib/store';
import type { HealthWriteSample } from '@/lib/integrations/types';

const LB_PER_KG = 2.20462;
const IN_PER_CM = 2.54;

const round = (v: number) => Math.round(v * 100) / 100;

const toKg = (weight: number, units: LocalProfile['units']) =>
  units === 'imperial' ? weight / LB_PER_KG : weight;
const toCm = (len: number, units: LocalProfile['units']) =>
  units === 'imperial' ? len * IN_PER_CM : len;

/**
 * Build the canonical write-samples for one check-in. Only includes a metric when
 * its source value is present (weight; waist; and body-fat when the Navy inputs —
 * height + waist + neck, plus hip for the female formula — are all available).
 * Timestamped at local noon on the check-in date to avoid a timezone day-shift.
 */
export function buildBodySamples(checkin: CheckinEntry, profile: LocalProfile): HealthWriteSample[] {
  const ts = `${checkin.date}T12:00:00`;
  const out: HealthWriteSample[] = [];

  if (typeof checkin.weight === 'number') {
    out.push({ metric: 'body.weight', value: round(toKg(checkin.weight, profile.units)), ts });
  }
  if (typeof checkin.waist === 'number') {
    out.push({ metric: 'body.waist', value: round(toCm(checkin.waist, profile.units)), ts });
  }

  const heightCm = profile.height != null ? toCm(profile.height, profile.units) : undefined;
  const bf = bodyFatNavy({
    units: profile.units,
    heightCm,
    waist: checkin.waist,
    neck: checkin.neck,
    hip: checkin.hips,
    female: usesFemaleFormula(profile.sex),
  });
  if (bf) out.push({ metric: 'body.fat_pct', value: bf.pct, ts });

  return out;
}

/** Stable hash of a day's samples, to skip re-writing unchanged data. */
export function hashSamples(samples: HealthWriteSample[]): string {
  return samples
    .map((s) => `${s.metric}:${s.value}`)
    .sort()
    .join('|');
}
