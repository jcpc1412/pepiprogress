// PepiProgress - reusable AI edge service (spec 05/10). Claude, server-side; the
// API key never touches the client.
//
// Actions:
//   parse_log       - Haiku; parses NL quick-log text into structured entities.
//   analyze_photo   - Sonnet vision; drift score + hedged change note.
//   check_fit       - Haiku vision; pre-capture fit check (position / angle / distance).
//   simple_analysis - Haiku text-only; encouraging weekly check-in message.
//   parse_lab       - Sonnet vision; extracts lab marker values from a photo.
//   scan_vial       - Sonnet vision; extracts compound name + concentration from a vial label.
//   insights        - Sonnet text; data-grounded trend / Q&A / correlation analysis (spec 05/13).
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

const PARSE_MODEL = Deno.env.get('AI_PARSE_MODEL') ?? 'claude-haiku-4-5';
const VISION_MODEL = Deno.env.get('AI_VISION_MODEL') ?? 'claude-sonnet-4-6';
const ENCOURAGE_MODEL = Deno.env.get('AI_ENCOURAGE_MODEL') ?? 'claude-haiku-4-5';
const INSIGHTS_MODEL = Deno.env.get('AI_INSIGHTS_MODEL') ?? 'claude-sonnet-4-6';

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
};

type ParseLabRequest = {
  action: 'parse_lab';
  image: string; // base64 JPEG
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
};

type CheckFitRequest = {
  action: 'check_fit';
  newImage: string; // base64 JPEG
  baselineImage?: string; // base64 JPEG - if absent, returns good fit
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
  kind: 'workout' | 'rest' | 'poor_sleep' | 'symptom' | 'dose';
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
        'ONE short, hedged, observational sentence about any visible difference between baseline and new. Empty string when there is no baseline. Never a medical claim or diagnosis.',
    },
    retake: { type: 'boolean', description: 'true if drift is high enough to recommend a retake.' },
    coverage: {
      type: 'string',
      enum: ['clothed', 'partial', 'minimal'],
      description:
        'Clothing coverage of the NEW photo. "minimal" = skin-exposed for maximum comparability (e.g. shirtless / underwear / swimwear); "partial" = fitted or partial clothing; "clothed" = loose or full clothing that obscures the body. Judge coverage only, never identity.',
    },
  },
  required: ['driftScore', 'comparable', 'lighting', 'framing', 'change', 'retake', 'coverage'],
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

