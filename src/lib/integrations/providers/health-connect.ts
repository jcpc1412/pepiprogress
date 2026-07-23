import { Platform } from 'react-native';

import { localDateKey } from '@/lib/dates';
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
  { accessType: 'read', recordType: 'MenstruationFlow' },
  // Requested alongside MenstruationFlow, not instead of it: period-tracker apps
  // split across both record types in practice (some log a daily flow level,
  // others only log the period span), and there is no public confirmation of
  // which one any given app — including the tester's Flo — actually writes. The
  // cost of requesting both is one extra permission line; the cost of guessing
  // wrong is the cycle feature silently not working for exactly the person it's
  // being validated against.
  { accessType: 'read', recordType: 'MenstruationPeriod' },
] as const;

async function readHealthConnect(since?: string): Promise<ProviderReading[]> {
  const { getSdkStatus, initialize, readRecords } = hc();
  const status = await getSdkStatus();
  if (status !== SDK_AVAILABLE) return [];
  await initialize();

  // Full-day query window (master-plan W1-1): daily aggregates must re-read ALL
  // of a day's records, so an incremental pull starts at the beginning of the
  // local day before `since` (the extra day covers sleep sessions that started
  // the previous evening). Reading from the raw `since` timestamp undercounted.
  let startTime: string;
  if (since) {
    const d = new Date(since);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 1);
    startTime = d.toISOString();
  } else {
    startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }
  const timeRangeFilter = { operator: 'after', startTime } as const;

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
      const dateKey = localDateKey(new Date(r.startTime)); // local day, not UTC
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
      const dateKey = localDateKey(new Date(r.startTime)); // local day, not UTC
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
      const dateKey = localDateKey(new Date(r.startTime)); // local day, not UTC
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
      const dateKey = localDateKey(new Date(r.startTime)); // local day, not UTC
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

  // --- Menstrual flow: one reading per logged flow day ---
  // The menstruation permission was already being requested here and never read —
  // asking for the most sensitive data class in the app and doing nothing with it.
  // Read BOTH record types period trackers use (see the permission comment above):
  // `MenstruationFlow` is per-day; `MenstruationPeriod` is a start..end span, so it
  // is expanded into the days it covers. Merged into one day->level map so a
  // period-only day (flow level unknown) still registers as a flow day at level 0,
  // which is all `derivePeriodStarts` needs to find the start.
  const byDay: Record<string, number> = {};
  try {
    const { records } = await readRecords('MenstruationFlow', { timeRangeFilter });
    // Flow constants: unknown=0, light=1, medium=2, heavy=3. There is no explicit
    // "none" value to filter out, unlike HealthKit.
    for (const r of records) {
      const d = new Date(r.time);
      if (Number.isNaN(d.getTime())) continue;
      const dateKey = localDateKey(d);
      byDay[dateKey] = Math.max(byDay[dateKey] ?? 0, r.flow ?? 0);
    }
  } catch { /* unavailable */ }
  try {
    // The library's ambient types model MenstruationPeriod as instantaneous
    // (`time` only); the real Health Connect API defines it as an interval with
    // startTime/endTime, matching HealthKit's period concept. Cast to the real
    // shape rather than trust the (wrong) generated type.
    const { records } = await readRecords('MenstruationPeriod', { timeRangeFilter });
    for (const r of records as unknown as { startTime: string; endTime: string }[]) {
      const start = new Date(r.startTime);
      const end = new Date(r.endTime);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateKey = localDateKey(new Date(d));
        byDay[dateKey] = byDay[dateKey] ?? 0;
      }
    }
  } catch { /* unavailable */ }
  for (const [dateKey, value] of Object.entries(byDay)) {
    readings.push({
      metric: CanonicalMetric.cycleFlow,
      value,
      ts: `${dateKey}T00:00:00.000Z`,
      sourceProvider: PROVIDER_ID,
    });
  }

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
    CanonicalMetric.cycleFlow,
  ],
  isAvailable: () => Platform.OS === 'android',
  nativeReady: true,
  authenticate: async () => {
    if (Platform.OS !== 'android') return { ok: false };
    try {
      const mod = hc();
      if (typeof mod?.getSdkStatus !== 'function') return { ok: false };
      const status = await mod.getSdkStatus();
      if (status !== SDK_AVAILABLE) return { ok: false };
      await mod.initialize();
      await mod.requestPermission(READ_PERMISSIONS as never);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  },
  pull: ({ since } = {}) => readHealthConnect(since),
};
