// PepiProgress - reusable AI edge service (spec 05/10). Claude, server-side; the
// API key never touches the client.
//
// Actions:
//   parse_log       - Haiku; parses NL quick-log text into structured entities.
//   analyze_photo   - Sonnet vision; comparability + region observations, cross-signal
//                     hypothesis and watch-next over the observation ledger (F5).
//   check_fit       - Haiku vision; pre-capture fit check (position / angle / distance).
//   classify_pose   - Haiku vision; sorts a reel photo into the canonical pose set (framing only).
//   simple_analysis - Haiku text-only; encouraging weekly check-in message.
//   parse_lab       - Sonnet vision; extracts lab marker values from a photo.
//   scan_vial       - Sonnet vision; extracts compound name + concentration from a vial label.
//   insights        - Sonnet text; data-grounded trend / Q&A / correlation analysis (spec 05/13).
//   compound_info   - Sonnet text; observational compound education behind the
//                     market_category posture gate (spec 05, W4-12). Controlled
//                     compounds never reach the model (code-enforced track-only).
//   terra           - Terra aggregator proxy (widget session + data pull); keeps Terra
//                     credentials server-side, like the Anthropic key (spec 06/10).
//
// Hard rules baked in (spec 04/05/11):
//  - Parse path PARSES what the user said. Never suggests doses, schedules, or synergies.
//  - Vision path is OBSERVATIONAL only. Never diagnoses or identifies the person.
//  - Encouragement path is SUPPORTIVE only. Never gives medical or dosing advice.
//  - Lab parse path extracts VALUES only - the document is never stored (spec 05).
//  - Insights path is ANALYTICAL only - grounded in the user's own data, hedged, no advice.

import Anthropic from 'npm:@anthropic-ai/sdk';
import {
  compoundInfoPromptLines,
  isTrackOnly,
  resolveMarketCategory,
} from '../_shared/posture.ts';
import { transitionPromptLines } from '../_shared/transition-context.ts';
import { localeLine } from '../_shared/prompt-lines.ts';

const PARSE_MODEL = Deno.env.get('AI_PARSE_MODEL') ?? 'claude-haiku-4-5';
const VISION_MODEL = Deno.env.get('AI_VISION_MODEL') ?? 'claude-sonnet-4-6';
const ENCOURAGE_MODEL = Deno.env.get('AI_ENCOURAGE_MODEL') ?? 'claude-haiku-4-5';
const INSIGHTS_MODEL = Deno.env.get('AI_INSIGHTS_MODEL') ?? 'claude-sonnet-4-6';
const COMPOUND_MODEL = Deno.env.get('AI_COMPOUND_MODEL') ?? 'claude-sonnet-4-6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// --- Request types ------------------------------------------------------------

type CatalogEntry = {
  slug: string;
  canonicalName: string;
  aliases?: string[];
  controlled?: boolean;
};

type ParseLogRequest = {
  action: 'parse_log';
  text: string;
  locale?: string;
  nowISO?: string;
  catalog?: CatalogEntry[];
};

/** One prior analysis of the same track (F5 observation ledger). */
type PriorAnalysis = {
  at: string;
  observations: { region: string; direction: string; note: string }[];
  hypothesis?: string;
  watchNext?: string;
};

/** Pre-digested numeric context from the user's logs (F5 context fusion). */
type AnalysisDataContext = {
  windowDays: number;
  weight?: { start: number; end: number; delta: number };
  nutrition?: { avgProtein?: number; avgCalories?: number; daysLogged: number };
  avgSleepQuality?: number;
  recentDoses?: { label: string; hoursBefore: number }[];
};

type AnalyzePhotoRequest = {
  action: 'analyze_photo';
  session: 'face' | 'body';
  newImage: string; // base64 JPEG
  baselineImage?: string; // base64 JPEG
  locale?: string;
  measurementDelta?: { waist?: number; hips?: number; extra?: { key: string; delta: number } };
  cycleContext?: 'luteal';
  symptomContext?: string;
  bodyTypeCalibration?: string;
  cycleWeek?: number;
  units?: 'metric' | 'imperial';
  /** Direction-aware transition-tracking framing (beta-notes §1.9). Only sent
   *  when the user selected the gender_transition goal AND their sex is mtf/ftm
   *  — the goal is the intent signal, sex alone never implies it. */
  transitionContext?: 'mtf' | 'ftm';
  /** Recent prior findings for this track, newest first (F5). */
  priorAnalyses?: PriorAnalysis[];
  /** Numeric log context over the photo window (F5). */
  dataContext?: AnalysisDataContext;
  /** Display label of the track (custom part name or the session), for framing. */
  poseLabel?: string;
};

type ParseLabRequest = {
  action: 'parse_lab';
  /** base64 JPEG of a photographed report. One of image | pdf is required. */
  image?: string;
  /** base64 of an uploaded PDF report (Claude reads it as a document). */
  pdf?: string;
  locale?: string;
};

type ScanVialRequest = {
  action: 'scan_vial';
  image: string; // base64 JPEG
  locale?: string;
};

type SimpleAnalysisRequest = {
  action: 'simple_analysis';
  compoundGroup: string;
  lastScientificResult?: {
    driftScore?: number;
    comparable?: boolean;
    change?: string;
    takenAt?: string;
  };
  recentLogs: { date: string; weight?: number; wellness?: number; energy?: number }[];
  cycleContext?: 'luteal' | 'follicular';
  locale?: string;
  units?: 'metric' | 'imperial';
  /** Findings from recent scientific analyses (F5) so the note can reference a
   *  real discovery instead of generic warmth. */
  recentDiscoveries?: string[];
};

type InsightHistory = {
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
  /** Context-memory notes (W3-10): the user's own explanations of off days. */
  context?: { date: string; note: string; metric?: string }[];
  photos?: { track: string; date: string; count: number; comparable?: boolean; note?: string }[];
};

type InsightsRequest = {
  action: 'insights';
  mode: 'trend' | 'qa' | 'correlation';
  question?: string;
  locale?: string;
  history: InsightHistory;
  /** 'quick' runs the cheap parse model (Pepi chat Q&A fallback, spec P-1); 'deep'
   *  or omitted uses the capable insights model (Analysis trends/correlations). */
  tier?: 'quick' | 'deep';
  /** How much Pepi weighs in (W3-8): shapes suggestion behavior, never the
   *  safety gates (dosing rules are level-independent). */
  coachingLevel?: 'observe' | 'nudge' | 'coach';
};

type CompoundInfoRequest = {
  action: 'compound_info';
  compound: {
    slug: string;
    canonicalName: string;
    /** From catalog data (bundled mirror or DB). NEVER model-inferred. */
    marketCategory?: string;
    /** Legacy hard gate; equivalent to marketCategory = 'controlled'. */
    controlled?: boolean;
  };
  /** Optional user question; without it, a general observational card. */
  question?: string;
  locale?: string;
};

type CheckFitRequest = {
  action: 'check_fit';
  newImage: string; // base64 JPEG
  baselineImage?: string; // base64 JPEG - if absent, returns good fit
};

type ClassifyPoseRequest = {
  action: 'classify_pose';
  image: string; // base64 JPEG, downscaled aggressively (classification needs little res)
};

