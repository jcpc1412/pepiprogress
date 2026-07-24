import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { registerCustomCompounds, type CatalogCompound } from '@/data/compound-catalog';
import type { CyclePromptState } from '@/lib/cycle';
import { localDateKey } from '@/lib/dates';
import type { CheckinField, Goal } from '@/lib/field-surfacing';
import { appendToLedger, type AnalysisRecord } from '@/lib/photo-observations';
import type { CanonicalPose } from '@/lib/photo-pose';
import type { CropBox } from '@/lib/photo-crop';
import {
  baselineFor,
  buildTypicalReadings,
  groupHasValueForDate,
  TYPICAL_GROUP_ORDER,
  TYPICAL_SILENT_CONFIDENCE,
  TYPICAL_TAP_CONFIDENCE,
  withoutTypicalForDate,
  withoutTypicalForGroup,
  withoutTypicalMetric,
  type TypicalBaseline,
  type TypicalGroup,
  type TypicalLevel,
  type TypicalPromptStatus,
} from '@/lib/typical-day';
import type { Enums } from '@/types/database';

export type UnitsSystem = Enums<'units_system'>;
export type DoseRoute = Enums<'dose_route'>;
export type InventoryKind = Enums<'inventory_kind'>; // 'vial' | 'consumable'

/** Dosing cadence. 'custom' is free-text in notes for now (spec 03). */
export type Frequency = 'daily' | 'eod' | 'twice_weekly' | 'weekly' | 'as_needed' | 'custom';

/** A rolling daily check-in (one per date). Numeric 1–5 fields use the scale. */
export type CheckinEntry = {
  date: string; // YYYY-MM-DD (local)
  weight?: number;
  sleep_quality?: number;
  wellness?: number;
  appetite?: number;
  energy?: number;
  soreness?: number;
  workout_effort?: number;
  /** Standing "lifting felt" chip (2b.3): relative to this user's own normal.
   *  Distinct from workout_effort (absolute RPE) — this is the strength-held
   *  ground truth the photo analysis needs, and the user's override over any
   *  passive device fill. Snapshot-only for now (no normalized column). */
  strength_felt?: 'easier' | 'same' | 'harder';
  libido?: number;
  protein?: number; // grams (manual entry or autofilled from Health, spec 06)
  calories?: number; // kcal (manual entry or autofilled from Health, spec 06)
  skin_notes?: string;
  measurements?: string;
  // Structured measurements (paired with photos for AI context).
  waist?: number;
  hips?: number;
  neck?: number; // circumference, for the Navy body-fat estimate (spec 04)
  extraMeasurementKey?: 'chest' | 'arms' | 'thighs';
  extraMeasurementValue?: number;
  // Gain-goal circumference emphasis (W5-22): dedicated slots so a gainer can
  // track arms + chest + thighs together, not just one extra.
  chest?: number;
  arms?: number;
  thighs?: number;
  note?: string;
  /** Lab marker values from a photo import — marker slug → numeric reading. */
  labValues?: Record<string, number>;
  /** Fields whose current value was written by integration autofill (not typed by
   *  the user). Autofill keeps these in sync with later re-syncs of the same day;
   *  a manual edit removes the field so the user's value is never overwritten. */
  autoFilled?: string[];
  updatedAt: string;
};

/** Discrete timestamped side-effect/symptom event (spec 03). */
export type SymptomEvent = {
  id: string;
  type: string;
  onsetAt: string; // ISO
  durationMinutes?: number;
  severity?: number; // 1–5
  note?: string;
  updatedAt?: string; // ISO — for cross-device merge (last-write-wins)
};

/** A compound the user is taking, with dosing details (spec 03). */
export type ProtocolItem = {
  id: string;
  compoundSlug: string;
  dose?: number;
  doseUnit?: string; // mg, mcg, iu
  route?: DoseRoute;
  frequency?: Frequency;
  /** Explicit day-of-week schedule (0=Sun … 6=Sat). When set, supersedes
   *  the legacy `frequency` field for schedule calculations. */
  doseDays?: number[];
  /** Vial concentration (mg/mL) for reconstitution + dose→volume math. */
  concentration?: number;
  /** When the user actually started this compound (YYYY-MM-DD). Drives cycle-week
   * context for the AI so a mid-cycle joiner isn't treated as day 1 (spec 03/08). */
  startedAt?: string;
  /** Fixed reference day (YYYY-MM-DD) for interval schedules: slots are
   * anchor + N*interval (P-04). Set by the first on-grid log or by the user
   * choosing "shift schedule" on an off-slot dose. Never moved silently. */
  scheduleAnchor?: string;
  updatedAt?: string; // ISO — for cross-device merge (last-write-wins)
};

/** One set inside a strength session (weight in the user's unit, kg or lb). */
export type StrengthSet = { weight: number; reps: number };

/** A logged strength-training session (training log, W5-21). Sport-agnostic: a
 *  named movement + its sets; the engine derives tonnage + e1RM. */
export type StrengthSession = {
  id: string;
  date: string; // YYYY-MM-DD
  exercise: string;
  sets: StrengthSet[];
  note?: string;
  updatedAt?: string; // ISO — cross-device merge (last-write-wins)
};

/** A sport-agnostic benchmark result (training log, W5-21): a named test with a
 *  value, e.g. "5k" 25:30 stored as a string, "max pushups" 42, "vertical" 28in. */
export type Benchmark = {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  value: string; // freeform so time/reps/distance all fit one field
  unit?: string;
  note?: string;
  updatedAt?: string; // ISO — cross-device merge (last-write-wins)
};

/** A logged dose (tap-to-confirm from schedule, or manual — spec 03). */
export type DoseEvent = {
  id: string;
  protocolItemId?: string;
  compoundSlug?: string;
  takenAt: string; // ISO
  dose?: number;
  doseUnit?: string;
  site?: string; // injection-site rotation
  /** The schedule slot (YYYY-MM-DD) this dose fulfills, when the user assigned an
   * off-slot dose via the P-04 prompt. Unset = completes its nearest slot. */
  slotKey?: string;
  /** Deliberately outside the schedule (P-04 "extra dose"): completes no slot. */
  extra?: boolean;
  updatedAt?: string; // ISO — for cross-device merge (last-write-wins)
};

