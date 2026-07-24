import { computeQuality, QUALITY_VERSION, type PhotoQuality } from '@/lib/photo-quality';
import { pickReference } from '@/lib/photo-reference';
import type { PhotoEntry } from '@/lib/store';

/**
 * Retroactive re-scoring of already-captured photos (2026-07-24).
 *
 * The quality score is written once at capture and frozen. That is fine until
 * the formula improves, at which point a library scored under the old rules
 * sits alongside new photos scored under the new ones, and the two are not
 * comparable. Worse, `qualityScore` drives working-reference promotion
 * (`photo-reference.ts`), so a stale score does not just display wrong, it can
 * keep the wrong photo as the thing every future shot is matched against.
 *
 * Recomputing is cheap for signals we stored and expensive for ones we did not:
 *
 *  - **level** — free. Roll and pitch are stored per photo, so any change to
 *    the tilt bands re-derives exactly. Photos captured before those fields
 *    existed fall back to the combined magnitude, which can only be judged
 *    approximately (see `photo-quality.ts`).
 *  - **light** — needs the image, but only locally: decode a thumbnail and
 *    average it. No network, no cost, works for photos of any age as long as
 *    the file is still reachable.
 *  - **framing** — the expensive one. It is a vision call comparing the shot
 *    against its reference. Now persisted with the reference id it used, so a
 *    formula change replays it for free; only photos that never had a fit
 *    stored (or whose reference has since been deleted) need a fresh call.
 *
 * This module is pure: it decides *what* needs doing and *what it will cost*,
 * so the caller can tell the user before spending anything. The work itself
 * lives in the runner.
 */

/** Photos scored before `scoreVersion` existed were written under version 1. */
export function scoreVersionOf(photo: PhotoEntry): number {
  return photo.scoreVersion ?? 1;
}

/** True when this photo's stored score predates the current formula. */
export function isStale(photo: PhotoEntry): boolean {
  return photo.qualityScore == null || scoreVersionOf(photo) < QUALITY_VERSION;
}

/** The `computeQuality` input reconstructed from what the photo has stored. */
export function qualityInputFor(photo: PhotoEntry, overrides: { luma?: number } = {}) {
  const luma = overrides.luma ?? photo.luma;
  return {
    // Prefer the axes; `tiltDeg` is the documented approximate fallback.
    rollDeg: photo.rollDeg,
    pitchDeg: photo.pitchDeg,
    tiltDeg: photo.rollDeg == null && photo.pitchDeg == null ? photo.tilt : undefined,
    // A stored fit with zero confidence means the check ran and could not
    // compare, which is 'unknown', not a verdict. Same rule as at capture.
    fit: photo.fit && (photo.fitConfidence ?? 0) > 0 ? photo.fit : undefined,
    luma,
  };
}

/** Rescore from stored signals alone, no I/O. */
export function rescoreFromStored(photo: PhotoEntry, overrides: { luma?: number } = {}): PhotoQuality {
  return computeQuality(qualityInputFor(photo, overrides));
}

export type PhotoWork = {
  photo: PhotoEntry;
  /** Brightness is missing and the image must be decoded to get it. Local. */
  needsLuma: boolean;
  /** No usable stored fit and a reference exists to compare against. Costs a
   *  vision call, so it is always reported before it is spent. */
  needsFit: boolean;
  /** A run that skips the vision calls would change this photo's score. False
   *  for a photo that is only missing its framing check: re-running the free
   *  pass on it would rewrite the identical number.
   *
   *  This is what keeps the free option from being a trap. Taking it stamps the
   *  current version, so without tracking framing separately those photos would
   *  read as up to date forever and could never be offered the AI upgrade. */
  freeGain: boolean;
  /** The reference this photo should be measured against, when one exists. A
   *  track's own reference is never compared against itself. */
  referenceId?: string;
};

export type RescorePlan = {
  /** Every photo that could be improved, with what each one needs. */
  work: PhotoWork[];
  /** Photos a free (no-AI) pass would actually change. */
  freeCount: number;
  /** Photos needing a local image decode. */
  lumaCount: number;
  /** Photos needing a vision call. THE number to show before running. */
  fitCount: number;
};

