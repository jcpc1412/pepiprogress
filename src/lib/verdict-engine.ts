/**
 * The verdict engine (redesign §3) — the core new logic behind the verdict-first
 * Home. Pure, deterministic, offline, and unit-tested in isolation: given the
 * user's logged + derived data it answers the one question the app exists for,
 * "is my suffering producing measurable results?", as a single reading.
 *
 * Hard rules baked in here:
 *  - No RN / i18n / network imports. Emits i18n *keys* (Localizable), never prose,
 *    so it stays testable and locale-agnostic. The screen (Phase 3) formats.
 *  - Descriptive only (legal rung 1): reports measured status, never diagnoses,
 *    prescribes, or implies dosing. A verdict-engine.test asserts this.
 *  - "down" is not inherently good or bad — favourability is resolved against the
 *    user's goals + active-compound intent, never from the raw sign.
 *  - Conservative: a wrong-but-confident verdict is worse than none. Low
 *    confidence is capped at `watch`; too little data yields `building`.
 */

import { usesFemaleFormula } from '@/lib/body-composition';
import { buildMetricSeries, CHART_METRICS, type DatedPoint } from '@/lib/chart-series';
import type { Goal } from '@/lib/field-surfacing';
import { compoundBySlug } from '@/data/compound-catalog';
import type {
  CheckinEntry,
  LocalProfile,
  MetricReading,
  PhotoEntry,
  ProtocolItem,
} from '@/lib/store';

// ── Public shapes ───────────────────────────────────────────────────────────

export type VerdictState = 'building' | 'on_track' | 'watch' | 'off_track';
export type Confidence = 'low' | 'medium' | 'high';
/** Whether a movement is favourable for the user's goal (decided here, not by sign). */
export type Favour = 'good' | 'watch' | 'bad';
export type Trend = 'up' | 'down' | 'flat';
export type SignalRole = 'supports' | 'drags' | 'neutral';
/** Row tone from the contextual matrix (level band + movement + explained), not
 *  movement alone — so a high metric ticking down slightly no longer reads red. */
export type SignalTone = 'good' | 'watch' | 'bad' | 'neutral';
/** How favourable the current *level* of a metric is (not its movement). Only
 *  subjective 1–5 metrics have a meaningful band; weight/length/pct are 'none'. */
export type LevelBand = 'high' | 'mid' | 'low' | 'none';
/** Canonical unit token; the UI maps it to a localized, unit-system-aware string. */
export type HeroUnit = 'weight' | 'scale5' | 'pct' | 'length';

/** A translatable message: a key plus params, resolved by the presentation layer. */
export type Localizable = { key: string; params?: Record<string, string | number> };

export type SignalContribution = {
  metricId: string;
  labelKey: string;
  /** Latest value in the window. */
  value: number;
  /** Change of the latest value vs the window baseline (signed, raw units). */
  delta: number;
  trend: Trend;
  favour: Favour;
  /** 0–1 relevance-scaled contribution weight (drives hero pick + ordering). */
  weight: number;
  role: SignalRole;
  /** Contextual row tone (level band + movement + explained), for the signal row. */
  tone: SignalTone;
  /** Chronological points for a sparkline. */
  series: DatedPoint[];
  /** Set when a drag is explained away (training load, cycle, known compound effect). */
  explained?: Localizable;
};

export type VerdictHero =
  | {
      kind: 'metric';
      metricId: string;
      labelKey: string;
      value: number;
      /** Signed change over the trend window — the figure the Home hero shows. */
      delta: number;
      /** The trend window in days (for the "N-DAY TREND" subline). */
      windowDays: number;
      unit: HeroUnit;
      favour: Favour;
      trend: 'up' | 'down'; // hero movement is always resolved to a direction
    }
  | { kind: 'photo'; photoId: string }
  | null;

export type Verdict = {
  state: VerdictState;
  confidence: Confidence;
  hero: VerdictHero;
  /** The weighted signal stack for the decompose screen (most relevant first). */
  signals: SignalContribution[];
  reconciliation?: Localizable;
  /** Optional mild goal-timeline forecast. Unpopulated until a target is modeled. */
  forecast?: Localizable;
  /** One-sentence template summary; the AI prose layer may replace it (Phase 3). */
  explanation: Localizable;
  explanationKey: 'template' | 'ai';
};

