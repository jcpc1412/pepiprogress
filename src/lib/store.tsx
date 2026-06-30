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
import type { CheckinField, Goal } from '@/lib/field-surfacing';
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
  libido?: number;
  protein?: number; // grams (manual entry or autofilled from Health, spec 06)
  calories?: number; // kcal (manual entry or autofilled from Health, spec 06)
  skin_notes?: string;
  measurements?: string;
  // Structured measurements (paired with photos for AI context).
  waist?: number;
  hips?: number;
  extraMeasurementKey?: 'chest' | 'arms' | 'thighs';
  extraMeasurementValue?: number;
  note?: string;
  /** Lab marker values from a photo import — marker slug → numeric reading. */
  labValues?: Record<string, number>;
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
  updatedAt?: string; // ISO — for cross-device merge (last-write-wins)
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
  uri: string; // local file uri (persistent copy)
  cloudPath?: string; // Supabase Storage path after upload (progress-photos bucket)
  takenAt: string; // ISO
  // Layer-1 capture metadata (spec 04) — optional until sensors/detection land.
  tilt?: number; // device pitch/roll delta from baseline (deg)
  luma?: number; // average brightness proxy (0–1)
  boxRatio?: number; // subject bbox vs frame (distance proxy)
  // Layer-2 AI (spec 04) — filled on-demand by the vision service.
  driftScore?: number; // 0–1, lower = more comparable to baseline
  comparable?: boolean;
  lighting?: 'ok' | 'too_dark' | 'too_bright' | 'different'; // from vision response
  // User-edited tags (overrides auto-derived compound+week tags in Photo History).
  customTags?: string[];
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
  /** Body-fat percentage (optional baseline). */
  bodyFatPct?: number;
  /** Metric keys the user pinned to the Today dashboard charts (H-01). */
  dashboardMetrics?: string[];
  /** Dismissed the "add your first compound" soft prompt (O-04). */
  dismissedAddCompoundPrompt?: boolean;
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
  // Body type calibration passed to vision AI for accurate composition assessment.
  bodyType?: string;
  // M5 — local notification preferences (spec 06 reminders). Times are "HH:mm" 24h.
  notifyCheckinEnabled?: boolean;
  notifyCheckinTime?: string; // default "20:00"
  notifyDosesEnabled?: boolean;
  notifyDoseTime?: string; // default "09:00"
  notifyInventoryEnabled?: boolean;
  notifyPhotosEnabled?: boolean;
  /** Last day (YYYY-MM-DD) an inventory-attention notification fired — dedupes the foreground check. */
  inventoryNotifiedOn?: string;
};

export type PersistedState = {
  version: 1;
  profile: LocalProfile;
  entries: Record<string, CheckinEntry>; // keyed by date
  symptomEvents: SymptomEvent[];
  protocolItems: ProtocolItem[];
  doseEvents: DoseEvent[];
  inventory: InventoryItem[];
  photos: PhotoEntry[];
  metricReadings: MetricReading[];
  integrations: Record<string, IntegrationState>;
  /** User-created compounds not in the bundled catalog (O-04). */
  customCompounds: CatalogCompound[];
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
  symptomEvents: [],
  protocolItems: [],
  doseEvents: [],
  inventory: [],
  photos: [],
  metricReadings: [],
  integrations: {},
  customCompounds: [],
};

/** Local date as YYYY-MM-DD (not UTC — the check-in is anchored to the user's day). */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local id for offline-created rows; mapped to a DB uuid on sync (spec 10). */
function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type StoreContextValue = {
  /** False until the persisted state has been loaded from disk. */
  ready: boolean;
  profile: LocalProfile;
  entries: Record<string, CheckinEntry>;
  symptomEvents: SymptomEvent[];
  protocolItems: ProtocolItem[];
  doseEvents: DoseEvent[];
  inventory: InventoryItem[];
  photos: PhotoEntry[];
  metricReadings: MetricReading[];
  integrations: Record<string, IntegrationState>;
  customCompounds: CatalogCompound[];
  setProfile: (patch: Partial<LocalProfile>) => void;
  completeOnboarding: () => void;
  /** Add a user-created compound (O-04). */
  addCustomCompound: (compound: CatalogCompound) => void;
  /** Create or update the check-in for a date (merge patch). */
  upsertCheckin: (date: string, patch: Partial<Omit<CheckinEntry, 'date' | 'updatedAt'>>) => void;
  /** Returns the new event's id (so callers can offer undo). */
  addSymptomEvent: (event: Omit<SymptomEvent, 'id'>) => string;
  deleteSymptomEvent: (id: string) => void;
  addProtocolItem: (item: Omit<ProtocolItem, 'id'>) => void;
  updateProtocolItem: (id: string, patch: Partial<Omit<ProtocolItem, 'id'>>) => void;
  removeProtocolItem: (id: string) => void;
  /** Returns the new dose's id (so callers can offer undo). */
  logDose: (dose: Omit<DoseEvent, 'id'>) => string;
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
      return { ...s, entries: { ...s.entries, [date]: next } };
    });
  }, []);

  const addSymptomEvent = useCallback<StoreContextValue['addSymptomEvent']>((event) => {
    const id = uid();
    setState((s) => ({ ...s, symptomEvents: [{ ...event, id }, ...s.symptomEvents] }));
    return id;
  }, []);

  const deleteSymptomEvent = useCallback((id: string) => {
    setState((s) => ({ ...s, symptomEvents: s.symptomEvents.filter((e) => e.id !== id) }));
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
      const seen = new Set(s.metricReadings.map((r) => `${r.sourceProvider}|${r.metric}|${r.ts}`));
      const added: MetricReading[] = [];
      for (const r of readings) {
        const key = `${r.sourceProvider}|${r.metric}|${r.ts}`;
        if (seen.has(key)) continue;
        seen.add(key);
        added.push({ ...r, id: uid() });
      }
      if (added.length === 0) return s;
      return { ...s, metricReadings: [...added, ...s.metricReadings] };
    });
  }, []);

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

  const value = useMemo<StoreContextValue>(
    () => ({
      ready,
      profile: state.profile,
      entries: state.entries,
      symptomEvents: state.symptomEvents,
      protocolItems: state.protocolItems,
      doseEvents: state.doseEvents,
      inventory: state.inventory,
      photos: state.photos,
      metricReadings: state.metricReadings,
      integrations: state.integrations,
      customCompounds: state.customCompounds,
      setProfile,
      completeOnboarding,
      addCustomCompound,
      upsertCheckin,
      addSymptomEvent,
      deleteSymptomEvent,
      addProtocolItem,
      updateProtocolItem,
      removeProtocolItem,
      logDose,
      deleteDose,
      addInventoryItem,
      updateInventoryItem,
      removeInventoryItem,
      addPhoto,
      updatePhoto,
      deletePhoto,
      addMetricReadings,
      setIntegration,
      resetStore,
      exportState,
      replaceState,
    }),
    [
      ready,
      state,
      setProfile,
      completeOnboarding,
      addCustomCompound,
      upsertCheckin,
      addSymptomEvent,
      deleteSymptomEvent,
      addProtocolItem,
      updateProtocolItem,
      removeProtocolItem,
      logDose,
      deleteDose,
      addInventoryItem,
      updateInventoryItem,
      removeInventoryItem,
      addPhoto,
      updatePhoto,
      deletePhoto,
      addMetricReadings,
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
