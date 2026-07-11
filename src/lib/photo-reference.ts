/**
 * Working-reference selection for a progress-photo track (PH-1, beta 2026-07-10).
 *
 * The very first photo of a (session, part) chain stays the immutable "true start"
 * so a before/after against day one is never lost. Separately, a promotable
 * "working reference" is whichever shot is the best to match against: highest
 * quality, with a hard skin-priority rule on top.
 *
 * Skin priority (the soft lock): coverage is ranked FIRST, so a `minimal`-coverage
 * shot always outranks a `clothed` one regardless of quality, and once a minimal
 * reference exists a clothed capture can never displace it. Within the same
 * coverage tier the higher quality score wins; ties break to the more recent shot.
 *
 * Pure and deterministic — no store, no dates beyond the ISO strings already on
 * the entries.
 */

/** The subset of PhotoEntry this module reasons over (keeps it store-decoupled). */
export type ReferenceCandidate = {
  id: string;
  takenAt: string; // ISO
  qualityScore?: number;
  coverage?: 'clothed' | 'partial' | 'minimal';
};

/** Higher = stronger skin priority. Unknown coverage sits between clothed and
 *  partial so an un-analyzed shot neither wins nor loses purely on coverage. */
const COVERAGE_RANK: Record<'clothed' | 'partial' | 'minimal', number> = {
  clothed: 0,
  partial: 2,
  minimal: 3,
};
const UNKNOWN_COVERAGE_RANK = 1;

function coverageRank(c?: 'clothed' | 'partial' | 'minimal'): number {
  return c ? COVERAGE_RANK[c] : UNKNOWN_COVERAGE_RANK;
}

/** Neutral quality when a shot has not been scored yet. */
const NEUTRAL_QUALITY = 70;

function qualityOf(p: ReferenceCandidate): number {
  return p.qualityScore ?? NEUTRAL_QUALITY;
}

/**
 * Order two candidates: the "better" reference sorts first. Coverage first, then
 * quality, then recency.
 */
function compareCandidates(a: ReferenceCandidate, b: ReferenceCandidate): number {
  const cov = coverageRank(b.coverage) - coverageRank(a.coverage);
  if (cov !== 0) return cov;
  const q = qualityOf(b) - qualityOf(a);
  if (q !== 0) return q;
  return b.takenAt.localeCompare(a.takenAt);
}

/**
 * The working reference for a track (the shot the ghost overlay + compare should
 * anchor to). Returns undefined for an empty chain. Falls back gracefully when no
 * shot has a quality score yet (recency wins, matching the old "latest" behavior).
 */
export function pickReference<T extends ReferenceCandidate>(photos: T[]): T | undefined {
  if (photos.length === 0) return undefined;
  return [...photos].sort(compareCandidates)[0];
}

/**
 * True when `candidateId` is (or has just become) the best reference AND there is
 * at least one other shot it beat — i.e. a genuine "new quality highscore" moment,
 * not just the first-ever photo. Used to fire the celebratory promotion cue.
 */
export function isNewHighscore(photos: ReferenceCandidate[], candidateId: string): boolean {
  if (photos.length < 2) return false;
  const best = pickReference(photos);
  return !!best && best.id === candidateId;
}