export type VerdictInput = {
  entries: Record<string, CheckinEntry>;
  metricReadings: MetricReading[];
  protocolItems: ProtocolItem[];
  photos: PhotoEntry[];
  profile: Pick<
    LocalProfile,
    | 'goals'
    | 'sex'
    | 'dobISO'
    | 'units'
    | 'estimatedMetricsMode'
    | 'lastPeriodDate'
    | 'cycleLength'
    | 'targetWeight'
    | 'height'
  >;
  /** Reference "today" (YYYY-MM-DD) for a deterministic window. Defaults to now. */
  today?: string;
};

// ── Tuning constants ────────────────────────────────────────────────────────

const WINDOW_DAYS = 14;
const MIN_POINTS = 3; // a signal needs this many points in the window to count
const FLAT_EPS = 1e-6;
const BASE_RELEVANCE = 0.15; // any logged metric counts a little, even off-goal
const STATE_THRESHOLD = 0.34; // |score| beyond this leaves the neutral "watch" band
const DAY_MS = 24 * 60 * 60 * 1000;

// ── Metric semantics ────────────────────────────────────────────────────────

type Direction = 'up_good' | 'down_good' | 'context';

const METRIC_DIRECTION: Record<string, Direction> = {
  weight: 'context',
  body_fat_pct: 'context',
  waist: 'context',
  hips: 'context',
  energy: 'up_good',
  sleep_quality: 'up_good',
  soreness: 'down_good',
  sleep_deep_pct: 'up_good',
  sleep_rem_pct: 'up_good',
  protein_adequacy: 'up_good',
  caloric_balance: 'context',
  body_comp_velocity: 'up_good',
  cv_strain: 'down_good',
  inflammation: 'down_good',
};

const METRIC_UNIT: Record<string, HeroUnit> = {
  weight: 'weight',
  body_fat_pct: 'pct',
  waist: 'length',
  hips: 'length',
  sleep_deep_pct: 'pct',
  sleep_rem_pct: 'pct',
};

/** Body-composition metric ids (the sex-aware fat cascade), for plateau + hero swap. */
const BODY_COMP_METRICS = ['body_fat_pct', 'waist', 'hips'] as const;
const unitFor = (metricId: string): HeroUnit => METRIC_UNIT[metricId] ?? 'scale5';

/** Public: the display-unit token for a metric (used to format signal values). */
export const metricHeroUnit = unitFor;

/** How favourable the current *level* is (not its movement). Subjective 1–5
 *  metrics only; the good-direction inverts the scale for down-good metrics so a
 *  low soreness reads as a "high" (good) band. Weight/length/pct → 'none'. */
export function levelBand(
  metricId: string,
  value: number,
  goodDir: 'up_good' | 'down_good' | null,
): LevelBand {
  if (unitFor(metricId) !== 'scale5' || !goodDir) return 'none';
  const fav = goodDir === 'down_good' ? 6 - value : value; // higher = better place to be
  if (fav >= 3.8) return 'high';
  if (fav <= 2.4) return 'low';
  return 'mid';
}

/** Contextual row tone (redesign R2-C C2). Tone is a function of the level band,
 *  the movement's favourability + magnitude, and whether an adverse move is
 *  explained away — NOT movement alone. This is why a 4/5 metric ticking down a
 *  little reads green, not red. */
export function computeSignalTone(p: {
  band: LevelBand;
  favourSign: -1 | 0 | 1;
  trend: Trend;
  normDev: number;
  explained: boolean;
}): SignalTone {
  if (p.trend === 'flat' || p.favourSign === 0) return 'neutral';
  if (p.favourSign > 0) return 'good'; // favourable movement is always good
  const material = p.normDev >= 0.5; // adverse move big enough to matter
  switch (p.band) {
    case 'high':
      return material ? 'watch' : 'good'; // sitting high: a small dip is fine
    case 'mid':
      return !material ? 'watch' : p.explained ? 'watch' : 'bad';
    case 'low':
      return p.explained ? 'watch' : 'bad';
    default: // 'none' — weight/length/pct, movement-only
      return p.explained ? 'watch' : 'bad';
  }
}

