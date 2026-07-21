/**
 * Navigation helpers for screens that push over the tab bar.
 * Originally a Modal-based OverlayProvider; now delegates to the root Stack
 * so every overlay gets native back-gesture support (iOS edge-swipe + Android
 * hardware back) for free.
 */

import { useRouter } from 'expo-router';

export type LoggingMode = 'quick' | 'detailed';

/** Drop-in replacement for the old useOverlay() hook. Callers are unchanged. */
export function useOverlay() {
  const router = useRouter();
  return {
    openSettings: () => router.push('/settings'),
    openLogging: (mode: LoggingMode = 'quick', seedPrompt?: 'macros', date?: string) =>
      router.push({
        pathname: '/logging',
        params: {
          mode,
          ...(seedPrompt ? { seedPrompt } : {}),
          // The Journal (item 41b) backfills a past day: open the log already on it.
          ...(date ? { date } : {}),
        },
      }),
    openAddCompound: () => router.push('/add-compound'),
    openCompoundDetail: (itemId: string) =>
      router.push({ pathname: '/compound-detail', params: { itemId } }),
    close: () => router.back(),
    /** Legacy: was the currently-open overlay state. Always null now. */
    state: null as null,
  };
}

/** Legacy no-op wrapper kept so import sites don't need to change. */
export function OverlayProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
