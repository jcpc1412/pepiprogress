import { useStore } from '@/lib/store';
import { resolveCoachingLevel, type CoachingLevel } from '@/lib/coaching';
import { useToday } from '@/lib/today';

/**
 * The effective coaching level for the current user (W3-8): an explicit
 * settings choice wins; otherwise it is inferred from commitment signals
 * (see src/lib/coaching.ts). Recomputed live; nothing inferred is persisted.
 */
export function useCoachingLevel(): CoachingLevel {
  const { entries, profile, protocolItems } = useStore();
  const today = useToday();
  const entryDates = Object.keys(entries);
  return resolveCoachingLevel(profile.coachingLevel, {
    entryDates,
    measurementDates: entryDates.filter((d) => {
      const e = entries[d];
      return e.waist !== undefined || e.hips !== undefined || e.neck !== undefined;
    }),
    protocolItemCount: protocolItems.length,
    todayKey: today,
  });
}
