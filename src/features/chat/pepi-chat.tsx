import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OptionChip } from '@/components/form';
import { EngravedLabel, Sunken } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { aiErrorKind, parseQuickLog, type ParsedItem } from '@/lib/ai';
import { executeQuery } from '@/lib/ask/execute';
import { matchQuery, SUGGESTED_QUERIES } from '@/lib/ask/intent';
import type { Aggregation, PepiAnswer, PepiQuery, QueryMetric, Timeframe, UnitTag } from '@/lib/ask/types';
import { AUTO_APPLY_CONFIDENCE, isResolvable } from '@/lib/quick-log-apply';
import { formatDateKey } from '@/lib/dates';
import { localDateKey, useStore, type CheckinEntry, type PepiMessage } from '@/lib/store';
import { isSupabaseConfigured } from '@/lib/supabase';

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
    profile,
    upsertCheckin,
    addSymptomEvent,
    deleteSymptomEvent,
    logDose,
    deleteDose,
  } = store;

  const lang = i18n.language;
  const [text, setText] = useState('');
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [undoableIds, setUndoableIds] = useState<Set<string>>(new Set());
  const [undoneIds, setUndoneIds] = useState<Set<string>>(new Set());
  const undoMap = useRef<Map<string, () => void>>(new Map());
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(id);
  }, [pepiMessages, pending]);

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

  // ── Routing: parse-to-log first, else deterministic ask ────────────────────
  const send = async (raw: string) => {
    const input = raw.trim();
    if (!input || pending) return;
    addPepiMessage({ role: 'user', text: input });
    setText('');
    setSelection(undefined);
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
          addPepiMessage({ role: 'pepi', text: formatAnswer(executeQuery(q, snapshot, localDateKey())), variant: 'answer' });
          handled = true;
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
    }
  };

  const runQuery = (labelKey: string, query: PepiQuery) => {
    if (pending) return;
    addPepiMessage({ role: 'user', text: t(labelKey as 'ask.sugDoses') });
    addPepiMessage({ role: 'pepi', text: formatAnswer(executeQuery(query, { entries, doseEvents }, localDateKey())), variant: 'answer' });
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

        <View style={styles.chips}>
          {TEMPLATE_CHIPS.map((c) => (
            <OptionChip key={c.label} label={t(c.label as 'quicklog.chipMorning')} selected={false} onPress={() => insertTemplate(t(c.tpl as 'quicklog.tplMorning'))} />
          ))}
          {ASK_CHIPS.map((s) => (
            <OptionChip key={s.labelKey} label={t(s.labelKey as 'ask.sugDoses')} selected={false} onPress={() => runQuery(s.labelKey, s.query)} />
          ))}
        </View>

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
}: {
  message: PepiMessage;
  showUndo: boolean;
  undone: boolean;
  onUndo: () => void;
  undoLabel: string;
  undoneLabel: string;
}) {
  const theme = useTheme();
  const isUser = message.role === 'user';
  const tone =
    message.variant === 'error' ? 'signalBad' : message.variant === 'hint' ? 'textMuted' : 'text';

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
  undoRow: { marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  input: { flex: 1, fontSize: 15, paddingVertical: Spacing.two, maxHeight: 120 },
  sendBtn: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radii.panel },
});
