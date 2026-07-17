import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { FunctionsFetchError, FunctionsRelayError } from '@supabase/supabase-js';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { COMPOUND_CATALOG, compoundBySlug, marketCategoryOf, type MarketCategory } from '@/data/compound-catalog';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { PhotoSession } from '@/lib/store';

/** One parsed entity from a natural-language quick-log (spec 13). */
export type ParsedItem = {
  kind: 'weight' | 'checkin' | 'symptom' | 'dose' | 'unknown';
  confidence: number;
  weight?: number;
  field?: string;
  value?: number;
  symptomType?: string;
  onsetISO?: string;
  durationMinutes?: number;
  severity?: number;
  compoundSlug?: string;
  compoundName?: string;
  dose?: number;
  doseUnit?: string;
  note?: string;
};

export type ParseLogResult = {
  reply: string;
  items: ParsedItem[];
};

export type PhotoAnalysis = {
  driftScore: number;
  comparable: boolean;
  lighting: 'ok' | 'too_dark' | 'too_bright' | 'different';
  framing: 'ok' | 'closer' | 'farther' | 'off_angle';
  change?: string;
  retake: boolean;
  /** Clothing coverage of the NEW photo (PH-1 skin priority). Drives the
   *  quality-highscore reference promotion + the soft lock toward minimal cover. */
  coverage?: 'clothed' | 'partial' | 'minimal';
};

export type FitCheck = {
  fit: 'good' | 'acceptable' | 'poor';
  confidence: number;
  hint?: string;
};

export type EncouragementResult = {
  message: string;
};

export type LabValue = {
  marker: string;
  value: number;
  unit: string;
  referenceRange?: string;
  confidence: number;
};

export type ParseLabResult = {
  labDate?: string;
  values: LabValue[];
};

export type VialScanResult = {
  compoundName?: string;
  concentrationMgMl?: number;
  totalMg?: number;
  volumeMl?: number;
  confidence: number;
};

export type InsightMode = 'trend' | 'qa' | 'correlation';

/** Compact, on-device-assembled history sent to the insights action (spec 05/13). */
export type InsightHistory = {
  checkins: {
    date: string;
    weight?: number;
    wellness?: number;
    energy?: number;
    sleepQuality?: number;
    soreness?: number;
  }[];
  doses: { date: string; compound: string; dose?: number; unit?: string }[];
  symptoms: { date: string; type: string; severity?: number }[];
  metrics: { date: string; metric: string; value: number; unit?: string }[];
  protocolStarts: { compound: string; startedAt: string }[];
  /** Context-memory notes (W3-10): user explanations of off days. */
  context?: { date: string; note: string; metric?: string }[];
  /** Photo-track digest (P-3) so the AI can see progress-photo results: latest
   *  capture per track + comparability + the hedged change note. */
  photos?: {
    track: string;
    date: string;
    count: number;
    comparable?: boolean;
    note?: string;
  }[];
};

export type InsightResult = {
  answer: string;
  insufficientData: boolean;
};

export class AiNotConfiguredError extends Error {
  constructor() {
    super('Supabase is not configured — the AI service is unavailable.');
    this.name = 'AiNotConfiguredError';
  }
}

/** The request never reached the service (offline / relay failure). Retryable. */
export class AiNetworkError extends Error {
  constructor() {
    super('Could not reach the AI service.');
    this.name = 'AiNetworkError';
  }
}

/** The service was reached but returned an error (non-2xx / function threw). Retryable. */
export class AiServerError extends Error {
  constructor() {
    super('The AI service returned an error.');
    this.name = 'AiServerError';
  }
}

/** Classify a supabase.functions.invoke error into a typed, UI-mappable AI error. */
function raiseAiError(error: unknown): never {
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    throw new AiNetworkError();
  }
  throw new AiServerError();
}

