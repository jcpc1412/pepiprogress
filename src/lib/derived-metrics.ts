import type { MetricReading } from '@/lib/store';

/**
 * Derived subjective metrics estimated from objective wearable signals — the same
 * recipe Whoop, Oura and Garmin/Firstbeat use: compare each day's vitals to the
 * user's own rolling baseline (a z-score), weight HRV highest, then resting HR,
 * then sleep and training load.
 *
 * Pure and deterministic (no AI, no network) so it runs offline and is testable.
 * Observational only — no diagnosis, no medical claim, no dosing implication
 * (locked rule, spec 05/11).
 *
 * References: Whoop recovery (HRV≈70%/RHR≈20%/sleep≈10%), Oura sleep contributors,
 * Garmin Body Battery (HRV+sleep+load+stress), Banister TRIMP, ACSM protein targets.
 */

export type DerivedMetricKey =
  | 'energy'
  | 'sleep_quality'
  | 'soreness'
  | 'sleep_deep_pct'
  | 'sleep_rem_pct'
  | 'protein_adequacy'
  | 'caloric_balance'
  | 'body_comp_velocity'
  | 'cv_strain'
  | 'inflammation';

export type DerivedProfile = { dobISO?: string; sex?: 'male' | 'female' | 'ftm' | 'mtf' };

/** One estimated point: a 1–5 value plus a 0–1 confidence (share of available signal weight). */
export type DerivedPoint = { dateKey: string; value: number; confidence: number };

const BASELINE_WINDOW_DAYS = 14;
const BASELINE_MIN_SAMPLES = 7;
const Z_CLAMP = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

function dateKeyOf(ts: string): string {
  return ts.slice(0, 10);
}

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

function baselineZ(series: Map<string, number>, dateKey: string, excluded?: Set<string>): number | null {
  const today = series.get(dateKey);
  if (today === undefined) return null;
  const end = new Date(`${dateKey}T00:00:00.000Z`).getTime();
  const start = end - BASELINE_WINDOW_DAYS * DAY_MS;
  const prior: number[] = [];
  for (const [k, v] of series) {
    // Explained-anomalous days (W3-10 context notes) are excluded so one weird
    // day never drags the rolling "normal".
    if (excluded?.has(k)) continue;
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

/** Most recent value at or before dateKey in a date-keyed series. */
function latestBefore(series: Map<string, number>, dateKey: string): number | undefined {
  let best: string | undefined;
  for (const k of series.keys()) {
    if (k <= dateKey && (best === undefined || k > best)) best = k;
  }
  return best !== undefined ? series.get(best) : undefined;
}

/** Linear regression slope (units per day) over trailing windowDays ending at dateKey.
 *  Returns null if fewer than minPoints are available. */
function linearSlope(
  series: Map<string, number>,
  dateKey: string,
  windowDays: number,
  minPoints = 3,
): number | null {
  const end = new Date(`${dateKey}T00:00:00.000Z`).getTime();
  const start = end - (windowDays - 1) * DAY_MS;
  const pts: [number, number][] = [];
  for (const [k, v] of series) {
    const t = new Date(`${k}T00:00:00.000Z`).getTime();
    if (t >= start && t <= end) pts.push([(t - start) / DAY_MS, v]);
  }
  if (pts.length < minPoints) return null;
  const n = pts.length;
  const sx = pts.reduce((s, [x]) => s + x, 0);
  const sy = pts.reduce((s, [, y]) => s + y, 0);
  const sxy = pts.reduce((s, [x, y]) => s + x * y, 0);
  const sxx = pts.reduce((s, [x]) => s + x * x, 0);
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-9) return null;
  return (n * sxy - sx * sy) / denom;
}

type Signal = { z: number | null; weight: number };

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
  const composite = acc / wSum;
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

function trimpB(sex?: DerivedProfile['sex']): number {
  return sex === 'male' || sex === 'mtf' ? 1.92 : 1.67;
}

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
          hrRatio = 0.55;
        }
        hrRatio = Math.max(0, Math.min(1, hrRatio));
        dayLoad += minutes * hrRatio * Math.exp(b * hrRatio);
      });
      out.set(dateKey, dayLoad);
    }
  }

  const energyByDate = dailySeries(grouped, 'activity.energy');
  for (const [dateKey, kcal] of energyByDate) {
    if (!out.has(dateKey)) out.set(dateKey, kcal / 10);
  }
  return out;
}

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

