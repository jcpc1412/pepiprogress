import { Platform } from 'react-native';

import { CanonicalMetric, type IntegrationProvider, type ProviderReading } from '@/lib/integrations/types';

const PROVIDER_ID = 'health_connect';

// Lazily required so the Android-only native module isn't bundled for web/iOS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const hc = () => require('react-native-health-connect') as typeof import('react-native-health-connect');

/** Health Connect SDK_AVAILABLE status code. */
const SDK_AVAILABLE = 3;

/** All permissions we request (read-only). */
const READ_PERMISSIONS = [
  { accessType: 'read', recordType: 'Weight' },
  { accessType: 'read', recordType: 'BodyFat' },
  { accessType: 'read', recordType: 'LeanBodyMass' },
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'RestingHeartRate' },
  { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'Nutrition' },
  { accessType: 'read', recordType: 'MenstruationPeriod' },
] as const;

async function readHealthConnect(since?: string): Promise<ProviderReading[]> {
  const { getSdkStatus, initialize, readRecords } = hc();
  const status = await getSdkStatus();
  if (status !== SDK_AVAILABLE) return [];
  await initialize();

  const timeRangeFilter = since
    ? ({ operator: 'after', startTime: since } as const)
    : ({
        operator: 'after',
        startTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      } as const);

  const readings: ProviderReading[] = [];

  // --- Weight ---
  try {
    const { records } = await readRecords('Weight', { timeRangeFilter });
    for (const r of records) {
      readings.push({ metric: CanonicalMetric.bodyWeight, value: r.weight.inKilograms, ts: r.time, sourceProvider: PROVIDER_ID });
    }
  } catch { /* unavailable */ }

  // --- Body fat ---
  try {
    const { records } = await readRecords('BodyFat', { timeRangeFilter });
    for (const r of records) {
      readings.push({ metric: CanonicalMetric.bodyFatPct, value: r.percentage, ts: r.time, sourceProvider: PROVIDER_ID });
    }
  } catch { /* unavailable */ }

  // --- Lean body mass ---
  try {
    const { records } = await readRecords('LeanBodyMass', { timeRangeFilter });
    for (const r of records) {
      readings.push({ metric: CanonicalMetric.bodyLeanMass, value: r.mass.inKilograms, ts: r.time, sourceProvider: PROVIDER_ID });
    }
  } catch { /* unavailable */ }

  // --- Steps: sum per calendar day ---
  try {
    const { records } = await readRecords('Steps', { timeRangeFilter });
    const daily: Record<string, number> = {};
    for (const r of records) {
      const dateKey = r.startTime.slice(0, 10);
      daily[dateKey] = (daily[dateKey] ?? 0) + r.count;
    }
    for (const [dateKey, value] of Object.entries(daily)) {
      readings.push({ metric: CanonicalMetric.activitySteps, value, ts: `${dateKey}T00:00:00.000Z`, sourceProvider: PROVIDER_ID });
    }
  } catch { /* unavailable */ }

  // --- Active calories: sum per calendar day ---
  try {
    const { records } = await readRecords('ActiveCaloriesBurned', { timeRangeFilter });
    const daily: Record<string, number> = {};
    for (const r of records) {
      const dateKey = r.startTime.slice(0, 10);
      daily[dateKey] = (daily[dateKey] ?? 0) + r.energy.inKilocalories;
    }
    for (const [dateKey, value] of Object.entries(daily)) {
      readings.push({ metric: CanonicalMetric.activityEnergy, value, ts: `${dateKey}T00:00:00.000Z`, sourceProvider: PROVIDER_ID });
    }
  } catch { /* unavailable */ }

  // --- Resting heart rate ---
  try {
    const { records } = await readRecords('RestingHeartRate', { timeRangeFilter });
    for (const r of records) {
      readings.push({ metric: CanonicalMetric.vitalsHrRest, value: r.beatsPerMinute, ts: r.time, sourceProvider: PROVIDER_ID });
    }
  } catch { /* unavailable */ }

  // --- HRV (RMSSD) ---
  try {
    const { records } = await readRecords('HeartRateVariabilityRmssd', { timeRangeFilter });
    for (const r of records) {
      readings.push({ metric: CanonicalMetric.vitalsHrv, value: r.heartRateVariabilityMillis, ts: r.time, sourceProvider: PROVIDER_ID });
    }
  } catch { /* unavailable */ }

  // --- Sleep: sum session durations per calendar day ---
  try {
    const { records } = await readRecords('SleepSession', { timeRangeFilter });
    const daily: Record<string, number> = {};
    for (const r of records) {
      const dateKey = r.startTime.slice(0, 10);
      const durationHours =
        (new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) / 3_600_000;
      daily[dateKey] = (daily[dateKey] ?? 0) + durationHours;
    }
    for (const [dateKey, hours] of Object.entries(daily)) {
      readings.push({ metric: CanonicalMetric.sleepDuration, value: hours, ts: `${dateKey}T00:00:00.000Z`, sourceProvider: PROVIDER_ID });
    }
  } catch { /* unavailable */ }

  // --- Nutrition: aggregate per-meal records to daily totals ---
  try {
    const { records } = await readRecords('Nutrition', { timeRangeFilter });
    const daily = {
      energy: {} as Record<string, number>,
      protein: {} as Record<string, number>,
      carbs: {} as Record<string, number>,
      fat: {} as Record<string, number>,
    };
    for (const r of records) {
      const dateKey = r.startTime.slice(0, 10);
      if (r.energy) daily.energy[dateKey] = (daily.energy[dateKey] ?? 0) + r.energy.inKilocalories;
      if (r.protein) daily.protein[dateKey] = (daily.protein[dateKey] ?? 0) + r.protein.inGrams;
      if (r.totalCarbohydrate) daily.carbs[dateKey] = (daily.carbs[dateKey] ?? 0) + r.totalCarbohydrate.inGrams;
      if (r.totalFat) daily.fat[dateKey] = (daily.fat[dateKey] ?? 0) + r.totalFat.inGrams;
    }
    for (const [dateKey, value] of Object.entries(daily.energy)) {
      readings.push({ metric: CanonicalMetric.nutritionEnergy, value, ts: `${dateKey}T00:00:00.000Z`, sourceProvider: PROVIDER_ID });
    }
    for (const [dateKey, value] of Object.entries(daily.protein)) {
      readings.push({ metric: CanonicalMetric.nutritionProtein, value, ts: `${dateKey}T00:00:00.000Z`, sourceProvider: PROVIDER_ID });
    }
    for (const [dateKey, value] of Object.entries(daily.carbs)) {
      readings.push({ metric: CanonicalMetric.nutritionCarbs, value, ts: `${dateKey}T00:00:00.000Z`, sourceProvider: PROVIDER_ID });
    }
    for (const [dateKey, value] of Object.entries(daily.fat)) {
      readings.push({ metric: CanonicalMetric.nutritionFat, value, ts: `${dateKey}T00:00:00.000Z`, sourceProvider: PROVIDER_ID });
    }
  } catch { /* unavailable */ }

  return readings;
}

export const healthConnectProvider: IntegrationProvider = {
  id: PROVIDER_ID,
  nameKey: 'integrations.healthConnect',
  capabilities: [
    CanonicalMetric.bodyWeight,
    CanonicalMetric.bodyFatPct,
    CanonicalMetric.bodyLeanMass,
    CanonicalMetric.activitySteps,
    CanonicalMetric.activityEnergy,
    CanonicalMetric.sleepDuration,
    CanonicalMetric.vitalsHrRest,
    CanonicalMetric.vitalsHrv,
    CanonicalMetric.nutritionEnergy,
    CanonicalMetric.nutritionProtein,
    CanonicalMetric.nutritionCarbs,
    CanonicalMetric.nutritionFat,
    CanonicalMetric.cyclePhase,
  ],
  isAvailable: () => Platform.OS === 'android',
  nativeReady: true,
  authenticate: async () => {
    if (Platform.OS !== 'android') return { ok: false };
    const { getSdkStatus, initialize, requestPermission } = hc();
    const status = await getSdkStatus();
    if (status !== SDK_AVAILABLE) return { ok: false };
    await initialize();
    await requestPermission(READ_PERMISSIONS as never);
    return { ok: true };
  },
  pull: ({ since } = {}) => readHealthConnect(since),
};
