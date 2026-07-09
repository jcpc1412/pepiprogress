import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useOverlay } from '@/lib/nav-overlay';

/**
 * Routes notification taps: the H-05 macro reminder opens the quick-log (seeded
 * for macros); the spec-15 "typical day" prompt lands on the Pepi tab where the
 * setup opener is waiting. Mounted inside OverlayProvider. No-op on web.
 */
export function MacroReminderHandler() {
  const { openLogging } = useOverlay();
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { kind?: string } | undefined;
      if (data?.kind === 'macros') openLogging('quick', 'macros');
      else if (data?.kind === 'typical') router.navigate('/pepi');
    });
    return () => sub.remove();
  }, [openLogging, router]);

  return null;
}