type TerraRequest = {
  action: 'terra';
  sub: 'widget_session' | 'pull';
  userId?: string; // for pull
  since?: string; // ISO, for pull
  redirectUrl?: string; // for widget_session
};

type SignalLedgerEvent = {
  id: string;
  kind: 'workout' | 'rest' | 'poor_sleep' | 'symptom' | 'dose' | 'cardio' | 'steps';
  label: string; // already-localized row label
  date: string; // YYYY-MM-DD
  impact?: number; // deterministic heuristic impact, if any (never for doses)
};

type SignalLedgerRequest = {
  action: 'signal_ledger';
  metric: string; // localized metric name
  goal?: string; // user's headline goal, for context
  trend?: 'up' | 'down' | 'flat';
  windowDays?: number;
  events: SignalLedgerEvent[];
  locale?: string;
};

// --- JSON schemas -------------------------------------------------------------

const LAB_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    labDate: {
      type: 'string',
      description: 'Date of the lab test in ISO format YYYY-MM-DD, if readable from the image.',
    },
    values: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          marker: {
            type: 'string',
            description:
              'Canonical marker slug, e.g. testosterone_total, estradiol, hematocrit, glucose, lipids.',
          },
          value: { type: 'number', description: 'Numeric result value.' },
          unit: { type: 'string', description: 'Unit as printed, e.g. ng/dL, %, mmol/L.' },
          referenceRange: {
            type: 'string',
            description: 'Reference range as printed, e.g. "264-916 ng/dL".',
          },
          confidence: { type: 'number', description: '0..1 confidence this marker was read correctly.' },
        },
        required: ['marker', 'value', 'unit', 'confidence'],
      },
    },
  },
  required: ['values'],
};

const VIAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    compoundName: {
      type: 'string',
      description: 'Compound name as printed on the vial label.',
    },
    concentrationMgMl: {
      type: 'number',
      description: 'Concentration in mg/mL as printed or calculable from the label.',
    },
    totalMg: { type: 'number', description: 'Total mg in the vial if printed.' },
    volumeMl: { type: 'number', description: 'Volume of solvent/solution in mL if printed.' },
    confidence: { type: 'number', description: '0..1 overall confidence.' },
  },
  required: ['confidence'],
};

const PARSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: {
      type: 'string',
      description:
        "One short line in the user's language, in a precise instrument voice: reflect the logged readings back plainly, e.g. 'Logged: sleep 7h, energy 4/5, weight 83.2 kg.' No exclamation marks, no emoji, no encouragement, no advice.",
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', enum: ['weight', 'checkin', 'symptom', 'dose', 'unknown'] },
          confidence: { type: 'number', description: '0..1 confidence in this parse' },
          weight: { type: 'number', description: 'kg or lb as the user stated; for kind=weight' },
          field: {
            type: 'string',
            enum: ['sleep_quality', 'wellness', 'appetite', 'energy', 'soreness', 'workout_effort', 'libido'],
            description: 'for kind=checkin: which 1-5 scale field',
          },
          value: { type: 'number', description: 'for kind=checkin: 1-5 value' },
          symptomType: { type: 'string', description: 'for kind=symptom: e.g. nausea, headache' },
          onsetISO: { type: 'string', description: 'for kind=symptom/dose: resolved ISO timestamp' },
          durationMinutes: { type: 'number' },
          severity: { type: 'number', description: '1-5' },
          compoundSlug: { type: 'string', description: 'for kind=dose: resolved catalog slug, or empty if unknown' },
          compoundName: { type: 'string', description: 'compound as the user named it' },
          dose: { type: 'number' },
          doseUnit: { type: 'string', enum: ['mg', 'mcg', 'iu'] },
          note: { type: 'string' },
        },
        required: ['kind', 'confidence'],
      },
    },
  },
  required: ['reply', 'items'],
};

const ANALYZE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    driftScore: {
      type: 'number',
      description: '0..1. 0 = same framing, lighting and angle as baseline; 1 = very different.',
    },
    comparable: {
      type: 'boolean',
      description: 'true if the two photos are similar enough for an honest before/after.',
    },
    lighting: { type: 'string', enum: ['ok', 'too_dark', 'too_bright', 'different'] },
    framing: { type: 'string', enum: ['ok', 'closer', 'farther', 'off_angle'] },
    change: {
      type: 'string',
      description:
        'ONE short, hedged sentence capturing the single most interesting finding — the headline. Empty string when there is no baseline. Never a medical claim or diagnosis.',
    },
    // F5: region-level findings — the discovery layer.
    observations: {
      type: 'array',
      maxItems: 5,
      description:
        'Region-level findings comparing baseline to new (empty array when there is no baseline or nothing is honestly visible). Only regions where something is actually worth saying.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          region: {
            type: 'string',
            description: "Short region label in the user's locale (e.g. waist, jawline, shoulders).",
          },
          note: {
            type: 'string',
            description: 'One hedged, observational sentence about this region.',
          },
          direction: {
            type: 'string',
            enum: ['gain', 'loss', 'stable', 'unclear'],
            description: 'Apparent direction of change in this region (size/fullness up = gain).',
          },
          confidence: {
            type: 'number',
            description:
              '0..1 confidence from the photo evidence alone. Lighting/angle differences cap this at 0.5.',
          },
        },
        required: ['region', 'note', 'direction', 'confidence'],
      },
    },
    hypothesis: {
      type: 'string',
      description:
        'ONE cross-signal hypothesis connecting the visual observations to the data context, phrased as a hypothesis ("consistent with", "may reflect"), never a conclusion. Empty string when visuals and data do not honestly connect.',
    },
    watchNext: {
      type: 'string',
      description:
        'ONE concrete, specific thing to look for in the next photo of this track. Empty string when nothing specific suggests itself.',
    },
    retake: { type: 'boolean', description: 'true if drift is high enough to recommend a retake.' },
    coverage: {
      type: 'string',
      enum: ['clothed', 'partial', 'minimal'],
      description:
        'Clothing coverage of the NEW photo. "minimal" = skin-exposed for maximum comparability (e.g. shirtless / underwear / swimwear); "partial" = fitted or partial clothing; "clothed" = loose or full clothing that obscures the body. Judge coverage only, never identity.',
    },
    // W6-28: display-only framing box, same call, no extra cost.
    cropBox: {
      type: 'object',
      additionalProperties: false,
      description:
        'Normalized bounding box (0..1, origin top-left) of the subject region worth showing in the NEW photo: torso for body shots, head for face shots. Used only to crop the DISPLAY thumbnail; the original is never modified. Set confidence low when unsure and the app will show the full frame.',
      properties: {
        x: { type: 'number', description: 'Left edge, 0..1.' },
        y: { type: 'number', description: 'Top edge, 0..1.' },
        w: { type: 'number', description: 'Width, 0..1.' },
        h: { type: 'number', description: 'Height, 0..1.' },
        confidence: { type: 'number', description: '0..1 confidence in this box.' },
      },
      required: ['x', 'y', 'w', 'h', 'confidence'],
    },
  },
  required: [
    'driftScore',
    'comparable',
    'lighting',
    'framing',
    'change',
    'observations',
    'hypothesis',
    'watchNext',
    'retake',
    'coverage',
    'cropBox',
  ],
};

const SIMPLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    message: {
      type: 'string',
      description: 'One warm, encouraging paragraph. No dosing or medical advice.',
    },
  },
  required: ['message'],
};

const INSIGHTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    answer: {
      type: 'string',
      description:
        "A grounded, hedged analysis of the user's own data (2-4 short paragraphs max). Cite specific dates/values. No dosing or medical advice.",
    },
    insufficientData: {
      type: 'boolean',
      description: 'true when there is not enough logged data to answer meaningfully.',
    },
  },
  required: ['answer', 'insufficientData'],
};

const COMPOUND_INFO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    answer: {
      type: 'string',
      description:
        'Two to four short sentences answering the question (or summarizing the compound) inside the stated posture. Hedged, observational, never individualized.',
    },
    facts: {
      type: 'array',
      description: 'Individual commonly-reported facts backing the answer.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: {
            type: 'string',
            enum: ['range', 'timing', 'side_effects', 'mechanism', 'other'],
          },
          text: {
            type: 'string',
            description:
              'One hedged, observational sentence. For grey compounds: never imperative, never second-person dosing.',
          },
          confidence: {
            type: 'string',
            enum: ['low', 'medium'],
            description: 'Never high: general knowledge is the unverified stopgap.',
          },
        },
        required: ['kind', 'text', 'confidence'],
      },
    },
    consultPointer: {
      type: 'boolean',
      description:
        'true when the answer includes the check-with-your-doctor-or-pharmacist pointer. MUST be true for otc compounds.',
    },
  },
  required: ['answer', 'facts', 'consultPointer'],
};

const LEDGER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: {
      type: 'string',
      description:
        'ONE short, hedged sentence naming which of the given events most plausibly moved this metric over the window. Grounded ONLY in the listed events. Empty string when the events are too sparse to say anything honest.',
    },
    notes: {
      type: 'array',
      description: 'Optional short context notes for a subset of events. Copy only - never a new impact number.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', description: 'The id of the event this note annotates.' },
          note: {
            type: 'string',
            description:
              'Under 12 words, hedged, observational. For dose events: context only, never an efficacy or dosing claim.',
          },
        },
        required: ['id', 'note'],
      },
    },
  },
  required: ['summary', 'notes'],
};

// --- System prompts -----------------------------------------------------------

function parseSystemPrompt(catalog: CatalogEntry[], nowISO: string, locale: string): string {
  const catalogLines = catalog
    .map(
      (c) =>
        `- ${c.slug}: ${c.canonicalName}${c.aliases?.length ? ` (aka ${c.aliases.join(', ')})` : ''}${c.controlled ? ' [controlled]' : ''}`,
    )
    .join('\n');
  return [
    "You parse a peptide/health tracker user's natural-language message into structured log entities.",
    'Output ONLY via the record tool. Each message may contain zero, one, or several items.',
    '',
    'Mapping:',
    '- A reported body weight => kind="weight" (keep the number as stated; do not convert units).',
    '- A 1-5 rating of sleep/mood/appetite/energy/soreness/workout effort/libido => kind="checkin" with field+value.',
    '- A side effect / symptom (with optional onset, duration, severity) => kind="symptom".',
    '- A dose the user reports taking => kind="dose"; resolve the compound to a catalog slug below.',
    '- Anything you cannot confidently map => kind="unknown" with low confidence.',
    '',
    'Compound catalog (resolve names/aliases to slug; leave compoundSlug empty if not found):',
    catalogLines || '(none provided)',
    '',
    `Resolve relative times ("this morning", "an hour ago", "yesterday") against now = ${nowISO}.`,
    `Write the "reply" in this locale: ${locale}. Voice = a precise lab instrument reflecting the`,
    'readings back: one short line, no exclamation marks, no emoji, no encouragement, no advice.',
    'Example: "Logged: sleep 7h, energy 4/5, weight 83.2 kg."',
    '',
    'CRITICAL - never give medical or dosing advice. Do not suggest doses, lengths, schedules, or',
    'synergies for ANY compound (controlled or not). You only record what the user already said.',
    'Set confidence below 0.6 when the compound is unknown, the dose is ambiguous, or the time is unclear.',
  ].join('\n');
}

type VisionCtx = {
  measurementDelta?: { waist?: number; hips?: number; extra?: { key: string; delta: number } };
  cycleContext?: 'luteal';
  symptomContext?: string;
  bodyTypeCalibration?: string;
  cycleWeek?: number;
  units?: 'metric' | 'imperial';
  transitionContext?: 'mtf' | 'ftm';
  priorAnalyses?: PriorAnalysis[];
  dataContext?: AnalysisDataContext;
  poseLabel?: string;
};

// ── visionSystemPrompt context modules (composer blocks) ──────────────────────
// Each returns the lines for ONE optional context section, or [] when it does not
// apply, so visionSystemPrompt spreads them unconditionally (mirrors
// transitionPromptLines). The vision prompt is the accumulator that MASTER-PLAN
// point 3 warns about: keeping every section a composed module means adding a new
// one (e.g. a pose region-template) is one more helper + one more spread, never an
// edit that grows the base monolith or dilutes its HARD RULES. These stay local
// (not in _shared) because they are vision-specific; the connector never uses them.

/** Base instruction + the two output-layer specs + hard rules (always present). */
function visionBaseLines(
  session: string,
  hasBaseline: boolean,
  locale: string,
  ctx: VisionCtx | undefined,
): string[] {
  const regionGuide =
    session === 'face'
      ? 'jawline, cheek fullness, under-eye area, neck, overall puffiness vs definition'
      : 'waist, midsection definition, chest, shoulders/delts, arms, back and legs when visible, overall fullness vs dryness';
  return [
    `You are the progress-reading engine of a body-tracking instrument. Session type: ${session}.${ctx?.poseLabel ? ` Track: ${ctx.poseLabel}.` : ''}`,
    hasBaseline
      ? 'You are given a BASELINE photo and a NEW photo. Compare them.'
      : 'You are given a single NEW photo with no baseline yet.',
    '',
    'Your one job: surface something TRUE and SPECIFIC the user could not have seen alone.',
    'The user reads this to discover, not to be complimented. If nothing visibly changed,',
    'say exactly that — a clean "no visible change yet at this cadence" beats invented',
    'progress every time. Never pad with praise.',
    '',
    'Layer 1 — COMPARABILITY (lighting, distance/framing, camera angle):',
    '- driftScore: 0 = same framing/lighting/angle, 1 = very different.',
    '- comparable: true if similar enough for an honest before/after (false with no baseline).',
    '- lighting and framing: classify with the allowed enums.',
    '- retake: true when drift is high enough that the user should retake.',
    '- coverage: classify the NEW photo as clothed / partial / minimal by how much clothing obscures the body. Judge coverage only, never identity or appearance beyond that.',
    '- cropBox: the subject region of the NEW photo worth showing (torso for body shots, head for face shots), normalized 0..1 from the top-left. This only crops the display thumbnail; the stored original is untouched. Prefer a slightly generous box, and set confidence below 0.6 whenever you are unsure so the app falls back to the full frame.',
    '',
    'Layer 2 — DISCOVERY (why the user is here):',
    `- observations: compare region by region (${regionGuide}). Report ONLY regions where something is honestly worth saying, 0-5 entries. Each: a short region label in the user's locale, one hedged sentence, a direction, and a confidence from the photo evidence alone. Different lighting or angle caps confidence at 0.5 — name the limit in the note.`,
    '- hypothesis: ONE sentence connecting what you see to the DATA CONTEXT below, when they genuinely relate ("waist appears tighter while weight held steady, consistent with recomposition or water shift rather than fat loss alone"). Always a hypothesis, never a conclusion; never state a mechanism as fact. Empty string when visuals and data do not honestly connect.',
    '- watchNext: ONE concrete thing to look for in the next photo of this track, tied to what the data suggests should move next. Empty string when nothing specific suggests itself.',
    hasBaseline
      ? '- change: ONE short, hedged sentence with the single most interesting finding (the headline).'
      : '- change: return an empty string (no baseline to compare); observations must also be empty.',
    '',
    'HARD RULES (non-negotiable):',
    '- Observational ONLY. Never diagnose, never give medical advice, never claim a health outcome.',
    '- Hedge everything ("appears", "may", "slightly"). Never definitive.',
    "- Do NOT identify or describe the person's identity. Judge framing/lighting/visible change only.",
    '- Uncertainty beats overclaiming: one wrong confident read costs more trust than ten honest "unclear"s.',
    `- ${localeLine(locale, 'every user-facing string (change, observation notes and region labels, hypothesis, watchNext)')}`,
    `- The user's unit system is ${ctx?.units ?? 'metric'}. Report any measurement or weight in ${ctx?.units === 'imperial' ? 'imperial (in / lb)' : 'metric (cm / kg)'}. Do NOT default to imperial.`,
  ];
}

