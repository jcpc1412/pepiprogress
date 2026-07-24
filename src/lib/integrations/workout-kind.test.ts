import { describe, expect, it } from 'vitest';

import {
  WorkoutKind,
  classifyAppleWorkout,
  classifyHealthConnectExercise,
  includesStrength,
} from '@/lib/integrations/workout-kind';

describe('classifyAppleWorkout', () => {
  it('buckets the strength types', () => {
    expect(classifyAppleWorkout(50)).toBe(WorkoutKind.strength); // traditionalStrengthTraining
    expect(classifyAppleWorkout(20)).toBe(WorkoutKind.strength); // functionalStrengthTraining
    expect(classifyAppleWorkout(59)).toBe(WorkoutKind.strength); // coreTraining
  });

  it('buckets cardio and mixed distinctly', () => {
    expect(classifyAppleWorkout(37)).toBe(WorkoutKind.cardio); // running
    expect(classifyAppleWorkout(13)).toBe(WorkoutKind.cardio); // cycling
    expect(classifyAppleWorkout(63)).toBe(WorkoutKind.mixed); // HIIT
    expect(classifyAppleWorkout(11)).toBe(WorkoutKind.mixed); // crossTraining
  });

  it('falls through to other rather than guessing', () => {
    expect(classifyAppleWorkout(6)).toBe(WorkoutKind.other); // basketball
    expect(classifyAppleWorkout(57)).toBe(WorkoutKind.other); // yoga
    expect(classifyAppleWorkout(undefined)).toBe(WorkoutKind.other);
    expect(classifyAppleWorkout(9999)).toBe(WorkoutKind.other);
  });
});

describe('classifyHealthConnectExercise', () => {
  it('buckets both the generic and the per-lift strength types', () => {
    expect(classifyHealthConnectExercise(70)).toBe(WorkoutKind.strength); // STRENGTH_TRAINING
    expect(classifyHealthConnectExercise(81)).toBe(WorkoutKind.strength); // WEIGHTLIFTING
    expect(classifyHealthConnectExercise(17)).toBe(WorkoutKind.strength); // DEADLIFT
    expect(classifyHealthConnectExercise(6)).toBe(WorkoutKind.strength); // BENCH_PRESS
    expect(classifyHealthConnectExercise(67)).toBe(WorkoutKind.strength); // SQUAT
  });

  it('buckets cardio and mixed distinctly', () => {
    expect(classifyHealthConnectExercise(56)).toBe(WorkoutKind.cardio); // RUNNING
    expect(classifyHealthConnectExercise(74)).toBe(WorkoutKind.cardio); // SWIMMING_POOL
    expect(classifyHealthConnectExercise(36)).toBe(WorkoutKind.mixed); // HIIT
    expect(classifyHealthConnectExercise(10)).toBe(WorkoutKind.mixed); // BOOT_CAMP
  });

  it('falls through to other rather than guessing', () => {
    expect(classifyHealthConnectExercise(0)).toBe(WorkoutKind.other); // OTHER_WORKOUT
    expect(classifyHealthConnectExercise(83)).toBe(WorkoutKind.other); // YOGA
    expect(classifyHealthConnectExercise(undefined)).toBe(WorkoutKind.other);
  });

  it('does not collide across the two providers (same number, different meaning)', () => {
    // 6 is BENCH_PRESS on Health Connect but basketball on HealthKit — the two
    // classifiers must never be used interchangeably.
    expect(classifyHealthConnectExercise(6)).toBe(WorkoutKind.strength);
    expect(classifyAppleWorkout(6)).toBe(WorkoutKind.other);
  });
});

describe('includesStrength', () => {
  it('counts strength and mixed, not cardio', () => {
    expect(includesStrength([WorkoutKind.cardio, WorkoutKind.strength])).toBe(true);
    expect(includesStrength([WorkoutKind.mixed])).toBe(true);
    expect(includesStrength([WorkoutKind.cardio, WorkoutKind.other])).toBe(false);
    expect(includesStrength([])).toBe(false);
  });
});
