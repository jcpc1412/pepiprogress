import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useOverlay } from '@/lib/nav-overlay';

/**
 * Opens the quick-log (seeded for macros) when the user taps the H-05 macro
 * reminder. Mounted inside OverlayProvider so it can drive the overlay. No-op on
 * web (local notifications don't run there).
 */
export function MacroReminderHandler() {
  const { openLogging } = useOverlay();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { kind?: string } | undefined;
      if (data?.kind === 'macros') openLogging('quick', 'macros');
    });
    return () => sub.remove();
  }, [openLogging]);

  return null;
}