/** Pre-digested numeric context from the user's own logs (F5 context fusion). */
function visionDataContextLines(d: AnalysisDataContext | undefined, units?: 'metric' | 'imperial'): string[] {
  if (!d) return [];
  const wUnit = units === 'imperial' ? 'lb' : 'kg';
  const parts: string[] = [`window: ${d.windowDays} days between baseline and new photo`];
  if (d.weight) {
    parts.push(
      `weight: ${d.weight.start}${wUnit} -> ${d.weight.end}${wUnit} (${d.weight.delta > 0 ? '+' : ''}${d.weight.delta}${wUnit})`,
    );
  }
  if (d.nutrition) {
    const n: string[] = [];
    if (d.nutrition.avgProtein !== undefined) n.push(`avg protein ${d.nutrition.avgProtein}g`);
    if (d.nutrition.avgCalories !== undefined) n.push(`avg calories ${d.nutrition.avgCalories}kcal`);
    parts.push(`nutrition over last 14d: ${n.join(', ')} (${d.nutrition.daysLogged} days logged)`);
  }
  if (d.avgSleepQuality !== undefined) parts.push(`avg sleep quality last 14d: ${d.avgSleepQuality}/5`);
  if (d.recentDoses?.length) {
    parts.push(
      `doses before this photo: ${d.recentDoses.map((x) => `${x.label} ${x.hoursBefore}h before`).join(', ')}`,
    );
  }
  return [
    '',
    'DATA CONTEXT (from the user\'s own logs — use for the hypothesis, cite specifics):',
    ...parts.map((p) => `- ${p}`),
  ];
}

/** The observation ledger: your prior findings on this track (F5). */
function visionPriorFindingsLines(priorAnalyses: PriorAnalysis[] | undefined): string[] {
  if (!priorAnalyses?.length) return [];
  return [
    '',
    'YOUR PRIOR FINDINGS on this track (newest first — your memory, not the user\'s words):',
    ...priorAnalyses.map((p) => {
      const obs = p.observations.map((o) => `${o.region} (${o.direction}): ${o.note}`).join('; ');
      const extra = [p.hypothesis ? `hypothesis: ${p.hypothesis}` : '', p.watchNext ? `watching: ${p.watchNext}` : '']
        .filter(Boolean)
        .join(' | ');
      return `- ${p.at.slice(0, 10)}: ${obs || 'no region findings'}${extra ? ` | ${extra}` : ''}`;
    }),
    'Confirm, extend, or quietly drop these — reference at most one or two, and only when the',
    'new photo actually supports it. If a prior watch-item can now be checked, address it.',
    'Never invent continuity the photos do not show.',
  ];
}

/** App-inferred body-type calibration (owner §4A). */
function visionBodyTypeLines(bodyTypeCalibration: string | undefined): string[] {
  if (!bodyTypeCalibration) return [];
  return ['', `Body type context: ${bodyTypeCalibration}. Factor this into your assessment.`];
}

/** Tape-measurement deltas since baseline. */
function visionMeasurementLines(
  measurementDelta: VisionCtx['measurementDelta'],
  unitLabel: string,
): string[] {
  if (!measurementDelta) return [];
  const parts: string[] = [];
  if (measurementDelta.waist !== undefined) {
    parts.push(`waist: ${measurementDelta.waist > 0 ? '+' : ''}${measurementDelta.waist}${unitLabel}`);
  }
  if (measurementDelta.hips !== undefined) {
    parts.push(`hips: ${measurementDelta.hips > 0 ? '+' : ''}${measurementDelta.hips}${unitLabel}`);
  }
  if (measurementDelta.extra) {
    parts.push(`${measurementDelta.extra.key}: ${measurementDelta.extra.delta > 0 ? '+' : ''}${measurementDelta.extra.delta}${unitLabel}`);
  }
  if (!parts.length) return [];
  return ['', `Measurement changes since baseline: ${parts.join(', ')}. Reference these in your change note if relevant.`];
}

/** Luteal-phase attribution register (beta-notes 1.7 step 1, owner-decided copy):
 *  attribute, never criticize; suppress bloating-as-regression entirely. */
function visionCycleLutealLines(cycleContext: 'luteal' | undefined): string[] {
  if (cycleContext !== 'luteal') return [];
  return [
    '',
    'Cycle context: the user is likely in their luteal phase. Register rules for this case:',
    '- If you observe bloating, fullness, or midsection softness, ATTRIBUTE it in this hedged register: "some water retention is consistent with this point in your cycle."',
    '- Never describe such changes as regression, fat gain, or lost progress; do not count them against progress in your comparability or change assessment.',
    '- Never use diagnostic phrasing (e.g. "hormonal inflammation detected"). Attribution, not diagnosis.',
    '- Mention the cycle only when a visible change plausibly relates to it; otherwise leave it out.',
  ];
}

/** A user-reported symptom to check for visual corroboration. */
function visionSymptomLines(symptomContext: string | undefined): string[] {
  if (!symptomContext) return [];
  return ['', `User reported a symptom to document: "${symptomContext}". Focus on whether this is visually apparent.`];
}

/** Weeks-into-cycle calibration, so a mid-cycle first photo isn't read as day 1. */
function visionCycleWeekLines(cycleWeek: number | undefined): string[] {
  if (!cycleWeek || cycleWeek <= 0) return [];
  return ['', `The user is about week ${cycleWeek} into their compound cycle (not a fresh start). Calibrate expectations to that point in a typical timeline rather than treating this as day 1.`];
}

/**
 * Compose the vision system prompt from its base + whichever context modules
 * apply to this call. Order is load-bearing (prompt order); keep it stable.
 */