/** Discriminator the UI uses to pick error copy. */
export type AiErrorKind = 'notConfigured' | 'network' | 'server';
export function aiErrorKind(err: unknown): AiErrorKind {
  if (err instanceof AiNotConfiguredError) return 'notConfigured';
  if (err instanceof AiNetworkError) return 'network';
  return 'server';
}

/** Send free text to the AI edge service and get structured log entities back (spec 05/13). */
export async function parseQuickLog(text: string, locale: string): Promise<ParseLogResult> {
  if (!isSupabaseConfigured) throw new AiNotConfiguredError();

  const { data, error } = await supabase.functions.invoke<ParseLogResult>('ai-service', {
    body: {
      action: 'parse_log',
      text,
      locale,
      nowISO: new Date().toISOString(),
      catalog: COMPOUND_CATALOG.map((c) => ({
        slug: c.slug,
        canonicalName: c.canonicalName,
        aliases: c.aliases,
        controlled: c.controlled,
      })),
    },
  });

  if (error) raiseAiError(error);
  if (!data) return { reply: '', items: [] };
  return data;
}

/** Downscale to 768px wide JPEG before sending to vision — reduces cost. */
async function toBase64(uri: string): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize({ width: 768 });
  const rendered = await ctx.renderAsync();
  const out = await rendered.saveAsync({ format: SaveFormat.JPEG, base64: true });
  return out.base64 ?? '';
}

/** On-demand photo analysis: drift score + comparability + hedged change note (spec 04/05). */
export async function analyzePhoto(opts: {
  uri: string;
  baselineUri?: string;
  session: PhotoSession;
  locale: string;
  measurementDelta?: { waist?: number; hips?: number; extra?: { key: string; delta: number } };
  cycleContext?: 'luteal';
  symptomContext?: string;
  bodyTypeCalibration?: string;
  /** Weeks since the user started their (earliest) compound — so the AI calibrates
   * to "week N of a cycle" rather than treating every first photo as day 1. */
  cycleWeek?: number;
  /** The user's chosen unit system, so measurements + any weight are reported in
   * their units instead of defaulting to imperial. */
  units?: 'metric' | 'imperial';
}): Promise<PhotoAnalysis> {
  if (!isSupabaseConfigured) throw new AiNotConfiguredError();

  const [newImage, baselineImage] = await Promise.all([
    toBase64(opts.uri),
    opts.baselineUri ? toBase64(opts.baselineUri) : Promise.resolve(undefined),
  ]);

  const { data, error } = await supabase.functions.invoke<PhotoAnalysis>('ai-service', {
    body: {
      action: 'analyze_photo',
      session: opts.session,
      locale: opts.locale,
      newImage,
      baselineImage,
      measurementDelta: opts.measurementDelta,
      cycleContext: opts.cycleContext,
      symptomContext: opts.symptomContext,
      bodyTypeCalibration: opts.bodyTypeCalibration,
      cycleWeek: opts.cycleWeek,
      units: opts.units,
    },
  });

  if (error) raiseAiError(error);
  if (!data) throw new Error('empty analysis');
  return data;
}

/**
 * Quick pre-capture fit check using Haiku vision (R3-H). Compares the new shot
 * to the baseline to catch angle/distance mismatches before the user saves.
 * Fails open (returns good fit) when AI is unconfigured or the call errors.
 */
export async function checkFit(newUri: string, baselineUri?: string): Promise<FitCheck> {
  if (!isSupabaseConfigured || !baselineUri) return { fit: 'good', confidence: 1 };
  try {
    const [newImage, baselineImage] = await Promise.all([toBase64(newUri), toBase64(baselineUri)]);
    const { data } = await supabase.functions.invoke<FitCheck>('ai-service', {
      body: { action: 'check_fit', newImage, baselineImage },
    });
    return data ?? { fit: 'good', confidence: 1 };
  } catch {
    return { fit: 'good', confidence: 1 };
  }
}

/**
 * Parse a photo of a lab report and extract marker values (spec 05/06).
 * Extracts values only — the image is NOT stored; only the numeric results land in the app.
 */
