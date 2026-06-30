import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Animated, Pressable, StyleSheet, View } from 'react-native';

import { LabeledInput, OptionChip, PrimaryButton, ScaleSelector, TextButton } from '@/components/form';
import { SignalDotIcon } from '@/components/icons';
import { Divider, EngravedLabel, Sunken } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { COMPOUND_CATALOG, compoundBySlug } from '@/data/compound-catalog';
import { aiErrorKind, parseQuickLog, type ParsedItem } from '@/lib/ai';
import { useTheme } from '@/hooks/use-theme';
import { localDateKey, useStore, type CheckinEntry } from '@/lib/store';

const AUTO_APPLY_CONFIDENCE = 0.7;
const PARSE_ANIM_MS = 1700;
const DISAMBIG_RESULTS = 4;

/** A symptom parsed without a severity — completed conversationally (H-04). */
type PendingSymptom = {
  type: string;
  severity?: number;
  duration: string;
  note?: string;
  onsetISO?: string;
};

/** A dose whose compound the AI named but couldn't match in the catalog. */
type UnmatchedDose = {
  compoundName: string;
  dose?: number;
  unit?: string;
  search: string;
  pickedSlug?: string;
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
  const [unmatchedDoses, setUnmatchedDoses] = useState<UnmatchedDose[]>([]);
  const [unknownFragments, setUnknownFragments] = useState<string[]>([]);
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

  const setUnmatchedField = (idx: number, patch: Partial<UnmatchedDose>) =>
    setUnmatchedDoses((prev) => prev.map((u, i) => (i === idx ? { ...u, ...patch } : u)));

  const catalogSearch = useMemo(
    () => (query: string) => {
      const q = query.toLowerCase().trim();
      if (!q) return COMPOUND_CATALOG.slice(0, DISAMBIG_RESULTS);
      return COMPOUND_CATALOG.filter(
        (c) =>
          c.canonicalName.toLowerCase().includes(q) ||
          c.slug.includes(q) ||
          c.aliases?.some((a) => a.toLowerCase().includes(q)),
      ).slice(0, DISAMBIG_RESULTS);
    },
    [],
  );

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
    setUnmatchedDoses([]);
    setUnknownFragments([]);
    setUndoBatch([]);
    try {
      const result = await parseQuickLog(input, i18n.language);
      const parsed = result.items ?? [];
      const pending: PendingSymptom[] = [];
      const unmatched: UnmatchedDose[] = [];
      const unknown: string[] = [];
      parsed.forEach((item) => {
        if (item.kind === 'symptom' && item.symptomType && item.severity == null) {
          pending.push({
            type: item.symptomType,
            duration: item.durationMinutes ? String(item.durationMinutes) : '',
            note: item.note,
            onsetISO: item.onsetISO,
          });
        }
        if (item.kind === 'dose' && !item.compoundSlug && item.compoundName) {
          unmatched.push({
            compoundName: item.compoundName,
            dose: item.dose,
            unit: item.doseUnit,
            search: item.compoundName,
          });
        }
        if (item.kind === 'unknown' && item.note) {
          unknown.push(item.note);
        }
      });
      setReply(result.reply ?? '');
      setItems(parsed);
      setPendingSymptoms(pending);
      setUnmatchedDoses(unmatched);
      setUnknownFragments(unknown);
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
      if (item.kind === 'dose' && !item.compoundSlug) return; // handled via unmatchedDoses
      if ((item.confidence ?? 1) >= AUTO_APPLY_CONFIDENCE && isResolvable(item)) {
        const undo = applyItem(item);
        if (undo) undos.push(undo);
      }
    });
    // Apply any unmatched doses the user resolved with a catalog pick
    unmatchedDoses.forEach((u) => {
      if (!u.pickedSlug || u.pickedSlug === '__skip__') return;
      const id = logDose({ compoundSlug: u.pickedSlug, takenAt: new Date().toISOString(), dose: u.dose, doseUnit: u.unit });
      undos.push({ kind: 'dose', id });
    });
    setUndoBatch(undos);
    setText('');
    setUnmatchedDoses([]);
    setUnknownFragments([]);
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

      {/* ── Disambiguation: unmatched doses ── */}
      {unmatchedDoses.length > 0 && (
        <View style={styles.disambigSection}>
          <Divider />
          <EngravedLabel>{t('quicklog.unclearLabel')}</EngravedLabel>
          {unmatchedDoses.map((u, idx) => {
            const matches = catalogSearch(u.search);
            return (
              <Sunken key={idx} style={styles.disambigCard}>
                <ThemedText type="monoSm" themeColor="textMuted">{t('quicklog.unclearCompound')}</ThemedText>
                <ThemedText type="smallBold">
                  {u.compoundName}{u.dose ? ` · ${u.dose}${u.unit ?? ''}` : ''}
                </ThemedText>
                <LabeledInput
                  label={t('quicklog.compoundSearch')}
                  placeholder={u.compoundName}
                  value={u.search}
                  onChangeText={(v) => setUnmatchedField(idx, { search: v, pickedSlug: undefined })}
                />
                {matches.length > 0 && (
                  <View style={styles.suggestions}>
                    {matches.map((c) => (
                      <OptionChip
                        key={c.slug}
                        label={c.canonicalName}
                        selected={u.pickedSlug === c.slug}
                        onPress={() => setUnmatchedField(idx, { pickedSlug: c.slug, search: c.canonicalName })}
                      />
                    ))}
                  </View>
                )}
                {u.pickedSlug ? (
                  <ThemedText type="monoSm" themeColor="signalGood">
                    {t('quicklog.unclearResolved', { name: compoundBySlug(u.pickedSlug)?.canonicalName ?? u.pickedSlug })}
                  </ThemedText>
                ) : (
                  <Pressable accessibilityRole="button" onPress={() => setUnmatchedField(idx, { pickedSlug: '__skip__' })}>
                    <ThemedText type="monoSm" themeColor="textMuted" style={styles.skipLink}>{t('quicklog.skipItem')}</ThemedText>
                  </Pressable>
                )}
              </Sunken>
            );
          })}
        </View>
      )}

      {/* ── Disambiguation: truly unknown fragments ── */}
      {unknownFragments.length > 0 && (
        <View style={styles.disambigSection}>
          {unmatchedDoses.length === 0 && <Divider />}
          {unknownFragments.map((note, idx) => (
            <View key={idx} style={styles.unknownRow}>
              <ThemedText type="monoSm" themeColor="textMuted">{t('quicklog.unclearSkipped')}</ThemedText>
              <ThemedText type="monoSm" themeColor="textSecondary" style={styles.unknownNote}>{note}</ThemedText>
            </View>
          ))}
        </View>
      )}

      <PrimaryButton
        label={t('quicklog.confirm')}
        onPress={confirm}
        disabled={reviewableItems.length === 0 && pendingSymptoms.length === 0 && unmatchedDoses.every(u => !u.pickedSlug || u.pickedSlug === '__skip__')}
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
  disambigSection: { gap: Spacing.two },
  disambigCard: { gap: Spacing.two },
  skipLink: { textDecorationLine: 'underline' },
  unknownRow: { gap: Spacing.one },
  unknownNote: { fontStyle: 'italic' },
});
