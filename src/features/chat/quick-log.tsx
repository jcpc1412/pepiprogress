import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Animated, Pressable, StyleSheet, View } from 'react-native';

import { LabeledInput, OptionChip, PrimaryButton, ScaleSelector, TextButton } from '@/components/form';
import { SignalDotIcon } from '@/components/icons';
import { EngravedLabel, Sunken } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { compoundBySlug } from '@/data/compound-catalog';
import { aiErrorKind, parseQuickLog, type ParsedItem } from '@/lib/ai';
import { useTheme } from '@/hooks/use-theme';
import { localDateKey, useStore, type CheckinEntry } from '@/lib/store';

const AUTO_APPLY_CONFIDENCE = 0.7;
const PARSE_ANIM_MS = 1700;

/** A symptom parsed without a severity — completed conversationally (H-04). */
type PendingSymptom = {
  type: string;
  severity?: number;
  duration: string;
  note?: string;
  onsetISO?: string;
};

/** Enough to reverse a single applied item (the undo toast, spec 13). */
type UndoEntry =
  | { kind: 'symptom'; id: string }
  | { kind: 'dose'; id: string }
  | { kind: 'checkin'; field: keyof CheckinEntry; prior: number | string | undefined };

type Phase = 'input' | 'parsing' | 'reviewing';

function isResolvable(item: ParsedItem): boolean {
  switch (item.kind) {
    case 'weight':
      return typeof item.weight === 'number';
    case 'checkin':
      return !!item.field && typeof item.value === 'number';
    case 'symptom':
      return !!item.symptomType;
    case 'dose':
      return !!item.compoundSlug;
    default:
      return false;
  }
}