export async function parseLab(uri: string, locale: string): Promise<ParseLabResult> {
  if (!isSupabaseConfigured) throw new AiNotConfiguredError();
  const image = await toBase64(uri);
  const { data, error } = await supabase.functions.invoke<ParseLabResult>('ai-service', {
    body: { action: 'parse_lab', image, locale },
  });
  if (error) raiseAiError(error);
  if (!data) return { values: [] };
  return data;
}

/**
 * Parse an uploaded PDF lab report (Claude reads it as a document). Extracts
 * values only — the PDF is NOT stored; only the numeric results land in the app.
 */
export async function parseLabPdf(base64Pdf: string, locale: string): Promise<ParseLabResult> {
  if (!isSupabaseConfigured) throw new AiNotConfiguredError();
  const { data, error } = await supabase.functions.invoke<ParseLabResult>('ai-service', {
    body: { action: 'parse_lab', pdf: base64Pdf, locale },
  });
  if (error) raiseAiError(error);
  if (!data) return { values: [] };
  return data;
}

/**
 * Scan a vial label photo and extract compound name + concentration (spec 03/05).
 * Returns confidence < 0.5 when the label is unreadable.
 */
export async function scanVial(uri: string, locale: string): Promise<VialScanResult> {
  if (!isSupabaseConfigured) throw new AiNotConfiguredError();
  const image = await toBase64(uri);
  const { data, error } = await supabase.functions.invoke<VialScanResult>('ai-service', {
    body: { action: 'scan_vial', image, locale },
  });
  if (error) raiseAiError(error);
  if (!data) return { confidence: 0 };
  return data;
}

/**
 * Data-grounded insights over the user's own history (spec 05/13): trend analysis,
 * own-data Q&A, and "what changed when I added X" correlations. Capable model.
 */
export async function runInsights(opts: {
  mode: InsightMode;
  question?: string;
  history: InsightHistory;
  locale: string;
  /** 'quick' runs the cheap model (Pepi chat fallback); 'deep' / omitted = the
   *  capable model (Analysis trends/correlations). */
  tier?: 'quick' | 'deep';
  /** How much Pepi weighs in (W3-8): observe = no unsolicited suggestions,
   *  nudge = default, coach = proactive lifestyle suggestions when relevant. */
  coachingLevel?: 'observe' | 'nudge' | 'coach';
}): Promise<InsightResult> {
  if (!isSupabaseConfigured) throw new AiNotConfiguredError();
  const { data, error } = await supabase.functions.invoke<InsightResult>('ai-service', {
    body: { action: 'insights', ...opts },
  });
  if (error) raiseAiError(error);
  if (!data) return { answer: '', insufficientData: true };
  return data;
}

/** Haiku text-only encouragement check-in — no photo required (spec 04 milestone plan). */
export async function runEncouragementAnalysis(opts: {
  compoundGroup: string;
  lastScientificResult?: {
    driftScore?: number;
    comparable?: boolean;
    change?: string;
    takenAt?: string;
  };
  recentLogs: { date: string; weight?: number; wellness?: number; energy?: number }[];
  cycleContext?: 'luteal' | 'follicular';
  locale: string;
  units?: 'metric' | 'imperial';
}): Promise<EncouragementResult> {
  if (!isSupabaseConfigured) throw new AiNotConfiguredError();

  const { data, error } = await supabase.functions.invoke<EncouragementResult>('ai-service', {
    body: { action: 'simple_analysis', ...opts },
  });

  if (error) raiseAiError(error);
  if (!data) throw new Error('empty analysis');
  return data;
}

/** A compound-agnostic event handed to the ledger action for contextual copy. */
export type SignalLedgerInput = {
  id: string;
  kind: 'workout' | 'rest' | 'poor_sleep' | 'symptom' | 'dose';
  label: string;
  date: string;
  impact?: number;
};