function visionSystemPrompt(
  session: string,
  hasBaseline: boolean,
  locale: string,
  ctx?: VisionCtx,
): string {
  const unitLabel = ctx?.units === 'imperial' ? 'in' : 'cm';
  return [
    ...visionBaseLines(session, hasBaseline, locale, ctx),
    ...visionDataContextLines(ctx?.dataContext, ctx?.units),
    ...visionPriorFindingsLines(ctx?.priorAnalyses),
    ...visionBodyTypeLines(ctx?.bodyTypeCalibration),
    ...visionMeasurementLines(ctx?.measurementDelta, unitLabel),
    ...visionCycleLutealLines(ctx?.cycleContext),
    ...transitionPromptLines(ctx?.transitionContext),
    ...visionSymptomLines(ctx?.symptomContext),
    ...visionCycleWeekLines(ctx?.cycleWeek),
  ].join('\n');
}

function labSystemPrompt(locale: string): string {
  return [
    'You extract lab test result values from a photo of a lab report.',
    'Return ONLY the numeric values shown on the page - never a diagnosis, interpretation, or advice.',
    'Map each result to a canonical marker slug (testosterone_total, estradiol, hematocrit, glucose,',
    'lipids, dhea_s, igf1, cortisol, thyroid_tsh, vitamin_d, ferritin, creatinine, or leave as-is if',
    'none of those match). Include the unit and reference range exactly as printed.',
    '',
    'HARD RULES:',
    '- Extract values ONLY. Never interpret results or advise any action.',
    '- Never store or echo back names, DOB, provider names, or identifying information from the document.',
    `- ${localeLine(locale, 'any descriptive text')}`,
  ].join('\n');
}

function vialSystemPrompt(_locale: string): string {
  return [
    'You read a vial label and extract the compound name and concentration.',
    'concentrationMgMl is the mg per mL of the reconstituted or liquid solution.',
    'If only total mg and volume are given, compute concentrationMgMl = totalMg / volumeMl.',
    '',
    'HARD RULES:',
    '- Return only what is printed - never suggest a concentration that is not derivable from the label.',
    '- Never provide dosing advice, schedules, or recommendations.',
  ].join('\n');
}

function insightsSystemPrompt(mode: string, locale: string, coachingLevel?: string): string {
  const modeLine =
    mode === 'trend'
      ? 'Focus: describe the notable TRENDS in the data over time (weight, wellness, energy, sleep, symptoms, integration metrics). What is moving, in which direction, how steadily.'
      : mode === 'correlation'
        ? "Focus: look for TEMPORAL ASSOCIATIONS - did anything in the data shift around the time a compound's protocol started, or around symptom clusters? Describe co-occurrence in time; never claim causation."
        : 'Focus: answer the user\'s question using ONLY their logged data.';
  // Coaching level (W3-8, beta-notes 3.6): shapes SUGGESTION behavior only. The
  // hard rules below (no dosing, no medical advice) are level-independent.
  const coachingLine =
    coachingLevel === 'observe'
      ? 'COACHING LEVEL: observe. Answer exactly what is asked; give NO unsolicited suggestions, targets, or lifestyle advice. Hedged reads of the data only.'
      : coachingLevel === 'coach'
        ? 'COACHING LEVEL: coach. When the data supports it, add ONE proactive, personalized lifestyle suggestion (nutrition, training effort, cardio, recovery, sleep, hydration) tied to the user\'s goal, with a short reason. Lifestyle only: NEVER a compound, dose, or schedule suggestion.'
        : 'COACHING LEVEL: nudge. If, and only if, something in the data looks clearly off or clearly working, you may add one gentle, goal-framed observation. No targets or plans unless asked. Lifestyle only: never a compound, dose, or schedule suggestion.';
  return [
    "You are a careful analyst of a single user's own self-tracked health data.",
    modeLine,
    coachingLine,
    '',
    'You are given a compact JSON history of their check-ins, logged doses, symptoms,',
    'integration metric readings, protocol start dates, and progress-photo results',
    '(each photo track with its latest capture date, comparability, and a hedged change note).',
    'Analyze only what is present.',
    'Metric labels may carry a goal-direction hint in parentheses, e.g. "hips (goal: lower is better)" - respect it: never frame a move against the user goal as good.',
    '',
    'TONE (spec A-5): read like a trusted instrument that also understands why the number matters. For each notable trend, add ONE short interpretive sentence about what it means for the user\'s stated goal, not just the figure. Warmer than a lab printout, still hedged and precise. When a read is flat or neutral, give it a little character rather than a canned line. Never clinical-only, never hype.',
    '',
    'HARD RULES (non-negotiable):',
    '- Ground every statement in the provided data. Reference specific dates and values.',
    '- NEVER give compound dosing or medical advice: no doses, schedules, changes, or synergies for ANY compound, under any framing (hypotheticals, "asking for a friend", research pretexts).',
    '- Lifestyle numbers are coaching, not dosing (spec 05 capability 8): when the user ASKS for a calorie, protein, training, hydration, or sleep target, answer directly and personally from their data. Do not deflect lifestyle questions with false hedging.',
    '- NEVER claim causation. Use association language ("around the time", "coincided with", "appears to track with").',
    '- Hedge ("appears", "may", "trends toward"). Never definitive health claims.',
    '- If the data is too sparse to say anything useful, set insufficientData=true and say so plainly.',
    '- Voice: precise and analytical, like a trusted instrument. No exclamation marks, no emoji, no hype.',
    `- ${localeLine(locale, 'the "answer"')}`,
  ].join('\n');
}

function simpleSystemPrompt(locale: string, units?: 'metric' | 'imperial'): string {
  return [
    'You are a warm, supportive wellness companion for a health tracking app.',
    'Write one encouraging paragraph based on the user\'s recent log data and their progress photo journey.',
    'Reference specific data points if available (weight trend, wellness scores, last photo comparison).',
    'Be genuine, not generic. Acknowledge the specific compound group they are tracking.',
    'When recent photo-analysis findings are provided, anchor the note to one of them — a real,',
    'specific observation lands harder than any compliment. Without findings, lean on the data.',
    '',
    'HARD RULES:',
    '- Never give dosing or medical advice of any kind.',
    '- Never make definitive health claims. Use hedged language ("appears", "may", "suggests").',
    '- Keep it to one paragraph, warm and direct.',
    '- Voice: calm and precise, like a trusted instrument. Supportive, never hype. No exclamation marks, no emoji.',
    `- Report weight in ${units === 'imperial' ? 'imperial (lb)' : 'metric (kg)'}, matching the units shown in the data. Do NOT convert or default to pounds.`,
    `- ${localeLine(locale)}`,
  ].join('\n');
}

