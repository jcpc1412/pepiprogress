/**
 * Context fusion for the photo analysis (F5 piece C).
 *
 * The discoveries worth making are cross-signal: "waist looks tighter while
 * weight held" is only sayable if the model knows what the weight did. This
 * module assembles that numeric context from the store's entities, shaped small
 * and pre-digested — the model gets trends and deltas, not raw rows, so its
 * attention goes to the photos.
 *
 * Pure and unit-tested. The caller resolves compound slugs to display names so
 * this stays free of catalog imports.
 */

/** The subset of a check-in entry this module reads. */
export type ContextEntry = {
  date: string; // YYYY-MM-DD
  weight?: number;
  protein?: number;
  calories?: number;
  sleep_quality?: number;
};

export type AnalysisDataContext = {
  /** Days between baseline and the new photo (0 when there is no baseline). */
  windowDays: number;
  /** Weight at each end of the window, when both ends have a reading. */
  weight?: { start: number; end: number; delta: number };
  /** Averages over the 14 days before the photo. */
  nutrition?: { avgProtein?: number; avgCalories?: number; daysLogged: number };
  avgSleepQuality?: number;
  /** Doses taken shortly before the photo — timing shapes fullness/water. */
  recentDoses?: { label: string; hoursBefore: number }[];
};

/** How far back a weight reading may sit from a window end and still anchor it. */
const WEIGHT_LOOKBACK_DAYS = 10;
/** Averaging window for nutrition/sleep. */
const HABIT_WINDOW_DAYS = 14;
/** A dose only plausibly shows in a photo within this horizon. */
const DOSE_HORIZON_HOURS = 72;

const DAY_MS = 86400000;

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Latest entry with a weight, dated at or before `day`, within the lookback. */
function anchorWeight(entries: ContextEntry[], day: string): ContextEntry | undefined {
  const limit = new Date(`${day}T00:00:00Z`).getTime() - WEIGHT_LOOKBACK_DAYS * DAY_MS;
  return entries
    .filter((e) => e.weight !== undefined && e.date <= day && new Date(`${e.date}T00:00:00Z`).getTime() >= limit)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

export function buildAnalysisContext(opts: {
  entries: ContextEntry[];
  /** Pre-resolved dose events: display label + when taken (ISO). */
  doses: { label: string; takenAt: string }[];
  /** When the NEW photo was taken (ISO). */
  photoAt: string;
  /** When the baseline photo was taken (ISO); absent = no baseline. */
  baselineAt?: string;
}): AnalysisDataContext {
  const photoDay = dayOf(opts.photoAt);
  const baselineDay = opts.baselineAt ? dayOf(opts.baselineAt) : undefined;

  const windowDays = opts.baselineAt
    ? Math.max(0, Math.round((new Date(opts.photoAt).getTime() - new Date(opts.baselineAt).getTime()) / DAY_MS))
    : 0;

  const ctx: AnalysisDataContext = { windowDays };

  // Weight at each end of the window. Same-entry anchors mean the scale did not
  // actually get read twice, so no trend is claimable.
  if (baselineDay) {
    const start = anchorWeight(opts.entries, baselineDay);
    const end = anchorWeight(opts.entries, photoDay);
    if (start && end && start.date !== end.date) {
      ctx.weight = {
        start: start.weight as number,
        end: end.weight as number,
        delta: round1((end.weight as number) - (start.weight as number)),
      };
    }
  }

  // Habits over the recent window before the photo.
  const habitStart = new Date(new Date(`${photoDay}T00:00:00Z`).getTime() - (HABIT_WINDOW_DAYS - 1) * DAY_MS);
  const habitStartDay = habitStart.toISOString().slice(0, 10);
  const recent = opts.entries.filter((e) => e.date >= habitStartDay && e.date <= photoDay);

  const proteins = recent.map((e) => e.protein).filter((v): v is number => v !== undefined);
  const calories = recent.map((e) => e.calories).filter((v): v is number => v !== undefined);
  const nutritionDays = recent.filter((e) => e.protein !== undefined || e.calories !== undefined).length;
  if (nutritionDays > 0) {
    ctx.nutrition = {
      avgProtein: proteins.length ? round1(proteins.reduce((a, b) => a + b, 0) / proteins.length) : undefined,
      avgCalories: calories.length ? round1(calories.reduce((a, b) => a + b, 0) / calories.length) : undefined,
      daysLogged: nutritionDays,
    };
  }

  const sleeps = recent.map((e) => e.sleep_quality).filter((v): v is number => v !== undefined);
  if (sleeps.length > 0) {
    ctx.avgSleepQuality = round1(sleeps.reduce((a, b) => a + b, 0) / sleeps.length);
  }

  // Most recent dose per compound inside the horizon before the photo.
  const photoTime = new Date(opts.photoAt).getTime();
  const byLabel = new Map<string, number>();
  for (const d of opts.doses) {
    const t = new Date(d.takenAt).getTime();
    if (!Number.isFinite(t) || t > photoTime) continue;
    const hours = (photoTime - t) / 3600000;
    if (hours > DOSE_HORIZON_HOURS) continue;
    const prev = byLabel.get(d.label);
    if (prev === undefined || hours < prev) byLabel.set(d.label, hours);
  }
  if (byLabel.size > 0) {
    ctx.recentDoses = Array.from(byLabel.entries())
      .map(([label, hours]) => ({ label, hoursBefore: round1(hours) }))
      .sort((a, b) => a.hoursBefore - b.hoursBefore);
  }

  return ctx;
}
