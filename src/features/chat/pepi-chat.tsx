import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFocusEffect, useRouter, type Href } from 'expo-router';

import { OptionChip } from '@/components/form';
import { GearIcon } from '@/components/icons';
import { LineChart, type ChartPoint } from '@/components/line-chart';
import { Sunken } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { aiErrorKind, parseAreas, parseQuickLog, runInsights, type ParsedItem } from '@/lib/ai';
import { buildInsightHistory, selectChartSeries, selectPhotoDigest } from '@/lib/data-facade';
import { resolveMsg, useVerdict, type TFn } from '@/features/home/use-verdict';
import { CHART_METRICS, type MetricSeries } from '@/lib/chart-series';
import { executeQuery } from '@/lib/ask/execute';
import { matchQuery, SUGGESTED_QUERIES } from '@/lib/ask/intent';
import type { Aggregation, PepiAnswer, PepiQuery, QueryMetric, Timeframe, UnitTag } from '@/lib/ask/types';
import { msUntilPillsReturn, shouldShowPills } from '@/lib/chat-pills';
import { AUTO_APPLY_CONFIDENCE, isResolvable } from '@/lib/quick-log-apply';
import { useCoachingLevel } from '@/lib/use-coaching-level';
import { daysBetween, formatDateKey, localHour, shiftDateKey } from '@/lib/dates';
import { surfaceFields, type CheckinField } from '@/lib/field-surfacing';
import {
  activeMicroSlot,
  matchChatControl,
  microFieldsFor,
  type ChatControl,
  type MicroSlot,
} from '@/lib/micro-checkin';
import { detectAnomalies, type Anomaly } from '@/lib/anomaly';
import { scheduleMicroSnooze } from '@/lib/notifications';
import { localDateKey, useStore, type CheckinEntry, type PepiMessage } from '@/lib/store';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
  firstEligibleTypicalGroup,
  matchTypicalDeviation,
  validateTypicalValue,
  TYPICAL_GROUPS,
  type TypicalGroup,
} from '@/lib/typical-day';
import { cyclePromptEligible, resolveCycle, type CyclePromptKind } from '@/lib/cycle';
import { CanonicalMetric } from '@/lib/integrations/types';

const TF_KEY: Record<Timeframe, string> = {
  today: 'ask.tfToday',
  last_7: 'ask.tfLast7',
  prior_7: 'ask.tfPrior7',
  last_30: 'ask.tfLast30',
  this_month: 'ask.tfThisMonth',
  all: 'ask.tfAll',
};
const AGG_KEY: Record<Aggregation, string> = {
  latest: 'ask.aggLatest',
  average: 'ask.aggAverage',
  sum: 'ask.aggSum',
  count: 'ask.aggCount',
  max: 'ask.aggMax',
  min: 'ask.aggMin',
};

/** Log-insert chips (E1 templates + dose) and deterministic ask chips. */
const TEMPLATE_CHIPS: { label: string; tpl: string }[] = [
  { label: 'quicklog.chipMorning', tpl: 'quicklog.tplMorning' },
  { label: 'quicklog.chipEvening', tpl: 'quicklog.tplEvening' },
  { label: 'quicklog.chipProgress', tpl: 'quicklog.tplProgress' },
  { label: 'pepi.chipLogDose', tpl: 'quicklog.tplDose' },
];
// "What changed?" (weight trend) + a weekly-ish doses summary — both deterministic.
const ASK_CHIPS = [SUGGESTED_QUERIES[1], SUGGESTED_QUERIES[4]];

/** Deterministic photo-status question (P-3): answered locally from the digest. */
const PHOTO_RE = /\b(photo|photos|picture|pictures|pic|pics|selfie|how do i look)\b/;

/** Session-close auto-clear window (P-5 / OQ-1 option 1): away this long, then the
 *  thread resets on return. 15 min keeps an active session intact, clears on real
 *  disengagement. */
const AUTO_CLEAR_MS = 15 * 60 * 1000;

/** Charted metric ids (P-2): a metric answer for one of these gets a sparkline. */
const CHARTED_IDS = new Set(CHART_METRICS.map((m) => m.id));
function chartMetricIdFor(a: PepiAnswer): string | undefined {
  if (a.kind === 'insufficient') return undefined;
  if (a.metric.kind !== 'checkin') return undefined;
  return CHARTED_IDS.has(a.metric.field) ? a.metric.field : undefined;
}

/**
 * Pepi as one chat (redesign R2-F, mockup frame 5). A single thread: the user
 * logs or asks in one composer, Pepi replies as messages. Routing per message is
 * quick-log parse first (confident parses auto-apply, with a session undo on the
 * confirmation), otherwise the deterministic Ask pipeline answers. No charts here
 * — Analysis owns every chart. Thread is lightly persisted (last N in the store).
 */
