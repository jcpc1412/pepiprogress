/**
 * Observation ledger (F5 — crown-jewel photo analysis).
 *
 * The north star: every analysis surfaces a true, specific thing about the
 * user's body they couldn't have seen alone, connected to what they did. That
 * is impossible for a stateless model, so this module gives the analysis a
 * memory: each run's structured observations are persisted per photo track
 * (session + optional custom part), and the next run receives the recent ones
 * so it can confirm, extend, or drop earlier hypotheses instead of rediscovering
 * the user from scratch.
 *
 * Everything here is pure data-shaping. The register rules (hypothesis, never
 * conclusion) live in the edge function's prompt; this file just makes sure the
 * model has something real to reason over and that the app can render and
 * store what came back.
 */

import type { PhotoSession } from '@/lib/store';

/** Whether a region's change is good for this user — the valence axis, kept
 *  independent of `direction` (2a.3). "watch" = low-confidence leaning bad. */
export type ObservationFavour = 'good' | 'bad' | 'none' | 'watch';

/** One region-level finding from a single analysis. `region` is a short label
 *  already in the user's locale (the model writes it); `direction` stays
 *  canonical so trends can be computed without parsing prose. `favour` + `x`/`y`
 *  (+ optional `pct`) are the on-photo arrow contract (2a.3): direction says the
 *  tissue grew or shrank, favour says whether that is good, x/y place the marker.
 *  All four are optional so pre-2a.3 ledger records still parse. */
export type PhotoObservation = {
  region: string;
  note: string;
  direction: 'gain' | 'loss' | 'stable' | 'unclear';
  confidence: number; // 0..1
  favour?: ObservationFavour;
  /** Normalized marker position on the NEW photo, 0..1 from the top-left. */
  x?: number;
  y?: number;
  /** Approximate magnitude of change as a percent, when the model estimated one. */
  pct?: number;
};

/** The persisted result of one scientific analysis on one track. */
export type AnalysisRecord = {
  id: string;
  session: PhotoSession;
  /** Custom body sub-track ("problem area"), undefined = the whole-session track. */
  part?: string;
  /** The NEW photo the analysis ran on. */
  photoId: string;
  /** When the analysis ran (ISO). */
  at: string;
  observations: PhotoObservation[];
  /** Cross-signal hypothesis connecting what's visible to the logged data. */
  hypothesis?: string;
  /** One concrete thing to look for in the next photo of this track. */
  watchNext?: string;
  /** The one-line summary (kept for share cards + encouragement context). */
  change?: string;
};

/** Ledger size cap. Old records fall off; the value of the ledger is recency
 *  plus a season of history, not an unbounded archive. */
export const LEDGER_CAP = 120;

/** How many prior analyses the model sees per run. More would invite the model
 *  to narrate history instead of examining the photo in front of it. */
export const PRIOR_ANALYSES_SENT = 3;

/** Append a record and enforce the cap, newest kept. */
export function appendToLedger(ledger: AnalysisRecord[], record: AnalysisRecord): AnalysisRecord[] {
  const next = [...ledger, record];
  return next.length > LEDGER_CAP ? next.slice(next.length - LEDGER_CAP) : next;
}

/** The records for one track, newest first. */
export function recentForTrack(
  ledger: AnalysisRecord[],
  session: PhotoSession,
  part: string | undefined,
  n: number = PRIOR_ANALYSES_SENT,
): AnalysisRecord[] {
  return ledger
    .filter((r) => r.session === session && (r.part ?? undefined) === (part ?? undefined))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, n);
}

/** Compact shape sent to the edge function as prior context. Confidence and ids
 *  are dropped: the model needs what was seen and wondered, not our bookkeeping. */
export type PriorAnalysisPayload = {
  at: string;
  observations: { region: string; direction: PhotoObservation['direction']; note: string }[];
  hypothesis?: string;
  watchNext?: string;
};

export function toPriorPayload(records: AnalysisRecord[]): PriorAnalysisPayload[] {
  return records.map((r) => ({
    at: r.at,
    observations: r.observations.map((o) => ({ region: o.region, direction: o.direction, note: o.note })),
    hypothesis: r.hypothesis,
    watchNext: r.watchNext,
  }));
}

/**
 * The most recent findings worth referencing outside the photo screen (the
 * encouragement tier, and later Pepi/day-in-review). A discovery is a
 * hypothesis when one exists, else the strongest confident observation.
 */
export function recentDiscoveries(ledger: AnalysisRecord[], n: number = 2): string[] {
  const out: string[] = [];
  const sorted = [...ledger].sort((a, b) => b.at.localeCompare(a.at));
  for (const r of sorted) {
    const best =
      r.hypothesis ??
      r.observations
        .filter((o) => o.confidence >= 0.6 && o.direction !== 'unclear')
        .sort((a, b) => b.confidence - a.confidence)[0]?.note ??
      r.change;
    if (best) out.push(best);
    if (out.length >= n) break;
  }
  return out;
}

/**
 * Sanitize what the model returned before it enters the store: drop malformed
 * entries, clamp confidence, cap the count. A degraded read must degrade to
 * fewer observations, never to garbage in the ledger.
 */
export function sanitizeObservations(raw: unknown, max: number = 5): PhotoObservation[] {
  if (!Array.isArray(raw)) return [];
  const out: PhotoObservation[] = [];
  for (const o of raw) {
    if (typeof o !== 'object' || o === null) continue;
    const cand = o as Record<string, unknown>;
    if (typeof cand.region !== 'string' || !cand.region.trim()) continue;
    if (typeof cand.note !== 'string' || !cand.note.trim()) continue;
    const direction =
      cand.direction === 'gain' || cand.direction === 'loss' || cand.direction === 'stable'
        ? cand.direction
        : 'unclear';
    const confidence =
      typeof cand.confidence === 'number' && Number.isFinite(cand.confidence)
        ? Math.min(1, Math.max(0, cand.confidence))
        : 0.5;
    // Arrow geometry (2a.3), all optional: a malformed value drops that field,
    // never the whole observation, so a partial read still yields a valid note.
    const favour: ObservationFavour | undefined =
      cand.favour === 'good' || cand.favour === 'bad' || cand.favour === 'none' || cand.favour === 'watch'
        ? cand.favour
        : undefined;
    const clamp01 = (v: unknown): number | undefined =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : undefined;
    const x = clamp01(cand.x);
    const y = clamp01(cand.y);
    const pct =
      typeof cand.pct === 'number' && Number.isFinite(cand.pct) ? Math.abs(cand.pct) : undefined;
    out.push({ region: cand.region.trim(), note: cand.note.trim(), direction, confidence, favour, x, y, pct });
    if (out.length >= max) break;
  }
  return out;
}