/** A vial or consumable on hand (spec 03). amountRemaining: mg for a vial,
 * count for a consumable (needles/swabs). Vials auto-decrement as doses log. */
export type InventoryItem = {
  id: string;
  kind: InventoryKind;
  compoundSlug?: string; // for vials
  label?: string; // for consumables / custom naming
  concentration?: number; // mg/mL
  amountRemaining?: number;
  /** Amount at creation/last refill — powers the depletion bar (P-02). */
  amountInitial?: number;
  unit?: string;
  lowThreshold?: number;
  expiry?: string; // YYYY-MM-DD
  vendor?: string; // PRIVATE — never surfaced on shared protocols (spec 14)
  updatedAt?: string; // ISO — for cross-device merge (last-write-wins)
};

/** A progress photo (spec 04 — the USP). One baseline per session type; the
 * ghost overlay aligns each new shot to the prior one. Capture metadata and AI
 * scores are filled in by later increments (sensors, vision edge function). */
export type PhotoSession = 'face' | 'body';
export type PhotoEntry = {
  id: string;
  session: PhotoSession;
  /** Custom "problem area" sub-track within a session (spec 04 §4A): e.g. belly,
   *  thighs, jawline. Undefined = the whole face/body track. Photos of the same
   *  (session, part) share a baseline/ghost chain. */
  part?: string;
  view?: 'front' | 'side'; // capture angle (spec 04 §4A); defaults to front
  uri: string; // local file uri (persistent copy)
  cloudPath?: string; // Supabase Storage path after upload (progress-photos bucket)
  takenAt: string; // ISO
  // Layer-1 capture metadata (spec 04) — optional until sensors/detection land.
  tilt?: number; // device pitch/roll delta from baseline (deg)
  luma?: number; // average brightness proxy (0–1)
  boxRatio?: number; // subject bbox vs frame (distance proxy)
  /** Composite capture-quality score (0–100) from photo-quality.ts, persisted at
   *  save time. Drives the quality-highscore reference promotion (PH-1). */
  qualityScore?: number;
  /** Clothing coverage from the vision service (PH-1): skin priority. `minimal`
   *  outranks `clothed` for the working reference, and once a minimal-coverage
   *  reference exists clothed captures never displace it (the soft lock). */
  coverage?: 'clothed' | 'partial' | 'minimal';
  // Layer-2 AI (spec 04) — filled on-demand by the vision service.
  driftScore?: number; // 0–1, lower = more comparable to baseline
  comparable?: boolean;
  lighting?: 'ok' | 'too_dark' | 'too_bright' | 'different'; // from vision response
  /** The vision service's hedged change note (spec 04). Persisted so Pepi can see
   *  photo results (P-3) and the timeline can show the last read. */
  changeNote?: string;
  /** Normalized subject box from the vision read, applied as a DISPLAY crop only
   *  (W6-28, beta-notes §1.2 "never destructive"). The stored file is never
   *  re-encoded, so a better box later can re-crop from the full frame. */
  cropBox?: CropBox;
  // User-edited tags (overrides auto-derived compound+week tags in Photo History).
  customTags?: string[];
  // ── Photo reel (W6-25, beta-notes §1.3) ──────────────────────────────────
  /** Canonical relaxed pose (front/side face, front/side body) or `other` for
   *  casual shots. Undefined = untagged (needs triage in the reel). In-app
   *  captures derive it from session+angle; imports are tagged manually (phase 1)
   *  or auto-classified (phase 2). */
  pose?: CanonicalPose;
  /** Classifier confidence for an auto-assigned pose (phase 2); absent when the
   *  pose was set manually or derived from an in-app capture. */
  poseConfidence?: number;
  /** True = one of the four locked poses on a required check-in (feeds analysis,
   *  ghost overlay, milestones). Casual reel photos are false/undefined. */
  isRequiredSet?: boolean;
};

/** A normalized reading ingested from an integration source (spec 06). The daily
 * log reads canonical metrics and never knows which provider supplied a value.
 * Mirrors the `metric_reading` table. `metric` is a canonical key (see
 * src/lib/integrations/types.ts), e.g. "body.weight", "sleep.duration". */
export type MetricReading = {
  id: string;
  metric: string;
  value: number;
  unit?: string;
  ts: string; // ISO timestamp of the reading
  sourceProvider: string; // provider id, e.g. "apple_health"
  confidence?: number; // 0–1
};

/** Per-provider connection state (local mirror of integration_connection). */
export type IntegrationState = {
  connectedAt?: string; // ISO when the user connected
  lastSyncAt?: string; // ISO of the last successful pull
  terraUserId?: string; // Terra-issued user id, captured from the Connect widget redirect
  /** Opt-in: mirror weight / body-fat % / waist back into this health store. */
  writeEnabled?: boolean;
  /** date (YYYY-MM-DD) -> hash of the body values last written back, so unchanged
   *  days aren't re-written (which would create duplicate Health samples). Seeded
   *  from existing check-ins when write-back is enabled, so only new/edited days
   *  mirror going forward (never echoes data imported *from* the store). */
  writtenHashes?: Record<string, string>;
};

/** A queued natural-language quick-log (spec 13). Submitted fire-and-forget so
 *  the user never waits on the AI: the runner (quick-log-runner.tsx) parses it in
 *  the background, applies confident items, and retries on failure. Persisted so a
 *  pending/failed job survives an app restart. */
export type QuickLogJob = {
  id: string;
  text: string;
  locale: string;
  dateKey: string; // day (YYYY-MM-DD) to log against — the day it was submitted
  createdAt: string; // ISO
  status: 'pending' | 'error' | 'done';
  attempts: number;
  nextRetryAt?: string; // ISO — set on error for backoff
  summary?: string; // on done: the AI's short confirmation (already localized)
  appliedCount?: number;
  skippedCount?: number;
};

