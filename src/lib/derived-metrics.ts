import type { MetricReading } from '@/lib/store';

/**
 * Derived subjective metrics (energy / sleep quality / recovery) estimated from
 * objective wearable signals — the same recipe Whoop, Oura and Garmin/Firstbeat
 * use: compare each day's vitals to the user's own rolling baseline (a z-score),
 * weight HRV highest, then resting HR, then sleep and training load.
 *
 * Pure and deterministic (no AI, no network) so it runs offline and is testable.
 * It never overwrites what the user logged: the caller decides how to show these
 * estimates alongside the subjective entries. Observational only — no diagnosis,
 * no medical claim, no dosing implication (locked rule, spec 05/11).
 *
 * References: Whoop recovery (HRV≈70% / RHR≈20% / sleep≈10%), Oura sleep
 * contributors, Garmin Body Battery (HRV + sleep + load + stress), and the
 * Banister TRIMP training-load model with the acute:chronic workload ratio.
 */

/** The three subjective check-in fields we can estimate. Higher = better for all
 *  three (energy fills up; "soreness" is surfaced as "Recovery"). */
export type DerivedMetricKey = 'energy' | 'sleep_quality' | 'soreness';

export type DerivedProfile = { dobISO?: string; sex?: 'male' | 'female' | 'ftm' | 'mtf' };

/** One estimated point: a 1–5 value plus a 0–1 confidence (share of the signal
 *  weight that was actually available that day). */
export type DerivedPoint = { dateKey: string; value: number; confidence: number };

const BASELINE_WINDOW_DAYS = 14; // trailing window for the personal baseline
const BASELINE_MIN_SAMPLES = 7; // cold-start guard: below this we produce nothing
const Z_CLAMP = 2; // ±2 SD → maps cleanly onto the 1–5 scale via 3 + z

const DAY_MS = 24 * 60 * 60 * 1000;

function dateKeyOf(ts: string): string {
  return ts.slice(0, 10);
}

