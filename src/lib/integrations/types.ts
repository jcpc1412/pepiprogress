import type { IntegrationState, MetricReading } from '@/lib/store';

/**
 * Canonical metric namespace (spec 06). Stable keys that every provider maps
 * into; the daily log reads only these and never knows the source provider.
 */
export const CanonicalMetric = {
  bodyWeight: 'body.weight',
  bodyFatPct: 'body.fat_pct',
  bodyLeanMass: 'body.lean_mass',
  activitySteps: 'activity.steps',
  activityEnergy: 'activity.energy',
  activityWorkout: 'activity.workout',
  activityEffort: 'activity.effort',
  sleepDuration: 'sleep.duration',
  sleepQuality: 'sleep.quality',
  sleepDeep: 'sleep.deep',
  sleepRem: 'sleep.rem',
  nutritionEnergy: 'nutrition.energy',
  nutritionProtein: 'nutrition.protein',
  nutritionCarbs: 'nutrition.carbs',
  nutritionFat: 'nutrition.fat',
  vitalsHrRest: 'vitals.hr_rest',
  vitalsHrv: 'vitals.hrv',
  vitalsRespRate: 'vitals.resp_rate',
  vitalsSpo2: 'vitals.spo2',
  vitalsBodyTemp: 'vitals.body_temp',
  vitalsGlucose: 'vitals.glucose',
  // Per-workout facts (paired by ts) — the derived-metrics engine reads these to
  // compute Banister TRIMP load; kept as flat readings to fit the MetricReading model.
  activityWorkoutMin: 'activity.workout_min',
  activityWorkoutHr: 'activity.workout_hr',
  /** Workout kind for the same session, paired by ts with the two above.
   *  Value is the `WorkoutKind` enum (see `workout-kind.ts`), not a free label:
   *  `MetricReading` carries only a number. Feeds the 2b.4 strength-held signal,
   *  which needs "was this resistance work?" to read a photo change as muscle
   *  rather than water. */
  activityWorkoutKind: 'activity.workout_kind',
  /** One logged menstrual-flow day. Value = flow level (1 light .. 4 heavy, 0 =
   *  recorded but unspecified). `src/lib/cycle.ts` collapses runs of these into
   *  period starts, an observed cycle length, and today's phase.
   *
   *  Was `cycle.phase`, which both providers advertised as a capability and
   *  neither ever produced. Sensitive class: stays local, never mirrored to the
   *  normalized tables, never reaches community aggregation. */
  cycleFlow: 'cycle.flow',
} as const;

export type CanonicalMetricKey = (typeof CanonicalMetric)[keyof typeof CanonicalMetric];

/** A reading produced by a provider, before the store assigns an id. */
export type ProviderReading = Omit<MetricReading, 'id'>;

/**
 * The body metrics Pepi can write back to a health store (weight, the computed
 * body-fat %, and waist — the only circumference HealthKit models). Values are
 * canonical: weight in kg, `body.fat_pct` as a percentage number (18.5 = 18.5%),
 * waist in cm. The provider converts to each store's native representation.
 */
export type HealthWriteMetric = 'body.weight' | 'body.fat_pct' | 'body.waist';
export type HealthWriteSample = { metric: HealthWriteMetric; value: number; ts: string };
export type HealthWriteResult = { ok: boolean; written: number; error?: string };

export type ProviderId = 'apple_health' | 'health_connect' | 'terra';

/**
 * Every source implements this interface (spec 06). Adding a source = one
 * provider object, no changes to the app. `nativeReady` is false while only the
 * framework binding exists (the native SDK call is a device-build step); the UI
 * uses it to show "needs native build" instead of faking a connection.
 */
export type IntegrationProvider = {
  id: ProviderId;
  /** i18n key for the display name. */
  nameKey: string;
  /** Canonical metrics this provider can supply (drives the UI capability list). */
  capabilities: CanonicalMetricKey[];
  /** Platform gate — e.g. Apple Health is iOS-only, Health Connect is Android-only. */
  isAvailable: () => boolean;
  /** False until the native SDK binding is wired (device-build step). */
  nativeReady: boolean;
  /**
   * Request permission / authenticate. `ok` is whether access was granted;
   * `patch` carries any connection state to persist (e.g. Terra's `terraUserId`).
   */
  authenticate: () => Promise<AuthResult>;
  /**
   * Pull readings since `opts.since` (ISO); a provider-chosen default window when
   * omitted. `opts.connection` gives the stored connection state (tokens, ids).
   */
  pull: (opts: { since?: string; connection?: IntegrationState }) => Promise<ProviderReading[]>;
  /**
   * Optional on-device diagnostic. Returns a short human-readable report (module
   * linked? permission status? raw sample counts per metric?) that the user can
   * read/screenshot when a sync mysteriously returns nothing. Native-only.
   */
  diagnose?: () => Promise<string>;
  /**
   * Optional write-back: mirror Pepi's body metrics (weight, body-fat %, waist)
   * into the health store. Only implemented where the store accepts writes
   * (Apple Health). Absent = read-only provider.
   */
  push?: (samples: HealthWriteSample[]) => Promise<HealthWriteResult>;
};

export type AuthResult = { ok: boolean; patch?: Partial<IntegrationState>; error?: string };
