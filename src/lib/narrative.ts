import { compoundBySlug } from '@/data/compound-catalog';
import { bestE1RM } from '@/lib/strength';
import type {
  Benchmark,
  CheckinEntry,
  PhotoEntry,
  ProtocolItem,
  StrengthSession,
  SymptomEvent,
} from '@/lib/store';

/**
 * Narrative timeline (W5-24, positioning §5.3). The signal ledger rendered as a
 * cross-metric chronological STORY rather than parallel charts: "started TRT →
 * sleep improved → strength up → hematocrit elevated → donation logged." It
 * communicates progression the way stacked graphs cannot, and is the natural
 * surface for the personal-history + attribution work of Wave 4.
 *
 * This is the pure assembly layer: it gathers milestone MOMENTS from the store's
 * own logged events, dedupes them to milestones (first onset, new PR, first
 * marker reading) so the story doesn't become a diary, and orders them oldest →
 * newest so it reads as a narrative. It emits STRUCTURED moments (never prose):
 * the presentation layer owns all copy + unit formatting, so this stays pure,
 * deterministic, locale-agnostic, and testable. Chronology only — a moment
 * following another implies sequence, never causation.
 */

export type NarrativeMoment =
  | { date: string; kind: 'protocol_start'; compound: string }
  | { date: string; kind: 'symptom'; symptomType: string }
  | { date: string; kind: 'lab'; marker: string; value: number }
  | { date: string; kind: 'photo'; note: string }
  | { date: string; kind: 'benchmark'; name: string; value: string; unit?: string }
  | { date: string; kind: 'strength_pr'; exercise: string; e1rm: number };

export type NarrativeInput = {
  protocolItems: ProtocolItem[];
  symptomEvents: SymptomEvent[];
  entries: Record<string, CheckinEntry>;
  photos: PhotoEntry[];
  benchmarks: Benchmark[];
  strengthSessions: StrengthSession[];
  /** Cap on returned moments (keeps the most recent). Default 24. */
  limit?: number;
};

/** ISO timestamp or date-key → YYYY-MM-DD. */
const dayOf = (iso: string): string => iso.slice(0, 10);

/**
 * Assemble the chronological milestone story, oldest → newest, deduped to
 * milestones and capped to the most recent `limit` moments.
 */
export function buildNarrative(input: NarrativeInput): NarrativeMoment[] {
  const moments: NarrativeMoment[] = [];

  // Protocol starts: one moment per item that recorded a start date.
  for (const item of input.protocolItems) {
    if (!item.startedAt) continue;
    const name = compoundBySlug(item.compoundSlug)?.canonicalName ?? item.compoundSlug;
    moments.push({ date: dayOf(item.startedAt), kind: 'protocol_start', compound: name });
  }

  // Symptoms: only the FIRST onset per type (a "started noticing X" milestone,
  // not every recurrence), so a chronic symptom doesn't flood the story.
  const seenSymptom = new Map<string, string>(); // type -> earliest day
  for (const s of input.symptomEvents) {
    const day = dayOf(s.onsetAt);
    const prev = seenSymptom.get(s.type);
    if (!prev || day < prev) seenSymptom.set(s.type, day);
  }
  for (const [symptomType, date] of seenSymptom) {
    moments.push({ date, kind: 'symptom', symptomType });
  }

  // Labs: the FIRST recorded reading per marker (getting bloodwork is the
  // milestone; later re-checks are tracked elsewhere).
  const seenMarker = new Map<string, { date: string; value: number }>();
  const datedEntries = Object.values(input.entries)
    .filter((e) => e.labValues && Object.keys(e.labValues).length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const e of datedEntries) {
    for (const [marker, value] of Object.entries(e.labValues ?? {})) {
      if (!seenMarker.has(marker)) seenMarker.set(marker, { date: e.date, value });
    }
  }
  for (const [marker, { date, value }] of seenMarker) {
    moments.push({ date, kind: 'lab', marker, value });
  }

  // Photos: comparable analyzed shots that carry a hedged change note — the
  // shots that actually said something.
  for (const p of input.photos) {
    if (p.comparable === true && p.changeNote) {
      moments.push({ date: dayOf(p.takenAt), kind: 'photo', note: p.changeNote });
    }
  }

  // Benchmarks: every logged benchmark result is a milestone by nature.
  for (const b of input.benchmarks) {
    moments.push({ date: dayOf(b.date), kind: 'benchmark', name: b.name, value: b.value, unit: b.unit });
  }

  // Strength PRs: a session that set a NEW best e1RM for its exercise, walking
  // sessions oldest → newest so only genuine improvements surface.
  const bestByExercise = new Map<string, number>();
  const sortedSessions = [...input.strengthSessions].sort((a, b) => a.date.localeCompare(b.date));
  for (const sess of sortedSessions) {
    const e1rm = bestE1RM(sess.sets);
    if (e1rm <= 0) continue;
    const prevBest = bestByExercise.get(sess.exercise) ?? 0;
    if (e1rm > prevBest) {
      bestByExercise.set(sess.exercise, e1rm);
      if (prevBest > 0) {
        // Only a strict improvement over an existing best is a "PR" moment; the
        // first session just establishes the baseline (no moment).
        moments.push({ date: dayOf(sess.date), kind: 'strength_pr', exercise: sess.exercise, e1rm: Math.round(e1rm) });
      }
    }
  }

  // Oldest → newest so it reads as a story; keep the most recent `limit`.
  moments.sort((a, b) => (a.date === b.date ? kindOrder(a.kind) - kindOrder(b.kind) : a.date.localeCompare(b.date)));
  const limit = input.limit ?? 24;
  return moments.length > limit ? moments.slice(moments.length - limit) : moments;
}

/** Stable secondary ordering for same-day moments: a protocol start reads before
 *  the effects it precedes. */
function kindOrder(kind: NarrativeMoment['kind']): number {
  const order: Record<NarrativeMoment['kind'], number> = {
    protocol_start: 0,
    lab: 1,
    strength_pr: 2,
    benchmark: 3,
    symptom: 4,
    photo: 5,
  };
  return order[kind];
}