/** One turn in the Pepi chat thread (redesign R2-F). Persisted lightly so the
 *  tab is not amnesiac; the undo affordance for `log` replies is session-only. */
export type PepiMessage = {
  id: string;
  role: 'user' | 'pepi';
  ts: string; // ISO
  text: string;
  /** Pepi reply shape: a logged-data confirmation, a data answer, or a hint/error. */
  variant?: 'log' | 'answer' | 'hint' | 'error';
  /** When set, the bubble renders a live sparkline for this charted metric id
   *  (P-2). Stored light: the series is re-derived from the store at render. */
  metricId?: string;
};

export type ThemePreference = 'light' | 'dark' | 'auto';
export type Sex = 'male' | 'female' | 'ftm' | 'mtf';

export type LocalProfile = {
  units: UnitsSystem;
  goals: Goal[];
  compoundSlugs: string[];
  onboardingComplete: boolean;
  /** Appearance override; 'auto' follows the device (D-01). */
  themePreference?: ThemePreference;
  /** Birth/transition sex — drives cycle relevance + AI change context (O-02). */
  sex?: Sex;
  // ── "Me" profile (R3-B) — identity + body baselines shown on the Me page. ──
  /** Display name (optional; used in reports + greetings). */
  displayName?: string;
  /** Persisted language override; applied on store-ready. Undefined = follow device. */
  language?: string;
  /** Height in the user's unit system (cm or in). */
  height?: number;
  /** Baseline weight in the user's unit (kg or lb); prefilled from latest check-in. */
  weightBaseline?: number;
  /** Goal weight in the user's unit; drives the Home hero's mild days-to-target
   *  projection (verdict-first redesign). Optional — no projection until set. */
  targetWeight?: number;
  /** Body-fat percentage (optional baseline). */
  bodyFatPct?: number;
  /** Metric keys the user pinned to the Today dashboard charts (H-01). */
  dashboardMetrics?: string[];
  /** How estimated (wearable-derived) metric values appear on charts:
   *  'fill' = only on days with no manual entry (default), 'always' = plotted
   *  alongside the subjective series, 'off' = never. */
  estimatedMetricsMode?: 'off' | 'fill' | 'always';
  /** Dismissed the "add your first compound" soft prompt (O-04). */
  dismissedAddCompoundPrompt?: boolean;
  /** Share-card branding (W6-27). The stat card carries the wordmark by default
   *  (it is promotional); an exported photo does not (it is personal). Both are
   *  user-overridable in settings. */
  watermarkStatCard?: boolean;
  watermarkPhoto?: boolean;
  /** End-of-day macro reminder (H-05). */
  notifyMacrosEnabled?: boolean;
  notifyMacroTime?: string; // default "20:00"
  /** Manual "customize what I log" overrides on top of the surfaced defaults (spec 02). */
  addedFields: CheckinField[];
  removedFields: CheckinField[];
  // M5 — privacy/consent (spec 11). Separate opt-ins per surface, stored with timestamp.
  dobISO?: string; // date of birth ISO string
  isAgeVerified?: boolean; // derived from DOB at consent time; stored so we don't re-derive
  consentPhotoStorage?: boolean; // explicit consent to store progress photos (spec 11)
  consentPhotoAI?: boolean; // explicit consent for AI analysis of photos (spec 04/11)
  consentCommunity?: boolean; // opt-in to anonymized community contribution (spec 07/11)
  consentTimestamp?: string; // ISO — when the consent batch was recorded
  // Photo milestone scheduling — ISO dates for next Haiku/Sonnet analysis per session.
  nextFaceEncouragementAt?: string;
  nextFaceScientificAt?: string;
  nextBodyEncouragementAt?: string;
  nextBodyScientificAt?: string;
  // Cycle modifier for female users (luteal-phase water-retention flag).
  lastPeriodDate?: string; // YYYY-MM-DD
  cycleLength?: number; // default 28
  /** User wants their cycle accounted for, INDEPENDENT of whether a start date
   *  is known yet. Split out because the onboarding opt-in used to stamp *today*
   *  as the last period, which is right only for someone on day 1 and silently
   *  wrong by up to a month for everyone else. */
  cycleTracking?: boolean;
  /** One-time Pepi setup bookkeeping (asked / declined / active), same pattern as
   *  `typicalPromptState`: a decline is remembered so it never asks twice. */
  cyclePromptState?: CyclePromptState;
  /** Post-onboarding setup cards the user has dismissed (goals / health). Both
   *  settings stay reachable from Settings; this only stops Home re-nagging. */
  setupDismissed?: string[];
  // Body type calibration passed to vision AI for accurate composition assessment.
  bodyType?: string;
  /** User-defined custom "problem area" photo tracks within the body session
   *  (spec 04 §4A), e.g. ["belly", "thighs"]. */
  customPhotoParts?: string[];
  /** Measurement guide-line positions (2a.7), normalized 0..1 down the photo, per
   *  measurement key. The whole point is CONSISTENCY: the user wraps the tape at
   *  the same anatomical spot every session, so the trend is signal not noise.
   *  Seeded from the default anatomical map, then adjusted by dragging. */
  measureGuides?: Record<string, number>;
  /** How much Pepi weighs in (beta-notes §3.6): explicit user choice. Absent =
   *  adaptively inferred (observe/nudge only; coach is never inferred). */
  coachingLevel?: 'observe' | 'nudge' | 'coach';
  /** Anomaly kinds the user said "stop asking about" (W3-10). */
  anomalyMuted?: string[];
  // M5 — local notification preferences (spec 06 reminders). Times are "HH:mm" 24h.
  notifyCheckinEnabled?: boolean;
  notifyCheckinTime?: string; // default "20:00"
  /** Morning micro check-in (beta-notes §4.1): a second scheduled chat moment. */
  notifyMorningEnabled?: boolean;
  notifyMorningTime?: string; // default "08:30"
  notifyDosesEnabled?: boolean;
  notifyDoseTime?: string; // default "09:00"
  notifyInventoryEnabled?: boolean;
  notifyPhotosEnabled?: boolean;
  /** Last day (YYYY-MM-DD) an inventory-attention notification fired — dedupes the foreground check. */
  inventoryNotifiedOn?: string;
  /** P-05 skip-doses nudge dedup: protocol item id → day (YYYY-MM-DD) the nudge
   *  last fired. Re-arms after a new dose for the item or 7 days. */
  skipNudgedOn?: Record<string, string>;
  // Typical-day baselines (spec 15): one-time "normal day" values per repetitive
  // metric group, so the log can collapse to usual/less/more chips.
  typicalBaselines?: TypicalBaseline[];
  /** Per-group prompt lifecycle so the one-time nudge is asked at most once. */
  typicalPromptState?: Partial<Record<TypicalGroup, TypicalPromptStatus>>;
  // Areas the user asked Pepi to watch in photos, in their own words (block 7).
  // Free text by design: skin and problem areas are user-specific, so there is
  // no fixed vocabulary to pick from. Fed straight into the vision context.
  focusAreas?: string[];
  /** Lifecycle for the one-time "where should I watch?" ask, so it fires once. */
  focusAreaPromptState?: 'asked' | 'declined' | 'set';
  /** Post-sync reconciliation queue (2b.5): fields a connected health source was
   *  expected to cover today and didn't, so Pepi can follow up instead of the
   *  user discovering the gap. Scoped to one day and rebuilt on each sync, so a
   *  stale queue can never outlive the day it was about. */
  pendingAsks?: { date: string; fields: CheckinField[]; asked?: CheckinField[] };
};