/** Goal → per-metric base relevance. */
const GOAL_METRIC_WEIGHTS: Record<Goal, Record<string, number>> = {
  weight_loss: { weight: 1.0, body_fat_pct: 1.0, waist: 0.8, hips: 0.5, caloric_balance: 0.6, body_comp_velocity: 0.5, energy: 0.3 },
  body_comp: { body_comp_velocity: 1.0, body_fat_pct: 0.9, waist: 0.7, hips: 0.6, weight: 0.6, protein_adequacy: 0.6, caloric_balance: 0.4 },
  sleep: { sleep_quality: 1.0, sleep_deep_pct: 0.7, sleep_rem_pct: 0.6, energy: 0.4 },
  recovery: { soreness: 1.0, energy: 0.7, cv_strain: 0.5, sleep_quality: 0.4 },
  wellness: { energy: 0.8, sleep_quality: 0.6, inflammation: 0.4 },
  skin: {}, // photo-driven; no charted numeric signal
};

/** Compound effect/monitoring tag → per-metric relevance. */
const TAG_METRIC_WEIGHTS: Record<string, Record<string, number>> = {
  fat_loss: { weight: 0.9, body_fat_pct: 0.7, waist: 0.6, caloric_balance: 0.5, body_comp_velocity: 0.4 },
  muscle: { body_comp_velocity: 0.9, protein_adequacy: 0.6, weight: 0.4 },
  recovery: { soreness: 0.8, energy: 0.5 },
  healing: { soreness: 0.7, inflammation: 0.5 },
  sleep: { sleep_quality: 0.9, sleep_deep_pct: 0.5 },
  cognition: { energy: 0.6 },
  mood: { energy: 0.4 },
  gut: { inflammation: 0.4 },
  // monitoring tags that map to a daily-trend metric
  hematocrit: { cv_strain: 0.3 },
  lipids: { cv_strain: 0.3 },
};