export type SignalLedgerResult = {
  /** One hedged sentence over the window; empty when events are too sparse. */
  summary: string;
  /** Optional per-event context notes, keyed by event id. */
  notes: Record<string, string>;
};

/**
 * Contextual copy over the deterministic signal ledger (redesign R2-D). The
 * impacts stay client-side + deterministic; this only adds a hedged summary +
 * per-event notes. Best-effort: returns null on any miss (not configured,
 * offline, or server error) so the caller keeps the offline ledger unchanged.
 */
/** One commonly-reported fact on a compound card (spec 05, W4-13). */
export type CompoundFact = {
  kind: 'range' | 'timing' | 'side_effects' | 'mechanism' | 'other';
  text: string;
  /** Never 'high': general knowledge is the unverified sourcing-ladder stopgap. */
  confidence: 'low' | 'medium';
};

export type CompoundInfo = {
  category: MarketCategory;
  trackOnly: boolean;
  source: 'reported_unverified';
  answer: string;
  facts: CompoundFact[];
  consultPointer: boolean;
};

const COMPOUND_INFO_CACHE_PREFIX = 'pepi.compoundInfo.';
const COMPOUND_INFO_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** Static track-only card, built without a network call: the client-side half of
 *  the controlled gate (the edge fn enforces the same in code). */
function trackOnlyInfo(): CompoundInfo {
  return {
    category: 'controlled',
    trackOnly: true,
    source: 'reported_unverified',
    answer: '',
    facts: [],
    consultPointer: false,
  };
}

/**
 * Observational compound info through the posture gate (spec 05, W4-13).
 * Catalog-level content is identical for every user, so responses are cached
 * on-device per slug+locale for 14 days (spec 05 cost rule).
 */
export async function getCompoundInfo(slug: string, locale: string): Promise<CompoundInfo> {
  const compound = compoundBySlug(slug);
  const category = compound
    ? marketCategoryOf(compound)
    : // Custom/unknown compounds are 'grey' by rule, but with no catalog identity
      // there is nothing factual to summarize: treat as track-only.
      'controlled';
  if (!compound || category === 'controlled') return trackOnlyInfo();

  const cacheKey = `${COMPOUND_INFO_CACHE_PREFIX}${slug}.${locale}`;
  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (raw) {
      const cached = JSON.parse(raw) as { at: number; info: CompoundInfo };
      if (Date.now() - cached.at < COMPOUND_INFO_TTL_MS && cached.info?.answer) return cached.info;
    }
  } catch {
    // cache is best-effort
  }

  if (!isSupabaseConfigured) throw new AiNotConfiguredError();
  const { data, error } = await supabase.functions.invoke<CompoundInfo>('ai-service', {
    body: {
      action: 'compound_info',
      compound: {
        slug: compound.slug,
        canonicalName: compound.canonicalName,
        marketCategory: category,
        controlled: compound.controlled,
      },
      locale,
    },
  });
  if (error) raiseAiError(error);
  if (!data) throw new AiServerError();

  try {
    await AsyncStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), info: data }));
  } catch {
    // cache is best-effort
  }
  return data;
}

export async function getSignalLedger(opts: {
  metric: string;
  goal?: string;
  trend?: 'up' | 'down' | 'flat';
  windowDays?: number;
  events: SignalLedgerInput[];
  locale: string;
}): Promise<SignalLedgerResult | null> {
  if (!isSupabaseConfigured || opts.events.length === 0) return null;
  try {
    const { data, error } = await supabase.functions.invoke<{
      summary?: string;
      notes?: { id: string; note: string }[];
    }>('ai-service', { body: { action: 'signal_ledger', ...opts } });
    if (error || !data) return null;
    const notes: Record<string, string> = {};
    for (const n of data.notes ?? []) {
      if (n?.id && n?.note) notes[n.id] = n.note;
    }
    return { summary: data.summary ?? '', notes };
  } catch {
    return null;
  }
}
