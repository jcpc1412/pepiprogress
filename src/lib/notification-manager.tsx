import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import {
  configureNotifications,
  ensureNotificationPermission,
  maybeNotifyInventory,
  rescheduleReminders,
} from '@/lib/notifications';
import { useStore } from '@/lib/store';

/**
 * Drives local reminders (spec 06): daily check-in, daily "log your doses", and
 * photo-milestone nudges are (re)scheduled whenever the relevant preferences,
 * milestone dates, or protocol change; low-stock/expiry fires on foreground
 * (deduped per day). Mounted once under the store provider. Renders nothing.
 * All scheduling is a no-op on web (see notifications.ts).
 */
export function NotificationManager() {
  const { ready, profile, protocolItems, inventory, setProfile } = useStore();

  // Configure the handler + Android channel once.
  useEffect(() => {
    configureNotifications();
  }, []);

  const anyEnabled =
    !!profile.notifyCheckinEnabled ||
    !!profile.notifyDosesEnabled ||
    !!profile.notifyInventoryEnabled ||
    !!profile.notifyPhotosEnabled ||
    !!profile.notifyMacrosEnabled;

  // Reschedule whenever the inputs that shape the schedule change.
  const scheduleKey = JSON.stringify({
    c: profile.notifyCheckinEnabled,
    ct: profile.notifyCheckinTime,
    d: profile.notifyDosesEnabled,
    dt: profile.notifyDoseTime,
    m: profile.notifyMacrosEnabled,
    mt: profile.notifyMacroTime,
    p: profile.notifyPhotosEnabled,
    hp: protocolItems.length > 0,
    fe: profile.nextFaceEncouragementAt,
    fs: profile.nextFaceScientificAt,
    be: profile.nextBodyEncouragementAt,
    bs: profile.nextBodyScientificAt,
  });

  useEffect(() => {
    if (!ready || !anyEnabled) return;
    let cancelled = false;
    void (async () => {
      const granted = await ensureNotificationPermission();
      if (cancelled || !granted) return;
      await rescheduleReminders(profile, protocolItems.length > 0);
    })();
    return () => {
      cancelled = true;
    };
    // profile/protocolItems are intentionally folded into scheduleKey to avoid
    // rescheduling on unrelated state churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, anyEnabled, scheduleKey]);

  // Low-stock / expiry check on launch + every foreground. Refs keep the latest
  // values available to the AppState listener without re-subscribing.
  const inventoryRef = useRef(inventory);
  const profileRef = useRef(profile);
  useEffect(() => {
    inventoryRef.current = inventory;
    profileRef.current = profile;
  });

  useEffect(() => {
    if (!ready) return;
    const run = async () => {
      const day = await maybeNotifyInventory(profileRef.current, inventoryRef.current);
      if (day) setProfile({ inventoryNotifiedOn: day });
    };
    void run();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void run();
    });
    return () => sub.remove();
  }, [ready, setProfile]);

  return null;
}
