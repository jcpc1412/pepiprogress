import type { PhotoSession } from '@/lib/store';

export type CompoundGroup =
  | 'fat_loss'
  | 'skin'
  | 'healing'
  | 'gh_peptides'
  | 'gh_oral'
  | 'trt'
  | 'supplements'
  | 'ancillaries'
  | 'unknown';

type Cadence = { encouragementDays: number; scientificDays: number };

const SLUG_TO_GROUP: Record<string, CompoundGroup> = {
  semaglutide:  'fat_loss',
  tirzepatide:  'fat_loss',
  'ghk-cu':     'skin',
  'bpc-157':    'healing',
  'tb-500':     'healing',
  ipamorelin:   'gh_peptides',
  'cjc-1295':   'gh_peptides',
  'mk-677':     'gh_oral',
  testosterone: 'trt',
  anastrozole:  'ancillaries',
  enclomiphene: 'ancillaries',
  creatine:     'supplements',
};

const CADENCES: Record<CompoundGroup, Cadence> = {
  fat_loss:    { encouragementDays: 7,  scientificDays: 21 },
  skin:        { encouragementDays: 7,  scientificDays: 21 },
  healing:     { encouragementDays: 5,  scientificDays: 5  },
  gh_peptides: { encouragementDays: 14, scientificDays: 42 },
  gh_oral:     { encouragementDays: 7,  scientificDays: 28 },
  trt:         { encouragementDays: 14, scientificDays: 42 },
  supplements: { encouragementDays: 7,  scientificDays: 7  },
  ancillaries: { encouragementDays: 0,  scientificDays: 0  },
  unknown:     { encouragementDays: 7,  scientificDays: 28 },
};

const VISUAL_SYMPTOMS = new Set([
  'face_bloat',
  'abdominal_bloat',
  'water_retention',
  'skin_changes',
  'gyno_tenderness',
  'acne',
]);

/** Returns the compound group with the shortest encouragement cadence across all active slugs. */
export function getGroupForSlugs(slugs: string[]): CompoundGroup {
  let bestGroup: CompoundGroup = 'unknown';
  let bestDays = Infinity;
  for (const slug of slugs) {
    const group = SLUG_TO_GROUP[slug] ?? 'unknown';
    const days = CADENCES[group].encouragementDays;
    if (days > 0 && days < bestDays) {
      bestDays = days;
      bestGroup = group;
    }
  }
  return bestGroup;
}

export function getCadence(group: CompoundGroup): Cadence {
  return CADENCES[group];
}

export function isVisualSymptom(type: string): boolean {
  return VISUAL_SYMPTOMS.has(type);
}

export function nextMilestoneISO(fromISO: string, cadenceDays: number): string {
  const d = new Date(fromISO);
  d.setDate(d.getDate() + cadenceDays);
  return d.toISOString();
}

export function daysUntil(isoDate: string, nowMs: number): number {
  const diff = new Date(isoDate).getTime() - nowMs;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function sessionEncouragementKey(
  session: PhotoSession,
): 'nextFaceEncouragementAt' | 'nextBodyEncouragementAt' {
  return session === 'face' ? 'nextFaceEncouragementAt' : 'nextBodyEncouragementAt';
}

export function sessionScientificKey(
  session: PhotoSession,
): 'nextFaceScientificAt' | 'nextBodyScientificAt' {
  return session === 'face' ? 'nextFaceScientificAt' : 'nextBodyScientificAt';
}
