import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
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

import { useRouter, type Href } from 'expo-router';

import { OptionChip } from '@/components/form';
import { LineChart, type ChartPoint } from '@/components/line-chart';
import { EngravedLabel, Sunken } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { aiErrorKind, parseQuickLog, runInsights, type ParsedItem } from '@/lib/ai';
import { buildInsightHistory, selectChartSeries, selectPhotoDigest } from '@/lib/data-facade';
import { resolveMsg, useVerdict, type TFn } from '@/features/home/use-verdict';
import { CHART_METRICS, type MetricSeries } from '@/lib/chart-series';
import { executeQuery } from '@/lib/ask/execute';
import { matchQuery, SUGGESTED_QUERIES } from '@/lib/ask/intent';
import type { Aggregation, PepiAnswer, PepiQuery, QueryMetric, Timeframe, UnitTag } from '@/lib/ask/types';
import { AUTO_APPLY_CONFIDENCE, isResolvable } from '@/lib/quick-log-apply';
import { daysBetween, formatDateKey, shiftDateKey } from '@/lib/dates';
import { surfaceFields } from '@/lib/field-surfacing';
import { localDateKey, useStore, type CheckinEntry, type PepiMessage } from '@/lib/store';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
  firstEligibleTypicalGroup,
  matchTypicalDeviation,
  validateTypicalValue,
  TYPICAL_GROUPS,
  type TypicalGroup,
} from '@/lib/typical-day';

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
  const [undoableIds, setUndoableIds] = useState<Set<string>>(new Set());
  const [undoneIds, setUndoneIds] = useState<Set<string>>(new Set());
  const undoMap = useRef<Map<string, () => void>>(new Map());
  const scrollRef = useRef<ScrollView>(null);
  // Keyboard state (P-4): when the keyboard is up we hide the template chips (they
  // would otherwise be shoved over the composer) and keep the thread pinned to the
  // latest message so the composer never covers what you just sent.
  const [keyboardUp, setKeyboardUp] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(id);
  }, [pepiMessages, pending]);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, () => {
      setKeyboardUp(true);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardUp(false));
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

    addPepiMessage({ role: 'user', text: input });
    setText('');
    setSelection(undefined);

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
              { entries, metricReadings, protocolItems, doseEvents, symptomEvents, profile, photos },
              today,
            ),
            locale: lang,
            tier: 'quick',
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
          <View style={styles.headerText}>
            <EngravedLabel>{t('tabs.pepi')}</EngravedLabel>
            <ThemedText type="small" themeColor="textSecondary">
              {t('pepi.subtitle')}
            </ThemedText>
          </View>
          {pepiMessages.length > 0 ? (
            <Pressable accessibilityRole="button" onPress={clearPepiMessages}>
              <ThemedText type="monoSm" themeColor="textMuted">
                {t('pepi.clear')}
              </ThemedText>
            </Pressable>
          ) : null}
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

        {!keyboardUp && (
        <View style={styles.chips}>
          {typicalSetup?.step === 'confirm' ? (
            <>
              <OptionChip label={t('typical.yes')} selected={false} onPress={() => confirmTypical(true)} />
              <OptionChip label={t('typical.no')} selected={false} onPress={() => confirmTypical(false)} />
            </>
          ) : (
            <>
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
            </>
          )}
        </View>
        )}

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
            style={[styles.sendBtn, { backgroundColor: theme.accent, opacity: pending || !text.trim() ? 0.4 : 1 }]}>
            <ThemedText type="monoSm" themeColor="background">
              {t('pepi.send')}
            </ThemedText>
          </Pressable>
        </Sunken>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

function Bubble({
  message,
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

  return (
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
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerText: { gap: 2, flex: 1 },
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
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  input: { flex: 1, fontSize: 15, paddingVertical: Spacing.two, maxHeight: 120 },
  sendBtn: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radii.panel },
});
