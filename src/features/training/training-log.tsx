import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { LabeledInput, PrimaryButton, SingleSelectChips, TextButton } from '@/components/form';
import { Card, Divider, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { hapticSuccess } from '@/lib/haptics';
import { bestE1RM, tonnage, type StrengthSet } from '@/lib/strength';
import { useStore } from '@/lib/store';

type Mode = 'strength' | 'benchmark';
type DraftSet = { weight: string; reps: string };

/**
 * Training log (W5-21). Sport-agnostic manual entry inside the detailed log: a
 * strength session (a named movement + its sets, from which tonnage + e1RM are
 * derived) or a benchmark (a named test + a freeform value, so a 5k time, a
 * pushup count, or a vertical all fit one field). Recent entries list beneath,
 * each removable. Attaches to the day being logged.
 */
export function TrainingLog({ date }: { date: string }) {
  const { t } = useTranslation();
  const { strengthSessions, benchmarks, addStrengthSession, deleteStrengthSession, addBenchmark, deleteBenchmark, profile } =
    useStore();
  const wUnit = profile.units === 'imperial' ? t('units.lb') : t('units.kg');

  const [mode, setMode] = useState<Mode>('strength');

  // Strength draft.
  const [exercise, setExercise] = useState('');
  const [sets, setSets] = useState<DraftSet[]>([{ weight: '', reps: '' }]);
  const parsedSets: StrengthSet[] = useMemo(
    () =>
      sets
        .map((s) => ({ weight: Number(s.weight), reps: Number(s.reps) }))
        .filter((s) => Number.isFinite(s.weight) && Number.isFinite(s.reps) && s.reps > 0),
    [sets],
  );
  const canSaveStrength = exercise.trim().length > 0 && parsedSets.length > 0;
  const previewTonnage = tonnage(parsedSets);
  const previewE1RM = Math.round(bestE1RM(parsedSets));

  // Benchmark draft.
  const [benchName, setBenchName] = useState('');
  const [benchValue, setBenchValue] = useState('');
  const canSaveBench = benchName.trim().length > 0 && benchValue.trim().length > 0;

  const updateSet = (i: number, patch: Partial<DraftSet>) =>
    setSets((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const addSetRow = () => setSets((prev) => [...prev, { weight: '', reps: '' }]);

  const saveStrength = () => {
    if (!canSaveStrength) return;
    addStrengthSession({ date, exercise: exercise.trim(), sets: parsedSets, updatedAt: new Date().toISOString() });
    hapticSuccess();
    setExercise('');
    setSets([{ weight: '', reps: '' }]);
  };

  const saveBench = () => {
    if (!canSaveBench) return;
    addBenchmark({ date, name: benchName.trim(), value: benchValue.trim(), updatedAt: new Date().toISOString() });
    hapticSuccess();
    setBenchName('');
    setBenchValue('');
  };

  // Recent, most-recent-first, capped.
  const recentSessions = useMemo(() => [...strengthSessions].slice(0, 4), [strengthSessions]);
  const recentBenchmarks = useMemo(() => [...benchmarks].slice(0, 4), [benchmarks]);

  return (
    <Card style={styles.card}>
      <EngravedLabel>{t('training.title')}</EngravedLabel>

      <SingleSelectChips
        options={[
          { value: 'strength', label: t('training.modeStrength') },
          { value: 'benchmark', label: t('training.modeBenchmark') },
        ]}
        value={mode}
        onChange={setMode}
      />

      {mode === 'strength' ? (
        <View style={styles.form}>
          <LabeledInput
            label={t('training.exercise')}
            placeholder={t('training.exercisePlaceholder')}
            value={exercise}
            onChangeText={setExercise}
          />
          {sets.map((s, i) => (
            <View key={i} style={styles.setRow}>
              <View style={styles.setField}>
                <LabeledInput
                  label={i === 0 ? t('training.weight', { unit: wUnit }) : undefined}
                  placeholder="0"
                  keyboardType="numeric"
                  value={s.weight}
                  onChangeText={(v) => updateSet(i, { weight: v })}
                />
              </View>
              <View style={styles.setField}>
                <LabeledInput
                  label={i === 0 ? t('training.reps') : undefined}
                  placeholder="0"
                  keyboardType="numeric"
                  value={s.reps}
                  onChangeText={(v) => updateSet(i, { reps: v })}
                />
              </View>
            </View>
          ))}
          <TextButton label={t('training.addSet')} onPress={addSetRow} />
          {parsedSets.length > 0 ? (
            <ThemedText type="monoSm" themeColor="textMuted">
              {t('training.derived', { tonnage: Math.round(previewTonnage), unit: wUnit, e1rm: previewE1RM })}
            </ThemedText>
          ) : null}
          <PrimaryButton label={t('training.saveSession')} onPress={saveStrength} disabled={!canSaveStrength} />
        </View>
      ) : (
        <View style={styles.form}>
          <LabeledInput
            label={t('training.benchName')}
            placeholder={t('training.benchNamePlaceholder')}
            value={benchName}
            onChangeText={setBenchName}
          />
          <LabeledInput
            label={t('training.benchValue')}
            placeholder={t('training.benchValuePlaceholder')}
            value={benchValue}
            onChangeText={setBenchValue}
          />
          <PrimaryButton label={t('training.saveBenchmark')} onPress={saveBench} disabled={!canSaveBench} />
        </View>
      )}

      {recentSessions.length > 0 || recentBenchmarks.length > 0 ? (
        <>
          <Divider />
          <EngravedLabel>{t('training.recent')}</EngravedLabel>
          {recentSessions.map((s) => (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              accessibilityHint={t('common.remove')}
              onLongPress={() => deleteStrengthSession(s.id)}
              style={styles.recentRow}>
              <ThemedText type="smallBold" style={styles.recentName} numberOfLines={1}>
                {s.exercise}
              </ThemedText>
              <ThemedText type="mono" themeColor="numeral">
                {t('training.rowStrength', { e1rm: Math.round(bestE1RM(s.sets)), unit: wUnit, sets: s.sets.length })}
              </ThemedText>
            </Pressable>
          ))}
          {recentBenchmarks.map((b) => (
            <Pressable
              key={b.id}
              accessibilityRole="button"
              accessibilityHint={t('common.remove')}
              onLongPress={() => deleteBenchmark(b.id)}
              style={styles.recentRow}>
              <ThemedText type="smallBold" style={styles.recentName} numberOfLines={1}>
                {b.name}
              </ThemedText>
              <ThemedText type="mono" themeColor="numeral">
                {b.value}
                {b.unit ? ` ${b.unit}` : ''}
              </ThemedText>
            </Pressable>
          ))}
          <ThemedText type="monoSm" themeColor="textMuted">
            {t('training.deleteHint')}
          </ThemedText>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two },
  form: { gap: Spacing.two },
  setRow: { flexDirection: 'row', gap: Spacing.two },
  setField: { flex: 1 },
  recentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, paddingVertical: Spacing.one },
  recentName: { flex: 1 },
});
