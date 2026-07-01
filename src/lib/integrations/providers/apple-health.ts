import { Platform } from 'react-native';

import { CanonicalMetric, type IntegrationProvider, type ProviderReading } from '@/lib/integrations/types';

const PROVIDER_ID = 'apple_health';

// Quantity type identifiers we request and read.
// Unit strings come from QuantityUnitByIdentifierMap in the SDK generated types.
const QUANTITY_MAP = [
  { id: 'HKQuantityTypeIdentifierBodyMass', metric: CanonicalMetric.bodyWeight, unit: 'kg', sumPerDay: false },
  { id: 'HKQuantityTypeIdentifierBodyFatPercentage', metric: CanonicalMetric.bodyFatPct, unit: '%', sumPerDay: false },
  { id: 'HKQuantityTypeIdentifierLeanBodyMass', metric: CanonicalMetric.bodyLeanMass, unit: 'kg', sumPerDay: false },
  { id: 'HKQuantityTypeIdentifierStepCount', metric: CanonicalMetric.activitySteps, unit: 'count', sumPerDay: true },
  { id: 'HKQuantityTypeIdentifierActiveEnergyBurned', metric: CanonicalMetric.activityEnergy, unit: 'kcal', sumPerDay: true },
  { id: 'HKQuantityTypeIdentifierRestingHeartRate', metric: CanonicalMetric.vitalsHrRest, unit: 'count/min', sumPerDay: false },
  { id: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', metric: CanonicalMetric.vitalsHrv, unit: 'ms', sumPerDay: false },
  // Nutrition — logged per-meal, summed to daily total
  { id: 'HKQuantityTypeIdentifierDietaryEnergyConsumed', metric: CanonicalMetric.nutritionEnergy, unit: 'kcal', sumPerDay: true },
  { id: 'HKQuantityTypeIdentifierDietaryProtein', metric: CanonicalMetric.nutritionProtein, unit: 'g', sumPerDay: true },
  { id: 'HKQuantityTypeIdentifierDietaryCarbohydrates', metric: CanonicalMetric.nutritionCarbs, unit: 'g', sumPerDay: true },
  { id: 'HKQuantityTypeIdentifierDietaryFatTotal', metric: CanonicalMetric.nutritionFat, unit: 'g', sumPerDay: true },
] as const;

// Loaded lazily so the module can be imported on web without bundling the native SDK.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const hk = () => require('@kingstinct/react-native-healthkit') as typeof import('@kingstinct/react-native-healthkit');

async function authenticate(): Promise<boolean> {
  const mod = hk();
  // Guard: if the native module isn't in this build, fail soft instead of throwing.
  if (typeof mod?.requestAuthorization !== 'function') return false;
  const toRead = [
    ...QUANTITY_MAP.map((m) => m.id),
    'HKCategoryTypeIdentifierSleepAnalysis',
  ] as Parameters<ReturnType<typeof hk>['requestAuthorization']>[0]['toRead'] & string[];
  try {
    await mod.requestAuthorization({ toRead });
    // iOS never exposes whether the user actually granted — the promise resolves
    // regardless of the choice (Apple privacy). Assume granted after the sheet
    // dismisses; if they denied, reads will return empty and we handle gracefully.
    return true;
  } catch {
    return false;
  }
}

async function readHealthKit(since?: string): Promise<ProviderReading[]> {
  const startDate = since ? new Date(since) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const endDate = new Date();
  const { queryQuantitySamples, queryCategorySamples } = hk();
  const readings: ProviderReading[] = [];

  // --- Quantity samples ---
  for (const entry of QUANTITY_MAP) {
    try {
      const samples = await queryQuantitySamples(entry.id as never, {
        filter: { date: { startDate, endDate } },
        limit: -1,
      });

      if (entry.sumPerDay) {
        const daily: Record<string, number> = {};
        for (const s of samples) {
          const dateKey = (s.startDate as Date).toISOString().slice(0, 10);
          daily[dateKey] = (daily[dateKey] ?? 0) + s.quantity;
        }
        for (const [dateKey, value] of Object.entries(daily)) {
          readings.push({ metric: entry.metric, value, ts: `${dateKey}T00:00:00.000Z`, sourceProvider: PROVIDER_ID });
        }
      } else {
        for (const s of samples) {
          readings.push({
            metric: entry.metric,
            value: s.quantity,
            ts: (s.startDate as Date).toISOString(),
            sourceProvider: PROVIDER_ID,
          });
        }
      }
    } catch {
      // Identifier unavailable on this device/OS version — skip gracefully.
    }
  }

  // --- Sleep: sum asleep stages per calendar day ---
  // CategoryValueSleepAnalysis: inBed=0, asleep=1, awake=2, asleepCore=3, asleepDeep=4, asleepREM=5
  try {
    const sleepSamples = await queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
      filter: { date: { startDate, endDate } },
      limit: -1,
    });

    const dailySleep: Record<string, number> = {};
    for (const s of sleepSamples) {
      const value = s.value as number;
      if (value === 0 || value === 2) continue; // inBed or awake — not actual sleep
      const dateKey = (s.startDate as Date).toISOString().slice(0, 10);
      const durationHours =
        ((s.endDate as Date).getTime() - (s.startDate as Date).getTime()) / 3_600_000;
      dailySleep[dateKey] = (dailySleep[dateKey] ?? 0) + durationHours;
    }
    for (const [dateKey, hours] of Object.entries(dailySleep)) {
      readings.push({
        metric: CanonicalMetric.sleepDuration,
        value: hours,
        ts: `${dateKey}T00:00:00.000Z`,
        sourceProvider: PROVIDER_ID,
      });
    }
  } catch {
    // Sleep unavailable.
  }

  return readings;
}

export const appleHealthProvider: IntegrationProvider = {
  id: PROVIDER_ID,
  nameKey: 'integrations.appleHealth',
  capabilities: [
    CanonicalMetric.bodyWeight,
    CanonicalMetric.bodyFatPct,
    CanonicalMetric.bodyLeanMass,
    CanonicalMetric.sleepDuration,
    CanonicalMetric.activitySteps,
    CanonicalMetric.activityEnergy,
    CanonicalMetric.vitalsHrRest,
    CanonicalMetric.vitalsHrv,
    CanonicalMetric.nutritionEnergy,
    CanonicalMetric.nutritionProtein,
    CanonicalMetric.nutritionCarbs,
    CanonicalMetric.nutritionFat,
    CanonicalMetric.cyclePhase,
  ],
  isAvailable: () => Platform.OS === 'ios',
  nativeReady: true,
  authenticate: async () => {
    if (Platform.OS !== 'ios') return { ok: false };
    const ok = await authenticate();
    return { ok };
  },
  pull: ({ since } = {}) => readHealthKit(since),
};