function ledgerSystemPrompt(locale: string): string {
  return [
    "You explain what plausibly moved ONE of a self-tracker's signals over a recent window.",
    'You are given the metric name, its trend direction, and a list of REAL events the user',
    'logged inside that window (workouts, rest days, poor-sleep nights, symptoms, and doses),',
    'each with a deterministic heuristic impact estimate where one exists.',
    '',
    'Produce:',
    '- summary: ONE hedged sentence naming which listed event(s) most plausibly moved the metric.',
    '- notes: optional short context lines for individual events (copy only).',
    '',
    'HARD RULES (non-negotiable):',
    '- Ground everything in the listed events ONLY. Never invent an event, value, or cause.',
    '- Never claim causation. Use association language ("around", "coincided with", "may track with").',
    '- Hedge everything ("appears", "may", "slightly"). Never definitive.',
    '- NEVER give dosing or medical advice. Never suggest doses, schedules, changes, or synergies.',
    '- DOSE events are CONTEXT ONLY: never attribute a quantified effect to a compound and never',
    '  imply it helped or hurt. You may note it was taken; nothing more.',
    '- Do not restate every event. Be concise; empty summary is fine when events are too sparse.',
    '- Voice: precise and analytical, like a trusted instrument. No exclamation marks, no emoji, no hype.',
    `- ${localeLine(locale, 'all text')}`,
  ].join('\n');
}