/** Conversational quick-log: input → parse (progress bar) → review → confirm (handoff §6). */
export function QuickLog({
  seedPrompt,
  onDismiss,
}: { seedPrompt?: 'macros'; onDismiss?: () => void } = {}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { entries, upsertCheckin, addSymptomEvent, logDose, deleteSymptomEvent, deleteDose } =
    useStore();

  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>('input');
  const [reply, setReply] = useState(seedPrompt === 'macros' ? t('quicklog.macroSeed') : '');
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [pendingSymptoms, setPendingSymptoms] = useState<PendingSymptom[]>([]);
  const [undoBatch, setUndoBatch] = useState<UndoEntry[]>([]);
  const [status, setStatus] = useState<'idle' | 'notConfigured' | 'network' | 'server' | 'empty'>(
    'idle',
  );

  const [progressAnim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (phase === 'parsing') {
      progressAnim.setValue(0);
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: PARSE_ANIM_MS,
        useNativeDriver: false,
      }).start();
    }
  }, [phase, progressAnim]);

  const applyItem = (item: ParsedItem): UndoEntry | null => {
    const today = localDateKey();
    const todayEntry = entries[today];
    switch (item.kind) {
      case 'weight':
        upsertCheckin(today, { weight: item.weight });
        return { kind: 'checkin', field: 'weight', prior: todayEntry?.weight };
      case 'checkin': {
        if (!item.field) return null;
        const field = item.field as keyof CheckinEntry;
        const prior = todayEntry?.[field] as number | string | undefined;
        upsertCheckin(today, { [field]: item.value });
        return { kind: 'checkin', field, prior };
      }
      case 'symptom': {
        const id = addSymptomEvent({
          type: item.symptomType ?? '',
          onsetAt: item.onsetISO ?? new Date().toISOString(),
          durationMinutes: item.durationMinutes,
          severity: item.severity,
          note: item.note,
        });
        return { kind: 'symptom', id };
      }
      case 'dose': {
        const id = logDose({
          compoundSlug: item.compoundSlug,
          takenAt: item.onsetISO ?? new Date().toISOString(),
          dose: item.dose,
          doseUnit: item.doseUnit,
        });
        return { kind: 'dose', id };
      }
      default:
        return null;
    }
  };

  const reverse = (entry: UndoEntry) => {
    if (entry.kind === 'symptom') deleteSymptomEvent(entry.id);
    else if (entry.kind === 'dose') deleteDose(entry.id);
    else upsertCheckin(localDateKey(), { [entry.field]: entry.prior });
  };

  const undoAll = () => {
    undoBatch.forEach(reverse);
    setUndoBatch([]);
    setPhase('input');
  };

  const setPendingField = (idx: number, patch: Partial<PendingSymptom>) =>
    setPendingSymptoms((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));

  const commitPending = (idx: number) => {
    const p = pendingSymptoms[idx];
    if (!p) return;
    const minutes = parseInt(p.duration, 10);
    const id = addSymptomEvent({
      type: p.type,
      onsetAt: p.onsetISO ?? new Date().toISOString(),
      severity: p.severity,
      durationMinutes: Number.isFinite(minutes) ? minutes : undefined,
      note: p.note,
    });
    setUndoBatch((prev) => [...prev, { kind: 'symptom', id }]);
    setPendingSymptoms((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    const input = text.trim();
    if (!input || phase === 'parsing') return;
    setPhase('parsing');
    setStatus('idle');
    setReply('');
    setItems([]);
    setPendingSymptoms([]);
    setUndoBatch([]);
    try {
      const result = await parseQuickLog(input, i18n.language);
      const parsed = result.items ?? [];
      const pending: PendingSymptom[] = [];
      parsed.forEach((item) => {
        if (item.kind === 'symptom' && item.symptomType && item.severity == null) {
          pending.push({
            type: item.symptomType,
            duration: item.durationMinutes ? String(item.durationMinutes) : '',
            note: item.note,
            onsetISO: item.onsetISO,
          });
        }
      });
      setReply(result.reply ?? '');
      setItems(parsed);
      setPendingSymptoms(pending);
      setStatus(parsed.length === 0 ? 'empty' : 'idle');
      setPhase(parsed.length === 0 ? 'input' : 'reviewing');
    } catch (err) {
      setStatus(aiErrorKind(err));
      setPhase('input');
    }
  };

  const confirm = () => {
    const undos: UndoEntry[] = [];
    items.forEach((item) => {
      if (item.kind === 'unknown') return;
      if (item.kind === 'symptom' && item.severity == null) return;
      if ((item.confidence ?? 1) >= AUTO_APPLY_CONFIDENCE && isResolvable(item)) {
        const undo = applyItem(item);
        if (undo) undos.push(undo);
      }
    });
    setUndoBatch(undos);
    setText('');
    onDismiss?.();
  };

  const backToInput = () => {
    setPhase('input');
    setItems([]);
  };

  const describe = (item: ParsedItem): string => {
    switch (item.kind) {
      case 'weight':
        return `${t('fields.weight')}: ${item.weight}`;
      case 'checkin':
        return item.field ? `${t(`fields.${item.field}` as 'fields.weight')}: ${item.value}` : '';
      case 'symptom':
        return [
          item.symptomType,
          item.severity ? t('symptoms.severityShort', { value: item.severity }) : null,
        ]
          .filter(Boolean)
          .join(' · ');
      case 'dose': {
        const name = item.compoundSlug
          ? compoundBySlug(item.compoundSlug)?.canonicalName
          : item.compoundName;
        return [name ?? item.compoundName, item.dose ? `${item.dose}${item.doseUnit ?? ''}` : null]
          .filter(Boolean)
          .join(' · ');
      }
      default:
        return item.note ?? t('quicklog.unresolved');
    }
  };

  // ── Input phase ────────────────────────────────────────────────────────────
  if (phase === 'input') {
    return (
      <View style={styles.container}>
        <LabeledInput
          label={t('quicklog.title')}
          placeholder={t('quicklog.placeholder')}
          value={text}
          onChangeText={setText}
          multiline
          style={styles.inputWell}
          onSubmitEditing={submit}
        />
        <ThemedText type="small" themeColor="textSecondary">
          {t('quicklog.voiceHint')}
        </ThemedText>

        {/* Quick-add suggestion chips — append to the input */}
        <EngravedLabel>{t('quicklog.suggestionsLabel')}</EngravedLabel>
        <View style={styles.suggestions}>
          {(
            [
              ['quicklog.sugSleep', t('quicklog.sugSleep')],
              ['quicklog.sugWeight', t('quicklog.sugWeight')],
              ['quicklog.sugEnergy', t('quicklog.sugEnergy')],
              ['quicklog.sugDose', t('quicklog.sugDose')],
              ['quicklog.sugSymptom', t('quicklog.sugSymptom')],
            ] as const
          ).map(([key, label]) => (
            <OptionChip
              key={key}
              label={label}
              selected={false}
              onPress={() => setText((cur) => (cur.trim() ? `${cur.trim()}, ${label}` : label))}
            />
          ))}
        </View>

        <PrimaryButton
          label={t('quicklog.parseApply')}
          onPress={submit}
          disabled={!text.trim()}
        />

        {status === 'notConfigured' && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('quicklog.notConfigured')}
          </ThemedText>
        )}
        {(status === 'network' || status === 'server') && (
          <View style={styles.errorRow}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.errorText}>
              {t(status === 'network' ? 'common.errorNetwork' : 'common.errorServer')}
            </ThemedText>
            <TextButton label={t('common.retry')} onPress={submit} />
          </View>
        )}
        {status === 'empty' && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('quicklog.nothing')}
          </ThemedText>
        )}

        {undoBatch.length > 0 && (
          <View style={styles.toast}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('quicklog.addedCount', { count: undoBatch.length })}
            </ThemedText>
            <Pressable accessibilityRole="button" onPress={undoAll}>
              <ThemedText type="smallBold">{t('quicklog.undo')}</ThemedText>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  // ── Parsing phase: spinner + animated progress bar (~1.7s) ────────────────
  if (phase === 'parsing') {
    return (
      <View style={styles.container}>
        <ThemedText type="smallBold">{t('quicklog.sending')}</ThemedText>
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                backgroundColor: theme.accent,
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
        <ActivityIndicator />
      </View>
    );
  }

  // ── Review phase: detected entries + CONFIRM ──────────────────────────────
  const reviewableItems = items.filter(
    (item) =>
      item.kind !== 'unknown' &&
      !(item.kind === 'symptom' && item.severity == null) &&
      isResolvable(item),
  );

  return (
    <View style={styles.container}>
      <View style={styles.reviewHeader}>
        <TextButton label={t('common.back')} onPress={backToInput} />
        <ThemedText type="label" themeColor="textMuted">
          {t('quicklog.reviewLabel')}
        </ThemedText>
      </View>

      {reply ? (
        <ThemedText type="small" themeColor="textSecondary">
          {reply}
        </ThemedText>
      ) : null}

      {reviewableItems.map((item, idx) => (
        <View key={idx} style={styles.reviewRow}>
          <SignalDotIcon size={8} color="signalGood" />
          <ThemedText type="small" style={styles.reviewText}>
            {describe(item)}
          </ThemedText>
        </View>
      ))}

      {reviewableItems.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('quicklog.nothing')}
        </ThemedText>
      )}

      {/* Conversational symptom completion — ask intensity + duration (H-04). */}
      {pendingSymptoms.map((p, idx) => (
        <Sunken key={`pending-${idx}`} style={styles.pending}>
          <ThemedText type="smallBold">{p.type}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('symptoms.severity')}
          </ThemedText>
          <ScaleSelector value={p.severity} onChange={(v) => setPendingField(idx, { severity: v })} />
          <LabeledInput
            label={t('symptoms.duration')}
            placeholder={t('symptoms.durationPlaceholder')}
            keyboardType="number-pad"
            value={p.duration}
            onChangeText={(v) => setPendingField(idx, { duration: v })}
          />
          <View style={styles.pendingActions}>
            <TextButton label={t('common.cancel')} onPress={() => commitPending(idx)} />
            <Pressable accessibilityRole="button" onPress={() => commitPending(idx)}>
              <ThemedText type="smallBold">{t('symptoms.log')}</ThemedText>
            </Pressable>
          </View>
        </Sunken>
      ))}

      <PrimaryButton
        label={t('quicklog.confirm')}
        onPress={confirm}
        disabled={reviewableItems.length === 0 && pendingSymptoms.length === 0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  inputWell: { minHeight: 120, textAlignVertical: 'top' },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  errorText: { flex: 1 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  reviewText: { flex: 1 },
  pending: { gap: Spacing.two },
  pendingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  rowText: { flex: 1 },
});
