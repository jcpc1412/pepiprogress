/**
 * Builds the localized vocabulary the deterministic quick-log matcher (F3) runs
 * against.
 *
 * Kept apart from the matcher so the matcher stays pure and testable. The
 * phrases come from the i18n catalog rather than a hardcoded English table, so
 * "peso 80" and "Gewicht 80" work exactly as well as "weight 80" and a new
 * locale needs no code change. Compound names come from the user's own protocol
 * first, since that is the shortlist of things they actually take.
 */

import type { TFunction } from 'i18next';

import { compoundBySlug } from '@/data/compound-catalog';
import type { DeterministicVocab, DoseCandidate } from '@/lib/quick-log-deterministic';
import type { ProtocolItem } from '@/lib/store';

/** Check-in fields whose label lives under the `fields.*` i18n namespace. */
const LABELLED_FIELDS = [
  'weight',
  'sleep_quality',
  'wellness',
  'appetite',
  'energy',
  'soreness',
  'workout_effort',
  'libido',
  'protein',
  'calories',
] as const;

/** Tape measurements, labelled under `measurements.*`. */
const MEASUREMENT_FIELDS = ['waist', 'hips', 'neck', 'chest', 'arms', 'thighs'] as const;

/**
 * A label can carry several names at once ("Mood / wellness") and a locale may
 * bracket or parenthesise. Split into the individual words a user would type.
 */
function labelVariants(label: string): string[] {
  return label
    .split(/[/|(),]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

/** Short forms the user types instead of the full label ("cals", "sleep"),
 *  authored per locale as a comma-separated list. Missing key = no aliases. */
function aliasesFor(t: TFunction, field: string): string[] {
  const raw = t(`quicklogAlias.${field}`, { defaultValue: '' });
  if (typeof raw !== 'string' || !raw.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

export function buildQuickLogVocab(t: TFunction, protocolItems: ProtocolItem[]): DeterministicVocab {
  const fields: Record<string, string[]> = {};

  for (const field of LABELLED_FIELDS) {
    fields[field] = [...labelVariants(t(`fields.${field}`)), ...aliasesFor(t, field)];
  }
  for (const field of MEASUREMENT_FIELDS) {
    fields[field] = [...labelVariants(t(`measurements.${field}`)), ...aliasesFor(t, field)];
  }

  // One candidate per protocol item: the compound's catalog name and aliases,
  // carrying the protocol's own dose so "sema" alone is loggable.
  const compounds: DoseCandidate[] = [];
  for (const item of protocolItems) {
    const compound = compoundBySlug(item.compoundSlug);
    const names = compound ? [compound.canonicalName, ...compound.aliases] : [item.compoundSlug];
    compounds.push({
      compoundSlug: item.compoundSlug,
      names,
      dose: item.dose,
      doseUnit: item.doseUnit,
    });
  }

  return { fields, compounds };
}
