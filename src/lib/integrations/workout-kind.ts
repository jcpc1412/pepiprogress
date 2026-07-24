/**
 * Workout-kind classification (MASTER-PLAN block 4, prereq for 2b.4 passive fill).
 *
 * `MetricReading` carries a number and nothing else, so the workout's kind rides
 * as a small numeric enum on its own metric, paired by timestamp with the
 * existing `activity.workout_min` / `activity.workout_hr` readings. Named
 * constants live here so no call site ever writes a bare 1 or 2.
 *
 * Why the buckets are this coarse: the only consumer is the strength-held signal
 * (2b.4), which asks one question — "did they train STRENGTH today?" — because
 * that is what makes a photo change readable as muscle rather than water. A
 * finer taxonomy would be more faithful to the source data and useless to the
 * one thing reading it. The subjective "lifting felt" chip stays authoritative
 * either way (owner decision); this is a suggestion layer.
 *
 * Pure: no provider imports, no clock, no I/O.
 */

export const WorkoutKind = {
  /** Anything we cannot honestly bucket, incl. the providers' "other" values. */
  other: 0,
  /** Resistance training against load. The one bucket 2b.4 actually acts on. */
  strength: 1,
  /** Sustained aerobic work. */
  cardio: 2,
  /** Genuinely both (HIIT, CrossFit-style, bootcamp, circuits). */
  mixed: 3,
} as const;

export type WorkoutKindValue = (typeof WorkoutKind)[keyof typeof WorkoutKind];

// ── Apple HealthKit (WorkoutActivityType) ────────────────────────────────────
// Numeric values from HKWorkoutActivityType. Only the types that map cleanly are
// listed; everything else falls through to `other` rather than being guessed at.

const HK_STRENGTH = new Set<number>([
  20, // functionalStrengthTraining
  50, // traditionalStrengthTraining
  59, // coreTraining
]);

const HK_CARDIO = new Set<number>([
  13, // cycling
  16, // elliptical
  35, // rowing
  37, // running
  46, // swimming
  52, // walking
  24, // hiking
  36, // runningTreadmill-adjacent / stairClimbing family
]);

const HK_MIXED = new Set<number>([
  11, // crossTraining
  63, // highIntensityIntervalTraining
]);

/** Bucket an Apple HealthKit workout by its activity type. */
export function classifyAppleWorkout(activityType: number | undefined): WorkoutKindValue {
  if (typeof activityType !== 'number') return WorkoutKind.other;
  if (HK_STRENGTH.has(activityType)) return WorkoutKind.strength;
  if (HK_MIXED.has(activityType)) return WorkoutKind.mixed;
  if (HK_CARDIO.has(activityType)) return WorkoutKind.cardio;
  return WorkoutKind.other;
}

// ── Health Connect (ExerciseType) ────────────────────────────────────────────
// Values from react-native-health-connect's ExerciseType constant. Health
// Connect enumerates individual LIFTS (deadlift, bench press, squat...) as
// exercise types, so the strength set is much larger than HealthKit's.

const HC_STRENGTH = new Set<number>([
  1, // BACK_EXTENSION
  3, // BARBELL_SHOULDER_PRESS
  6, // BENCH_PRESS
  7, // BENCH_SIT_UP
  12, // BURPEE
  13, // CALISTHENICS
  15, // CRUNCH
  17, // DEADLIFT
  18, 19, // DUMBBELL_CURL_LEFT/RIGHT_ARM
  20, // DUMBBELL_FRONT_RAISE
  21, // DUMBBELL_LATERAL_RAISE
  22, 23, 24, // DUMBBELL_TRICEPS_EXTENSION_*
  30, // FORWARD_TWIST
  40, // JUMPING_JACK
  42, // LAT_PULL_DOWN
  43, // LUNGE
  49, // PLANK
  67, // SQUAT
  70, // STRENGTH_TRAINING
  77, // UPPER_TWIST
  81, // WEIGHTLIFTING
]);

const HC_CARDIO = new Set<number>([
  8, 9, // BIKING, BIKING_STATIONARY
  25, // ELLIPTICAL
  37, // HIKING
  41, // JUMP_ROPE
  53, 54, // ROWING, ROWING_MACHINE
  56, 57, // RUNNING, RUNNING_TREADMILL
  68, 69, // STAIR_CLIMBING, STAIR_CLIMBING_MACHINE
  73, 74, // SWIMMING_OPEN_WATER, SWIMMING_POOL
  79, // WALKING
  82, // WHEELCHAIR
]);

const HC_MIXED = new Set<number>([
  10, // BOOT_CAMP
  26, // EXERCISE_CLASS
  36, // HIGH_INTENSITY_INTERVAL_TRAINING
]);

/** Bucket a Health Connect exercise session by its exercise type. */
export function classifyHealthConnectExercise(exerciseType: number | undefined): WorkoutKindValue {
  if (typeof exerciseType !== 'number') return WorkoutKind.other;
  if (HC_STRENGTH.has(exerciseType)) return WorkoutKind.strength;
  if (HC_MIXED.has(exerciseType)) return WorkoutKind.mixed;
  if (HC_CARDIO.has(exerciseType)) return WorkoutKind.cardio;
  return WorkoutKind.other;
}

/**
 * Did this set of kind values include resistance work? `mixed` counts: a HIIT or
 * CrossFit session loads muscle, and treating it as "no strength today" would
 * make the passive fill wrong for exactly the people who train hardest.
 */
export function includesStrength(kinds: readonly number[]): boolean {
  return kinds.some((k) => k === WorkoutKind.strength || k === WorkoutKind.mixed);
}