// ── Small helpers ───────────────────────────────────────────────────────────

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function shiftDay(dateKey: string, delta: number): string {
  const t = new Date(`${dateKey}T00:00:00.000Z`).getTime() + delta * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** Protocol intent, read from goals + active-compound effect tags. Drives the
 *  favourable direction of "context" metrics (weight, caloric balance). */
function resolveIntent(goals: Goal[], protocolItems: ProtocolItem[]): { cutting: boolean; bulking: boolean } {
  const goalSet = new Set(goals);
  const tags = new Set<string>();
  for (const item of protocolItems) {
    const c = compoundBySlug(item.compoundSlug);
    if (c) for (const t of c.effectTags) tags.add(t);
  }
  const cutting = goalSet.has('weight_loss') || tags.has('fat_loss');
  const bulking = goalSet.has('body_comp') || tags.has('muscle');
  return { cutting, bulking };
}

/** Resolved goal-direction for a metric: is UP favourable, DOWN favourable, or is
 *  it neutral for this user? `neutral` covers context metrics with no decisive
 *  intent (recomp / wellness-only). */
export type MetricFavourDir = 'up_good' | 'down_good' | 'neutral';

/**
 * The single source of truth for "which way is good" per charted metric, given
 * the user's goals + active compounds. Every surface that frames a movement as
 * good/bad, INCLUDING AI prompts, must resolve direction through this so nothing
 * ever contradicts the verdict engine (e.g. calling a male cutter's rising hips a
 * good sign). Pure + deterministic.
 */
export function resolveMetricDirections(
  goals: Goal[],
  protocolItems: ProtocolItem[],
): Record<string, MetricFavourDir> {
  const intent = resolveIntent(goals, protocolItems);
  const out: Record<string, MetricFavourDir> = {};
  for (const metricId of Object.keys(METRIC_DIRECTION)) {
    const dir = METRIC_DIRECTION[metricId];
    const goodDir = dir === 'context' ? contextDirection(metricId, intent) : dir;
    out[metricId] = goodDir ?? 'neutral';
  }
  return out;
}

/** Resolve a "context" metric to a concrete good-direction, or null if neutral. */
function contextDirection(
  metricId: string,
  intent: { cutting: boolean; bulking: boolean },
): 'up_good' | 'down_good' | null {
  // Body-composition metrics: fat leaving the body is favourable whenever there is
  // ANY body intent (cut or recomp/mass), and up is never "good" for these. A pure
  // wellness/sleep user (no body intent) reads them as neutral.
  if ((BODY_COMP_METRICS as readonly string[]).includes(metricId)) {
    return intent.cutting || intent.bulking ? 'down_good' : null;
  }
  const decisive = intent.cutting !== intent.bulking; // exactly one → clear intent
  if (!decisive) return null; // recomp / no intent → weight & balance are neutral
  if (metricId === 'weight') return intent.cutting ? 'down_good' : 'up_good';
  if (metricId === 'caloric_balance') return intent.cutting ? 'down_good' : 'up_good';
  return null;
}

/** Fat-distribution pattern, following hormones (mtf → female, ftm → male). Null
 *  when sex is unknown → no sex weighting. */
function fatPatternSex(sex: VerdictInput['profile']['sex']): 'male' | 'female' | null {
  if (sex === 'female' || sex === 'mtf') return 'female';
  if (sex === 'male' || sex === 'ftm') return 'male';
  return null;
}

/** Sex multiplier on body-composition relevance (R2-B). Defaults to 1.0; only the
 *  dimorphic tape metrics diverge, so goal-driven metrics (sleep, energy, …) are
 *  never sex-weighted. body_fat_pct is sex-correct by construction (Navy), so 1.0. */
const SEX_METRIC_MULTIPLIER: Record<'male' | 'female', Record<string, number>> = {
  male: { waist: 1.0, hips: 0.25 },
  female: { waist: 0.8, hips: 1.0 },
};

/** Sum of goal + compound-tag relevance for a metric, plus a small base, then a
 *  sex multiplier on the body-composition metrics only. */
function relevanceFor(metricId: string, input: VerdictInput): number {
  let w = BASE_RELEVANCE;
  for (const goal of input.profile.goals) w += GOAL_METRIC_WEIGHTS[goal]?.[metricId] ?? 0;
  for (const item of input.protocolItems) {
    const c = compoundBySlug(item.compoundSlug);
    if (!c) continue;
    for (const tag of [...c.effectTags, ...c.monitoringTags]) {
      w += TAG_METRIC_WEIGHTS[tag]?.[metricId] ?? 0;
    }
  }
  const pattern = fatPatternSex(input.profile.sex);
  if (pattern) w *= SEX_METRIC_MULTIPLIER[pattern][metricId] ?? 1;
  return w;
}

/** Cycle day (0-based) for a female user, or null when not trackable. */
function cycleDay(input: VerdictInput, today: string): number | null {
  const { sex, lastPeriodDate, cycleLength } = input.profile;
  if (sex !== 'female' || !lastPeriodDate) return null;
  const len = cycleLength && cycleLength > 0 ? cycleLength : 28;
  const days = Math.floor(
    (new Date(`${today}T00:00:00.000Z`).getTime() -
      new Date(`${lastPeriodDate}T00:00:00.000Z`).getTime()) /
      DAY_MS,
  );
  if (days < 0) return null;
  return ((days % len) + len) % len;
}

// ── Engine ──────────────────────────────────────────────────────────────────

type Raw = {
  metricId: string;
  labelKey: string;
  series: DatedPoint[];
  latest: number;
  delta: number;
  trend: Trend;
  goodDir: 'up_good' | 'down_good' | null;
  favourSign: -1 | 0 | 1;
  relevance: number;
  normDev: number;
};

export function computeVerdict(input: VerdictInput): Verdict {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const windowStart = shiftDay(today, -(WINDOW_DAYS - 1));
  const intent = resolveIntent(input.profile.goals, input.protocolItems);

  const series = buildMetricSeries({
    selectedIds: CHART_METRICS.map((m) => m.id),
    entries: input.entries,
    metricReadings: input.metricReadings,
    profile: {
      dobISO: input.profile.dobISO,
      sex: input.profile.sex as 'male' | 'female' | 'ftm' | 'mtf' | undefined,
      estimatedMetricsMode: input.profile.estimatedMetricsMode ?? 'fill',
      units: input.profile.units,
      female: usesFemaleFormula(input.profile.sex),
      // profile.height is in the user's units; body_fat_pct needs cm.
      heightCm:
        typeof input.profile.height === 'number'
          ? input.profile.units === 'imperial'
            ? input.profile.height * 2.54
            : input.profile.height
          : undefined,
    },
    windowStart,
    windowEnd: today,
  });

  const raws: Raw[] = [];
  for (const s of series) {
    const points = s.primary.length ? s.primary : s.estimated;
    if (points.length < MIN_POINTS) continue;

    const vals = points.map((p) => p.value);
    const latest = vals[vals.length - 1];
    const prior = vals.slice(0, -1);
    const baseline = mean(prior);
    const delta = latest - baseline;
    const spread = std(vals);
    const trend: Trend =
      Math.abs(delta) <= Math.max(FLAT_EPS, spread * 0.15) ? 'flat' : delta > 0 ? 'up' : 'down';

    const dir = METRIC_DIRECTION[s.id];
    const goodDir = dir === 'context' ? contextDirection(s.id, intent) : dir;
    let favourSign: -1 | 0 | 1 = 0;
    if (trend !== 'flat' && goodDir) {
      const up = trend === 'up';
      favourSign = (goodDir === 'up_good') === up ? 1 : -1;
    }
    const normDev = spread > 0 ? Math.min(1, Math.abs(delta) / (2 * spread)) : 0;

    raws.push({
      metricId: s.id,
      labelKey: s.labelKey,
      series: points,
      latest,
      delta,
      trend,
      goodDir,
      favourSign,
      relevance: relevanceFor(s.id, input),
      normDev,
    });
  }

  // Cold-start: no usable signal → building, hero falls back to the latest photo.
  if (raws.length === 0) {
    return buildingVerdict(input);
  }

  // Verdict score: relevance-weighted mean of favour signs (neutral signals pull toward 0).
  const relSum = raws.reduce((a, r) => a + r.relevance, 0);
  const score = relSum > 0 ? raws.reduce((a, r) => a + r.relevance * r.favourSign, 0) / relSum : 0;

  // Signals that actually take a side (drive confidence).
  const decisive = raws.filter((r) => r.favourSign !== 0);
  const agreement = Math.abs(score);
  let confidence: Confidence = 'low';
  if (decisive.length >= 3 && agreement >= 0.5) confidence = 'high';
  else if (decisive.length >= 2 && agreement >= 0.3) confidence = 'medium';

  let state: VerdictState =
    score >= STATE_THRESHOLD ? 'on_track' : score <= -STATE_THRESHOLD ? 'off_track' : 'watch';
  // Conservative: never claim a firm verdict on thin evidence.
  if (confidence === 'low' && state !== 'watch') state = 'watch';

  // Plateau: weight has stalled over a meaningful span while logging continues and
  // there is a body intent. The scale reads flat but tape/fat may still be moving.
  const weightRaw = raws.find((r) => r.metricId === 'weight');
  const plateau = !!weightRaw && (intent.cutting || intent.bulking) && isPlateau(weightRaw);

  const heroScore = (r: Raw) => r.relevance * (0.4 + 0.6 * r.normDev);
  // Hero = the most decision-relevant signal today (relevance, boosted by anomaly).
  let heroRaw = [...raws].sort((a, b) => heroScore(b) - heroScore(a))[0];
  // On a plateau, hand the read to the strongest body-composition signal that
  // actually moved (body-fat % then waist, via the cascade) instead of flat weight.
  if (plateau) {
    const movedBodyComp = raws
      .filter((r) => (BODY_COMP_METRICS as readonly string[]).includes(r.metricId) && r.trend !== 'flat')
      .sort((a, b) => heroScore(b) - heroScore(a))[0];
    if (movedBodyComp) heroRaw = movedBodyComp;
  }

  const cday = cycleDay(input, today);
  const luteal = cday !== null && cday >= (input.profile.cycleLength ?? 28) / 2;
  const heavyTraining = recentHeavyTraining(input, today);

  // Build the signal stack + reconciliation.
  const signals: SignalContribution[] = raws
    .map((r) => {
      const scoreSign = score > 0 ? 1 : score < 0 ? -1 : 0;
      let role: SignalRole = 'neutral';
      if (r.favourSign !== 0 && scoreSign !== 0) {
        role = r.favourSign === scoreSign ? 'supports' : 'drags';
      }
      const explained =
        role === 'drags' ? explainDrag(r, { luteal, heavyTraining, input }) : undefined;
      const favour: Favour = r.favourSign > 0 ? 'good' : r.favourSign < 0 ? 'bad' : 'watch';
      const tone = computeSignalTone({
        band: levelBand(r.metricId, r.latest, r.goodDir),
        favourSign: r.favourSign,
        trend: r.trend,
        normDev: r.normDev,
        explained: !!explained,
      });
      return {
        metricId: r.metricId,
        labelKey: r.labelKey,
        value: r.latest,
        delta: r.delta,
        trend: r.trend,
        favour,
        weight: r.relevance * (0.4 + 0.6 * r.normDev),
        role,
        tone,
        series: r.series,
        explained,
      };
    })
    .sort((a, b) => b.weight - a.weight);

  const reconciliation = pickReconciliation(signals);

  // Mixed-verdict copy (H-2): when the read is "watch", name the signal(s) pulling
  // against the rest instead of a generic "signals are mixed" line. Falls back to
  // the generic template when nothing is clearly dragging.
  const drags = signals.filter((s) => s.role === 'drags').slice(0, 2);
  let explanation: Localizable;
  if (plateau) {
    explanation = { key: 'verdict.explanation.plateau', params: { metric: heroRaw.labelKey } };
  } else if (state === 'watch' && drags.length >= 1) {
    explanation =
      drags.length >= 2
        ? { key: 'verdict.explanation.watchMixed2', params: { drag: drags[0].labelKey, drag2: drags[1].labelKey } }
        : { key: 'verdict.explanation.watchMixed', params: { drag: drags[0].labelKey } };
  } else {
    explanation = { key: `verdict.explanation.${state}`, params: { metric: heroRaw.labelKey } };
  }

  // Dynamic hero (W3-11): a fresh, comparable, ANALYZED photo with a visible
  // change note outranks the numeric signals — a visible physique change is the
  // strongest evidence the app has. Otherwise the most decision-relevant metric
  // (relevance boosted by anomaly deviation, plateau swap above) leads as before.
  const heroPhoto = input.photos
    .filter(
      (p) =>
        p.comparable === true &&
        !!p.changeNote &&
        (new Date(`${today}T00:00:00.000Z`).getTime() -
          new Date(`${p.takenAt.slice(0, 10)}T00:00:00.000Z`).getTime()) /
          DAY_MS <=
          7,
    )
    .sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1))[0];

  const hero: VerdictHero = heroPhoto
    ? { kind: 'photo', photoId: heroPhoto.id }
    : {
        kind: 'metric',
        metricId: heroRaw.metricId,
        labelKey: heroRaw.labelKey,
        value: heroRaw.latest,
        delta: heroRaw.delta,
        windowDays: WINDOW_DAYS,
        unit: unitFor(heroRaw.metricId),
        favour: heroRaw.favourSign > 0 ? 'good' : heroRaw.favourSign < 0 ? 'bad' : 'watch',
        trend: heroRaw.trend === 'flat' ? (heroRaw.delta >= 0 ? 'up' : 'down') : heroRaw.trend,
      };

  return {
    state,
    confidence,
    hero,
    signals,
    reconciliation,
    forecast: weightForecast(heroRaw, input),
    explanation,
    explanationKey: 'template',
  };
}