/**
 * Work out what a rescore would involve.
 *
 * `referenceFor` is supplied by the caller because reference selection depends
 * on the whole track (coverage, quality, recency) and lives in
 * `photo-reference.ts`; duplicating that here would let the two disagree about
 * which photo is the anchor.
 */
export function planRescore(
  photos: PhotoEntry[],
  referenceFor: (photo: PhotoEntry) => string | undefined,
): RescorePlan {
  const work: PhotoWork[] = [];
  for (const photo of photos) {
    const referenceId = referenceFor(photo);
    // A stored fit is reusable only if it was measured against the SAME
    // reference. Against a different one it describes a comparison that no
    // longer applies, and silently reusing it would bake a stale framing
    // verdict into the new score.
    const storedFitUsable =
      photo.fit != null && photo.fitReferenceId != null && photo.fitReferenceId === referenceId;
    const needsFit = !storedFitUsable && referenceId != null && referenceId !== photo.id;
    const needsLuma = photo.luma == null;
    const stale = isStale(photo);
    // A photo that is current and fully measured has nothing to gain.
    if (!stale && !needsFit && !needsLuma) continue;
    work.push({ photo, needsLuma, needsFit, freeGain: stale || needsLuma, referenceId });
  }
  return {
    work,
    freeCount: work.filter((w) => w.freeGain).length,
    lumaCount: work.filter((w) => w.needsLuma).length,
    fitCount: work.filter((w) => w.needsFit).length,
  };
}

/** The fields a rescore writes back onto a photo. */
export type RescorePatch = {
  qualityScore: number;
  scoreVersion: number;
  luma?: number;
  fit?: 'good' | 'acceptable' | 'poor';
  fitConfidence?: number;
  fitReferenceId?: string;
};

/**
 * Build the patch for one photo from whatever the runner managed to gather.
 *
 * Newly-measured signals are folded in, and the version is stamped only when
 * the score is actually written — so a photo whose image could not be read is
 * left stale and retried on the next run rather than being marked current with
 * a worse score than it had.
 */
export function buildPatch(
  photo: PhotoEntry,
  gathered: {
    luma?: number;
    fit?: { fit: 'good' | 'acceptable' | 'poor'; confidence: number };
    referenceId?: string;
  },
): RescorePatch {
  const luma = gathered.luma ?? photo.luma;
  const merged: PhotoEntry = {
    ...photo,
    luma,
    ...(gathered.fit
      ? {
          fit: gathered.fit.fit,
          fitConfidence: gathered.fit.confidence,
          fitReferenceId: gathered.referenceId,
        }
      : {}),
  };
  const quality = rescoreFromStored(merged);
  return {
    qualityScore: quality.score,
    scoreVersion: QUALITY_VERSION,
    ...(luma !== undefined ? { luma } : {}),
    ...(gathered.fit
      ? {
          fit: gathered.fit.fit,
          fitConfidence: gathered.fit.confidence,
          fitReferenceId: gathered.referenceId,
        }
      : {}),
  };
}


/** Photos of the same (session, part) share a reference chain. */
function trackKey(photo: PhotoEntry): string {
  return `${photo.session}::${photo.part ?? ''}`;
}

/**
 * Group photos into their reference chains and resolve each chain's anchor.
 *
 * Uses the same `pickReference` the capture screens use, so a rescore can never
 * disagree with the live app about which photo is the anchor — including the
 * skin-priority soft lock, where a minimal-coverage shot outranks a
 * higher-scoring clothed one.
 */
export function referenceResolver(photos: PhotoEntry[]): (photo: PhotoEntry) => string | undefined {
  const byTrack = new Map<string, PhotoEntry[]>();
  for (const p of photos) {
    const key = trackKey(p);
    const list = byTrack.get(key);
    if (list) list.push(p);
    else byTrack.set(key, [p]);
  }
  const refByTrack = new Map<string, string | undefined>();
  for (const [key, list] of byTrack) refByTrack.set(key, pickReference(list)?.id);
  return (photo) => refByTrack.get(trackKey(photo));
}

/** What a rescore would cost, without doing any of it. */
export function planFor(photos: PhotoEntry[]): RescorePlan {
  return planRescore(photos, referenceResolver(photos));
}