export function deriveMetrics(
  readings: MetricReading[],
  profile: DerivedProfile,
  /** Explained-anomalous day keys (W3-10): excluded from every rolling baseline. */
  excludeDates?: Set<string>,
): Record<DerivedMetricKey, Map<string, DerivedPoint>> {
  const grouped = collect(readings);

  // --- Core vitals (existing) ---
  const hrv = dailySeries(grouped, 'vitals.hrv');
  const rhr = dailySeries(grouped, 'vitals.hr_rest');
  const resp = dailySeries(grouped, 'vitals.resp_rate');
  const temp = dailySeries(grouped, 'vitals.body_temp');
  const sleepDur = dailySeries(grouped, 'sleep.duration');
  const calories = dailySeries(grouped, 'nutrition.energy');
  const trimp = dailyTrimp(grouped, profile);

  // --- Additional signals for new metrics ---
  const sleepDeepRaw = dailySeries(grouped, 'sleep.deep');
  const sleepRemRaw = dailySeries(grouped, 'sleep.rem');
  const proteinByDate = dailySeries(grouped, 'nutrition.protein');
  const activeEnergyByDate = dailySeries(grouped, 'activity.energy');
  const weightByDate = dailySeries(grouped, 'body.weight');
  const fatPctByDate = dailySeries(grouped, 'body.fat_pct');

  // Sleep stage % of total sleep (requires both stage and total)
  const sleepDeepPctSeries = new Map<string, number>();
  const sleepRemPctSeries = new Map<string, number>();
  for (const [d, dur] of sleepDur) {
    if (dur < 0.5) continue; // artifact
    const deep = sleepDeepRaw.get(d);
    const rem = sleepRemRaw.get(d);
    if (deep !== undefined) sleepDeepPctSeries.set(d, (deep / dur) * 100);
    if (rem !== undefined) sleepRemPctSeries.set(d, (rem / dur) * 100);
  }

  // Lean mass = weight × (1 − fat%) when body composition data is available
  const leanMass = new Map<string, number>();
  for (const [d, w] of weightByDate) {
    const fat = fatPctByDate.get(d);
    if (fat !== undefined) leanMass.set(d, w * (1 - fat / 100));
  }

  // All dates across every signal
  const dates = new Set<string>();
  for (const s of [
    hrv, rhr, resp, temp, sleepDur, calories, trimp,
    sleepDeepPctSeries, sleepRemPctSeries,
    proteinByDate, activeEnergyByDate, weightByDate,
  ]) {
    for (const k of s.keys()) dates.add(k);
  }

  const energy = new Map<string, DerivedPoint>();
  const sleep = new Map<string, DerivedPoint>();
  const recovery = new Map<string, DerivedPoint>();
  const sleepDeepPctOut = new Map<string, DerivedPoint>();
  const sleepRemPctOut = new Map<string, DerivedPoint>();
  const proteinAdequacy = new Map<string, DerivedPoint>();
  const caloricBalance = new Map<string, DerivedPoint>();
  const bodyCompVelocity = new Map<string, DerivedPoint>();
  const cvStrain = new Map<string, DerivedPoint>();
  const inflammation = new Map<string, DerivedPoint>();

  for (const dateKey of dates) {
    const zHrv = baselineZ(hrv, dateKey, excludeDates);
    const zRhr = baselineZ(rhr, dateKey, excludeDates);
    const zResp = baselineZ(resp, dateKey, excludeDates);
    const zTemp = baselineZ(temp, dateKey, excludeDates);
    const zSleepDur = baselineZ(sleepDur, dateKey, excludeDates);
    const zCal = baselineZ(calories, dateKey, excludeDates);
    const zTrimpAcute = baselineZ(trimp, dateKey, excludeDates);

    // ─── Existing three metrics ───────────────────────────────────────────────

    const sleepRes = combine([
      { z: zSleepDur, weight: 0.45 },
      { z: zHrv, weight: 0.3 },
      { z: zRhr === null ? null : -zRhr, weight: 0.15 },
      { z: zResp === null ? null : -Math.abs(zResp), weight: 0.05 },
      { z: zTemp === null ? null : -Math.abs(zTemp), weight: 0.05 },
    ]);
    if (sleepRes) sleep.set(dateKey, { dateKey, ...sleepRes });

    const sleepScore = sleep.get(dateKey)?.value;
    const zSleepScore = sleepScore === undefined ? null : sleepScore - 3;
    const energyRes = combine([
      { z: zHrv, weight: 0.4 },
      { z: zRhr === null ? null : -zRhr, weight: 0.15 },
      { z: zSleepScore, weight: 0.2 },
      { z: zTrimpAcute === null ? null : -zTrimpAcute, weight: 0.15 },
      { z: zCal, weight: 0.1 },
    ]);
    if (energyRes) energy.set(dateKey, { dateKey, ...energyRes });

    const acute = trailingMean(trimp, dateKey, 7);
    const chronic = trailingMean(trimp, dateKey, 28);
    let zAcwr: number | null = null;
    if (acute !== null && chronic !== null && chronic > 1e-6) {
      const acwr = acute / chronic;
      zAcwr = Math.max(-Z_CLAMP, Math.min(Z_CLAMP, (acwr - 1) / 0.3));
    }
    const recoveryRes = combine([
      { z: zHrv, weight: 0.4 },
      { z: zRhr === null ? null : -zRhr, weight: 0.3 },
      { z: zAcwr === null ? null : -zAcwr, weight: 0.2 },
      { z: zTrimpAcute === null ? null : -zTrimpAcute, weight: 0.1 },
    ]);
    if (recoveryRes) recovery.set(dateKey, { dateKey, ...recoveryRes });

    // ─── Sleep architecture ───────────────────────────────────────────────────

    // Output the REAL percentage (deep÷total, rem÷total), not a 1-5 z-score. These
    // are `pct`-unit metrics: the prior z-score→1-5 mapping was displayed with a
    // "%" suffix, so a z=0 day read as a nonsensical "3%" (Track A3). Coloring is
    // now a clinical norm band in the verdict engine, not a self-baseline z-score.
    const deepPct = sleepDeepPctSeries.get(dateKey);
    if (deepPct !== undefined) {
      sleepDeepPctOut.set(dateKey, { dateKey, value: Math.round(deepPct * 10) / 10, confidence: 1.0 });
    }

    const remPct = sleepRemPctSeries.get(dateKey);
    if (remPct !== undefined) {
      sleepRemPctOut.set(dateKey, { dateKey, value: Math.round(remPct * 10) / 10, confidence: 1.0 });
    }

    // ─── Protein adequacy ────────────────────────────────────────────────────
    // Absolute thresholds (g/kg body weight) per ACSM/ISSN guidelines.
    // <0.8=1 (deficient), 0.8-1.2=2 (minimal), 1.2-1.8=3 (adequate),
    // 1.8-2.2=4 (optimal for most goals), >2.2=5 (high/intentional surplus).
    const proteinG = proteinByDate.get(dateKey);
    const weightKg = latestBefore(weightByDate, dateKey);
    if (proteinG !== undefined && weightKg !== undefined && weightKg > 20) {
      const ratio = proteinG / weightKg;
      const value =
        ratio < 0.8 ? 1 :
        ratio < 1.2 ? 2 :
        ratio < 1.8 ? 3 :
        ratio < 2.2 ? 4 : 5;
      proteinAdequacy.set(dateKey, { dateKey, value, confidence: 1.0 });
    }

    // ─── Caloric balance ─────────────────────────────────────────────────────
    // Estimates deficit/surplus relative to total energy expenditure (dietary
    // intake minus estimated TDEE). BMR approximated from weight alone (crude
    // without height; weight × 22 ≈ Harris-Benedict at average height & age).
    // TDEE = BMR_approx + active_energy_from_watch.
    const dietaryKcal = calories.get(dateKey);
    if (dietaryKcal !== undefined) {
      const activeKcal = activeEnergyByDate.get(dateKey) ?? 0;
      const wKg = latestBefore(weightByDate, dateKey);
      const bmr = wKg ? wKg * 22 : 1700; // crude BMR fallback without height
      const tdee = bmr + activeKcal;
      const balance = dietaryKcal - tdee;
      // Centered at 3 (maintenance ±200 kcal); surplus = higher, deficit = lower.
      const value =
        balance <= -500 ? 1 :
        balance <= -200 ? 2 :
        balance <= 200  ? 3 :
        balance <= 500  ? 4 : 5;
      caloricBalance.set(dateKey, { dateKey, value, confidence: wKg ? 1.0 : 0.6 });
    }

    // ─── Body composition velocity ───────────────────────────────────────────
    // 14-day linear regression slope on lean mass (if body fat % available) or
    // weight. kg/week: >0.5=5 (gaining), 0.1-0.5=4, ±0.1=3, -0.1 to -0.5=2,
    // <-0.5=1 (losing lean mass / significant weight loss).
    const targetSeries = leanMass.size > 0 ? leanMass : weightByDate;
    if (targetSeries.size > 0) {
      const slope = linearSlope(targetSeries, dateKey, 14);
      if (slope !== null) {
        const weeklyChange = slope * 7;
        const value =
          weeklyChange < -0.5 ? 1 :
          weeklyChange < -0.1 ? 2 :
          weeklyChange <= 0.1 ? 3 :
          weeklyChange <= 0.5 ? 4 : 5;
        bodyCompVelocity.set(dateKey, {
          dateKey,
          value,
          confidence: leanMass.size > 0 ? 1.0 : 0.5,
        });
      }
    }

    // ─── CV Strain ───────────────────────────────────────────────────────────
    // Unexplained RHR elevation: elevated RHR with concurrent training load is
    // expected (EPOC); the same elevation without training signals cardiac stress.
    // Training mitigates the RHR penalty by up to 50% of the load z-score.
    // Score: 5=adaptation (RHR well below baseline), 3=normal, 1=flag.
    if (zRhr !== null) {
      const trimpMitigator = zTrimpAcute !== null ? Math.max(0, zTrimpAcute * 0.5) : 0;
      const netZ = zRhr - trimpMitigator; // negative = below baseline = positive adaptation
      cvStrain.set(dateKey, {
        dateKey,
        value: Math.max(1, Math.min(5, Math.round(3 - netZ))),
        confidence: 1.0,
      });
    }

    // ─── Inflammation proxy ──────────────────────────────────────────────────
    // Simultaneous deviation of vitals in the "stressed / unwell" direction:
    // RHR↑ + HRV↓ + wrist temp↑ + resp rate↑. Because all four being stressed at
    // once is the hallmark of an immune response (or injury), whereas a hard
    // training day typically depresses HRV and raises RHR but rarely raises temp.
    // combine() maps positive z → high score; pass each signal sign-corrected.
    const inflammRes = combine([
      { z: zRhr !== null ? -zRhr : null, weight: 0.35 },           // lower RHR = better
      { z: zHrv, weight: 0.35 },                                    // higher HRV = better
      { z: zTemp !== null ? -Math.max(0, zTemp) : null, weight: 0.20 }, // penalise elevated temp only
      { z: zResp !== null ? -Math.max(0, zResp) : null, weight: 0.10 }, // penalise elevated resp only
    ]);
    if (inflammRes) inflammation.set(dateKey, { dateKey, ...inflammRes });
  }

  return {
    energy,
    sleep_quality: sleep,
    soreness: recovery,
    sleep_deep_pct: sleepDeepPctOut,
    sleep_rem_pct: sleepRemPctOut,
    protein_adequacy: proteinAdequacy,
    caloric_balance: caloricBalance,
    body_comp_velocity: bodyCompVelocity,
    cv_strain: cvStrain,
    inflammation,
  };
}