/** A structured user explanation of an off day (beta-notes §3.4 context memory,
 * W3-10): "ceramics class, dust, clogged nose". Future detector hits check these
 * first, the insights prompt reads them, and explained days are excluded from
 * rolling baselines so one weird day never drags the user's "normal". */
export type ContextNote = {
  id: string;
  dateKey: string; // the day being explained (YYYY-MM-DD)
  metric?: string; // affected metric/field, when known
  explanation: string;
  createdAt: string; // ISO
};

export type PersistedState = {
  version: 1;
  profile: LocalProfile;
  entries: Record<string, CheckinEntry>; // keyed by date
  contextNotes: ContextNote[];
  symptomEvents: SymptomEvent[];
  protocolItems: ProtocolItem[];
  doseEvents: DoseEvent[];
  inventory: InventoryItem[];
  photos: PhotoEntry[];
  metricReadings: MetricReading[];
  integrations: Record<string, IntegrationState>;
  /** User-created compounds not in the bundled catalog (O-04). */
  customCompounds: CatalogCompound[];
  /** Background natural-language quick-log queue (spec 13). */
  quickLogJobs: QuickLogJob[];
  /** Pepi chat thread, trimmed to the last N messages (redesign R2-F). */
  pepiMessages: PepiMessage[];
  /** Strength sessions + benchmarks (training log, W5-21). */
  strengthSessions: StrengthSession[];
  benchmarks: Benchmark[];
  /** How many quick-logs each parse path handled (F3). Diagnostic only: it tells
   *  us what share of real traffic the free local matcher covers, so the AI-call
   *  budget is measured rather than guessed. Never shown to the user. */
  quickLogPathCounts?: { deterministic: number; ai: number };
  /** Observation ledger (F5): structured findings from each scientific photo
   *  analysis, per track — the analysis's longitudinal memory. Local-first +
   *  snapshot sync like everything else; never in community aggregates. */
  analysisLedger?: AnalysisRecord[];
};

/** Manual check-in nutrition field → its canonical metric (for precedence cleanup). */
const CHECKIN_FIELD_TO_METRIC: Record<'calories' | 'protein', string> = {
  calories: 'nutrition.energy',
  protein: 'nutrition.protein',
};

/** Convert a dose to mg for inventory decrement. IU can't be converted → null. */
function doseToMg(dose: number | undefined, unit: string | undefined): number | null {
  if (dose == null || !Number.isFinite(dose)) return null;
  if (unit === 'mcg') return dose / 1000;
  if (unit === 'mg' || unit == null) return dose;
  return null; // iu and others: not mass-convertible
}

const STORAGE_KEY = 'pepi.store.v1';

const EMPTY_STATE: PersistedState = {
  version: 1,
  profile: {
    units: 'metric',
    goals: [],
    compoundSlugs: [],
    onboardingComplete: false,
    addedFields: [],
    removedFields: [],
  },
  entries: {},
  contextNotes: [],
  symptomEvents: [],
  protocolItems: [],
  doseEvents: [],
  inventory: [],
  photos: [],
  metricReadings: [],
  integrations: {},
  customCompounds: [],
  quickLogJobs: [],
  pepiMessages: [],
  strengthSessions: [],
  benchmarks: [],
};

/** How many Pepi chat turns to retain (redesign R2-F: last N, lightly persisted). */
const PEPI_HISTORY_LIMIT = 40;

/** Local date as YYYY-MM-DD — canonical definition moved to dates.ts (so
 *  integration providers can use it without importing the store); re-exported
 *  here for the many existing importers. */
export { localDateKey };