/** Weight has stalled: ≥5 points spanning ≥10 days with a flat trend. The signal's
 *  own flat-band classification already accounts for its noise. */
function isPlateau(weightRaw: Raw): boolean {
  const pts = weightRaw.series;
  if (pts.length < 5 || weightRaw.trend !== 'flat') return false;
  const spanDays =
    (new Date(`${pts[pts.length - 1].dateKey}T00:00:00.000Z`).getTime() -
      new Date(`${pts[0].dateKey}T00:00:00.000Z`).getTime()) /
    DAY_MS;
  return spanDays >= 10;
}

/**
 * A hedged, descriptive days-to-target projection for the weight hero (redesign
 * §3.3 "mild goal-timeline"). Deliberately conservative and honest: only when
 * the hero is weight, a target is set, and current velocity is actually moving
 * toward it at a plausible rate. Reports an observed pace, never a promise or a
 * prescription — stays inside the legal rung-1 gate.
 */
function weightForecast(heroRaw: Raw, input: VerdictInput): Localizable | undefined {
  if (heroRaw.metricId !== 'weight') return undefined;
  const target = input.profile.targetWeight;
  if (typeof target !== 'number' || !Number.isFinite(target)) return undefined;

  const pts = heroRaw.series;
  if (pts.length < MIN_POINTS) return undefined;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const spanDays =
    (new Date(`${last.dateKey}T00:00:00.000Z`).getTime() -
      new Date(`${first.dateKey}T00:00:00.000Z`).getTime()) /
    DAY_MS;
  if (spanDays <= 0) return undefined;

  const perDay = (last.value - first.value) / spanDays; // signed velocity
  const remaining = target - last.value;
  if (Math.abs(remaining) < 0.1) return undefined; // effectively there already
  // Must be moving toward the target, not away from it.
  if (Math.sign(perDay) !== Math.sign(remaining) || perDay === 0) return undefined;

  const days = Math.round(Math.abs(remaining / perDay));
  // Only project across an honest horizon — too far out is noise, not a reading.
  if (days < 1 || days > 365) return undefined;
  return { key: 'verdict.forecast.daysToTarget', params: { n: days } };
}

