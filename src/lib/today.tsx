import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { msUntilNextLocalMidnight } from '@/lib/day-boundary';
import { localDateKey } from '@/lib/dates';

/**
 * The current local day, as a shared value that actually changes when the day
 * does (W7-46).
 *
 * Screens used to call `localDateKey()` during render. That is correct at call
 * time but nothing re-calls it, so an app left open overnight kept showing the
 * day it was mounted on: yesterday's doses, yesterday's check-in, yesterday's
 * verdict, until an unrelated state change happened to force a re-render.
 *
 * One watcher owns the boundary and every consumer re-renders together, which
 * also avoids each screen growing its own timer.
 */
const TodayContext = createContext<string | null>(null);

/**
 * Today's date key (YYYY-MM-DD), re-rendering consumers when the day rolls over.
 *
 * Use this anywhere "today" is read *during render*. Event handlers and
 * background jobs should keep calling `localDateKey()` directly: they run at a
 * known moment and want the freshest possible answer, not a subscription.
 */
export function useToday(): string {
  const ctx = useContext(TodayContext);
  // Falling back keeps the hook usable in tests and any tree mounted outside the
  // provider; it simply loses the live update rather than crashing.
  return ctx ?? localDateKey();
}

export function TodayProvider({ children }: { children: ReactNode }) {
  const [today, setToday] = useState(() => localDateKey());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Only ever moves the value when the day genuinely changed, so a foreground
    // event or a stray timer cannot cause a pointless re-render of the app.
    const sync = () => {
      if (cancelled) return;
      const next = localDateKey();
      setToday((prev) => (prev === next ? prev : next));
    };

    // Path 1: the app sat in the foreground across midnight. Rescheduled after
    // every fire, since a single timeout only covers one boundary.
    const scheduleMidnight = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        sync();
        scheduleMidnight();
      }, msUntilNextLocalMidnight());
    };
    scheduleMidnight();

    // Path 2: the app was suspended across midnight, so the timer above never
    // ran (or ran late). Re-check on the way back in, and re-arm from the new
    // "now" so the next boundary is timed from the real current moment.
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      sync();
      scheduleMidnight();
    });

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      sub.remove();
    };
  }, []);

  return <TodayContext.Provider value={today}>{children}</TodayContext.Provider>;
}
