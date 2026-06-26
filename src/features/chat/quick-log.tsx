import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { LabeledInput, PrimaryButton, ScaleSelector, TextButton } from '@/components/form';
import { Sunken } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { compoundBySlug } from '@/data/compound-catalog';
import { aiErrorKind, parseQuickLog, type ParsedItem } from '@/lib/ai';
import { localDateKey, useStore, type CheckinEntry } from '@/lib/store';

const AUTO_APPLY_CONFIDENCE = 0.7;

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

/** Conversational quick-log: one box → structured entities (spec 13). Confident
 * parses auto-apply with an undo affordance; low-confidence/unresolved wait for a tap. */
export function QuickLog({ seedPrompt }: { seedPrompt?: 'macros' } = {}) {
  const { t, i18n } = useTranslation();
  const { entries, upsertCheckin, addSymptomEvent, logDose, deleteSymptomEvent, deleteDose } =
    useStore();

  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState(seedPrompt === 'macros' ? t('quicklog.macroSeed') : '');
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [applied, setApplied] = useState<Set<number>>(new Set());
  const [undoBatch, setUndoBatch] = useState<UndoEntry[]>([]);
  const [pendingSymptoms, setPendingSymptoms] = useState<PendingSymptom[]>([]);
  const [status, setStatus] = useState<'idle' | 'notConfigured' | 'network' | 'server' | 'empty'>(
    'idle',
  );

  // Apply one item; returns how to reverse it (or null if not applicable).
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
    setApplied(new Set());
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
    if (!input || busy) return;
    setBusy(true);
    setStatus('idle');
    setReply('');
    setItems([]);
    setApplied(new Set());
    setUndoBatch([]);
    try {
      const result = await parseQuickLog(input, i18n.language);
      const parsed = result.items ?? [];
      const appliedIdx = new Set<number>();
      const undos: UndoEntry[] = [];
      const pending: PendingSymptom[] = [];
      parsed.forEach((item, idx) => {
        // Symptoms without a severity are completed conversationally (H-04) —
        // ask intensity (+ duration) rather than committing a bare record.
        if (item.kind === 'symptom' && item.symptomType && item.severity == null) {
          pending.push({
            type: item.symptomType,
            duration: item.durationMinutes ? String(item.durationMinutes) : '',
            note: item.note,
            onsetISO: item.onsetISO,
          });
          return;
        }
        if (item.confidence >= AUTO_APPLY_CONFIDENCE && isResolvable(item)) {
          const undo = applyItem(item);
          if (undo) {
            undos.push(undo);
            appliedIdx.add(idx);
          }
        }
      });
      setReply(result.reply ?? '');
      setItems(parsed);
      setApplied(appliedIdx);
      setUndoBatch(undos);
      setPendingSymptoms(pending);
      setStatus(parsed.length === 0 ? 'empty' : 'idle');
      setText('');
    } catch (err) {
      setStatus(aiErrorKind(err));
    } finally {
      setBusy(false);
    }
  };

  const addManually = (item: ParsedItem, idx: number) => {
    const undo = applyItem(item);
    if (!undo) return;
    setUndoBatch((prev) => [...prev, undo]);
    setApplied((prev) => new Set(prev).add(idx));
  };

  const describe = (item: ParsedItem): string => {
    switch (item.kind) {
      case 'weight':
        return `${t('fields.weight')}: ${item.weight}`;
      case 'checkin':
        // item.field is an untyped string from parsed JSON; the AI is constrained to fields.*.
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

  return (
    <View style={styles.container}>
      <ThemedText type="smallBold">{t('quicklog.title')}</ThemedText>
      <LabeledInput
        label={t('quicklog.label')}
        placeholder={t('quicklog.placeholder')}
        value={text}
        onChangeText={setText}
        multiline
        onSubmitEditing={submit}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {t('quicklog.voiceHint')}
      </ThemedText>
      <PrimaryButton
        label={busy ? t('quicklog.sending') : t('quicklog.send')}
        onPress={submit}
        disabled={busy || !text.trim()}
      />

      {busy && <ActivityIndicator />}

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

      {reply ? (
        <ThemedText type="small" themeColor="textSecondary">
          {reply}
        </ThemedText>
      ) : null}

      {/* Conversational symptom completion — ask intensity, then duration (H-04). */}
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

      {items.map((item, idx) => {
        if (item.kind === 'unknown') return null;
        if (item.kind === 'symptom' && item.severity == null) return null;
        const isApplied = applied.has(idx);
        const resolvable = isResolvable(item);
        return (
          <View key={idx} style={styles.row}>
            <ThemedText type="small" style={styles.rowText}>
              {describe(item)}
            </ThemedText>
            {isApplied ? (
              <ThemedText type="smallBold" themeColor="textSecondary">
                {t('quicklog.applied')}
              </ThemedText>
            ) : resolvable ? (
              <Pressable accessibilityRole="button" onPress={() => addManually(item, idx)}>
                <ThemedText type="smallBold">{t('quicklog.apply')}</ThemedText>
              </Pressable>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                {t('quicklog.unresolved')}
              </ThemedText>
            )}
          </View>
        );
      })}

      {/* Undo toast — reverse everything applied from this message (spec 13). */}
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

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  rowText: { flex: 1 },
  errorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  errorText: { flex: 1 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  pending: { gap: Spacing.two },
  pendingActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