// --- Handler ------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json()) as
      | ParseLogRequest
      | AnalyzePhotoRequest
      | CheckFitRequest
      | ClassifyPoseRequest
      | SimpleAnalysisRequest
      | ParseLabRequest
      | ScanVialRequest
      | InsightsRequest
      | CompoundInfoRequest
      | SignalLedgerRequest
      | TerraRequest;

    // -- terra --------------------------------------------------------------
    // Aggregator proxy: keeps Terra credentials server-side. Does not need the
    // Anthropic key, so handle it before that guard.
    if (body.action === 'terra') {
      return await handleTerra(body);
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
    const client = new Anthropic({ apiKey });

    // -- parse_log ------------------------------------------------------------
    if (body.action === 'parse_log') {
      if (!body.text?.trim()) return json({ error: 'text is required' }, 400);
      const nowISO = body.nowISO ?? new Date().toISOString();
      const locale = body.locale ?? 'en';
      const message = await client.messages.create({
        model: PARSE_MODEL,
        max_tokens: 1024,
        system: parseSystemPrompt(body.catalog ?? [], nowISO, locale),
        ...structured(PARSE_SCHEMA),
        messages: [{ role: 'user', content: body.text }],
      });
      return json(extractJson(message, { reply: '', items: [] }), 200);
    }

    // -- analyze_photo --------------------------------------------------------
    if (body.action === 'analyze_photo') {
      if (!body.newImage) return json({ error: 'newImage is required' }, 400);
      const locale = body.locale ?? 'en';
      const hasBaseline = !!body.baselineImage;
      const content: unknown[] = [];
      if (hasBaseline) {
        content.push({ type: 'text', text: 'BASELINE photo (reference):' });
        content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: body.baselineImage } });
        content.push({ type: 'text', text: 'NEW photo (just taken):' });
      } else {
        content.push({ type: 'text', text: 'NEW photo (no baseline yet):' });
      }
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: body.newImage } });

      const message = await client.messages.create({
        model: VISION_MODEL,
        // F5: the discovery layer (region observations + hypothesis) needs room.
        max_tokens: 1024,
        system: visionSystemPrompt(body.session, hasBaseline, locale, {
          measurementDelta: body.measurementDelta,
          cycleContext: body.cycleContext,
          symptomContext: body.symptomContext,
          bodyTypeCalibration: body.bodyTypeCalibration,
          cycleWeek: body.cycleWeek,
          units: body.units,
          transitionContext: body.transitionContext,
          priorAnalyses: body.priorAnalyses,
          dataContext: body.dataContext,
          poseLabel: body.poseLabel,
        }),
        ...structured(ANALYZE_SCHEMA),
        // deno-lint-ignore no-explicit-any
        messages: [{ role: 'user', content: content as any }],
      });
      return json(
        extractJson(message, {
          driftScore: 1,
          comparable: false,
          lighting: 'different',
          framing: 'off_angle',
          change: '',
          observations: [],
          hypothesis: '',
          watchNext: '',
          retake: true,
          coverage: 'clothed',
          // cropBox deliberately omitted: a degraded read must not crop the
          // display. The client treats a missing box as "show the full frame".
        }),
        200,
      );
    }

    // -- simple_analysis ------------------------------------------------------
    if (body.action === 'simple_analysis') {
      const locale = body.locale ?? 'en';
      const wUnit = body.units === 'imperial' ? 'lb' : 'kg';
      const logSummary = body.recentLogs.length
        ? body.recentLogs
            .slice(0, 7)
            .map(
              (l) =>
                `${l.date}: weight=${l.weight !== undefined ? `${l.weight}${wUnit}` : 'n/a'}, wellness=${l.wellness ?? 'n/a'}/5, energy=${l.energy ?? 'n/a'}/5`,
            )
            .join('\n')
        : 'No recent logs.';

      const lastPhoto = body.lastScientificResult
        ? `Last photo comparison: drift=${body.lastScientificResult.driftScore?.toFixed(2) ?? 'n/a'}, comparable=${body.lastScientificResult.comparable ?? 'n/a'}${body.lastScientificResult.change ? `, note: "${body.lastScientificResult.change}"` : ''}.`
        : 'No photo comparison yet.';

      const cycleNote = body.cycleContext === 'luteal'
        ? 'The user may be in their luteal phase. If weight or bloating ticked up, attribute it in a hedged register ("some water retention is consistent with this point in your cycle") and never frame it as regression or lost progress.'
        : '';

      // F5: hand the note real discoveries so it can reference something
      // specific instead of generic warmth.
      const discoveries = body.recentDiscoveries?.length
        ? `Recent findings from photo analyses (reference ONE if it fits naturally, hedged):\n${body.recentDiscoveries.map((d) => `- ${d}`).join('\n')}`
        : '';

      const userContext = [
        `Tracking focus: ${body.compoundGroup.replace('_', ' ')}.`,
        lastPhoto,
        discoveries,
        cycleNote,
        '',
        'Recent check-ins (newest first):',
        logSummary,
      ]
        .filter(Boolean)
        .join('\n');

      const message = await client.messages.create({
        model: ENCOURAGE_MODEL,
        max_tokens: 300,
        system: simpleSystemPrompt(locale, body.units),
        ...structured(SIMPLE_SCHEMA),
        messages: [{ role: 'user', content: userContext }],
      });
      return json(extractJson(message, { message: '' }), 200);
    }

    // -- parse_lab ------------------------------------------------------------
    // Accepts a photographed report (image) OR an uploaded PDF (document block).
    // The document is never stored (spec 05): values are extracted, then discarded.
    if (body.action === 'parse_lab') {
      if (!body.image && !body.pdf) return json({ error: 'image or pdf is required' }, 400);
      const locale = body.locale ?? 'en';
      const source = body.pdf
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: body.pdf } }
        : { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: body.image } };
      const message = await client.messages.create({
        model: VISION_MODEL,
        max_tokens: 1024,
        system: labSystemPrompt(locale),
        ...structured(LAB_SCHEMA),
        // deno-lint-ignore no-explicit-any
        messages: [{ role: 'user', content: [source] as any }],
      });
      return json(extractJson(message, { values: [] }), 200);
    }

    // -- scan_vial ------------------------------------------------------------
    if (body.action === 'scan_vial') {
      if (!body.image) return json({ error: 'image is required' }, 400);
      const locale = body.locale ?? 'en';
      const message = await client.messages.create({
        model: VISION_MODEL,
        max_tokens: 256,
        system: vialSystemPrompt(locale),
        ...structured(VIAL_SCHEMA),
        messages: [
          {
            role: 'user',
            // deno-lint-ignore no-explicit-any
            content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: body.image } }] as any,
          },
        ],
      });
      return json(extractJson(message, { confidence: 0 }), 200);
    }

    // -- insights -------------------------------------------------------------
    if (body.action === 'insights') {
      const locale = body.locale ?? 'en';
      const mode = body.mode ?? 'trend';
      const h = body.history;
      const userContent = [
        body.question ? `User question: ${body.question}` : `Analysis mode: ${mode}.`,
        '',
        'DATA (JSON):',
        JSON.stringify({
          checkins: h.checkins.slice(0, 90),
          doses: h.doses.slice(0, 200),
          symptoms: h.symptoms.slice(0, 100),
          metrics: h.metrics.slice(0, 300),
          protocolStarts: h.protocolStarts,
          photos: (h.photos ?? []).slice(0, 40),
          context: (h.context ?? []).slice(0, 60),
        }),
      ].join('\n');

      // Chat Q&A fallback runs the cheap model (Haiku); Analysis deep-dives keep
      // the capable model (spec P-1: "Haiku is enough for now").
      const insightsModel = body.tier === 'quick' ? PARSE_MODEL : INSIGHTS_MODEL;
      const message = await client.messages.create({
        model: insightsModel,
        max_tokens: 900,
        system: insightsSystemPrompt(mode, locale, body.coachingLevel),
        ...structured(INSIGHTS_SCHEMA),
        messages: [{ role: 'user', content: userContent }],
      });
      return json(extractJson(message, { answer: '', insufficientData: true }), 200);
    }

    // -- compound_info --------------------------------------------------------
    // The posture gate (spec 05, W4-12): category comes from catalog data passed
    // by the client, resolved and enforced HERE in code. Controlled compounds are
    // answered without any model call (track-only), so no prompt attack can leak
    // a range for them.
    if (body.action === 'compound_info') {
      if (!body.compound?.slug || !body.compound?.canonicalName) {
        return json({ error: 'compound.slug and compound.canonicalName are required' }, 400);
      }
      const locale = body.locale ?? 'en';
      const category = resolveMarketCategory(body.compound.marketCategory, body.compound.controlled);
      if (isTrackOnly(category)) {
        return json(
          {
            category,
            trackOnly: true,
            source: 'reported_unverified',
            answer: '',
            facts: [],
            consultPointer: false,
          },
          200,
        );
      }
      const userContent = [
        `Compound: ${body.compound.canonicalName} (${body.compound.slug}).`,
        body.question?.trim()
          ? `User question: ${body.question.trim()}`
          : 'No specific question: give a short observational overview (commonly reported ranges, timing, side effects).',
      ].join('\n');
      const message = await client.messages.create({
        model: COMPOUND_MODEL,
        max_tokens: 700,
        system: compoundInfoPromptLines(category, locale).join('\n'),
        ...structured(COMPOUND_INFO_SCHEMA),
        messages: [{ role: 'user', content: userContent }],
      });
      const out = extractJson(message, { answer: '', facts: [], consultPointer: false }) as {
        answer: string;
        facts: { kind: string; text: string; confidence: string }[];
        consultPointer: boolean;
      };
      // Code-level enforcement on top of the prompt: otc always carries the
      // pointer flag so the client renders it even if the model forgot.
      if (category === 'otc') out.consultPointer = true;
      return json({ category, trackOnly: false, source: 'reported_unverified', ...out }, 200);
    }

    // -- check_fit -------------------------------------------------------------
    if (body.action === 'check_fit') {
      if (!body.baselineImage) return json({ fit: 'good', confidence: 1 }, 200);
      const message = await client.messages.create({
        model: PARSE_MODEL,
        max_tokens: 120,
        ...structured({
          type: 'object',
          additionalProperties: false,
          properties: {
            fit: { type: 'string', enum: ['good', 'acceptable', 'poor'] },
            confidence: { type: 'number', description: '0..1' },
            hint: { type: 'string', description: 'Under 10 words; specific + actionable when fit is not good.' },
          },
          required: ['fit', 'confidence'],
        }),
        system: [
          'You are a photo fit-checker. Given a baseline photo and a new photo, assess whether',
          'the user\'s position, distance, and angle in the new photo are comparable to the baseline.',
          'Rules: "good" = similar framing; "acceptable" = minor difference; "poor" = substantially',
          'different angle/distance or subject out of frame. hint must be specific and actionable.',
        ].join(' '),
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: body.baselineImage } },
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: body.newImage } },
            { type: 'text', text: 'Baseline is the first image. New photo is the second. Return the JSON fit assessment.' },
          ],
        }],
      });
      return json(extractJson(message, { fit: 'good', confidence: 1 }), 200);
    }

    // -- classify_pose ---------------------------------------------------------
    // Reel auto-cataloguing (W6-26): a cheap Haiku-vision call that sorts a photo
    // into the canonical pose set (or `other` for casual shots / non-body images
    // like screenshots or pets). Purely descriptive of framing — never analyses
    // the body, never identifies a person. The client downscales aggressively;
    // classification needs far less resolution than the scientific compare.
    if (body.action === 'classify_pose') {
      const message = await client.messages.create({
        model: PARSE_MODEL,
        max_tokens: 120,
        ...structured({
          type: 'object',
          additionalProperties: false,
          properties: {
            pose: {
              type: 'string',
              enum: ['front_face', 'side_profile', 'front_relaxed', 'side_relaxed', 'other'],
            },
            confidence: { type: 'number', description: '0..1 confidence in the pose label' },
          },
          required: ['pose', 'confidence'],
        }),
        system: [
          'You sort a progress photo into one camera framing. Categories:',
          '"front_face" = head/face shot facing the camera;',
          '"side_profile" = head/face shot from the side;',
          '"front_relaxed" = full or upper body facing the camera, arms relaxed (not flexed);',
          '"side_relaxed" = full or upper body from the side, relaxed;',
          '"other" = anything else, incl. flexed/posed shots, screenshots, close-ups, objects, or photos with no clear single subject.',
          'Judge framing only. Do NOT describe, assess, or identify the body or person.',
          'confidence reflects how clearly the framing matches; use <=0.6 when ambiguous.',
        ].join(' '),
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: body.image } },
            { type: 'text', text: 'Return the JSON pose classification for this photo.' },
          ],
        }],
      });
      return json(extractJson(message, { pose: 'other', confidence: 0 }), 200);
    }

    // -- signal_ledger ---------------------------------------------------------
    // Contextual copy over the deterministic ledger (redesign R2-D). Impacts stay
    // client-side + deterministic; the model only adds a hedged summary + notes.
    if (body.action === 'signal_ledger') {
      const locale = body.locale ?? 'en';
      if (!body.events?.length) return json({ summary: '', notes: [] }, 200);
      const eventLines = body.events
        .map(
          (e) =>
            `- [${e.id}] ${e.date} ${e.kind}: ${e.label}${typeof e.impact === 'number' ? ` (est. impact ${e.impact > 0 ? '+' : ''}${e.impact})` : ''}`,
        )
        .join('\n');
      const userContent = [
        `Metric: ${body.metric}.`,
        body.goal ? `User goal: ${body.goal}.` : '',
        body.trend ? `Trend over the window: ${body.trend}.` : '',
        body.windowDays ? `Window: last ${body.windowDays} days.` : '',
        '',
        'Logged events in the window (newest first):',
        eventLines,
      ]
        .filter(Boolean)
        .join('\n');

      const message = await client.messages.create({
        model: PARSE_MODEL,
        max_tokens: 400,
        system: ledgerSystemPrompt(locale),
        ...structured(LEDGER_SCHEMA),
        messages: [{ role: 'user', content: userContent }],
      });
      return json(extractJson(message, { summary: '', notes: [] }), 200);
    }

    return json({ error: 'unsupported action' }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'request failed' }, 500);
  }
});

