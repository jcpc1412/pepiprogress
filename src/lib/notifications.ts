import * as Notifications from 'expo-notifications';
import { t as i18nT } from 'i18next';
import { Platform } from 'react-native';

import { inventoryAttention } from '@/lib/inventory';
import { localDateKey, type InventoryItem, type LocalProfile } from '@/lib/store';

const isWeb = Platform.OS === 'web';

const DEFAULT_CHECKIN_TIME = '20:00';
const DEFAULT_DOSE_TIME = '09:00';
const DEFAULT_MACRO_TIME = '20:30';

/** "HH:mm" → { hour, minute }, tolerant of bad input (falls back to 9:00). */
function parseHM(time: string | undefined, fallback: string): { hour: number; minute: number } {
  const [h, m] = (time ?? fallback).split(':');
  const hour = Number(h);
  const minute = Number(m);
  return {
    hour: Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 9,
    minute: Number.isFinite(minute) ? Math.min(59, Math.max(0, minute)) : 0,
  };
}

/** Configure the foreground handler + Android channel. Safe to call repeatedly; no-op on web. */
export function configureNotifications(): void {
  if (isWeb) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync('default', {
      name: 'PepiProgress',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

/** Ask for permission if not already granted. Returns whether we ended up granted. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (isWeb) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

const t = (key: string, opts?: Record<string, unknown>): string =>
  i18nT(key as never, opts as never) as unknown as string;

/** Schedule a one-shot reminder for a future ISO date (skips past dates). */
async function scheduleOneShot(identifier: string, isoDate: string, titleKey: string, bodyKey: string) {
  const when = new Date(isoDate);
  if (!Number.isFinite(when.getTime()) || when.getTime() <= Date.now()) return;
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { title: t(titleKey), body: t(bodyKey) },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
  });
}

async function scheduleDaily(identifier: string, time: string, fallback: string, titleKey: string, bodyKey: string) {
  const { hour, minute } = parseHM(time, fallback);
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { title: t(titleKey), body: t(bodyKey) },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
  });
}

/**
 * Rebuild all scheduled reminders from the current profile. This module is the
 * only scheduler, so it cancels everything then re-adds the enabled set —
 * idempotent, no leaked duplicates. No-op on web. Caller ensures permission.
 *
 * `hasScheduledDoses` should be true only when at least one protocol item is on
 * a fixed schedule (i.e. has doseDays with days selected, or a non-as_needed /
 * non-custom frequency). Prevents the dose notification from firing daily even
 * when every compound is set to "as needed."
 */
export async function rescheduleReminders(profile: LocalProfile, hasScheduledDoses: boolean): Promise<void> {
  if (isWeb) return;
  await Notifications.cancelAllScheduledNotificationsAsync();

  if (profile.notifyCheckinEnabled) {
    await scheduleDaily('pepi.checkin', profile.notifyCheckinTime ?? DEFAULT_CHECKIN_TIME, DEFAULT_CHECKIN_TIME,
      'notify.checkinTitle', 'notify.checkinBody');
  }
  if (profile.notifyDosesEnabled && hasScheduledDoses) {
    await scheduleDaily('pepi.doses', profile.notifyDoseTime ?? DEFAULT_DOSE_TIME, DEFAULT_DOSE_TIME,
      'notify.doseTitle', 'notify.doseBody');
  }
  if (profile.notifyMacrosEnabled) {
    // End-of-day macro reminder (H-05). Carries a deep-link marker so the tap
    // opens the quick-log seeded for macros.
    const { hour, minute } = parseHM(profile.notifyMacroTime, DEFAULT_MACRO_TIME);
    await Notifications.scheduleNotificationAsync({
      identifier: 'pepi.macros',
      content: { title: t('notify.macroTitle'), body: t('notify.macroBody'), data: { kind: 'macros' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
    });
  }
  if (profile.notifyPhotosEnabled) {
    const milestones: [string, string | undefined][] = [
      ['pepi.photo.faceEnc', profile.nextFaceEncouragementAt],
      ['pepi.photo.faceSci', profile.nextFaceScientificAt],
      ['pepi.photo.bodyEnc', profile.nextBodyEncouragementAt],
      ['pepi.photo.bodySci', profile.nextBodyScientificAt],
    ];
    for (const [id, iso] of milestones) {
      if (iso) await scheduleOneShot(id, iso, 'notify.photoTitle', 'notify.photoBody');
    }
  }
}

/**
 * Fire an immediate low-stock/expiry reminder if anything needs attention and we
 * haven't already notified today. Returns the day-key to persist as
 * `inventoryNotifiedOn` (or null when nothing fired). No-op on web.
 */
export async function maybeNotifyInventory(
  profile: LocalProfile,
  inventory: InventoryItem[],
): Promise<string | null> {
  if (isWeb || !profile.notifyInventoryEnabled) return null;
  const today = localDateKey();
  if (profile.inventoryNotifiedOn === today) return null;
  const attention = inventoryAttention(inventory, today);
  if (attention.length === 0) return null;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: t('notify.inventoryTitle'),
      body: t('notify.inventoryBody', { count: attention.length }),
    },
    trigger: null, // immediate
  });
  return today;
}