function buildingVerdict(input: VerdictInput): Verdict {
  const latestPhoto = input.photos.length
    ? [...input.photos].sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1))[0]
    : null;
  return {
    state: 'building',
    confidence: 'low',
    hero: latestPhoto ? { kind: 'photo', photoId: latestPhoto.id } : null,
    signals: [],
    explanation: { key: 'verdict.explanation.building' },
    explanationKey: 'template',
  };
}

/** True if the last 3 days show a hard session (high effort or rising CV strain). */
function recentHeavyTraining(input: VerdictInput, today: string): boolean {
  for (let i = 0; i < 3; i++) {
    const e = input.entries[shiftDay(today, -i)];
    if (e && typeof e.workout_effort === 'number' && e.workout_effort >= 4) return true;
  }
  return false;
}

/** Annotate a dragging signal if a known driver explains it away (§3.3). */
function explainDrag(
  r: Raw,
  ctx: { luteal: boolean; heavyTraining: boolean; input: VerdictInput },
): Localizable | undefined {
  if (['soreness', 'energy', 'cv_strain'].includes(r.metricId) && ctx.heavyTraining) {
    return { key: 'verdict.reconcile.trainingLoad', params: { metric: r.labelKey } };
  }
  if (r.metricId === 'weight' && ctx.luteal) {
    return { key: 'verdict.reconcile.cycle', params: { metric: r.labelKey } };
  }
  if (['weight', 'caloric_balance'].includes(r.metricId)) {
    const hasFatLoss = ctx.input.protocolItems.some((it) =>
      compoundBySlug(it.compoundSlug)?.effectTags.includes('fat_loss'),
    );
    if (hasFatLoss) {
      return { key: 'verdict.reconcile.compound', params: { metric: r.labelKey } };
    }
  }
  return undefined;
}

/** The single most-weighted explained drag becomes the reconciliation line. */
function pickReconciliation(signals: SignalContribution[]): Localizable | undefined {
  const explained = signals.filter((s) => s.role === 'drags' && s.explained);
  return explained.length ? explained[0].explained : undefined;
}
