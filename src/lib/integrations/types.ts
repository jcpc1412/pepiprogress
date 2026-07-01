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
  nutritionEnergy: 'nutrition.energy',
  nutritionProtein: 'nutrition.protein',
  nutritionCarbs: 'nutrition.carbs',
  nutritionFat: 'nutrition.fat',
  vitalsHrRest: 'vitals.hr_rest',
  vitalsHrv: 'vitals.hrv',
  vitalsGlucose: 'vitals.glucose',
  cyclePhase: 'cycle.phase',
} as const;

export type CanonicalMetricKey = (typeof CanonicalMetric)[keyof typeof CanonicalMetric];

/** A reading produced by a provider, before the store assigns an id. */
export type ProviderReading = Omit<MetricReading, 'id'>;

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
};

export type AuthResult = { ok: boolean; patch?: Partial<IntegrationState>; error?: string };
