import * as Notifications from 'expo-notifications';
import { t as i18nT } from 'i18next';
import { Platform } from 'react-native';

import { compoundBySlug } from '@/data/compound-catalog';
import { daysBetween } from '@/lib/dates';
import {
  anchorFor,
  intervalFor,
  missedSlotStreak,
  missedWeekdayStreak,
  type ScheduledDose,
} from '@/lib/dose-schedule';
import { inventoryAttention } from '@/lib/inventory';
import {
  localDateKey,
  type DoseEvent,
  type InventoryItem,
  type LocalProfile,
  type ProtocolItem,
} from '@/lib/store';

const isWeb = Platform.OS === 'web';

const DEFAULT_CHECKIN_TIME = '20:00';
const DEFAULT_MORNING_TIME = '08:30';
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
    // The evening moment (beta-notes §4.1): deep-links into Pepi chat where the
    // micro check-in chips are waiting, instead of a dead-end reminder.
    const { hour, minute } = parseHM(profile.notifyCheckinTime, DEFAULT_CHECKIN_TIME);
    await Notifications.scheduleNotificationAsync({
      identifier: 'pepi.checkin',
      content: {
        title: t('notify.checkinTitle'),
        body: t('notify.checkinBody'),
        data: { kind: 'micro', slot: 'evening' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
    });
  }
  if (profile.notifyMorningEnabled) {
    // The morning moment (beta-notes §4.1).
    const { hour, minute } = parseHM(profile.notifyMorningTime, DEFAULT_MORNING_TIME);
    await Notifications.scheduleNotificationAsync({
      identifier: 'pepi.morning',
      content: {
        title: t('notify.morningTitle'),
        body: t('notify.morningBody'),
        data: { kind: 'micro', slot: 'morning' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
    });
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
 * Fire the one-time "typical day" prompt for a group (spec 15). A question, never
 * advice; deep-links to Pepi where the setup runs. Deduped by the caller via the
 * profile's `typicalPromptState` (only fired when a group is freshly eligible).
 * No-op on web. Returns whether it was scheduled.
 */
export async function notifyTypicalPrompt(group: string): Promise<boolean> {
  if (isWeb) return false;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: t('notify.typicalTitle'),
      body: group === 'sleep' ? t('notify.typicalBodySleep') : t('notify.typicalBodyNutrition'),
      data: { kind: 'typical', group },
    },
    trigger: null, // immediate; once-ever per group by design
  });
  return true;
}

/** "Ask me in an hour" (beta-notes §4.2): reschedule the active micro check-in
 *  as a one-shot. No-op on web. */
export async function scheduleMicroSnooze(slot: 'morning' | 'evening'): Promise<boolean> {
  if (isWeb) return false;
  await Notifications.scheduleNotificationAsync({
    identifier: `pepi.micro.snooze.${slot}`,
    content: {
      title: t('notify.checkinTitle'),
      body: t('notify.snoozeBody'),
      data: { kind: 'micro', slot },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return true;
}

/** Missed scheduled doses before a nudge fires (ISSUES P-05; spec discussion
 *  suggested 2-3, resolved to 2 — early enough to matter, late enough to not
 *  ping over a single forgotten log). */
const SKIP_NUDGE_THRESHOLD = 2;
/** Days after a nudge before it can re-fire without a new dose in between. */
const SKIP_NUDGE_REARM_DAYS = 7;

/**
 * P-05: when {@link SKIP_NUDGE_THRESHOLD}+ consecutive scheduled doses went
 * unlogged for an item, fire ONE non-judgmental notification that deep-links
 * into Pepi chat (data.kind='skipped'). Deduped per item via
 * `profile.skipNudgedOn`; re-arms after a new dose for the item or
 * {@link SKIP_NUDGE_REARM_DAYS} days. Returns the skipNudgedOn patch to persist
 * (or null when nothing fired). No-op on web; respects notifyDosesEnabled.
 * The Wave-3 anomaly engine + context memory upgrades this simple version.
 */
export async function maybeNotifySkippedDoses(
  profile: LocalProfile,
  protocolItems: ProtocolItem[],
  doseEvents: DoseEvent[],
): Promise<Record<string, string> | null> {
  if (isWeb || !profile.notifyDosesEnabled) return null;
  const today = localDateKey();

  // Doses per item: by explicit link, falling back to compound match (chat-logged
  // doses carry no protocolItemId — they must still count as taken).
  const dosesFor = (p: ProtocolItem): ScheduledDose[] =>
    doseEvents
      .filter((d) => (d.protocolItemId ? d.protocolItemId === p.id : d.compoundSlug === p.compoundSlug))
      .map((d) => ({
        dateKey: localDateKey(new Date(d.takenAt)),
        slotKey: d.slotKey,
        extra: d.extra,
      }));

  const fired: Record<string, string> = {};
  for (const p of protocolItems) {
    const doses = dosesFor(p);

    let streak = 0;
    if (p.doseDays !== undefined) {
      streak = missedWeekdayStreak(p.doseDays, doses.map((d) => d.dateKey), today);
    } else {
      const interval = intervalFor(p.frequency);
      if (interval == null) continue; // as_needed / custom: no schedule to miss
      const anchor = anchorFor(p, doses.map((d) => d.dateKey), today);
      if (!anchor) continue;
      streak = missedSlotStreak(anchor, interval, doses, today);
    }
    if (streak < SKIP_NUDGE_THRESHOLD) continue;

    // Dedup / re-arm.
    const nudgedOn = profile.skipNudgedOn?.[p.id];
    if (nudgedOn) {
      const doseAfterNudge = doses.some((d) => d.dateKey >= nudgedOn);
      if (!doseAfterNudge && daysBetween(nudgedOn, today) < SKIP_NUDGE_REARM_DAYS) continue;
    }

    const compound = compoundBySlug(p.compoundSlug)?.canonicalName ?? p.compoundSlug;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: t('notify.skippedTitle'),
        body: t('notify.skippedBody', { compound, count: streak }),
        data: { kind: 'skipped', itemId: p.id },
      },
      trigger: null, // immediate
    });
    fired[p.id] = today;
  }

  return Object.keys(fired).length ? { ...profile.skipNudgedOn, ...fired } : null;
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
