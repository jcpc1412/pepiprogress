import { checkFit } from '@/lib/ai';
import { buildPatch, planFor, type RescorePatch } from '@/lib/photo-rescore';
import { averageLumaOf, resolvePhotoUri } from '@/lib/photos';
import type { PhotoEntry } from '@/lib/store';

/**
 * Runs a retroactive rescore (see `photo-rescore.ts` for the why and the cost
 * model). Impure half: reads image files, spends vision calls, reports back.
 *
 * Deliberately incremental. Each photo is patched as it finishes rather than
 * batched at the end, so a run interrupted by backgrounding, a dead network or
 * the user leaving keeps everything it already paid for. Re-running picks up
 * exactly where it stopped, because a photo only stops being stale once its
 * new score is written.
 */

export type RescoreProgress = { done: number; total: number };
export type RescoreSummary = {
  rescored: number;
  fitCalls: number;
  /** Photos left stale because their image could not be read. Retried next run. */
  skipped: number;
};

export type RescoreOptions = {
  photos: PhotoEntry[];
  /** Apply one photo's new values. Called per photo, not once at the end. */
  onPatch: (id: string, patch: RescorePatch) => void;
  onProgress?: (p: RescoreProgress) => void;
  /** Set true to stop early; the work already applied stands. */
  shouldStop?: () => boolean;
  /** Skip the vision calls and rescore only from local signals. Lets a user
   *  take the free half of the improvement without spending anything. */
  skipFit?: boolean;
  userId?: string;
};

export async function runRescore(options: RescoreOptions): Promise<RescoreSummary> {
  const { photos, onPatch, onProgress, shouldStop, skipFit, userId } = options;
  const plan = planFor(photos);
  const byId = new Map(photos.map((p) => [p.id, p]));

  let rescored = 0;
  let fitCalls = 0;
  let skipped = 0;
  let done = 0;

  for (const item of plan.work) {
    if (shouldStop?.()) break;
    const { photo } = item;
    // Nothing a no-AI pass could change here: rewriting the same score would
    // only churn the store and mislead the progress count.
    if (skipFit && !item.freeGain) continue;

    let luma: number | undefined;
    let uri: string | undefined;
    if (item.needsLuma || (item.needsFit && !skipFit)) {
      // A photo restored on a second device has no local file, so resolve
      // through the cloud copy the same way the gallery does.
      uri = (await resolvePhotoUri(photo, userId ?? null)).uri ?? undefined;
    }

    if (item.needsLuma) {
      if (!uri) {
        // No readable image: leave it stale rather than stamping the current
        // version onto a score that is missing a signal it should have.
        skipped += 1;
        done += 1;
        onProgress?.({ done, total: plan.work.length });
        continue;
      }
      luma = await averageLumaOf(uri);
      if (luma === undefined) {
        skipped += 1;
        done += 1;
        onProgress?.({ done, total: plan.work.length });
        continue;
      }
    }

    let fit: { fit: 'good' | 'acceptable' | 'poor'; confidence: number } | undefined;
    if (item.needsFit && !skipFit && item.referenceId) {
      const reference = byId.get(item.referenceId);
      const referenceUri = reference
        ? (await resolvePhotoUri(reference, userId ?? null)).uri ?? undefined
        : undefined;
      if (uri && referenceUri) {
        fit = await checkFit(uri, referenceUri);
        fitCalls += 1;
      }
    }

    onPatch(
      photo.id,
      buildPatch(photo, {
        luma,
        fit,
        referenceId: fit ? item.referenceId : undefined,
      }),
    );
    rescored += 1;
    done += 1;
    onProgress?.({ done, total: plan.work.length });
  }

  return { rescored, fitCalls, skipped };
}
