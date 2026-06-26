import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { FunctionsFetchError, FunctionsRelayError } from '@supabase/supabase-js';

import { COMPOUND_CATALOG } from '@/data/compound-catalog';
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
    },
  });

  if (error) raiseAiError(error);
  if (!data) throw new Error('empty analysis');
  return data;
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
}): Promise<EncouragementResult> {
  if (!isSupabaseConfigured) throw new AiNotConfiguredError();

  const { data, error } = await supabase.functions.invoke<EncouragementResult>('ai-service', {
    body: { action: 'simple_analysis', ...opts },
  });

  if (error) raiseAiError(error);
  if (!data) throw new Error('empty analysis');
  return data;
}