// --- Terra aggregator proxy (spec 06) ------------------------------------------
// Credentials live in edge secrets (TERRA_DEV_ID, TERRA_API_KEY), never in the
// client. The client provider calls this to (a) open a Connect widget and (b)
// pull readings, which are mapped to the canonical metric model server-side.

const TERRA_BASE = 'https://api.tryterra.co/v2';
// Broad provider set for the Connect widget; Terra shows the user a picker.
const TERRA_PROVIDERS =
  'GARMIN,WITHINGS,FITBIT,OURA,WHOOP,PELOTON,GOOGLE,SAMSUNG,POLAR,SUUNTO,FREESTYLELIBRE,DEXCOM,CRONOMETER,MYFITNESSPAL';

function terraHeaders(devId: string, apiKey: string) {
  return { 'dev-id': devId, 'x-api-key': apiKey, 'Content-Type': 'application/json' };
}

async function handleTerra(body: TerraRequest): Promise<Response> {
  const devId = Deno.env.get('TERRA_DEV_ID');
  const apiKey = Deno.env.get('TERRA_API_KEY');
  if (!devId || !apiKey) return json({ error: 'terra_not_configured' }, 501);
  const headers = terraHeaders(devId, apiKey);

  if (body.sub === 'widget_session') {
    const res = await fetch(`${TERRA_BASE}/auth/generateWidgetSession`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        providers: TERRA_PROVIDERS,
        language: 'en',
        auth_success_redirect_url: body.redirectUrl ?? 'pepi://terra',
        auth_failure_redirect_url: body.redirectUrl ?? 'pepi://terra',
      }),
    });
    const data = await res.json();
    if (!res.ok) return json({ error: 'terra_widget_failed', detail: data }, 502);
    return json({ url: data.url, sessionId: data.session_id }, 200);
  }

  if (body.sub === 'pull') {
    if (!body.userId) return json({ error: 'userId required' }, 400);
    const end = new Date();
    const start = body.since ? new Date(body.since) : new Date(end.getTime() - 30 * 86400000);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);

    const readings: ProviderReading[] = [];
    for (const type of ['body', 'daily', 'sleep', 'activity'] as const) {
      const url = `${TERRA_BASE}/${type}?user_id=${encodeURIComponent(body.userId)}&start_date=${startStr}&end_date=${endStr}&to_webhook=false`;
      const res = await fetch(url, { headers });
      if (!res.ok) continue; // skip a type that errors; partial data is fine
      const env = await res.json();
      for (const record of env.data ?? []) {
        mapTerraRecord(type, record, readings);
      }
    }
    return json({ readings }, 200);
  }

  return json({ error: 'unsupported terra sub-action' }, 400);
}

// A reading before the client assigns an id (mirrors ProviderReading in the app).
type ProviderReading = {
  metric: string;
  value: number;
  unit?: string;
  ts: string;
  sourceProvider: string;
  confidence?: number;
};

function push(out: ProviderReading[], metric: string, value: unknown, ts: string, unit?: string) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    out.push({ metric, value, unit, ts, sourceProvider: 'terra' });
  }
}

// deno-lint-ignore no-explicit-any
function mapTerraRecord(type: string, r: any, out: ProviderReading[]) {
  const ts: string =
    r?.metadata?.end_time ?? r?.metadata?.start_time ?? r?.metadata?.upload_type ?? new Date().toISOString();

  if (type === 'body') {
    for (const m of r?.measurements_data?.measurements ?? []) {
      const mts = m?.measurement_time ?? ts;
      push(out, 'body.weight', m?.weight_kg, mts, 'kg');
      push(out, 'body.fat_pct', m?.bodyfat_percentage, mts, '%');
      push(out, 'body.lean_mass', m?.lean_mass_g ? m.lean_mass_g / 1000 : undefined, mts, 'kg');
    }
    // Resting / HRV sometimes ride on the body payload too.
    push(out, 'vitals.hr_rest', r?.heart_data?.heart_rate_data?.summary?.resting_hr_bpm, ts, 'bpm');
  }

  if (type === 'daily') {
    push(out, 'activity.steps', r?.distance_data?.steps, ts, 'steps');
    push(out, 'activity.energy', r?.calories_data?.total_burned_calories, ts, 'kcal');
    push(out, 'vitals.hr_rest', r?.heart_rate_data?.summary?.resting_hr_bpm, ts, 'bpm');
    push(out, 'vitals.hrv', r?.heart_rate_data?.summary?.avg_hrv_rmssd, ts, 'ms');
  }

  if (type === 'sleep') {
    const secs = r?.sleep_durations_data?.asleep?.duration_asleep_state_seconds;
    push(out, 'sleep.duration', typeof secs === 'number' ? secs / 3600 : undefined, ts, 'h');
    // Terra sleep efficiency (0..100) is a reasonable proxy for sleep quality.
    push(out, 'sleep.quality', r?.sleep_durations_data?.sleep_efficiency, ts, '%');
  }

  if (type === 'activity') {
    push(out, 'activity.energy', r?.calories_data?.total_burned_calories, ts, 'kcal');
    // Effort normalization: Whoop-style strain is 0..21 -> map to a 0..100 effort score
    // so heterogeneous provider scores share one canonical scale (spec 06). Raw stays at source.
    const strain = r?.strain_data?.strain_level;
    if (typeof strain === 'number' && Number.isFinite(strain)) {
      push(out, 'activity.effort', Math.round((strain / 21) * 100), ts);
    }
  }
}

// Structured output is produced via a forced tool call (see `structured` below),
// so the result rides a tool_use block. Falls back to parsing a text block for
// any prompt that still returns raw JSON.
// deno-lint-ignore no-explicit-any
function extractJson(message: any, fallback: unknown): unknown {
  const toolBlock = message.content.find((b: { type: string }) => b.type === 'tool_use');
  if (toolBlock && 'input' in toolBlock) return toolBlock.input;
  const textBlock = message.content.find((b: { type: string }) => b.type === 'text');
  if (textBlock && 'text' in textBlock) {
    try { return JSON.parse(textBlock.text); } catch { /* fall through */ }
  }
  return fallback;
}

/**
 * Forced-tool-call params for structured output. Replaces the `output_config`
 * json_schema path, whose grammar compilation timed out on the larger schemas
 * (the parse_log spinner). Tool use is the robust way to get JSON from Claude.
 */
function structured(schema: unknown) {
  return {
    tools: [{ name: 'record', description: 'Record the structured result.', input_schema: schema }],
    tool_choice: { type: 'tool' as const, name: 'record' },
  };
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