/** Group readings into metric → dateKey → list-of-values. */
function collect(readings: MetricReading[]): Map<string, Map<string, number[]>> {
  const out = new Map<string, Map<string, number[]>>();
  for (const r of readings) {
    if (typeof r.value !== 'number' || Number.isNaN(r.value)) continue;
    let byDate = out.get(r.metric);
    if (!byDate) { byDate = new Map(); out.set(r.metric, byDate); }
    const key = dateKeyOf(r.ts);
    const arr = byDate.get(key);
    if (arr) arr.push(r.value);
    else byDate.set(key, [r.value]);
  }
  return out;
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Per-day aggregate for a metric using the given reducer (mean by default). */
function dailySeries(
  grouped: Map<string, Map<string, number[]>>,
  metric: string,
  reduce: (xs: number[]) => number = mean,
): Map<string, number> {
  const byDate = grouped.get(metric);
  const out = new Map<string, number>();
  if (!byDate) return out;
  for (const [k, xs] of byDate) if (xs.length) out.set(k, reduce(xs));
  return out;
}

/**
 * z-score of `dateKey`'s value against the trailing baseline window (days strictly
 * before it). Returns null when the day has no value or the baseline is too thin
 * (cold-start) or flat (zero variance). Clamped to ±Z_CLAMP.
 */
function baselineZ(series: Map<string, number>, dateKey: string): number | null {
  const today = series.get(dateKey);
  if (today === undefined) return null;
  const end = new Date(`${dateKey}T00:00:00.000Z`).getTime();
  const start = end - BASELINE_WINDOW_DAYS * DAY_MS;
  const prior: number[] = [];
  for (const [k, v] of series) {
    const t = new Date(`${k}T00:00:00.000Z`).getTime();
    if (t < end && t >= start) prior.push(v);
  }
  if (prior.length < BASELINE_MIN_SAMPLES) return null;
  const mu = mean(prior);
  const variance = mean(prior.map((x) => (x - mu) ** 2));
  const sd = Math.sqrt(variance);
  if (sd < 1e-6) return 0;
  const z = (today - mu) / sd;
  return Math.max(-Z_CLAMP, Math.min(Z_CLAMP, z));
}

/** A weighted signal: its baseline z (already sign-oriented so + = better) and the
 *  weight it carries when present. Missing signals (null) are dropped and the rest
 *  renormalized, so a partial data day still yields a value. */
type Signal = { z: number | null; weight: number };

/** Combine signals into a 1–5 score + confidence, or null if nothing is present. */
function combine(signals: Signal[]): { value: number; confidence: number } | null {
  let wSum = 0;
  let acc = 0;
  let totalWeight = 0;
  for (const s of signals) {
    totalWeight += s.weight;
    if (s.z === null) continue;
    wSum += s.weight;
    acc += s.weight * s.z;
  }
  if (wSum === 0) return null;
  const composite = acc / wSum; // stays within ±Z_CLAMP
  const value = Math.max(1, Math.min(5, Math.round(3 + composite)));
  return { value, confidence: wSum / totalWeight };
}

function ageFrom(dobISO?: string): number | null {
  if (!dobISO) return null;
  const dob = new Date(dobISO).getTime();
  if (Number.isNaN(dob)) return null;
  const years = (Date.now() - dob) / (365.25 * DAY_MS);
  return years > 0 && years < 120 ? years : null;
}

/** Banister exponential weighting: b = 1.92 (male physiology) / 1.67 (female). */
function trimpB(sex?: DerivedProfile['sex']): number {
  return sex === 'male' || sex === 'mtf' ? 1.92 : 1.67;
}

/**
 * Per-day Banister TRIMP training load. Pairs workout duration + average HR by
 * timestamp; HRmax ≈ 220 − age, HRrest from the RHR baseline (fallback 60). When a
 * workout has no HR, a moderate-intensity assumption stands in. When there are no
 * workouts at all, active-energy (kcal) is a crude fallback load proxy.
 */
function dailyTrimp(
  grouped: Map<string, Map<string, number[]>>,
  profile: DerivedProfile,
): Map<string, number> {
  const out = new Map<string, number>();
  const age = ageFrom(profile.dobISO) ?? 35;
  const hrMax = 220 - age;
  const b = trimpB(profile.sex);
  const rhrByDate = dailySeries(grouped, 'vitals.hr_rest');
  const rhrValues = [...rhrByDate.values()];
  const hrRest = rhrValues.length ? mean(rhrValues) : 60;

  // Workout facts are stored as paired readings (workout_min + workout_hr) at the
  // same ts. Re-pair them from the raw readings via the per-metric daily buckets.
  const minsByDate = grouped.get('activity.workout_min');
  const hrByDate = grouped.get('activity.workout_hr');
  if (minsByDate) {
    for (const [dateKey, mins] of minsByDate) {
      const hrs = hrByDate?.get(dateKey) ?? [];
      let dayLoad = 0;
      mins.forEach((minutes, i) => {
        const avgHr = hrs[i];
        let hrRatio: number;
        if (typeof avgHr === 'number' && hrMax > hrRest) {
          hrRatio = (avgHr - hrRest) / (hrMax - hrRest);
        } else {
          hrRatio = 0.55; // moderate assumption when HR is missing
        }
        hrRatio = Math.max(0, Math.min(1, hrRatio));
        dayLoad += minutes * hrRatio * Math.exp(b * hrRatio);
      });
      out.set(dateKey, dayLoad);
    }
  }

  // Fallback: for days with active energy but no workout record, approximate load
  // from kcal so sedentary-but-active days still register (Garmin-style).
  const energyByDate = dailySeries(grouped, 'activity.energy');
  for (const [dateKey, kcal] of energyByDate) {
    if (!out.has(dateKey)) out.set(dateKey, kcal / 10); // ~coarse kcal→TRIMP scale
  }
  return out;
}

/** Mean of a day-keyed series over the trailing `days` ending at (and including)
 *  `dateKey`. Used for acute (7d) vs chronic (28d) training load. */
function trailingMean(series: Map<string, number>, dateKey: string, days: number): number | null {
  const end = new Date(`${dateKey}T00:00:00.000Z`).getTime();
  const start = end - (days - 1) * DAY_MS;
  const vals: number[] = [];
  for (const [k, v] of series) {
    const t = new Date(`${k}T00:00:00.000Z`).getTime();
    if (t <= end && t >= start) vals.push(v);
  }
  return vals.length ? mean(vals) : null;
}

/**
 * Estimate all three derived metrics across every date that has any objective
 * data. Returns a map: derived key → (dateKey → point). Days that can't clear the
 * cold-start / signal-availability bar are simply absent.
 */
export function deriveMetrics(
  readings: MetricReading[],
  profile: DerivedProfile,
): Record<DerivedMetricKey, Map<string, DerivedPoint>> {
  const grouped = collect(readings);

  const hrv = dailySeries(grouped, 'vitals.hrv');
  const rhr = dailySeries(grouped, 'vitals.hr_rest');
  const resp = dailySeries(grouped, 'vitals.resp_rate');
  const temp = dailySeries(grouped, 'vitals.body_temp');
  const sleepDur = dailySeries(grouped, 'sleep.duration');
  const calories = dailySeries(grouped, 'nutrition.energy');
  const trimp = dailyTrimp(grouped, profile);

  // Every date any signal touched.
  const dates = new Set<string>();
  for (const s of [hrv, rhr, resp, temp, sleepDur, calories, trimp]) for (const k of s.keys()) dates.add(k);

  const energy = new Map<string, DerivedPoint>();
  const sleep = new Map<string, DerivedPoint>();
  const recovery = new Map<string, DerivedPoint>();

  for (const dateKey of dates) {
    const zHrv = baselineZ(hrv, dateKey);
    const zRhr = baselineZ(rhr, dateKey);
    const zResp = baselineZ(resp, dateKey);
    const zTemp = baselineZ(temp, dateKey);
    const zSleepDur = baselineZ(sleepDur, dateKey);
    const zCal = baselineZ(calories, dateKey);
    const zTrimpAcute = baselineZ(trimp, dateKey);

    // --- Sleep quality: duration-led, then HRV up / RHR down; resp + temp
    //     penalize any deviation (instability signals worse sleep). ---
    const sleepRes = combine([
      { z: zSleepDur, weight: 0.45 },
      { z: zHrv, weight: 0.3 },
      { z: zRhr === null ? null : -zRhr, weight: 0.15 },
      { z: zResp === null ? null : -Math.abs(zResp), weight: 0.05 },
      { z: zTemp === null ? null : -Math.abs(zTemp), weight: 0.05 },
    ]);
    if (sleepRes) sleep.set(dateKey, { dateKey, ...sleepRes });

    // --- Energy (readiness/body-battery): recovery (HRV, RHR) + last night's
    //     sleep + fuel (calories) − recent training load. ---
    const sleepScore = sleep.get(dateKey)?.value;
    const zSleepScore = sleepScore === undefined ? null : sleepScore - 3; // 1..5 → −2..2
    const energyRes = combine([
      { z: zHrv, weight: 0.4 },
      { z: zRhr === null ? null : -zRhr, weight: 0.15 },
      { z: zSleepScore, weight: 0.2 },
      { z: zTrimpAcute === null ? null : -zTrimpAcute, weight: 0.15 },
      { z: zCal, weight: 0.1 },
    ]);
    if (energyRes) energy.set(dateKey, { dateKey, ...energyRes });

    // --- Recovery (the "soreness" field, surfaced as Recovery — higher = better):
    //     Whoop-style, HRV up / RHR down / recent load down, plus the acute:chronic
    //     workload ratio as a fatigue penalty. ---
    const acute = trailingMean(trimp, dateKey, 7);
    const chronic = trailingMean(trimp, dateKey, 28);
    let zAcwr: number | null = null;
    if (acute !== null && chronic !== null && chronic > 1e-6) {
      const acwr = acute / chronic;
      // ACWR ~1 is balanced; >1 accumulates fatigue. Center and scale into ±2.
      zAcwr = Math.max(-Z_CLAMP, Math.min(Z_CLAMP, (acwr - 1) / 0.3));
    }
    const recoveryRes = combine([
      { z: zHrv, weight: 0.4 },
      { z: zRhr === null ? null : -zRhr, weight: 0.3 },
      { z: zAcwr === null ? null : -zAcwr, weight: 0.2 },
      { z: zTrimpAcute === null ? null : -zTrimpAcute, weight: 0.1 },
    ]);
    if (recoveryRes) recovery.set(dateKey, { dateKey, ...recoveryRes });
  }

  return { energy, sleep_quality: sleep, soreness: recovery };
}
