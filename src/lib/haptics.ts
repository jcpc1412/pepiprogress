/**
 * Thin haptics wrapper (UX audit 2026-07-11). Native-only: expo-haptics no-ops
 * unreliably on web, so every call is gated + fire-and-forget. Semantic names
 * keep call sites honest about intent (a light tap for routine confirmations,
 * a success notification for milestone moments).
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const native = Platform.OS === 'ios' || Platform.OS === 'android';

/** Routine confirmation: a dose logged, a value saved. */
export function hapticTap(): void {
  if (!native) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Milestone moment: photo saved, new quality highscore. */
export function hapticSuccess(): void {
  if (!native) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
