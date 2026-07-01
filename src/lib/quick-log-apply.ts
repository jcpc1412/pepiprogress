import type { ParsedItem } from '@/lib/ai';
import type { CheckinEntry, DoseEvent, SymptomEvent } from '@/lib/store';

/** Confidence at/above which a parsed item is applied without review. */
export const AUTO_APPLY_CONFIDENCE = 0.7;

/** Whether a parsed item has the fields it needs to be written to the store. */
export function isResolvable(item: ParsedItem): boolean {
  switch (item.kind) {
    case 'weight':
      return typeof item.weight === 'number';
    case 'checkin':
      return !!item.field && typeof item.value === 'number';
    case 'symptom':
      return !!item.symptomType;
    case 'dose':
      return !!item.compoundSlug;
    default:
      return false;
  }
}

/** Store writers the applier needs — a subset of the store context. */
export type ApplyDeps = {
  /** The day (YYYY-MM-DD) the entries belong to. */
  today: string;
  upsertCheckin: (date: string, patch: Partial<Omit<CheckinEntry, 'date' | 'updatedAt'>>) => void;
  addSymptomEvent: (event: Omit<SymptomEvent, 'id'>) => string;
  logDose: (dose: Omit<DoseEvent, 'id'>) => string;
};

/**
 * Apply the confident, resolvable items from a quick-log parse to the store.
 * Shared by the interactive path and the background runner so both write the
 * same way. Low-confidence, unresolved, and `unknown` items are skipped (their
 * count is returned so the UI can note them). Never throws.
 */
export function applyParsedItems(
  items: ParsedItem[],
  deps: ApplyDeps,
): { applied: number; skipped: number } {
  let applied = 0;
  let skipped = 0;
  for (const item of items) {
    if (
      item.kind === 'unknown' ||
      (item.confidence ?? 1) < AUTO_APPLY_CONFIDENCE ||
      !isResolvable(item)
    ) {
      skipped++;
      continue;
    }
    switch (item.kind) {
      case 'weight':
        deps.upsertCheckin(deps.today, { weight: item.weight });
        break;
      case 'checkin':
        deps.upsertCheckin(deps.today, {
          [item.field as keyof CheckinEntry]: item.value,
        } as Partial<Omit<CheckinEntry, 'date' | 'updatedAt'>>);
        break;
      case 'symptom':
        deps.addSymptomEvent({
          type: item.symptomType ?? '',
          onsetAt: item.onsetISO ?? new Date().toISOString(),
          durationMinutes: item.durationMinutes,
          severity: item.severity,
          note: item.note,
        });
        break;
      case 'dose':
        deps.logDose({
          compoundSlug: item.compoundSlug,
          takenAt: item.onsetISO ?? new Date().toISOString(),
          dose: item.dose,
          doseUnit: item.doseUnit,
        });
        break;
    }
    applied++;
  }
  return { applied, skipped };
}
