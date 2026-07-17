import { daysBetween } from '@/lib/dates';
import { selectCompoundMonitoring } from '@/lib/lab-monitoring';
import { getCadence, groupForSlug } from '@/lib/photo-cadence';
import type { CheckinEntry, PhotoEntry, ProtocolItem } from '@/lib/store';
import type { Localizable } from '@/lib/verdict-engine';

/**
 * "What should I measure next?" (W4-17, external review 2026-07-16). The verdict
 * names its own biggest evidence gap: a photo that would strengthen the read, or
 * a bloodwork marker that has gone unchecked. Sources: a compound's monitoring
 * tags + bloodwork recency (via lab-monitoring) and its photo cadence (via
 * photo-cadence). Surfaces on the reasoning screen and as a Today-level nudge.
 *
 * Pure + deterministic (no AI, no network); `today` is a parameter. Emits i18n
 * *keys* (Localizable), never prose, so it stays testable and locale-agnostic.
 */

export type EvidenceGapKind = 'bloodwork' | 'photo';
/** Where the offer/nudge routes to — resolved to a concrete action by the UI. */
export type EvidenceGapTarget = 'photos' | 'labs';

export type EvidenceGap = {
  kind: EvidenceGapKind;
  target: EvidenceGapTarget;
  /** Sort weight; higher surfaces first. Bloodwork gaps outrank photo gaps. */
  priority: number;
  message: Localizable;
};

export type EvidenceGapInput = {
  protocolItems: ProtocolItem[];
  entries: Record<string, CheckinEntry>;
  photos: PhotoEntry[];
  /** Reference "today" (YYYY-MM-DD). Defaults to now. */
  today?: string;
};

const weeksAgo = (days: number): number => Math.max(1, Math.round(days / 7));

/** Bloodwork gaps: markers an active compound wants watched that are never
 *  checked or overdue. Deduped across compounds, keeping the worst status. */
function bloodworkGaps(input: EvidenceGapInput, today: string): EvidenceGap[] {
  // marker -> worst { status, daysAgo }
  const worst = new Map<string, { never: boolean; daysAgo: number }>();
  for (const item of input.protocolItems) {
    for (const m of selectCompoundMonitoring(item.compoundSlug, input.entries, today)) {
      if (m.status === 'recent') continue;
      const prev = worst.get(m.marker);
      const never = m.status === 'never';
      const daysAgo = m.daysAgo ?? 0;
      if (!prev || (never && !prev.never) || (never === prev.never && daysAgo > prev.daysAgo)) {
        worst.set(m.marker, { never, daysAgo });
      }
    }
  }

  const gaps: EvidenceGap[] = [];
  for (const [marker, w] of worst) {
    if (w.never) {
      gaps.push({
        kind: 'bloodwork',
        target: 'labs',
        priority: 100,
        message: { key: 'measureNext.bloodworkNever', params: { marker: `markers.${marker}` } },
      });
    } else {
      // 50 at the stale threshold, rising with overdue-ness (capped well below never).
      const priority = 50 + Math.min(20, (w.daysAgo - 90) / 14);
      gaps.push({
        kind: 'bloodwork',
        target: 'labs',
        priority,
        message: {
          key: 'measureNext.bloodworkStale',
          params: { marker: `markers.${marker}`, count: weeksAgo(w.daysAgo) },
        },
      });
    }
  }
  return gaps;
}

/** Photo gap: no baseline yet, or the last shot predates the compound's
 *  scientific-analysis cadence. Skipped when the active stack has no photo
 *  cadence (e.g. ancillaries only). */
function photoGap(input: EvidenceGapInput, today: string): EvidenceGap | null {
  // Shortest scientific cadence across the active stack's photo-relevant groups.
  // Ancillary-only stacks have no photo cadence and get no photo nudge.
  const cadenceDays = input.protocolItems
    .map((p) => getCadence(groupForSlug(p.compoundSlug)).scientificDays)
    .filter((d) => d > 0)
    .sort((a, b) => a - b)[0];
  if (!cadenceDays) return null;

  if (input.photos.length === 0) {
    return {
      kind: 'photo',
      target: 'photos',
      priority: 45,
      message: { key: 'measureNext.photoBaseline' },
    };
  }

  const last = [...input.photos].sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1))[0];
  const daysAgo = Math.max(0, daysBetween(last.takenAt.slice(0, 10), today));
  if (daysAgo < cadenceDays) return null;

  const priority = 30 + Math.min(14, (daysAgo - cadenceDays) / 7);
  return {
    kind: 'photo',
    target: 'photos',
    priority,
    message: { key: 'measureNext.photoDue', params: { count: weeksAgo(daysAgo) } },
  };
}

/** All current evidence gaps, most valuable first. Empty when there is nothing
 *  worth measuring (no protocol, or everything is current). */
export function computeEvidenceGaps(input: EvidenceGapInput): EvidenceGap[] {
  if (input.protocolItems.length === 0) return [];
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const gaps = bloodworkGaps(input, today);
  const photo = photoGap(input, today);
  if (photo) gaps.push(photo);
  return gaps.sort((a, b) => b.priority - a.priority);
}

/** The single biggest evidence gap, for the Today-level nudge. */
export function topEvidenceGap(input: EvidenceGapInput): EvidenceGap | null {
  return computeEvidenceGaps(input)[0] ?? null;
}
