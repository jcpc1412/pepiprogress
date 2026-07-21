/**
 * Journal day-assembly (Wave 7 item 41b, F4). Pure helpers that gather a single
 * day's already-written entities and resolve what can be known about each. The
 * Journal is a read/edit view — it never writes — so these only READ the store
 * slices the check-in, quick-log, Pepi chat, dose drawer, and integrations
 * already populate. Formatting (units, locale, "4 / 5") stays in the screen.
 */
import type { CheckinField } from '@/lib/field-surfacing';
import type { CheckinEntry, DoseEvent, MetricReading, PhotoEntry, SymptomEvent } from '@/lib/store';

/** Provenance of a logged value — who or what wrote it. Drives the SourceBadge. */
export type LogSource = 'health' | 'pepi' | 'quick' | 'typical' | 'tap';

/** Maps an ISO timestamp to a local YYYY-MM-DD key. Passed in so the lib stays
 *  pure and uses the same local-day convention as the dose surfaces. */
export type DayKeyOf = (iso: string) => string;

/** Doses logged on `dateKey`, earliest first. */
export function dosesForDay(doses: DoseEvent[], dateKey: string, dayKeyOf: DayKeyOf): DoseEvent[] {
  return doses.filter((d) => dayKeyOf(d.takenAt) === dateKey).sort((a, b) => (a.takenAt < b.takenAt ? -1 : 1));
}

/** Symptom events with onset on `dateKey`, earliest first. */
export function symptomsForDay(symptoms: SymptomEvent[], dateKey: string, dayKeyOf: DayKeyOf): SymptomEvent[] {
  return symptoms.filter((s) => dayKeyOf(s.onsetAt) === dateKey).sort((a, b) => (a.onsetAt < b.onsetAt ? -1 : 1));
}

/** Photos taken on `dateKey`, earliest first. */
export function photosForDay(photos: PhotoEntry[], dateKey: string, dayKeyOf: DayKeyOf): PhotoEntry[] {
  return photos.filter((p) => dayKeyOf(p.takenAt) === dateKey).sort((a, b) => (a.takenAt < b.takenAt ? -1 : 1));
}

/** Whether the day carries ANY logged data — drives the week-strip logged dot. */
export function dayHasData(
  dateKey: string,
  data: {
    entries: Record<string, CheckinEntry>;
    doses: DoseEvent[];
    symptoms: SymptomEvent[];
    photos: PhotoEntry[];
  },
  dayKeyOf: DayKeyOf,
): boolean {
  if (data.entries[dateKey]) return true;
  if (data.doses.some((d) => dayKeyOf(d.takenAt) === dateKey)) return true;
  if (data.symptoms.some((s) => dayKeyOf(s.onsetAt) === dateKey)) return true;
  if (data.photos.some((p) => dayKeyOf(p.takenAt) === dateKey)) return true;
  return false;
}

/**
 * Provenance of a check-in field's current value, when it can be known honestly.
 * Integration autofill is tagged on the entry (`autoFilled`) → HEALTH. Everything
 * else is indistinguishable at rest (a typed, quick-logged, or Pepi-logged value
 * look identical in the store), so we return undefined rather than guess — a wrong
 * badge is worse than no badge (bias-toward-uncertainty).
 */
export function checkinFieldSource(entry: CheckinEntry | undefined, field: string): LogSource | undefined {
  if (!entry) return undefined;
  return entry.autoFilled?.includes(field) ? 'health' : undefined;
}

/** Provenance of a metric reading: the typical-day estimator vs a real device. */
export function metricReadingSource(r: MetricReading): LogSource {
  return r.sourceProvider === 'typical' ? 'typical' : 'health';
}

/**
 * How many of the tracked data fields have a value on the day. Presence, not
 * performance — no percentages, no streaks (spec 03). `fields` is the set of
 * surfaced data fields (the "areas" the user could log).
 */
export function completeness(
  entry: CheckinEntry | undefined,
  fields: CheckinField[],
): { filled: number; total: number } {
  const total = fields.length;
  if (!entry) return { filled: 0, total };
  const filled = fields.filter((f) => {
    const v = (entry as Record<string, unknown>)[f];
    return v !== undefined && v !== null && v !== '';
  }).length;
  return { filled, total };
}
