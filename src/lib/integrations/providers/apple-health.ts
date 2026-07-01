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

// Writeable types we also request share access for. Read-only authorization is
// deliberately opaque on iOS (`authorizationStatusFor` returns "denied" even when
// a read is granted, and reads come back empty either way), so requesting *write*
// for weight gives us one type whose status we can actually read back in the
// diagnostic — and sets up writing the check-in weight back to Health later.
const SHARE_MAP = ['HKQuantityTypeIdentifierBodyMass'] as const;

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

  return lines.join('\n');
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
          const d = toDate(s.startDate);
          if (!d || typeof s.quantity !== 'number') continue;
          const dateKey = d.toISOString().slice(0, 10);
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
      const start = toDate(s.startDate);
      const end = toDate(s.endDate);
      if (!start || !end) continue;
      const dateKey = start.toISOString().slice(0, 10);
      const durationHours = (end.getTime() - start.getTime()) / 3_600_000;
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
    return authenticate();
  },
  pull: ({ since } = {}) => readHealthKit(since),
  diagnose: () => (Platform.OS === 'ios' ? diagnose() : Promise.resolve('Apple Health is iOS-only.')),
};