/** Local id for offline-created rows; mapped to a DB uuid on sync (spec 10). */
function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type StoreContextValue = {
  /** False until the persisted state has been loaded from disk. */
  ready: boolean;
  profile: LocalProfile;
  entries: Record<string, CheckinEntry>;
  contextNotes: ContextNote[];
  symptomEvents: SymptomEvent[];
  protocolItems: ProtocolItem[];
  doseEvents: DoseEvent[];
  inventory: InventoryItem[];
  photos: PhotoEntry[];
  metricReadings: MetricReading[];
  integrations: Record<string, IntegrationState>;
  customCompounds: CatalogCompound[];
  quickLogJobs: QuickLogJob[];
  pepiMessages: PepiMessage[];
  strengthSessions: StrengthSession[];
  benchmarks: Benchmark[];
  /** Queue a natural-language quick-log for background parsing; returns its id. */
  enqueueQuickLog: (text: string, locale: string) => string;
  updateQuickLogJob: (id: string, patch: Partial<QuickLogJob>) => void;
  removeQuickLogJob: (id: string) => void;
  /** Tally which parse path handled a quick-log (F3 diagnostic, never shown). */
  recordQuickLogPath: (path: 'deterministic' | 'ai') => void;
  /** Observation ledger (F5), oldest → newest. */
  analysisLedger: AnalysisRecord[];
  /** Persist one scientific analysis's findings; returns the record id. */
  addAnalysisRecord: (record: Omit<AnalysisRecord, 'id'>) => string;
  /** Append a Pepi chat turn (trimmed to the last N); returns its id (R2-F). */
  addPepiMessage: (msg: Omit<PepiMessage, 'id' | 'ts'>) => string;
  clearPepiMessages: () => void;
  setProfile: (patch: Partial<LocalProfile>) => void;
  completeOnboarding: () => void;
  /** Add a user-created compound (O-04). */
  addCustomCompound: (compound: CatalogCompound) => void;
  /** Create or update the check-in for a date (merge patch). */
  upsertCheckin: (date: string, patch: Partial<Omit<CheckinEntry, 'date' | 'updatedAt'>>) => void;
  /** Store a context-memory note (W3-10); returns its id. */
  addContextNote: (note: Omit<ContextNote, 'id' | 'createdAt'>) => string;
  deleteContextNote: (id: string) => void;
  /** Returns the new event's id (so callers can offer undo). */
  addSymptomEvent: (event: Omit<SymptomEvent, 'id'>) => string;
  /** Training log (W5-21): add/remove strength sessions + benchmarks; adds return the new id. */
  addStrengthSession: (session: Omit<StrengthSession, 'id'>) => string;
  deleteStrengthSession: (id: string) => void;
  addBenchmark: (benchmark: Omit<Benchmark, 'id'>) => string;
  deleteBenchmark: (id: string) => void;
  deleteSymptomEvent: (id: string) => void;
  addProtocolItem: (item: Omit<ProtocolItem, 'id'>) => void;
  updateProtocolItem: (id: string, patch: Partial<Omit<ProtocolItem, 'id'>>) => void;
  removeProtocolItem: (id: string) => void;
  /** Returns the new dose's id (so callers can offer undo). */
  logDose: (dose: Omit<DoseEvent, 'id'>) => string;
  /** Patch a logged dose (P-04: assign an off-slot dose to a slot / mark extra). */
  updateDose: (id: string, patch: Partial<Omit<DoseEvent, 'id'>>) => void;
  deleteDose: (id: string) => void;
  addInventoryItem: (item: Omit<InventoryItem, 'id'>) => void;
  updateInventoryItem: (id: string, patch: Partial<Omit<InventoryItem, 'id'>>) => void;
  removeInventoryItem: (id: string) => void;
  /** Returns the new photo's id. */
  addPhoto: (photo: Omit<PhotoEntry, 'id'>) => string;
  updatePhoto: (id: string, patch: Partial<Omit<PhotoEntry, 'id'>>) => void;
  deletePhoto: (id: string) => void;
  /** Bulk-ingest canonical readings from an integration; dedupes by provider+metric+ts (spec 06). */
  addMetricReadings: (readings: Omit<MetricReading, 'id'>[]) => void;
  // ── Typical-day baselines (spec 15) ──
  /** Create/replace the baseline for a group (enables it). */
  setTypicalBaseline: (baseline: TypicalBaseline) => void;
  /** Patch a group's baseline (e.g. toggle enabled, edit values). No-op if absent. */
  updateTypicalBaseline: (group: TypicalGroup, patch: Partial<TypicalBaseline>) => void;
  /** Record the daily deviation chip for a group on a date; replaces prior typical
   *  readings for that date and honors precedence (manual/synced win). */
  recordTypicalDeviation: (group: TypicalGroup, date: string, level: TypicalLevel) => void;
  /** Silent "usual" fill for any enabled group with no value on a date (conf 0.3). */
  silentFillTypical: (date: string) => void;
  /** Delete all estimated (typical) readings for a group. */
  clearTypicalHistory: (group: TypicalGroup) => void;
  /** Set a group's one-time prompt status (notified/asked/declined/active). */
  setTypicalPromptState: (group: TypicalGroup, status: TypicalPromptStatus) => void;
  /** Patch a provider's connection state (connect/disconnect/last-sync). */
  setIntegration: (provider: string, patch: Partial<IntegrationState>) => void;
  /** GDPR erasure: wipes all local data and resets to the empty state (spec 11). */
  resetStore: () => void;
  /** Returns a snapshot of the full persisted state (used by the sync engine). */
  exportState: () => PersistedState;
  /** Replaces the full local state (used when pulling data from cloud on sign-in). */
  replaceState: (next: PersistedState) => void;
};

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(EMPTY_STATE);
  const [ready, setReady] = useState(false);
  // Avoid persisting the empty placeholder before the initial load resolves.
  const loaded = useRef(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!active) return;
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as Partial<PersistedState>;
            // Merge over defaults so older blobs missing newer keys still load.
            setState({
              ...EMPTY_STATE,
              ...parsed,
              profile: { ...EMPTY_STATE.profile, ...parsed.profile },
            });
          } catch {
            // Corrupt blob — start clean rather than wedge the app.
          }
        }
      })
      .finally(() => {
        if (!active) return;
        loaded.current = true;
        setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Persist on every change once the initial load has completed.
  useEffect(() => {
    if (!loaded.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {
      // Best-effort; a failed write retries on the next mutation.
    });
  }, [state]);

  // Mirror custom compounds into the catalog registry so compoundBySlug /
  // field-surfacing resolve them (O-04).
  useEffect(() => {
    registerCustomCompounds(state.customCompounds);
  }, [state.customCompounds]);

  const setProfile = useCallback((patch: Partial<LocalProfile>) => {
    setState((s) => ({ ...s, profile: { ...s.profile, ...patch } }));
  }, []);

  const completeOnboarding = useCallback(() => {
    setState((s) => ({ ...s, profile: { ...s.profile, onboardingComplete: true } }));
  }, []);

  const resetStore = useCallback(() => {
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    setState(EMPTY_STATE);
  }, []);

  const exportState = useCallback((): PersistedState => state, [state]);

  const replaceState = useCallback((next: PersistedState) => {
    setState(next);
  }, []);

  const upsertCheckin = useCallback<StoreContextValue['upsertCheckin']>((date, patch) => {
    setState((s) => {
      const existing = s.entries[date];
      const next: CheckinEntry = {
        ...existing,
        ...patch,
        date,
        updatedAt: new Date().toISOString(),
      };
      // Precedence (spec 15, decision 8): a manual nutrition number supersedes any
      // typical estimate for that metric/day: drop the estimate so it can't double-
      // count on the charts/verdict.
      let metricReadings = s.metricReadings;
      for (const field of ['calories', 'protein'] as const) {
        if (field in patch && typeof patch[field] === 'number') {
          metricReadings = withoutTypicalMetric(metricReadings, CHECKIN_FIELD_TO_METRIC[field], date);
        }
      }
      return { ...s, entries: { ...s.entries, [date]: next }, metricReadings };
    });
  }, []);

  const addContextNote = useCallback<StoreContextValue['addContextNote']>((note) => {
    const id = uid();
    setState((s) => ({
      ...s,
      contextNotes: [{ ...note, id, createdAt: new Date().toISOString() }, ...s.contextNotes],
    }));
    return id;
  }, []);

  const deleteContextNote = useCallback((id: string) => {
    setState((s) => ({ ...s, contextNotes: s.contextNotes.filter((n) => n.id !== id) }));
  }, []);

  const addSymptomEvent = useCallback<StoreContextValue['addSymptomEvent']>((event) => {
    const id = uid();
    setState((s) => ({ ...s, symptomEvents: [{ ...event, id }, ...s.symptomEvents] }));
    return id;
  }, []);

  const deleteSymptomEvent = useCallback((id: string) => {
    setState((s) => ({ ...s, symptomEvents: s.symptomEvents.filter((e) => e.id !== id) }));
  }, []);

  const addStrengthSession = useCallback<StoreContextValue['addStrengthSession']>((session) => {
    const id = uid();
    setState((s) => ({ ...s, strengthSessions: [{ ...session, id }, ...s.strengthSessions] }));
    return id;
  }, []);

  const deleteStrengthSession = useCallback((id: string) => {
    setState((s) => ({ ...s, strengthSessions: s.strengthSessions.filter((x) => x.id !== id) }));
  }, []);

  const addBenchmark = useCallback<StoreContextValue['addBenchmark']>((benchmark) => {
    const id = uid();
    setState((s) => ({ ...s, benchmarks: [{ ...benchmark, id }, ...s.benchmarks] }));
    return id;
  }, []);

  const deleteBenchmark = useCallback((id: string) => {
    setState((s) => ({ ...s, benchmarks: s.benchmarks.filter((x) => x.id !== id) }));
  }, []);

  const addProtocolItem = useCallback<StoreContextValue['addProtocolItem']>((item) => {
    setState((s) => {
      // Keep field-surfacing in sync: a protocol compound must surface its tags.
      const compoundSlugs = s.profile.compoundSlugs.includes(item.compoundSlug)
        ? s.profile.compoundSlugs
        : [...s.profile.compoundSlugs, item.compoundSlug];
      return {
        ...s,
        profile: { ...s.profile, compoundSlugs },
        protocolItems: [...s.protocolItems, { ...item, id: uid() }],
      };
    });
  }, []);

  const updateProtocolItem = useCallback<StoreContextValue['updateProtocolItem']>((id, patch) => {
    setState((s) => ({
      ...s,
      protocolItems: s.protocolItems.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }, []);

  const removeProtocolItem = useCallback((id: string) => {
    setState((s) => ({ ...s, protocolItems: s.protocolItems.filter((p) => p.id !== id) }));
  }, []);

  const logDose = useCallback<StoreContextValue['logDose']>((dose) => {
    const id = uid();
    setState((s) => {
      // Auto-decrement inventory as a dose is logged (spec 03):
      //  • the matching vial by dose-in-mg,
      //  • the first consumable with stock by 1 (a pin/swab per injection).
      const doseMg = doseToMg(dose.dose, dose.doseUnit);
      const vialIdx =
        doseMg != null && dose.compoundSlug
          ? s.inventory.findIndex(
              (i) =>
                i.kind === 'vial' &&
                i.compoundSlug === dose.compoundSlug &&
                i.amountRemaining != null,
            )
          : -1;
      const consumableIdx = s.inventory.findIndex(
        (i) => i.kind === 'consumable' && (i.amountRemaining ?? 0) > 0,
      );
      const inventory = s.inventory.map((i, k) => {
        if (k === vialIdx && doseMg != null) {
          return { ...i, amountRemaining: Math.max(0, (i.amountRemaining ?? 0) - doseMg) };
        }
        if (k === consumableIdx) {
          return { ...i, amountRemaining: Math.max(0, (i.amountRemaining ?? 0) - 1) };
        }
        return i;
      });
      return { ...s, doseEvents: [{ ...dose, id }, ...s.doseEvents], inventory };
    });
    return id;
  }, []);

  const updateDose = useCallback<StoreContextValue['updateDose']>((id, patch) => {
    setState((s) => ({
      ...s,
      doseEvents: s.doseEvents.map((d) =>
        d.id === id ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d,
      ),
    }));
  }, []);

  const deleteDose = useCallback((id: string) => {
    setState((s) => ({ ...s, doseEvents: s.doseEvents.filter((d) => d.id !== id) }));
  }, []);

  const addInventoryItem = useCallback<StoreContextValue['addInventoryItem']>((item) => {
    setState((s) => ({ ...s, inventory: [...s.inventory, { ...item, id: uid() }] }));
  }, []);

  const updateInventoryItem = useCallback<StoreContextValue['updateInventoryItem']>(
    (id, patch) => {
      setState((s) => ({
        ...s,
        inventory: s.inventory.map((i) => (i.id === id ? { ...i, ...patch } : i)),
      }));
    },
    [],
  );

  const removeInventoryItem = useCallback((id: string) => {
    setState((s) => ({ ...s, inventory: s.inventory.filter((i) => i.id !== id) }));
  }, []);

  const addPhoto = useCallback<StoreContextValue['addPhoto']>((photo) => {
    const id = uid();
    setState((s) => ({ ...s, photos: [{ ...photo, id }, ...s.photos] }));
    return id;
  }, []);

  const updatePhoto = useCallback<StoreContextValue['updatePhoto']>((id, patch) => {
    setState((s) => ({ ...s, photos: s.photos.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  }, []);

  const deletePhoto = useCallback((id: string) => {
    setState((s) => ({ ...s, photos: s.photos.filter((p) => p.id !== id) }));
  }, []);

  const addMetricReadings = useCallback<StoreContextValue['addMetricReadings']>((readings) => {
    if (readings.length === 0) return;
    setState((s) => {
      // Upsert semantics (master-plan W1-1): a reading with the same
      // provider|metric|ts key REPLACES the stored value when it changed, instead
      // of being dropped. Daily aggregates (nutrition, steps, energy) all carry a
      // midnight ts, so the old dedup froze each day at its first-synced partial
      // total and every later re-sync of the growing total was silently discarded.
      const key = (r: Pick<MetricReading, 'sourceProvider' | 'metric' | 'ts'>) =>
        `${r.sourceProvider}|${r.metric}|${r.ts}`;
      const indexByKey = new Map<string, number>();
      s.metricReadings.forEach((r, i) => indexByKey.set(key(r), i));
      let updated: MetricReading[] | null = null; // copy-on-write of the stored list
      const addedByKey = new Map<string, MetricReading>();
      for (const r of readings) {
        const k = key(r);
        const idx = indexByKey.get(k);
        if (idx !== undefined) {
          const cur = (updated ?? s.metricReadings)[idx];
          if (cur.value !== r.value || cur.unit !== r.unit || cur.confidence !== r.confidence) {
            if (!updated) updated = [...s.metricReadings];
            updated[idx] = { ...cur, ...r, id: cur.id };
          }
        } else {
          // Within-batch duplicate keys: last one wins, keep a stable id.
          addedByKey.set(k, { ...r, id: addedByKey.get(k)?.id ?? uid() });
        }
      }
      const added = [...addedByKey.values()];
      if (!updated && added.length === 0) return s;
      return { ...s, metricReadings: [...added, ...(updated ?? s.metricReadings)] };
    });
  }, []);

  // ── Typical-day baselines (spec 15) ──────────────────────────────────────────
  const setTypicalBaseline = useCallback<StoreContextValue['setTypicalBaseline']>((baseline) => {
    setState((s) => {
      const others = (s.profile.typicalBaselines ?? []).filter((b) => b.group !== baseline.group);
      return {
        ...s,
        profile: {
          ...s.profile,
          typicalBaselines: [...others, baseline],
          typicalPromptState: { ...s.profile.typicalPromptState, [baseline.group]: 'active' },
        },
      };
    });
  }, []);

  const updateTypicalBaseline = useCallback<StoreContextValue['updateTypicalBaseline']>(
    (group, patch) => {
      setState((s) => {
        const list = s.profile.typicalBaselines ?? [];
        if (!list.some((b) => b.group === group)) return s;
        return {
          ...s,
          profile: {
            ...s.profile,
            typicalBaselines: list.map((b) => (b.group === group ? { ...b, ...patch } : b)),
          },
        };
      });
    },
    [],
  );

  const recordTypicalDeviation = useCallback<StoreContextValue['recordTypicalDeviation']>(
    (group, date, level) => {
      setState((s) => {
        const baseline = baselineFor(s.profile.typicalBaselines, group);
        if (!baseline) return s;
        const entry = s.entries[date];
        const cleared = withoutTypicalForDate(s.metricReadings, group, date);
        const added = buildTypicalReadings({
          baseline,
          dateKey: date,
          level,
          confidence: TYPICAL_TAP_CONFIDENCE,
          readings: cleared,
          checkinValues: { calories: entry?.calories, protein: entry?.protein },
        }).map((r) => ({ ...r, id: uid() }));
        return { ...s, metricReadings: [...added, ...cleared] };
      });
    },
    [],
  );

  const silentFillTypical = useCallback<StoreContextValue['silentFillTypical']>((date) => {
    setState((s) => {
      let readings = s.metricReadings;
      let changed = false;
      const entry = s.entries[date];
      const checkinValues = { calories: entry?.calories, protein: entry?.protein };
      for (const group of TYPICAL_GROUP_ORDER) {
        const baseline = baselineFor(s.profile.typicalBaselines, group);
        if (!baseline) continue;
        if (groupHasValueForDate({ group, dateKey: date, readings, checkinValues })) continue;
        const added = buildTypicalReadings({
          baseline,
          dateKey: date,
          level: 'usual',
          confidence: TYPICAL_SILENT_CONFIDENCE,
          readings,
          checkinValues,
        }).map((r) => ({ ...r, id: uid() }));
        if (added.length) {
          readings = [...added, ...readings];
          changed = true;
        }
      }
      return changed ? { ...s, metricReadings: readings } : s;
    });
  }, []);

  const clearTypicalHistory = useCallback<StoreContextValue['clearTypicalHistory']>((group) => {
    setState((s) => ({ ...s, metricReadings: withoutTypicalForGroup(s.metricReadings, group) }));
  }, []);

  const setTypicalPromptState = useCallback<StoreContextValue['setTypicalPromptState']>(
    (group, status) => {
      setState((s) => ({
        ...s,
        profile: {
          ...s.profile,
          typicalPromptState: { ...s.profile.typicalPromptState, [group]: status },
        },
      }));
    },
    [],
  );

  const setIntegration = useCallback<StoreContextValue['setIntegration']>((provider, patch) => {
    setState((s) => ({
      ...s,
      integrations: { ...s.integrations, [provider]: { ...s.integrations[provider], ...patch } },
    }));
  }, []);

  const addCustomCompound = useCallback<StoreContextValue['addCustomCompound']>((compound) => {
    setState((s) =>
      s.customCompounds.some((c) => c.slug === compound.slug)
        ? s
        : { ...s, customCompounds: [...s.customCompounds, compound] },
    );
  }, []);

  const enqueueQuickLog = useCallback<StoreContextValue['enqueueQuickLog']>((text, locale) => {
    const id = uid();
    const job: QuickLogJob = {
      id,
      text,
      locale,
      dateKey: localDateKey(),
      createdAt: new Date().toISOString(),
      status: 'pending',
      attempts: 0,
    };
    setState((s) => ({ ...s, quickLogJobs: [...s.quickLogJobs, job] }));
    return id;
  }, []);

  const updateQuickLogJob = useCallback<StoreContextValue['updateQuickLogJob']>((id, patch) => {
    setState((s) => ({
      ...s,
      quickLogJobs: s.quickLogJobs.map((j) => (j.id === id ? { ...j, ...patch } : j)),
    }));
  }, []);

  const removeQuickLogJob = useCallback<StoreContextValue['removeQuickLogJob']>((id) => {
    setState((s) => ({ ...s, quickLogJobs: s.quickLogJobs.filter((j) => j.id !== id) }));
  }, []);

  const recordQuickLogPath = useCallback<StoreContextValue['recordQuickLogPath']>((path) => {
    setState((s) => {
      const counts = s.quickLogPathCounts ?? { deterministic: 0, ai: 0 };
      return { ...s, quickLogPathCounts: { ...counts, [path]: counts[path] + 1 } };
    });
  }, []);

  const addAnalysisRecord = useCallback<StoreContextValue['addAnalysisRecord']>((record) => {
    const id = uid();
    setState((s) => ({
      ...s,
      analysisLedger: appendToLedger(s.analysisLedger ?? [], { ...record, id }),
    }));
    return id;
  }, []);

  const addPepiMessage = useCallback<StoreContextValue['addPepiMessage']>((msg) => {
    const id = uid();
    const full: PepiMessage = { ...msg, id, ts: new Date().toISOString() };
    setState((s) => ({ ...s, pepiMessages: [...s.pepiMessages, full].slice(-PEPI_HISTORY_LIMIT) }));
    return id;
  }, []);

  const clearPepiMessages = useCallback<StoreContextValue['clearPepiMessages']>(() => {
    setState((s) => ({ ...s, pepiMessages: [] }));
  }, []);

  const value = useMemo<StoreContextValue>(
    () => ({
      ready,
      profile: state.profile,
      entries: state.entries,
      contextNotes: state.contextNotes,
      symptomEvents: state.symptomEvents,
      protocolItems: state.protocolItems,
      doseEvents: state.doseEvents,
      inventory: state.inventory,
      photos: state.photos,
      metricReadings: state.metricReadings,
      integrations: state.integrations,
      customCompounds: state.customCompounds,
      quickLogJobs: state.quickLogJobs,
      pepiMessages: state.pepiMessages,
      strengthSessions: state.strengthSessions,
      benchmarks: state.benchmarks,
      analysisLedger: state.analysisLedger ?? [],
      addAnalysisRecord,
      enqueueQuickLog,
      updateQuickLogJob,
      removeQuickLogJob,
      recordQuickLogPath,
      addPepiMessage,
      clearPepiMessages,
      setProfile,
      completeOnboarding,
      addCustomCompound,
      upsertCheckin,
      addContextNote,
      deleteContextNote,
      addSymptomEvent,
      deleteSymptomEvent,
      addStrengthSession,
      deleteStrengthSession,
      addBenchmark,
      deleteBenchmark,
      addProtocolItem,
      updateProtocolItem,
      removeProtocolItem,
      logDose,
      updateDose,
      deleteDose,
      addInventoryItem,
      updateInventoryItem,
      removeInventoryItem,
      addPhoto,
      updatePhoto,
      deletePhoto,
      addMetricReadings,
      setTypicalBaseline,
      updateTypicalBaseline,
      recordTypicalDeviation,
      silentFillTypical,
      clearTypicalHistory,
      setTypicalPromptState,
      setIntegration,
      resetStore,
      exportState,
      replaceState,
    }),
    [
      ready,
      state,
      addAnalysisRecord,
      enqueueQuickLog,
      updateQuickLogJob,
      removeQuickLogJob,
      recordQuickLogPath,
      addPepiMessage,
      clearPepiMessages,
      setProfile,
      completeOnboarding,
      addCustomCompound,
      upsertCheckin,
      addContextNote,
      deleteContextNote,
      addSymptomEvent,
      deleteSymptomEvent,
      addStrengthSession,
      deleteStrengthSession,
      addBenchmark,
      deleteBenchmark,
      addProtocolItem,
      updateProtocolItem,
      removeProtocolItem,
      logDose,
      updateDose,
      deleteDose,
      addInventoryItem,
      updateInventoryItem,
      removeInventoryItem,
      addPhoto,
      updatePhoto,
      deletePhoto,
      addMetricReadings,
      setTypicalBaseline,
      updateTypicalBaseline,
      recordTypicalDeviation,
      silentFillTypical,
      clearTypicalHistory,
      setTypicalPromptState,
      setIntegration,
      resetStore,
      exportState,
      replaceState,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within a StoreProvider');
  return ctx;
}