function visionSystemPrompt(
  session: string,
  hasBaseline: boolean,
  locale: string,
  ctx?: {
    measurementDelta?: { waist?: number; hips?: number; extra?: { key: string; delta: number } };
    cycleContext?: 'luteal';
    symptomContext?: string;
    bodyTypeCalibration?: string;
    cycleWeek?: number;
    units?: 'metric' | 'imperial';
  },
): string {
  const unitLabel = ctx?.units === 'imperial' ? 'in' : 'cm';
  const lines = [
    `You assess progress photos for a health tracker. Session type: ${session}.`,
    hasBaseline
      ? 'You are given a BASELINE photo and a NEW photo. Compare them.'
      : 'You are given a single NEW photo with no baseline yet.',
    '',
    'Judge COMPARABILITY: lighting, distance/framing, and camera angle.',
    '- driftScore: 0 = same framing/lighting/angle, 1 = very different.',
    '- comparable: true if similar enough for an honest before/after (false with no baseline).',
    '- lighting and framing: classify with the allowed enums.',
    '- retake: true when drift is high enough that the user should retake.',
    '- coverage: classify the NEW photo as clothed / partial / minimal by how much clothing obscures the body. Judge coverage only, never identity or appearance beyond that.',
    hasBaseline
      ? '- change: ONE short, hedged, observational sentence about any visible difference.'
      : '- change: return an empty string (no baseline to compare).',
    '',
    'HARD RULES (non-negotiable):',
    '- Observational ONLY. Never diagnose, never give medical advice, never claim a health outcome.',
    '- Hedge everything ("appears", "may", "slightly"). Never definitive.',
    "- Do NOT identify or describe the person's identity. Judge framing/lighting/visible change only.",
    `- Write the "change" sentence in this locale: ${locale}.`,
    `- The user's unit system is ${ctx?.units ?? 'metric'}. Report any measurement or weight in ${ctx?.units === 'imperial' ? 'imperial (in / lb)' : 'metric (cm / kg)'}. Do NOT default to imperial.`,
  ];

  if (ctx?.bodyTypeCalibration) {
    lines.push('', `Body type context: ${ctx.bodyTypeCalibration}. Factor this into your assessment.`);
  }
  if (ctx?.measurementDelta) {
    const parts: string[] = [];
    if (ctx.measurementDelta.waist !== undefined) {
      parts.push(`waist: ${ctx.measurementDelta.waist > 0 ? '+' : ''}${ctx.measurementDelta.waist}${unitLabel}`);
    }
    if (ctx.measurementDelta.hips !== undefined) {
      parts.push(`hips: ${ctx.measurementDelta.hips > 0 ? '+' : ''}${ctx.measurementDelta.hips}${unitLabel}`);
    }
    if (ctx.measurementDelta.extra) {
      parts.push(`${ctx.measurementDelta.extra.key}: ${ctx.measurementDelta.extra.delta > 0 ? '+' : ''}${ctx.measurementDelta.extra.delta}${unitLabel}`);
    }
    if (parts.length) {
      lines.push('', `Measurement changes since baseline: ${parts.join(', ')}. Reference these in your change note if relevant.`);
    }
  }
  if (ctx?.cycleContext === 'luteal') {
    lines.push('', 'Note: user may be in their luteal phase. Any bloating or fullness may reflect normal hormonal water retention, not actual body composition change. Account for this in your assessment.');
  }
  if (ctx?.symptomContext) {
    lines.push('', `User reported a symptom to document: "${ctx.symptomContext}". Focus on whether this is visually apparent.`);
  }
  if (ctx?.cycleWeek && ctx.cycleWeek > 0) {
    lines.push('', `The user is about week ${ctx.cycleWeek} into their compound cycle (not a fresh start). Calibrate expectations to that point in a typical timeline rather than treating this as day 1.`);
  }

  return lines.join('\n');
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
    `- Write any descriptive text in locale: ${locale}.`,
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

function insightsSystemPrompt(mode: string, locale: string): string {
  const modeLine =
    mode === 'trend'
      ? 'Focus: describe the notable TRENDS in the data over time (weight, wellness, energy, sleep, symptoms, integration metrics). What is moving, in which direction, how steadily.'
      : mode === 'correlation'
        ? "Focus: look for TEMPORAL ASSOCIATIONS - did anything in the data shift around the time a compound's protocol started, or around symptom clusters? Describe co-occurrence in time; never claim causation."
        : 'Focus: answer the user\'s question using ONLY their logged data.';
  return [
    "You are a careful analyst of a single user's own self-tracked health data.",
    modeLine,
    '',
    'You are given a compact JSON history of their check-ins, logged doses, symptoms,',
    'integration metric readings, protocol start dates, and progress-photo results',
    '(each photo track with its latest capture date, comparability, and a hedged change note).',
    'Analyze only what is present.',
    'Metric labels may carry a goal-direction hint in parentheses, e.g. "hips (goal: lower is better)" - respect it: never frame a move against the user goal as good.',
    '',
    'HARD RULES (non-negotiable):',
    '- Ground every statement in the provided data. Reference specific dates and values.',
    '- NEVER give medical or dosing advice. Never suggest doses, schedules, changes, or synergies.',
    '- NEVER claim causation. Use association language ("around the time", "coincided with", "appears to track with").',
    '- Hedge ("appears", "may", "trends toward"). Never definitive health claims.',
    '- If the data is too sparse to say anything useful, set insufficientData=true and say so plainly.',
    '- Voice: precise and analytical, like a trusted instrument. No exclamation marks, no emoji, no hype.',
    `- Write the "answer" in this locale: ${locale}.`,
  ].join('\n');
}

function simpleSystemPrompt(locale: string, units?: 'metric' | 'imperial'): string {
  return [
    'You are a warm, supportive wellness companion for a health tracking app.',
    'Write one encouraging paragraph based on the user\'s recent log data and their progress photo journey.',
    'Reference specific data points if available (weight trend, wellness scores, last photo comparison).',
    'Be genuine, not generic. Acknowledge the specific compound group they are tracking.',
    '',
    'HARD RULES:',
    '- Never give dosing or medical advice of any kind.',
    '- Never make definitive health claims. Use hedged language ("appears", "may", "suggests").',
    '- Keep it to one paragraph, warm and direct.',
    '- Voice: calm and precise, like a trusted instrument. Supportive, never hype. No exclamation marks, no emoji.',
    `- Report weight in ${units === 'imperial' ? 'imperial (lb)' : 'metric (kg)'}, matching the units shown in the data. Do NOT convert or default to pounds.`,
    `- Write in this locale: ${locale}.`,
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
    `- Write all text in this locale: ${locale}.`,
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
      | SimpleAnalysisRequest
      | ParseLabRequest
      | ScanVialRequest
      | InsightsRequest
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
        max_tokens: 512,
        system: visionSystemPrompt(body.session, hasBaseline, locale, {
          measurementDelta: body.measurementDelta,
          cycleContext: body.cycleContext,
          symptomContext: body.symptomContext,
          bodyTypeCalibration: body.bodyTypeCalibration,
          cycleWeek: body.cycleWeek,
          units: body.units,
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
          retake: true,
          coverage: 'clothed',
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
        ? 'The user may be in their luteal phase - acknowledge that water retention this week is normal and expected.'
        : '';

      const userContext = [
        `Tracking focus: ${body.compoundGroup.replace('_', ' ')}.`,
        lastPhoto,
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
    if (body.action === 'parse_lab') {
      if (!body.image) return json({ error: 'image is required' }, 400);
      const locale = body.locale ?? 'en';
      const message = await client.messages.create({
        model: VISION_MODEL,
        max_tokens: 1024,
        system: labSystemPrompt(locale),
        ...structured(LAB_SCHEMA),
        messages: [
          {
            role: 'user',
            // deno-lint-ignore no-explicit-any
            content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: body.image } }] as any,
          },
        ],
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
        }),
      ].join('\n');

      // Chat Q&A fallback runs the cheap model (Haiku); Analysis deep-dives keep
      // the capable model (spec P-1: "Haiku is enough for now").
      const insightsModel = body.tier === 'quick' ? PARSE_MODEL : INSIGHTS_MODEL;
      const message = await client.messages.create({
        model: insightsModel,
        max_tokens: 900,
        system: insightsSystemPrompt(mode, locale),
        ...structured(INSIGHTS_SCHEMA),
        messages: [{ role: 'user', content: userContent }],
      });
      return json(extractJson(message, { answer: '', insufficientData: true }), 200);
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
