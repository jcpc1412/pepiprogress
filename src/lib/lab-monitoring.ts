import { compoundBySlug } from '@/data/compound-catalog';
import { daysBetween } from '@/lib/dates';
import type { CheckinEntry, ProtocolItem } from '@/lib/store';

/**
 * Bloodwork-to-compound monitoring mapping (spec positioning §3 item 4, W4-16).
 * A compound's monitoring_tags already know which markers it wants watched
 * (testosterone watches hematocrit + estradiol + lipids). This surfaces, per
 * active protocol item, which of those markers are lab markers, the latest value
 * imported for each, and how long ago it was checked, flagging never-checked and
 * overdue markers.
 *
 * Pure + deterministic (no AI, no network); `today` is a parameter.
 */

/** monitoring_tags that are bloodwork markers (the rest, e.g. appetite/nausea,
 *  are symptom-monitoring tags surfaced as check-in fields, not labs). */
export const LAB_MARKERS = new Set<string>([
  'estradiol',
  'glucose',
  'hematocrit',
  'lipids',
  'liver_enzymes',
  'prolactin',
  'testosterone_total',
]);

/** A checked marker older than this is flagged as due for a re-check. */
export const STALE_DAYS = 90;

export type MarkerStatus = 'recent' | 'stale' | 'never';

export type MarkerMonitoring = {
  marker: string;
  status: MarkerStatus;
  /** Latest imported value + the check-in date it came from (if any). */
  value?: number;
  date?: string;
  daysAgo?: number;
};

/** Latest imported value for a marker across all check-ins that carry lab values. */
function latestForMarker(
  entries: Record<string, CheckinEntry>,
  marker: string,
): { value: number; date: string } | null {
  let best: { value: number; date: string } | null = null;
  for (const e of Object.values(entries)) {
    const v = e.labValues?.[marker];
    if (typeof v !== 'number') continue;
    if (!best || e.date > best.date) best = { value: v, date: e.date };
  }
  return best;
}

/**
 * The markers a single compound wants watched, each with its latest imported
 * value + recency. Empty when the compound has no bloodwork monitoring tags.
 */
export function selectCompoundMonitoring(
  slug: string,
  entries: Record<string, CheckinEntry>,
  today: string,
): MarkerMonitoring[] {
  const compound = compoundBySlug(slug);
  if (!compound) return [];
  const markers = compound.monitoringTags.filter((tag) => LAB_MARKERS.has(tag));
  return markers.map((marker) => {
    const latest = latestForMarker(entries, marker);
    if (!latest) return { marker, status: 'never' as const };
    const daysAgo = Math.max(0, daysBetween(latest.date, today));
    return {
      marker,
      value: latest.value,
      date: latest.date,
      daysAgo,
      status: daysAgo > STALE_DAYS ? ('stale' as const) : ('recent' as const),
    };
  });
}

/** True when any active protocol item has a bloodwork marker that is never
 *  checked or overdue (drives an attention affordance). */
export function hasMonitoringGap(
  protocolItems: ProtocolItem[],
  entries: Record<string, CheckinEntry>,
  today: string,
): boolean {
  for (const item of protocolItems) {
    const markers = selectCompoundMonitoring(item.compoundSlug, entries, today);
    if (markers.some((m) => m.status !== 'recent')) return true;
  }
  return false;
}