export function PepiChat() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const store = useStore();
  const {
    pepiMessages,
    addPepiMessage,
    clearPepiMessages,
    entries,
    contextNotes,
    addContextNote,
    doseEvents,
    metricReadings,
    symptomEvents,
    protocolItems,
    photos,
    profile,
    upsertCheckin,
    addSymptomEvent,
    deleteSymptomEvent,
    logDose,
    deleteDose,
    setTypicalBaseline,
    recordTypicalDeviation,
    silentFillTypical,
    setTypicalPromptState,
  } = store;

  const lang = i18n.language;
  const today = localDateKey();
  const router = useRouter();
  const verdict = useVerdict();
  // How much Pepi weighs in (W3-8): user-set or silently inferred; shapes the
  // insights prompt (observe = no unsolicited suggestions, coach = proactive).
  const coachingLevel = useCoachingLevel();
  const tx = t as unknown as TFn;
  // Live per-metric chart series (P-2): a metric answer renders a sparkline from
  // the same facade series the charts use, re-derived at render (messages stay light).
  const seriesMap = useMemo(() => {
    const { series } = selectChartSeries(
      { entries, metricReadings, protocolItems, profile },
      today,
      { selectedIds: CHART_METRICS.map((m) => m.id) },
    );
    const map: Record<string, MetricSeries> = {};
    for (const s of series) map[s.id] = s;
    return map;
  }, [entries, metricReadings, protocolItems, profile, today]);
  const [text, setText] = useState('');
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  const [pending, setPending] = useState(false);
  // Typical-day setup mini-flow (spec 15). Null when not setting up.
  const [typicalSetup, setTypicalSetup] = useState<{ group: TypicalGroup; step: 'confirm' | 'baseline' } | null>(null);
  // Cycle setup (piece D): 'confirm' when Health already has the data (one tap,
  // nothing to type), 'date' when it must be entered by hand.
  const [cycleSetup, setCycleSetup] = useState<{ step: 'confirm' | 'date' } | null>(null);
  /**
   * Focus-area flow (MASTER-PLAN block 7). `ask` waits for free text; `pick`
   * holds parsed candidates plus which are ticked. The tickable card is the
   * human-in-the-loop step: the parse proposes, the user disposes, so a sloppy
   * parse costs a tap rather than writing categories nobody asked for.
   *
   * Deliberately session state, not a persisted message: only the outcome
   * (profile.focusAreas) is durable, so a half-finished card never resurrects.
   */
  const [areaSetup, setAreaSetup] = useState<
    | { step: 'ask' }
    | {
        step: 'pick';
        candidates: string[];
        ticked: string[];
        /** 'named': the user said these, so pre-ticked. 'suggested': a
         *  descriptor-only answer (e.g. "oily") produced common candidates for
         *  that descriptor — a question, not a fact, so nothing starts ticked
         *  and nothing is created unless the user taps it. */
        source: 'named' | 'suggested';
      }
    | null
  >(null);
  // Micro check-in flow (W3-9, beta-notes §4.1): chips-first 1-5 answers, zero AI.
  const [microFlow, setMicroFlow] = useState<{ slot: MicroSlot; fields: CheckinField[]; index: number } | null>(null);
  // Snoozed/dismissed this session: hides the opener chip until the next visit.
  const [microHidden, setMicroHidden] = useState<Set<MicroSlot>>(new Set());
  // Anomaly opener (W3-10, beta-notes §3.4): a deterministic detector fired and
  // Pepi is waiting for the user's explanation (the next message is captured).
  const [anomalyCapture, setAnomalyCapture] = useState<Anomaly | null>(null);
  const [anomalyHidden, setAnomalyHidden] = useState(false);
  const [undoableIds, setUndoableIds] = useState<Set<string>>(new Set());
  const [undoneIds, setUndoneIds] = useState<Set<string>>(new Set());
  const undoMap = useRef<Map<string, () => void>>(new Map());
  const scrollRef = useRef<ScrollView>(null);
  // Keyboard: the thread stays pinned to the latest message so the composer
  // never covers what you just sent. Chip visibility no longer keys off the
  // keyboard; it follows the pill rules (W7-43).
  // Enter-animation gate (P-5): disabled under reduce-motion.
  const [reduceMotion, setReduceMotion] = useState(false);
  // Session-close auto-clear (P-5 / OQ-1 option 1): the thread clears when the user
  // has been away (app backgrounded or tab left) for AUTO_CLEAR_MS, then returns.
  const awayAtRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => mounted && setReduceMotion(v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  // Clear on return if we were away long enough (app background/foreground).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        if (awayAtRef.current && Date.now() - awayAtRef.current > AUTO_CLEAR_MS) clearPepiMessages();
        awayAtRef.current = 0;
      } else {
        awayAtRef.current = Date.now();
      }
    });
    return () => sub.remove();
  }, [clearPepiMessages]);

  // Same rule when leaving/returning the Pepi tab.
  useFocusEffect(
    useCallback(() => {
      if (awayAtRef.current && Date.now() - awayAtRef.current > AUTO_CLEAR_MS) clearPepiMessages();
      awayAtRef.current = 0;
      return () => {
        awayAtRef.current = Date.now();
      };
    }, [clearPepiMessages]),
  );

  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(id);
  }, [pepiMessages, pending]);

  // Suggestion pills (W7-43): visible on a cold screen and after the exchange
  // goes quiet, hidden while typing or mid-conversation. Held as state and
  // decided inside an effect so the clock is never read during render.
  const [showPills, setShowPills] = useState(true);
  const lastMessageTs = pepiMessages.length ? pepiMessages[pepiMessages.length - 1].ts : undefined;
  const draftLength = text.trim().length;
  const hasConversation = pepiMessages.length > 0;
  // Chips that answer a question Pepi just asked are the interaction itself, so
  // they ignore the pill rules entirely.
  const activeChipFlow =
    !!anomalyCapture ||
    !!microFlow ||
    typicalSetup?.step === 'confirm' ||
    cycleSetup?.step === 'confirm' ||
    // The tickable card IS the interaction, so it ignores the pill timing rules.
    areaSetup?.step === 'pick';

  /** Offer the focus-area ask once, and only to someone whose photos it would
   *  change: the skin goal is the clearest signal, but anyone already taking
   *  face photos benefits, so both qualify. Never re-asks once answered. */
  const areaPromptEligible =
    !profile.focusAreaPromptState && (profile.goals.includes('skin') || photos.some((p) => p.session === 'face'));

  useEffect(() => {
    const evaluate = (): number | null => {
      const state = {
        draftLength,
        msSinceActivity: lastMessageTs ? Date.now() - new Date(lastMessageTs).getTime() : 0,
        hasConversation,
      };
      setShowPills(shouldShowPills(state));
      return msUntilPillsReturn(state);
    };
    const wait = evaluate();
    if (wait === null) return;
    // A single wake-up at the moment the pills fall due, rather than polling.
    const id = setTimeout(evaluate, wait + 50);
    return () => clearTimeout(id);
  }, [draftLength, lastMessageTs, hasConversation]);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, () => {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => {});
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // ── Answer formatting (mono data lines; no charts) ─────────────────────────
  const metricLabel = (m: QueryMetric): string =>
    m.kind === 'dose' ? t('ask.doses') : t(`fields.${m.field}` as 'fields.weight');
  const unitLabel = (u: UnitTag): string => {
    switch (u) {
      case 'weight':
        return t(profile.units === 'imperial' ? 'units.lb' : 'units.kg');
      case 'rating':
        return t('ask.ratingSuffix');
      case 'g':
        return t('units.g');
      case 'kcal':
        return t('units.kcal');
      case 'count':
        return t('ask.dosesUnit');
    }
  };
  const fmtNum = (v: number, u: UnitTag): number =>
    u === 'rating' || u === 'weight' ? Math.round(v * 10) / 10 : Math.round(v);

  const formatAnswer = (a: PepiAnswer): string => {
    if (a.kind === 'insufficient') {
      return a.reason === 'not_understood'
        ? t('ask.notUnderstood')
        : t('ask.noData', { metric: a.metric ? metricLabel(a.metric) : '' });
    }
    if (a.kind === 'value') {
      return t('pepi.ansValue', {
        metric: metricLabel(a.metric),
        tf: t(TF_KEY[a.timeframe] as 'ask.tfToday'),
        value: fmtNum(a.value, a.unit),
        unit: unitLabel(a.unit),
        agg: t(AGG_KEY[a.agg] as 'ask.aggAverage'),
        samples: t('ask.sampleCount', { count: a.sampleCount }),
      });
    }
    if (a.kind === 'compare') {
      const d = fmtNum(a.value - a.prior, a.unit);
      return t('pepi.ansCompare', {
        metric: metricLabel(a.metric),
        tf: t(TF_KEY[a.timeframe] as 'ask.tfToday'),
        value: fmtNum(a.value, a.unit),
        unit: unitLabel(a.unit),
        delta: `${d > 0 ? '+' : ''}${d}`,
        vsPrior: t('ask.vsPrior'),
      });
    }
    return t('pepi.ansExtremum', {
      metric: metricLabel(a.metric),
      value: fmtNum(a.value, a.unit),
      unit: unitLabel(a.unit),
      dir: t((a.dir === 'max' ? AGG_KEY.max : AGG_KEY.min) as 'ask.aggMax'),
      date: formatDateKey(a.dateKey, lang),
    });
  };

  // Post a data answer, attaching a live sparkline for charted metrics and, for
  // weight, the verdict's hedged days-to-target projection (P-2).
  const postAnswer = (a: PepiAnswer) => {
    const metricId = chartMetricIdFor(a);
    let answerText = formatAnswer(a);
    if (metricId === 'weight' && verdict.forecast) answerText += ` · ${resolveMsg(tx, verdict.forecast)}`;
    addPepiMessage({ role: 'pepi', text: answerText, variant: 'answer', metricId });
  };

  // ── Apply a confident parse, capturing a batch undo (session-only) ─────────
  const applyWithUndo = (items: ParsedItem[]): { applied: number; undo: () => void } => {
    const today = localDateKey();
    const cur = entries[today];
    const priorCheckin: Partial<Record<keyof CheckinEntry, number | undefined>> = {};
    const symptomIds: string[] = [];
    const doseIds: string[] = [];
    let applied = 0;

    for (const item of items) {
      switch (item.kind) {
        case 'weight':
          if (!('weight' in priorCheckin)) priorCheckin.weight = cur?.weight;
          upsertCheckin(today, { weight: item.weight });
          applied++;
          break;
        case 'checkin': {
          const f = item.field as keyof CheckinEntry;
          if (!(f in priorCheckin)) priorCheckin[f] = cur?.[f] as number | undefined;
          upsertCheckin(today, { [f]: item.value } as Partial<Omit<CheckinEntry, 'date' | 'updatedAt'>>);
          applied++;
          break;
        }
        case 'symptom':
          symptomIds.push(
            addSymptomEvent({
              type: item.symptomType ?? '',
              onsetAt: item.onsetISO ?? new Date().toISOString(),
              durationMinutes: item.durationMinutes,
              severity: item.severity,
              note: item.note,
            }),
          );
          applied++;
          break;
        case 'dose':
          doseIds.push(
            logDose({
              compoundSlug: item.compoundSlug,
              takenAt: item.onsetISO ?? new Date().toISOString(),
              dose: item.dose,
              doseUnit: item.doseUnit,
            }),
          );
          applied++;
          break;
      }
    }

    const undo = () => {
      if (Object.keys(priorCheckin).length > 0) {
        upsertCheckin(today, priorCheckin as Partial<Omit<CheckinEntry, 'date' | 'updatedAt'>>);
      }
      symptomIds.forEach(deleteSymptomEvent);
      doseIds.forEach(deleteDose);
    };
    return { applied, undo };
  };

  // ── Typical-day baselines (spec 15) ────────────────────────────────────────
  const activeGroups = useMemo<TypicalGroup[]>(
    () => (profile.typicalBaselines ?? []).filter((b) => b.enabled).map((b) => b.group),
    [profile.typicalBaselines],
  );

  const surfaced = useMemo(
    () => surfaceFields(profile.goals, profile.compoundSlugs).fields,
    [profile.goals, profile.compoundSlugs],
  );

  // The first group eligible for the one-time opener (sparse, established user, no
  // synced source, not yet asked/declined). Drives the opener chip; allows a
  // 'notified' status so the chip persists after the notification fired.
  const eligibleGroup = useMemo<TypicalGroup | null>(() => {
    const firstEntry = Object.keys(entries).sort()[0];
    const daysSinceFirstEntry = firstEntry ? daysBetween(firstEntry, today) : 0;
    return firstEligibleTypicalGroup({
      goals: profile.goals,
      surfacedFields: surfaced,
      promptState: profile.typicalPromptState,
      entries,
      readings: metricReadings,
      windowStart: shiftDateKey(today, -13),
      windowEnd: today,
      daysSinceFirstEntry,
      allowNotified: true,
    });
  }, [entries, metricReadings, profile.typicalPromptState, profile.goals, surfaced, today]);

  /** Extract the baseline numbers from free text ("2600 cal, 150g protein"). */
  const parseBaseline = (input: string, group: TypicalGroup): Record<string, number> | null => {
    const nums = (input.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => parseFloat(n.replace(',', '.')));
    const def = TYPICAL_GROUPS[group];
    if (group === 'sleep') {
      const v = nums.length ? validateTypicalValue(def.metrics[0], nums[0]) : null;
      return v != null ? { 'sleep.duration': v } : null;
    }
    if (nums.length < 2) return null;
    const sorted = [...nums].sort((a, b) => b - a); // calories >> protein
    const cal = validateTypicalValue(def.metrics[0], sorted[0]);
    const pro = validateTypicalValue(def.metrics[1], sorted[1]);
    return cal != null && pro != null ? { 'nutrition.energy': cal, 'nutrition.protein': pro } : null;
  };

  // ── Micro check-in (W3-9, beta-notes §4.1) ──────────────────────────────────
  // The pending fields for the current scheduled moment (morning/evening), if any.
  const microPending = useMemo<{ slot: MicroSlot; fields: CheckinField[] } | null>(() => {
    const slot = activeMicroSlot(localHour());
    if (!slot) return null;
    const fields = microFieldsFor(slot, surfaced, entries[today]);
    return fields.length ? { slot, fields } : null;
  }, [surfaced, entries, today]);

  const startMicroFlow = () => {
    if (!microPending) return;
    const { slot, fields } = microPending;
    addPepiMessage({
      role: 'pepi',
      text: t('micro.ask', { field: t(`fields.${fields[0]}` as 'fields.energy') }),
      variant: 'answer',
    });
    setMicroFlow({ slot, fields, index: 0 });
  };

  const answerMicro = (value: number) => {
    if (!microFlow) return;
    const field = microFlow.fields[microFlow.index];
    addPepiMessage({ role: 'user', text: String(value) });
    upsertCheckin(today, { [field]: value });
    advanceMicro();
  };

  const skipMicroField = () => {
    if (!microFlow) return;
    addPepiMessage({ role: 'user', text: t('micro.skip') });
    advanceMicro();
  };

  const advanceMicro = () => {
    if (!microFlow) return;
    const next = microFlow.index + 1;
    if (next >= microFlow.fields.length) {
      addPepiMessage({ role: 'pepi', text: t('micro.done'), variant: 'log' });
      setMicroHidden((prev) => new Set(prev).add(microFlow.slot));
      setMicroFlow(null);
    } else {
      addPepiMessage({
        role: 'pepi',
        text: t('micro.ask', { field: t(`fields.${microFlow.fields[next]}` as 'fields.energy') }),
        variant: 'answer',
      });
      setMicroFlow({ ...microFlow, index: next });
    }
  };

  const snoozeMicro = (slot: MicroSlot) => {
    setMicroHidden((prev) => new Set(prev).add(slot));
    setMicroFlow(null);
    void scheduleMicroSnooze(slot);
    addPepiMessage({ role: 'pepi', text: t('micro.snoozed'), variant: 'hint' });
  };

  // ── Chat controls (W3-9, beta-notes §4.2/4.3): never silent, always confirmed.
  const handleControl = (control: ChatControl) => {
    if (control.kind === 'snooze') {
      const slot = microPending?.slot ?? activeMicroSlot(localHour()) ?? 'evening';
      snoozeMicro(slot);
      return;
    }
    if (control.kind === 'toneDown') {
      // Deterministic quieting ladder: morning prompt, then evening, then macros.
      if (profile.notifyMorningEnabled) {
        store.setProfile({ notifyMorningEnabled: false });
        addPepiMessage({ role: 'pepi', text: t('pepi.ctl.turnedOff.morning'), variant: 'answer' });
      } else if (profile.notifyCheckinEnabled) {
        store.setProfile({ notifyCheckinEnabled: false });
        addPepiMessage({ role: 'pepi', text: t('pepi.ctl.turnedOff.evening'), variant: 'answer' });
      } else if (profile.notifyMacrosEnabled) {
        store.setProfile({ notifyMacrosEnabled: false });
        addPepiMessage({ role: 'pepi', text: t('pepi.ctl.turnedOffMacros'), variant: 'answer' });
      } else {
        addPepiMessage({ role: 'pepi', text: t('pepi.ctl.alreadyQuiet'), variant: 'hint' });
      }
      return;
    }
    if (control.kind === 'toggleCheckin') {
      const patch =
        control.slot === 'morning'
          ? { notifyMorningEnabled: control.enable }
          : { notifyCheckinEnabled: control.enable };
      store.setProfile(patch);
      addPepiMessage({
        role: 'pepi',
        text: t(
          control.enable
            ? (`pepi.ctl.turnedOn.${control.slot}` as 'pepi.ctl.turnedOn.morning')
            : (`pepi.ctl.turnedOff.${control.slot}` as 'pepi.ctl.turnedOff.morning'),
        ),
        variant: 'answer',
      });
      return;
    }
    // moveCheckin
    const patch =
      control.slot === 'morning'
        ? { notifyMorningEnabled: true, notifyMorningTime: control.time }
        : { notifyCheckinEnabled: true, notifyCheckinTime: control.time };
    store.setProfile(patch);
    addPepiMessage({
      role: 'pepi',
      text: t(`pepi.ctl.moved.${control.slot}` as 'pepi.ctl.moved.morning', { time: control.time }),
      variant: 'answer',
    });
  };

  // ── Anomaly opener (W3-10): detection is deterministic + free; AI only ever
  // handles the conversation after the user replies. Explained days (context
  // notes) neither re-fire nor pollute the rolling baselines.
  const todayAnomaly = useMemo<Anomaly | null>(() => {
    const excluded = new Set(contextNotes.map((n) => n.dateKey));
    const muted = new Set(profile.anomalyMuted ?? []);
    const hits = detectAnomalies({ entries, metricReadings, todayKey: today, excludedDates: excluded, profile });
    return hits.find((a) => !muted.has(a.kind)) ?? null;
  }, [contextNotes, entries, metricReadings, today, profile]);

  const startAnomalyCapture = () => {
    if (!todayAnomaly) return;
    addPepiMessage({
      role: 'pepi',
      text: t(`anomaly.ask.${todayAnomaly.kind}` as 'anomaly.ask.sleep_short'),
      variant: 'answer',
    });
    setAnomalyCapture(todayAnomaly);
  };

  const muteAnomaly = () => {
    const kind = anomalyCapture?.kind ?? todayAnomaly?.kind;
    if (!kind) return;
    store.setProfile({ anomalyMuted: [...(profile.anomalyMuted ?? []), kind] });
    setAnomalyCapture(null);
    setAnomalyHidden(true);
    addPepiMessage({ role: 'pepi', text: t('anomaly.muted'), variant: 'hint' });
  };

  // ── Cycle setup (piece D) ──────────────────────────────────────────────────
  const cycleFlowReadings = useMemo(
    () => metricReadings.filter((r) => r.metric === CanonicalMetric.cycleFlow),
    [metricReadings],
  );

  const cyclePrompt = useMemo<CyclePromptKind | null>(
    () =>
      cyclePromptEligible({
        sex: profile.sex,
        promptState: profile.cyclePromptState,
        tracking: profile.cycleTracking,
        hasManualStart: !!profile.lastPeriodDate,
        hasSyncedFlow: cycleFlowReadings.length > 0,
        goals: profile.goals,
      }),
    [profile.sex, profile.cyclePromptState, profile.cycleTracking, profile.lastPeriodDate, profile.goals, cycleFlowReadings.length],
  );

  const startCycleSetup = (kind: CyclePromptKind) => {
    addPepiMessage({ role: 'pepi', text: t(`cycle.ask.${kind}` as 'cycle.ask.confirm'), variant: 'answer' });
    setCycleSetup({ step: kind === 'confirm' ? 'confirm' : 'date' });
    store.setProfile({ cyclePromptState: 'asked' });
  };

  /** Answer the yes/no. Yes on the synced path needs no date at all — Health
   *  already has the period starts, which is the whole point of confirming
   *  rather than asking. */
  const confirmCycle = (yes: boolean) => {
    if (yes) {
      addPepiMessage({ role: 'user', text: t('cycle.yes') });
      store.setProfile({ cycleTracking: true, cyclePromptState: 'active' });
      const state = resolveCycle({
        manualStart: profile.lastPeriodDate,
        statedLength: profile.cycleLength,
        flow: cycleFlowReadings,
        today,
      });
      addPepiMessage({
        role: 'pepi',
        text: state
          ? t('cycle.confirmSynced', { day: state.dayInCycle, length: state.cycleLength })
          : t('cycle.askDate'),
        variant: 'answer',
      });
      setCycleSetup(state ? null : { step: 'date' });
    } else {
      addPepiMessage({ role: 'user', text: t('cycle.no') });
      store.setProfile({ cyclePromptState: 'declined' });
      addPepiMessage({ role: 'pepi', text: t('cycle.declineAck'), variant: 'hint' });
      setCycleSetup(null);
    }
  };

  /** Record a start date from a chip (today / yesterday) or typed text. */
  const setCycleStart = (dateKey: string) => {
    store.setProfile({
      cycleTracking: true,
      lastPeriodDate: dateKey,
      cycleLength: profile.cycleLength ?? 28,
      cyclePromptState: 'active',
    });
    const state = resolveCycle({
      manualStart: dateKey,
      statedLength: profile.cycleLength,
      flow: cycleFlowReadings,
      today,
    });
    addPepiMessage({
      role: 'pepi',
      text: state
        ? t('cycle.confirmManual', { day: state.dayInCycle, length: state.cycleLength })
        : t('cycle.declineAck'),
      variant: 'answer',
    });
    setCycleSetup(null);
  };

  /** Opener: Pepi asks where to watch. One-shot — the prompt state records the
   *  ask so it never nags, whatever the user does next. */
  const startAreaSetup = () => {
    addPepiMessage({ role: 'pepi', text: t('areas.ask'), variant: 'answer' });
    setAreaSetup({ step: 'ask' });
    store.setProfile({ focusAreaPromptState: 'asked' });
  };

  /** Toggle one candidate on the card. */
  const toggleArea = (area: string) => {
    setAreaSetup((s) =>
      s?.step === 'pick'
        ? {
            ...s,
            ticked: s.ticked.includes(area)
              ? s.ticked.filter((a) => a !== area)
              : [...s.ticked, area],
          }
        : s,
    );
  };

  /** Commit the ticked candidates, merging with anything already tracked. */
  const saveAreas = () => {
    if (areaSetup?.step !== 'pick') return;
    const ticked = areaSetup.ticked;
    if (ticked.length === 0) {
      setAreaSetup(null);
      store.setProfile({ focusAreaPromptState: 'declined' });
      addPepiMessage({ role: 'pepi', text: t('areas.none'), variant: 'hint' });
      return;
    }
    // Merge case-insensitively so re-running the flow tops up rather than
    // duplicating an area the user already tracks.
    const existing = profile.focusAreas ?? [];
    const seen = new Set(existing.map((a) => a.toLowerCase()));
    const merged = [...existing];
    for (const a of ticked) {
      if (seen.has(a.toLowerCase())) continue;
      seen.add(a.toLowerCase());
      merged.push(a);
    }
    store.setProfile({ focusAreas: merged, focusAreaPromptState: 'set' });
    setAreaSetup(null);
    addPepiMessage({
      role: 'pepi',
      text: t('areas.saved', { areas: ticked.join(', ') }),
      variant: 'log',
    });
  };

  const startTypicalSetup = (group: TypicalGroup) => {
    addPepiMessage({ role: 'pepi', text: t(`typical.ask.${group}` as 'typical.ask.nutrition'), variant: 'answer' });
    setTypicalSetup({ group, step: 'confirm' });
    setTypicalPromptState(group, 'asked');
  };

  const confirmTypical = (yes: boolean) => {
    if (!typicalSetup) return;
    const { group } = typicalSetup;
    if (yes) {
      addPepiMessage({ role: 'user', text: t('typical.yes') });
      addPepiMessage({
        role: 'pepi',
        text: t(`typical.baselineAsk.${group}` as 'typical.baselineAsk.nutrition'),
        variant: 'answer',
      });
      setTypicalSetup({ group, step: 'baseline' });
    } else {
      addPepiMessage({ role: 'user', text: t('typical.no') });
      setTypicalPromptState(group, 'declined');
      addPepiMessage({ role: 'pepi', text: t('typical.declineAck'), variant: 'hint' });
      setTypicalSetup(null);
    }
  };

  // ── Routing: parse-to-log first, else deterministic ask ────────────────────
  const send = async (raw: string) => {
    const input = raw.trim();
    if (!input || pending) return;

    // Typical-day setup: while waiting for the baseline, intercept the message and
    // parse the numbers instead of routing to log/ask (spec 15).
    if (typicalSetup?.step === 'baseline') {
      const { group } = typicalSetup;
      addPepiMessage({ role: 'user', text: input });
      setText('');
      setSelection(undefined);
      const values = parseBaseline(input, group);
      if (values) {
        setTypicalBaseline({ group, values, setAt: new Date().toISOString(), enabled: true });
        const confirmText =
          group === 'nutrition'
            ? t('typical.confirmNutrition', { calories: values['nutrition.energy'], protein: values['nutrition.protein'] })
            : t('typical.confirmSleep', { hours: values['sleep.duration'] });
        addPepiMessage({ role: 'pepi', text: confirmText, variant: 'answer' });
        setTypicalSetup(null);
      } else {
        addPepiMessage({
          role: 'pepi',
          text: t(`typical.baselineRetry.${group}` as 'typical.baselineRetry.nutrition'),
          variant: 'hint',
        });
      }
      return;
    }

    // Cycle setup: while waiting for a start date, the message is a date, not a
    // log entry — route it here instead of to the parser.
    if (cycleSetup?.step === 'date') {
      addPepiMessage({ role: 'user', text: input });
      setText('');
      setSelection(undefined);
      const match = input.match(/(\d{4})-(\d{2})-(\d{2})/);
      const key = match?.[0];
      if (key && key <= today && !Number.isNaN(new Date(`${key}T00:00:00Z`).getTime())) {
        setCycleStart(key);
      } else {
        addPepiMessage({ role: 'pepi', text: t('cycle.dateRetry'), variant: 'hint' });
      }
      return;
    }

    // Focus areas: the reply names places to watch, not something to log, so it
    // goes to the extraction parse and comes back as a tickable card.
    if (areaSetup?.step === 'ask') {
      addPepiMessage({ role: 'user', text: input });
      setText('');
      setSelection(undefined);
      const { areas, suggested } = await parseAreas(input, i18n.language);
      if (areas.length > 0) {
        // Pre-tick everything: the user named these, so the common case is
        // "yes, all of them" and the ticks exist to remove a mis-parse, not to
        // re-enter.
        setAreaSetup({ step: 'pick', candidates: areas, ticked: areas, source: 'named' });
        addPepiMessage({ role: 'pepi', text: t('areas.confirm'), variant: 'answer' });
        return;
      }
      if (suggested.length > 0) {
        // A descriptor with no location ("oily", "itchy"). These are a
        // question, not a fact — nothing starts ticked, and nothing is
        // created unless the user taps one.
        setAreaSetup({ step: 'pick', candidates: suggested, ticked: [], source: 'suggested' });
        addPepiMessage({
          role: 'pepi',
          text: t('areas.suggestAsk', { areas: suggested.join(', ') }),
          variant: 'answer',
        });
        return;
      }
      // No area named and no descriptor recognized. Don't guess — say so and
      // leave the flow open so the next message is still treated as an answer.
      addPepiMessage({ role: 'pepi', text: t('areas.retry'), variant: 'hint' });
      return;
    }

    // Anomaly explanation capture (W3-10): the reply to an anomaly opener is
    // stored as a structured context note, not routed to the parser.
    if (anomalyCapture) {
      addPepiMessage({ role: 'user', text: input });
      setText('');
      setSelection(undefined);
      addContextNote({ dateKey: anomalyCapture.dateKey, metric: anomalyCapture.metric, explanation: input });
      addPepiMessage({ role: 'pepi', text: t('anomaly.thanks'), variant: 'log' });
      setAnomalyCapture(null);
      setAnomalyHidden(true);
      return;
    }

    addPepiMessage({ role: 'user', text: input });
    setText('');
    setSelection(undefined);

    // Chat controls (W3-9 §4.2/4.3): snooze / tone-down / per-check-in intents,
    // deterministic pattern match, always confirmed back, never silent.
    const control = matchChatControl(input);
    if (control) {
      handleControl(control);
      return;
    }

    // Deterministic deviation chip from free text ("ate more than usual"): offline,
    // before the AI parse (spec 15 §UX.3).
    const dev = matchTypicalDeviation(input, activeGroups);
    if (dev) {
      recordTypicalDeviation(dev.group, today, dev.level);
      addPepiMessage({
        role: 'pepi',
        text: t(`typical.logged.${dev.level}` as 'typical.logged.more'),
        variant: 'log',
      });
      return;
    }

    setPending(true);

    const snapshot = { entries, doseEvents };
    let aiError: unknown;
    try {
      let handled = false;

      if (isSupabaseConfigured) {
        try {
          const result = await parseQuickLog(input, lang);
          const applicable = (result.items ?? []).filter(
            (i) => i.kind !== 'unknown' && (i.confidence ?? 1) >= AUTO_APPLY_CONFIDENCE && isResolvable(i),
          );
          if (applicable.length > 0) {
            const { applied, undo } = applyWithUndo(applicable);
            const id = addPepiMessage({
              role: 'pepi',
              text: result.reply?.trim() || t('pepi.loggedCount', { count: applied }),
              variant: 'log',
            });
            undoMap.current.set(id, undo);
            setUndoableIds((prev) => new Set(prev).add(id));
            handled = true;
          }
        } catch (err) {
          aiError = err; // fall through to the deterministic ask
        }
      }

      if (!handled) {
        const q = matchQuery(input);
        if (q) {
          postAnswer(executeQuery(q, snapshot, localDateKey()));
          handled = true;
        }
      }

      // Deterministic photo-status answer (P-3): "when was my last photo / how do I
      // look" is answered instantly from the local digest, no AI call.
      if (!handled && PHOTO_RE.test(input.toLowerCase())) {
        const digest = selectPhotoDigest({ photos });
        if (digest.length === 0) {
          addPepiMessage({ role: 'pepi', text: t('pepi.photoNone'), variant: 'answer' });
        } else {
          const d = digest[0];
          const extra = d.changeNote
            ? ` ${d.changeNote}`
            : d.comparable != null
              ? ` ${t(d.comparable ? 'photos.comparable' : 'photos.notComparable')}`
              : '';
          addPepiMessage({
            role: 'pepi',
            text: t('pepi.photoStatus', { date: formatDateKey(d.lastCaptureDate, lang) }) + extra,
            variant: 'answer',
          });
        }
        handled = true;
      }

      // AI Q&A fallback (P-1): anything the deterministic layers can't answer goes
      // to the cheap insights Q&A (Haiku, tier 'quick'), grounded in the same facade
      // history the charts + Analysis use. No cap, by design (owner decision).
      if (!handled && isSupabaseConfigured) {
        try {
          const res = await runInsights({
            mode: 'qa',
            question: input,
            history: buildInsightHistory(
              { entries, metricReadings, protocolItems, doseEvents, symptomEvents, profile, photos, contextNotes },
              today,
            ),
            locale: lang,
            tier: 'quick',
            coachingLevel,
          });
          if (res.answer.trim()) {
            addPepiMessage({ role: 'pepi', text: res.answer.trim(), variant: 'answer' });
            handled = true;
          }
        } catch (err) {
          aiError = err;
        }
      }

      if (!handled) {
        const notConfigured = !isSupabaseConfigured || (aiError && aiErrorKind(aiError) === 'notConfigured');
        addPepiMessage({
          role: 'pepi',
          text: notConfigured ? t('quicklog.notConfigured') : aiError ? t('pepi.error') : t('pepi.notUnderstood'),
          variant: notConfigured ? 'hint' : aiError ? 'error' : 'answer',
        });
      }
    } finally {
      setPending(false);
      // A Pepi interaction counts as a check-in touch: silently fill "usual" for any
      // enabled typical group with no value today (spec 15 §UX.3, conf 0.3).
      if (activeGroups.length > 0) silentFillTypical(today);
    }
  };

  const runQuery = (labelKey: string, query: PepiQuery) => {
    if (pending) return;
    addPepiMessage({ role: 'user', text: t(labelKey as 'ask.sugDoses') });
    postAnswer(executeQuery(query, { entries, doseEvents }, localDateKey()));
  };

  // A-2: "what moved together" surfaces the insights correlation path right in the
  // chat (previously buried in Analysis). Cheap tier (Haiku), same facade history.
  const runCorrelation = async () => {
    if (pending) return;
    addPepiMessage({ role: 'user', text: t('pepi.chipMovedTogether') });
    if (!isSupabaseConfigured) {
      addPepiMessage({ role: 'pepi', text: t('quicklog.notConfigured'), variant: 'hint' });
      return;
    }
    setPending(true);
    try {
      const res = await runInsights({
        mode: 'correlation',
        history: buildInsightHistory(
          { entries, metricReadings, protocolItems, doseEvents, symptomEvents, profile, photos, contextNotes },
          today,
        ),
        locale: lang,
        tier: 'quick',
        coachingLevel,
      });
      const answer = res.answer.trim();
      addPepiMessage({
        role: 'pepi',
        text: answer && !res.insufficientData ? answer : t('pepi.movedNone'),
        variant: 'answer',
      });
    } catch (err) {
      const notConfigured = aiErrorKind(err) === 'notConfigured';
      addPepiMessage({
        role: 'pepi',
        text: notConfigured ? t('quicklog.notConfigured') : t('pepi.error'),
        variant: notConfigured ? 'hint' : 'error',
      });
    } finally {
      setPending(false);
    }
  };

  const insertTemplate = (template: string) => {
    const base = text.trim() ? `${text.replace(/\s+$/, '')}\n` : '';
    const full = base + template;
    const blank = template.indexOf(': ');
    const pos = base.length + (blank >= 0 ? blank + 2 : template.length);
    setText(full);
    setSelection({ start: pos, end: pos });
  };

  const onUndo = (id: string) => {
    const fn = undoMap.current.get(id);
    if (!fn) return;
    fn();
    undoMap.current.delete(id);
    setUndoneIds((prev) => new Set(prev).add(id));
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <ThemedText type="display" style={styles.hero}>
            {t('tabs.pepi')}
          </ThemedText>
          {/* Gear on every tab header (UX audit: header consistency). */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.title')}
            onPress={() => router.push('/settings')}
            hitSlop={8}>
            <GearIcon />
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.thread}
          contentContainerStyle={styles.threadContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {pepiMessages.length === 0 ? (
            <View style={styles.empty}>
              <ThemedText type="body" themeColor="textSecondary">
                {t('pepi.emptyTitle')}
              </ThemedText>
              <ThemedText type="small" themeColor="textMuted" style={styles.emptyHint}>
                {t('pepi.emptyHint')}
              </ThemedText>
            </View>
          ) : (
            pepiMessages.map((m) => (
              <Bubble
                key={m.id}
                message={m}
                reduceMotion={reduceMotion}
                showUndo={undoableIds.has(m.id)}
                undone={undoneIds.has(m.id)}
                onUndo={() => onUndo(m.id)}
                undoLabel={t('quicklog.undo')}
                undoneLabel={t('pepi.undone')}
                series={m.metricId ? seriesMap[m.metricId] : undefined}
                onOpenTrend={m.metricId ? () => router.push(`/signal/${m.metricId}` as Href) : undefined}
                viewLabel={t('pepi.viewTrend')}
                noDataLabel={t('common.noData')}
              />
            ))
          )}
          {pending ? (
            <View style={[styles.row, styles.rowPepi]}>
              <ThemedText type="monoSm" themeColor="textMuted">
                {t('pepi.thinking')}
              </ThemedText>
            </View>
          ) : null}
        </ScrollView>

        {/* A flow's answer chips are the interaction itself and always show;
            the suggestion pills come and go with shouldShowPills (W7-43). */}
        {(activeChipFlow || showPills) && (
        <View style={styles.chips}>
          {anomalyCapture ? (
            // While waiting for the explanation: an instantly-available way out.
            <OptionChip label={t('anomaly.muteChip')} selected={false} onPress={muteAnomaly} />
          ) : microFlow ? (
            // Micro check-in answer chips (W3-9): 1-5 + skip + "ask me in an hour".
            <>
              {[1, 2, 3, 4, 5].map((v) => (
                <OptionChip key={v} label={String(v)} selected={false} onPress={() => answerMicro(v)} />
              ))}
              <OptionChip label={t('micro.skip')} selected={false} onPress={skipMicroField} />
              <OptionChip label={t('micro.later')} selected={false} onPress={() => snoozeMicro(microFlow.slot)} />
            </>
          ) : typicalSetup?.step === 'confirm' ? (
            <>
              <OptionChip label={t('typical.yes')} selected={false} onPress={() => confirmTypical(true)} />
              <OptionChip label={t('typical.no')} selected={false} onPress={() => confirmTypical(false)} />
            </>
          ) : areaSetup?.step === 'pick' ? (
            // The tickable confirmation card: every candidate is a toggle, and
            // the primary action names the count so it's clear what gets created.
            <>
              {areaSetup.candidates.map((a) => (
                <OptionChip
                  key={a}
                  label={a}
                  selected={areaSetup.ticked.includes(a)}
                  onPress={() => toggleArea(a)}
                />
              ))}
              <OptionChip
                label={
                  areaSetup.ticked.length > 0
                    ? t('areas.save', { count: areaSetup.ticked.length })
                    : t('areas.skip')
                }
                selected={false}
                onPress={saveAreas}
              />
            </>
          ) : cycleSetup?.step === 'confirm' ? (
            <>
              <OptionChip label={t('cycle.yes')} selected={false} onPress={() => confirmCycle(true)} />
              <OptionChip label={t('cycle.no')} selected={false} onPress={() => confirmCycle(false)} />
            </>
          ) : cycleSetup?.step === 'date' ? (
            // Chips for the two answers that cover most cases, so the common path
            // needs no typing at all; anything older is typed into the input.
            <>
              <OptionChip label={t('cycle.chipToday')} selected={false} onPress={() => setCycleStart(today)} />
              <OptionChip
                label={t('cycle.chipYesterday')}
                selected={false}
                onPress={() => setCycleStart(shiftDateKey(today, -1))}
              />
            </>
          ) : (
            <>
              {todayAnomaly && !anomalyHidden ? (
                <OptionChip
                  label={t(`anomaly.opener.${todayAnomaly.kind}` as 'anomaly.opener.sleep_short')}
                  selected={false}
                  onPress={startAnomalyCapture}
                />
              ) : null}
              {microPending && !microHidden.has(microPending.slot) ? (
                <OptionChip
                  label={t(`micro.opener.${microPending.slot}` as 'micro.opener.morning')}
                  selected={false}
                  onPress={startMicroFlow}
                />
              ) : null}
              {cyclePrompt && !cycleSetup ? (
                <OptionChip
                  label={t('cycle.opener')}
                  selected={false}
                  onPress={() => startCycleSetup(cyclePrompt)}
                />
              ) : null}
              {areaPromptEligible && !areaSetup ? (
                <OptionChip label={t('areas.opener')} selected={false} onPress={startAreaSetup} />
              ) : null}
              {eligibleGroup && !typicalSetup ? (
                <OptionChip
                  label={t(`typical.opener.${eligibleGroup}` as 'typical.opener.nutrition')}
                  selected={false}
                  onPress={() => startTypicalSetup(eligibleGroup)}
                />
              ) : null}
              {TEMPLATE_CHIPS.map((c) => (
                <OptionChip key={c.label} label={t(c.label as 'quicklog.chipMorning')} selected={false} onPress={() => insertTemplate(t(c.tpl as 'quicklog.tplMorning'))} />
              ))}
              {ASK_CHIPS.map((s) => (
                <OptionChip key={s.labelKey} label={t(s.labelKey as 'ask.sugDoses')} selected={false} onPress={() => runQuery(s.labelKey, s.query)} />
              ))}
              {isSupabaseConfigured ? (
                <OptionChip label={t('pepi.chipMovedTogether')} selected={false} onPress={runCorrelation} />
              ) : null}
            </>
          )}
        </View>
        )}

        <SafeAreaView edges={['bottom']} style={styles.composerWrap}>
          <Sunken style={styles.composer}>
            <TextInput
              style={[styles.input, { color: theme.text }]}
              value={text}
              onChangeText={(v) => {
                if (selection) setSelection(undefined);
                setText(v);
              }}
              selection={selection}
              placeholder={t('pepi.composerPlaceholder')}
              placeholderTextColor={theme.textMuted}
              multiline
              onSubmitEditing={() => send(text)}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('pepi.send')}
              disabled={pending || !text.trim()}
              onPress={() => send(text)}
              style={({ pressed }) => [
                styles.sendBtn,
                { backgroundColor: theme.accent, opacity: pending || !text.trim() ? 0.4 : 1 },
                pressed && styles.sendBtnPressed,
              ]}>
              <ThemedText type="monoSm" themeColor="background">
                {t('pepi.send')}
              </ThemedText>
            </Pressable>
          </Sunken>
        </SafeAreaView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

function Bubble({
  message,
  reduceMotion,
  showUndo,
  undone,
  onUndo,
  undoLabel,
  undoneLabel,
  series,
  onOpenTrend,
  viewLabel,
  noDataLabel,
}: {
  message: PepiMessage;
  reduceMotion: boolean;
  showUndo: boolean;
  undone: boolean;
  onUndo: () => void;
  undoLabel: string;
  undoneLabel: string;
  series?: MetricSeries;
  onOpenTrend?: () => void;
  viewLabel: string;
  noDataLabel: string;
}) {
  const theme = useTheme();
  const isUser = message.role === 'user';
  const tone =
    message.variant === 'error' ? 'signalBad' : message.variant === 'hint' ? 'textMuted' : 'text';

  const points: ChartPoint[] = (series?.primary ?? []).map((p) => ({ label: p.dateKey.slice(5), value: p.value }));
  const estimated: ChartPoint[] = (series?.estimated ?? []).map((p) => ({ label: p.dateKey.slice(5), value: p.value }));
  const hasChart = !!series && (points.length > 0 || estimated.length > 0);

  // Gentle enter animation (P-5): each new bubble fades + rises in on mount.
  // Reduce-motion pins it to the resting state.
  const [enter] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) {
      enter.setValue(1);
      return;
    }
    Animated.timing(enter, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [enter, reduceMotion]);

  return (
    <Animated.View
      style={{
        opacity: enter,
        transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
      }}>
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowPepi]}>
      <View
        style={[
          styles.bubble,
          isUser
            ? { backgroundColor: theme.backgroundSelected }
            : { backgroundColor: theme.backgroundElement },
        ]}>
        <ThemedText type={message.variant === 'log' ? 'mono' : 'body'} themeColor={tone}>
          {message.text}
        </ThemedText>
        {hasChart ? (
          <Pressable accessibilityRole="button" accessibilityHint={viewLabel} onPress={onOpenTrend} style={styles.chartBox}>
            <LineChart data={points} estimated={estimated} emptyLabel={noDataLabel} />
            <ThemedText type="monoSm" themeColor="accent" style={styles.viewTrend}>
              {viewLabel}
            </ThemedText>
          </Pressable>
        ) : null}
        {showUndo ? (
          undone ? (
            <ThemedText type="monoSm" themeColor="textMuted" style={styles.undoRow}>
              {undoneLabel}
            </ThemedText>
          ) : (
            <Pressable accessibilityRole="button" onPress={onUndo} style={styles.undoRow}>
              <ThemedText type="monoSm" themeColor="accent">
                {undoLabel}
              </ThemedText>
            </Pressable>
          )
        ) : null}
      </View>
    </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  flex: { flex: 1 },
  safe: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hero: { textTransform: 'uppercase', letterSpacing: 1 },
  thread: { flex: 1 },
  threadContent: { gap: Spacing.two, paddingVertical: Spacing.two },
  empty: { paddingVertical: Spacing.six, gap: Spacing.one, alignItems: 'center' },
  emptyHint: { textAlign: 'center', maxWidth: 320 },
  row: { flexDirection: 'row' },
  rowUser: { justifyContent: 'flex-end' },
  rowPepi: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '85%', paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: Radii.panel, gap: Spacing.one },
  chartBox: { marginTop: Spacing.one, gap: 2, minWidth: 220 },
  viewTrend: { textDecorationLine: 'underline' },
  undoRow: { marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  composerWrap: { paddingBottom: Spacing.two },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  input: { flex: 1, fontSize: 15, paddingVertical: Spacing.two, paddingHorizontal: Spacing.one, maxHeight: 120 },
  sendBtn: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.two, borderRadius: Radii.panel },
  sendBtnPressed: { transform: [{ scale: 0.94 }] },
});
