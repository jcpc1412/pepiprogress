import { Platform } from 'react-native';

import { localDateKey } from '@/lib/dates';
import {
  CanonicalMetric,
  type HealthWriteResult,
  type HealthWriteSample,
  type IntegrationProvider,
  type ProviderReading,
} from '@/lib/integrations/types';

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
  // Recovery/sleep vitals — one point per reading; the derivation averages per day.
  { id: 'HKQuantityTypeIdentifierRespiratoryRate', metric: CanonicalMetric.vitalsRespRate, unit: 'count/min', sumPerDay: false },
  { id: 'HKQuantityTypeIdentifierOxygenSaturation', metric: CanonicalMetric.vitalsSpo2, unit: '%', sumPerDay: false },
  { id: 'HKQuantityTypeIdentifierAppleSleepingWristTemperature', metric: CanonicalMetric.vitalsBodyTemp, unit: 'degC', sumPerDay: false },
  // Nutrition — logged per-meal, summed to daily total
  { id: 'HKQuantityTypeIdentifierDietaryEnergyConsumed', metric: CanonicalMetric.nutritionEnergy, unit: 'kcal', sumPerDay: true },
  { id: 'HKQuantityTypeIdentifierDietaryProtein', metric: CanonicalMetric.nutritionProtein, unit: 'g', sumPerDay: true },
  { id: 'HKQuantityTypeIdentifierDietaryCarbohydrates', metric: CanonicalMetric.nutritionCarbs, unit: 'g', sumPerDay: true },
  { id: 'HKQuantityTypeIdentifierDietaryFatTotal', metric: CanonicalMetric.nutritionFat, unit: 'g', sumPerDay: true },
] as const;

// Writeable types we request share (write) access for. Read-only authorization
// is deliberately opaque on iOS (`authorizationStatusFor` returns "denied" even
// when a read is granted, and reads come back empty either way), so requesting
// *write* for weight also gives us one type whose status we can read back in the
// diagnostic. These are exactly the body metrics `push()` mirrors back to Health.
const SHARE_MAP = [
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierBodyFatPercentage',
  'HKQuantityTypeIdentifierWaistCircumference',
] as const;

// Canonical write metric -> HealthKit identifier + unit + value transform.
// Units are the SDK's writeable-unit strings; body-fat's percent unit is a
// fraction (0.185 = 18.5%), so a percentage number is divided by 100.
const WRITE_MAP: Record<
  HealthWriteSample['metric'],
  { id: string; unit: string; toNative: (v: number) => number }
> = {
  'body.weight': { id: 'HKQuantityTypeIdentifierBodyMass', unit: 'kg', toNative: (v) => v },
  'body.fat_pct': { id: 'HKQuantityTypeIdentifierBodyFatPercentage', unit: '%', toNative: (v) => v / 100 },
  'body.waist': { id: 'HKQuantityTypeIdentifierWaistCircumference', unit: 'cm', toNative: (v) => v },
};

// Loaded lazily so the module can be imported on web without bundling the native SDK.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const hk = () => require('@kingstinct/react-native-healthkit') as typeof import('@kingstinct/react-native-healthkit');

/**
 * Coerce a HealthKit sample date into a JS Date. Nitro modules can hand back a
 * `Date`, an epoch-millisecond number, or an ISO string depending on the bridge —
 * calling `.toISOString()` on a non-Date throws, which the per-type catch below
 * would silently swallow, dropping every sample (the "nothing synced" bug).
 */
function toDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    // Heuristic: seconds vs milliseconds since epoch.
    const d = new Date(v < 1e12 ? v * 1000 : v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Returns { ok } on success, or { ok:false, error } with the real reason so the
 *  UI can surface it (missing entitlement, HealthKit unavailable, native module
 *  not in the build). Silent failure was making a broken build indistinguishable
 *  from a denied grant. */
async function authenticate(): Promise<{ ok: boolean; error?: string }> {
  const mod = hk();
  // Guard: if the native module isn't in this build, say so explicitly.
  if (typeof mod?.requestAuthorization !== 'function') {
    return { ok: false, error: 'HealthKit native module not linked in this build' };
  }
  // HealthKit is unavailable on iPad / when the entitlement is missing.
  try {
    if (typeof mod.isHealthDataAvailable === 'function' && !mod.isHealthDataAvailable()) {
      return { ok: false, error: 'HealthKit is not available on this device' };
    }
  } catch {
    // isHealthDataAvailable itself failing means the native module is broken.
    return { ok: false, error: 'HealthKit native module failed to load' };
  }
  const toRead = [
    ...QUANTITY_MAP.map((m) => m.id),
    'HKCategoryTypeIdentifierSleepAnalysis',
    'HKQuantityTypeIdentifierHeartRate', // read per-workout avg HR for TRIMP load
    'HKWorkoutTypeIdentifier',
    // Cycle: real period starts, so the luteal attribution stops drifting off a
    // hand-typed date that is never updated again.
    'HKCategoryTypeIdentifierMenstrualFlow',
  ] as Parameters<ReturnType<typeof hk>['requestAuthorization']>[0]['toRead'] & string[];
  const toShare = [...SHARE_MAP] as Parameters<
    ReturnType<typeof hk>['requestAuthorization']
  >[0]['toShare'] & string[];
  try {
    // v14 returns true once the request completes (sheet shown or already
    // decided); it throws on a real error (e.g. missing entitlement). iOS never
    // reveals grant vs. deny, so a resolved call means "proceed" — empty reads
    // handle the denied case gracefully.
    const ok = await mod.requestAuthorization({ toRead, toShare });
    return { ok: ok !== false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * On-device sanity report. Answers the three questions a silent empty sync can't:
 * is the native module actually in this build, has the OS recorded a permission
 * decision, and how many raw samples does each type return? Purely observational —
 * no writes, safe to run anytime. Returned as plain lines for a screenshot.
 */
async function diagnose(): Promise<string> {
  const lines: string[] = [];
  const mod = hk();
  const linked = typeof mod?.requestAuthorization === 'function';
  lines.push(`module linked: ${linked ? 'yes' : 'NO'}`);
  if (!linked) {
    lines.push('→ native HealthKit module is not in this build. Rebuild with the config plugin.');
    return lines.join('\n');
  }

  try {
    const available = typeof mod.isHealthDataAvailable === 'function' ? mod.isHealthDataAvailable() : true;
    lines.push(`health data available: ${available ? 'yes' : 'NO'}`);
  } catch {
    lines.push('health data available: error');
  }

  // Aggregate request status. shouldRequest = the sheet was never completed;
  // unnecessary = a decision exists (granted OR denied — iOS hides which).
  try {
    const toRead = [
      ...QUANTITY_MAP.map((m) => m.id),
      'HKCategoryTypeIdentifierSleepAnalysis',
    ] as Parameters<typeof mod.getRequestStatusForAuthorization>[0]['toRead'] & string[];
    const status = await mod.getRequestStatusForAuthorization({ toRead });
    const label = status === 1 ? 'shouldRequest (sheet not completed)' : status === 2 ? 'unnecessary (decision recorded)' : 'unknown';
    lines.push(`request status: ${label}`);
  } catch (e) {
    lines.push(`request status: error ${e instanceof Error ? e.message : String(e)}`);
  }

  // Weight is the one type we also requested write for, so its status is real.
  try {
    const s = mod.authorizationStatusFor('HKQuantityTypeIdentifierBodyMass');
    const label = s === 2 ? 'sharingAuthorized' : s === 1 ? 'sharingDenied' : 'notDetermined';
    lines.push(`weight share status: ${label}`);
  } catch {
    // older module without this export
  }

  // Raw sample counts over the last 30 days, before any mapping — this is the
  // number that tells us whether HealthKit is actually handing data back.
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const endDate = new Date();
  lines.push('raw samples (30d):');
  for (const entry of QUANTITY_MAP) {
    try {
      const samples = await mod.queryQuantitySamples(entry.id as never, {
        filter: { date: { startDate, endDate } },
        limit: -1,
      });
      lines.push(`  ${entry.metric}: ${samples.length}`);
    } catch (e) {
      lines.push(`  ${entry.metric}: error ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  try {
    const sleep = await mod.queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
      filter: { date: { startDate, endDate } },
      limit: -1,
    });
    lines.push(`  sleep.duration: ${sleep.length}`);
  } catch (e) {
    lines.push(`  sleep.duration: error ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    const flow = await mod.queryCategorySamples('HKCategoryTypeIdentifierMenstrualFlow', {
      filter: { date: { startDate, endDate } },
      limit: -1,
    });
    lines.push(`  cycle.flow: ${flow.length}`);
  } catch (e) {
    lines.push(`  cycle.flow: error ${e instanceof Error ? e.message : String(e)}`);
  }

  return lines.join('\n');
}

async function readHealthKit(since?: string): Promise<ProviderReading[]> {
  // Full-day query window (master-plan W1-1): daily aggregates (nutrition, steps,
  // energy, sleep) must be summed from ALL of a day's samples, so an incremental
  // pull re-reads from the start of the local day BEFORE `since` (the extra day
  // covers sleep sessions that started the previous evening). Querying from the
  // raw `since` timestamp produced partial-day totals that undercounted.
  let startDate: Date;
  if (since) {
    startDate = new Date(since);
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - 1);
  } else {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }
  const endDate = new Date();
  const { queryQuantitySamples, queryCategorySamples, queryWorkoutSamples } = hk();
  const readings: ProviderReading[] = [];

  // --- Quantity samples ---
  for (const entry of QUANTITY_MAP) {
    try {
      const samples = await queryQuantitySamples(entry.id as never, {
        filter: { date: { startDate, endDate } },
        limit: -1,
      });

      if (entry.sumPerDay) {
        // Bucket by LOCAL day — check-in dates are local, so UTC bucketing put
        // late-evening samples on the wrong day for users east of UTC.
        const daily: Record<string, number> = {};
        for (const s of samples) {
          const d = toDate(s.startDate);
          if (!d || typeof s.quantity !== 'number') continue;
          const dateKey = localDateKey(d);
          daily[dateKey] = (daily[dateKey] ?? 0) + s.quantity;
        }
        for (const [dateKey, value] of Object.entries(daily)) {
          readings.push({ metric: entry.metric, value, ts: `${dateKey}T00:00:00.000Z`, sourceProvider: PROVIDER_ID });
        }
      } else {
        for (const s of samples) {
          const d = toDate(s.startDate);
          if (!d || typeof s.quantity !== 'number') continue;
          readings.push({
            metric: entry.metric,
            value: s.quantity,
            ts: d.toISOString(),
            sourceProvider: PROVIDER_ID,
          });
        }
      }
    } catch {
      // Identifier unavailable on this device/OS version — skip gracefully.
    }
  }

  // --- Sleep: total asleep hours + deep/REM stage hours per calendar day ---
  // CategoryValueSleepAnalysis: inBed=0, asleep=1, awake=2, asleepCore=3, asleepDeep=4, asleepREM=5
  try {
    const sleepSamples = await queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
      filter: { date: { startDate, endDate } },
      limit: -1,
    });

    const dailyTotal: Record<string, number> = {};
    const dailyDeep: Record<string, number> = {};
    const dailyRem: Record<string, number> = {};
    for (const s of sleepSamples) {
      const value = s.value as number;
      if (value === 0 || value === 2) continue; // inBed or awake — not actual sleep
      const start = toDate(s.startDate);
      const end = toDate(s.endDate);
      if (!start || !end) continue;
      const dateKey = localDateKey(start);
      const durationHours = (end.getTime() - start.getTime()) / 3_600_000;
      dailyTotal[dateKey] = (dailyTotal[dateKey] ?? 0) + durationHours;
      if (value === 4) dailyDeep[dateKey] = (dailyDeep[dateKey] ?? 0) + durationHours;
      if (value === 5) dailyRem[dateKey] = (dailyRem[dateKey] ?? 0) + durationHours;
    }
    const pushDaily = (map: Record<string, number>, metric: string) => {
      for (const [dateKey, hours] of Object.entries(map)) {
        readings.push({ metric, value: hours, ts: `${dateKey}T00:00:00.000Z`, sourceProvider: PROVIDER_ID });
      }
    };
    pushDaily(dailyTotal, CanonicalMetric.sleepDuration);
    pushDaily(dailyDeep, CanonicalMetric.sleepDeep);
    pushDaily(dailyRem, CanonicalMetric.sleepRem);
  } catch {
    // Sleep unavailable.
  }

  // --- Workouts: duration + average HR per session (feeds Banister TRIMP) ---
  try {
    const workouts = await queryWorkoutSamples({
      filter: { date: { startDate, endDate } },
      limit: -1,
    });
    for (const w of workouts) {
      const start = toDate(w.startDate);
      if (!start || typeof w.duration !== 'number') continue;
      const minutes = w.duration / 60;
      if (minutes < 1) continue; // ignore sub-minute noise
      readings.push({
        metric: CanonicalMetric.activityWorkoutMin,
        value: minutes,
        ts: start.toISOString(),
        sourceProvider: PROVIDER_ID,
      });
      // Average HR is a per-workout statistic — best-effort; skip if unavailable.
      try {
        const stat = await w.getStatistic('HKQuantityTypeIdentifierHeartRate' as never);
        const avgHr = stat?.averageQuantity?.quantity;
        if (typeof avgHr === 'number' && avgHr > 0) {
          readings.push({
            metric: CanonicalMetric.activityWorkoutHr,
            value: avgHr,
            ts: start.toISOString(),
            sourceProvider: PROVIDER_ID,
          });
        }
      } catch {
        // No HR for this workout — TRIMP falls back to an energy-based load proxy.
      }
    }
  } catch {
    // Workouts unavailable.
  }

  // --- Menstrual flow: one reading per logged flow day ---
  // HKCategoryValueVaginalBloodFlow: unspecified=1, light=2, medium=3, heavy=4,
  // none=5. `none` is a deliberate "no flow today" entry from Cycle Tracking and
  // must NOT be stored as a flow day, or every non-period day would open a new
  // period and collapse the derived cycle length.
  try {
    const flow = await queryCategorySamples('HKCategoryTypeIdentifierMenstrualFlow', {
      filter: { date: { startDate, endDate } },
      limit: -1,
    });
    // Bucket by local day: several samples can land on one day, and only the
    // fact that flow occurred that day matters to the derivation.
    const byDay: Record<string, number> = {};
    for (const s of flow) {
      const value = s.value as number;
      if (value === 5) continue; // explicit "none"
      const d = toDate(s.startDate);
      if (!d) continue;
      const dateKey = localDateKey(d);
      const level = value >= 2 && value <= 4 ? value - 1 : 0; // 1 light .. 3 heavy, 0 unspecified
      byDay[dateKey] = Math.max(byDay[dateKey] ?? 0, level);
    }
    for (const [dateKey, value] of Object.entries(byDay)) {
      readings.push({
        metric: CanonicalMetric.cycleFlow,
        value,
        ts: `${dateKey}T00:00:00.000Z`,
        sourceProvider: PROVIDER_ID,
      });
    }
  } catch {
    // Cycle tracking unavailable or not authorized.
  }

  return readings;
}

/**
 * Mirror Pepi's body metrics into HealthKit. Each sample becomes an instantaneous
 * quantity sample at its timestamp, tagged as user-entered + Pepi-sourced so it's
 * distinguishable from device-measured data (and skippable on future reads). A
 * per-sample try/catch keeps one unwritable type from sinking the batch.
 */
async function writeHealthKit(samples: HealthWriteSample[]): Promise<HealthWriteResult> {
  const mod = hk();
  if (typeof mod?.saveQuantitySample !== 'function') {
    return { ok: false, written: 0, error: 'HealthKit native module not linked in this build' };
  }
  let written = 0;
  let lastError: string | undefined;
  for (const s of samples) {
    const map = WRITE_MAP[s.metric];
    if (!map || !Number.isFinite(s.value)) continue;
    const d = toDate(s.ts);
    if (!d) continue;
    try {
      await mod.saveQuantitySample(map.id as never, map.unit as never, map.toNative(s.value), d, d, {
        HKWasUserEntered: true,
        PepiSource: 'checkin',
      } as never);
      written += 1;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  return { ok: written > 0 || samples.length === 0, written, error: lastError };
}

export const appleHealthProvider: IntegrationProvider = {
  id: PROVIDER_ID,
  nameKey: 'integrations.appleHealth',
  capabilities: [
    CanonicalMetric.bodyWeight,
    CanonicalMetric.bodyFatPct,
    CanonicalMetric.bodyLeanMass,
    CanonicalMetric.sleepDuration,
    CanonicalMetric.sleepDeep,
    CanonicalMetric.sleepRem,
    CanonicalMetric.activitySteps,
    CanonicalMetric.activityEnergy,
    CanonicalMetric.activityWorkoutMin,
    CanonicalMetric.activityWorkoutHr,
    CanonicalMetric.vitalsHrRest,
    CanonicalMetric.vitalsHrv,
    CanonicalMetric.vitalsRespRate,
    CanonicalMetric.vitalsSpo2,
    CanonicalMetric.vitalsBodyTemp,
    CanonicalMetric.nutritionEnergy,
    CanonicalMetric.nutritionProtein,
    CanonicalMetric.nutritionCarbs,
    CanonicalMetric.nutritionFat,
    CanonicalMetric.cycleFlow,
  ],
  isAvailable: () => Platform.OS === 'ios',
  nativeReady: true,
  authenticate: async () => {
    if (Platform.OS !== 'ios') return { ok: false };
    return authenticate();
  },
  pull: ({ since } = {}) => readHealthKit(since),
  diagnose: () => (Platform.OS === 'ios' ? diagnose() : Promise.resolve('Apple Health is iOS-only.')),
  push: (samples) =>
    Platform.OS === 'ios'
      ? writeHealthKit(samples)
      : Promise.resolve({ ok: false, written: 0, error: 'Apple Health is iOS-only.' }),
};
