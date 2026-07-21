/**
 * Motion presets (Wave 7 item 35, F2). The reusable reanimated layer built on the
 * `Motion` tokens in `src/constants/theme.ts`. Screens adopt these instead of
 * hand-rolling durations/easings so the whole app moves on one rhythm.
 *
 * - `easings.*` — reanimated `Easing` functions from the token bezier curves.
 * - `timing.*` — `withTiming` configs for shared-value animations.
 * - `enter*` / `exit*` — layout-animation builders for `<Animated.View entering/exiting>`.
 * - `layout` — the standard `LinearTransition` for list add/remove/reorder.
 * - `pressScale` — the transform for pressed tappables (matches `Motion.pressScale`).
 *
 * Reduce-motion: reanimated layout animations respect the OS setting when a
 * `<ReducedMotionConfig mode={ReduceMotion.System} />` is mounted at the root; the
 * `withTiming` configs here fall back to instant under the same setting via
 * reanimated's built-in handling.
 */
import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  LinearTransition,
  type WithTimingConfig,
} from 'react-native-reanimated';

import { Motion } from '@/constants/theme';

const bezier = (c: readonly [number, number, number, number]) => Easing.bezier(c[0], c[1], c[2], c[3]);

export const easings = {
  standard: bezier(Motion.easing.standard),
  decelerate: bezier(Motion.easing.decelerate),
  exit: bezier(Motion.easing.exit),
};

/** `withTiming` configs for shared-value driven animation. */
export const timing = {
  instant: { duration: Motion.duration.instant, easing: easings.standard } satisfies WithTimingConfig,
  fast: { duration: Motion.duration.fast, easing: easings.standard } satisfies WithTimingConfig,
  base: { duration: Motion.duration.base, easing: easings.standard } satisfies WithTimingConfig,
  slow: { duration: Motion.duration.slow, easing: easings.decelerate } satisfies WithTimingConfig,
};

/** Small element appears in place (toasts, revealed rows). */
export const enterFade = FadeIn.duration(Motion.duration.fast).easing(easings.standard);
export const exitFade = FadeOut.duration(Motion.duration.fast).easing(easings.exit);

/** Content rising into place (cards, list items, sheets). */
export const enterRise = FadeInDown.duration(Motion.duration.base).easing(easings.decelerate);
export const exitSink = FadeOutDown.duration(Motion.duration.fast).easing(easings.exit);

/** Standard layout transition for list add/remove/reorder + size changes. */
export const layout = LinearTransition.duration(Motion.duration.base).easing(easings.standard);

/** Transform for a pressed tappable surface. Spread into a Pressable style. */
export const pressScale = (isPressed: boolean) => ({
  transform: [{ scale: isPressed ? Motion.pressScale : 1 }],
});
