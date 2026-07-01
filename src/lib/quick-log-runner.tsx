import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { aiErrorKind, parseQuickLog } from '@/lib/ai';
import { applyParsedItems } from '@/lib/quick-log-apply';
import { useStore, type QuickLogJob } from '@/lib/store';

/** How long a finished job lingers so the dashboard can show its confirmation. */
const DONE_TTL_MS = 8000;
/** Stop auto-retrying after this many failures (job stays visible as an error). */
const MAX_ATTEMPTS = 6;
/** Re-evaluate retry timers on this cadence. */
const TICK_MS = 5000;

function backoffMs(attempts: number): number {
  return Math.min(5 * 60_000, 2 ** attempts * 1000); // 2s, 4s, 8s … capped at 5 min
}

function isRetryable(job: QuickLogJob, now: number): boolean {
  if (job.status === 'pending') return true;
  if (job.status === 'error') {
    return job.attempts < MAX_ATTEMPTS && (!job.nextRetryAt || Date.parse(job.nextRetryAt) <= now);
  }
  return false;
}

/**
 * Drives the background quick-log queue (spec 13). Mounted once under the store
 * provider. Parses each queued entry via the AI service, applies the confident
 * items, and retries on failure with backoff — so the user never waits on the
 * network. Finished jobs self-clear after a short display window.
 */
export function QuickLogRunner() {
  const { ready, quickLogJobs, updateQuickLogJob, removeQuickLogJob, upsertCheckin, addSymptomEvent, logDose } =
    useStore();
  const inFlight = useRef<Set<string>>(new Set());
  const doneTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [tick, setTick] = useState(0);

  // Periodic tick so error-backoff jobs get reconsidered without a store change,
  // plus an immediate re-check whenever the app returns to the foreground.
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), TICK_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setTick((t) => t + 1);
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    // `tick` participates in the deps so error-backoff windows re-open over time.
    void tick;
    const now = Date.now();
    const runnable = quickLogJobs.filter((j) => isRetryable(j, now));
    for (const job of runnable) {
      if (inFlight.current.has(job.id)) continue;
      inFlight.current.add(job.id);
      void (async () => {
        try {
          const result = await parseQuickLog(job.text, job.locale);
          const { applied, skipped } = applyParsedItems(result.items ?? [], {
            today: job.dateKey,
            upsertCheckin,
            addSymptomEvent,
            logDose,
          });
          updateQuickLogJob(job.id, {
            status: 'done',
            summary: result.reply ?? '',
            appliedCount: applied,
            skippedCount: skipped,
          });
          const t = setTimeout(() => {
            removeQuickLogJob(job.id);
            doneTimers.current.delete(job.id);
          }, DONE_TTL_MS);
          doneTimers.current.set(job.id, t);
        } catch (err) {
          const attempts = job.attempts + 1;
          // A missing-config error will never succeed on retry — leave it dormant.
          const dormant = aiErrorKind(err) === 'notConfigured' || attempts >= MAX_ATTEMPTS;
          updateQuickLogJob(job.id, {
            status: 'error',
            attempts,
            nextRetryAt: dormant ? undefined : new Date(Date.now() + backoffMs(attempts)).toISOString(),
          });
        } finally {
          inFlight.current.delete(job.id);
        }
      })();
    }
  }, [quickLogJobs, tick, ready, updateQuickLogJob, removeQuickLogJob, upsertCheckin, addSymptomEvent, logDose]);

  // Clear any pending removal timers on unmount.
  useEffect(() => {
    const timers = doneTimers.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  return null;
}

export type QuickLogActivity =
  | { state: 'idle' }
  | { state: 'distilling'; count: number }
  | { state: 'error' }
  | { state: 'done'; summary: string; applied: number };

/** Aggregate quick-log queue status for the Today dashboard's distillation card. */
export function useQuickLogActivity(): QuickLogActivity {
  const { quickLogJobs } = useStore();
  return useMemo(() => {
    const distilling = quickLogJobs.filter((j) => j.status === 'pending').length;
    if (distilling > 0) return { state: 'distilling', count: distilling };
    if (quickLogJobs.some((j) => j.status === 'error')) return { state: 'error' };
    const done = quickLogJobs.filter((j) => j.status === 'done').at(-1);
    if (done) return { state: 'done', summary: done.summary ?? '', applied: done.appliedCount ?? 0 };
    return { state: 'idle' };
  }, [quickLogJobs]);
}
