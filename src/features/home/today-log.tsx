import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { TextButton } from '@/components/form';
import { PencilIcon } from '@/components/icons';
import { Card, EngravedLabel, StatusPill } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { compoundBySlug } from '@/data/compound-catalog';
import { useTheme } from '@/hooks/use-theme';
import { localDateKey, useStore } from '@/lib/store';
import { useQuickLogActivity } from '@/lib/quick-log-runner';
import { useToday } from '@/lib/today';

/**
 * Today's log recap + editable note (redesign — merged out of Home). This is the
 * "what I logged today" summary; it lives at the foot of the reasoning screen
 * next to the "why" (the signal stack), so the two readouts share one surface
 * and Home stays a clean verdict → evidence → log flow.
 */
export function TodayLog({ bare = false }: { bare?: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { entries, doseEvents, profile, upsertCheckin } = useStore();
  const quickLog = useQuickLogActivity();

  const today = useToday();
  const todayEntry = entries[today];
  const loggedToday = !!todayEntry;
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');

  const dosesToday = doseEvents.filter((d) => localDateKey(new Date(d.takenAt)) === today);

  const distillation = useMemo(() => {
    const names = Array.from(
      new Set(
        dosesToday
          .map((d) => (d.compoundSlug ? compoundBySlug(d.compoundSlug)?.canonicalName : null))
          .filter(Boolean),
      ),
    ).slice(0, 2) as string[];
    const unit = profile.units === 'imperial' ? t('units.lb') : t('units.kg');
    const munit = profile.units === 'imperial' ? t('measurements.unitIn') : t('measurements.unitCm');
    const parts = [
      names.length ? t('dashboard.compoundsLogged', { names: names.join(' + ') }) : null,
      typeof todayEntry?.weight === 'number' ? `${todayEntry.weight} ${unit}` : null,
      typeof todayEntry?.protein === 'number' ? `+${todayEntry.protein}${t('units.g')}` : null,
      typeof todayEntry?.waist === 'number' ? `${t('measurements.waist')} ${todayEntry.waist}${munit}` : null,
      typeof todayEntry?.hips === 'number' ? `${t('measurements.hips')} ${todayEntry.hips}${munit}` : null,
    ].filter(Boolean);
    return parts.join(' · ');
  }, [dosesToday, todayEntry, profile.units, t]);

  const startEditNote = () => {
    setNoteDraft(todayEntry?.note ?? '');
    setEditingNote(true);
  };
  const saveNote = () => {
    upsertCheckin(today, { note: noteDraft.trim() || undefined });
    setEditingNote(false);
  };

  const head = (
    <View style={styles.summaryHead}>
      <EngravedLabel>{t('dashboard.distillation')}</EngravedLabel>
      <View style={styles.summaryHeadRight}>
        {quickLog.state === 'distilling' ? (
          <StatusPill label={t('dashboard.distillingPill')} tone="neutral" />
        ) : quickLog.state === 'error' ? (
          <StatusPill label={t('dashboard.distillErrorPill')} tone="bad" />
        ) : (
          <StatusPill
            label={loggedToday ? t('dashboard.onTrack') : t('dashboard.pending')}
            tone={loggedToday ? 'good' : 'neutral'}
          />
        )}
        {quickLog.state !== 'distilling' && !editingNote && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('dashboard.editNote')}
            onPress={startEditNote}
            hitSlop={8}>
            <PencilIcon size={16} color="textMuted" />
          </Pressable>
        )}
      </View>
    </View>
  );

  const body = editingNote ? (
    <View style={styles.noteEditor}>
      <TextInput
        style={[styles.noteInput, { color: theme.text, borderColor: theme.border }]}
        value={noteDraft}
        onChangeText={setNoteDraft}
        placeholder={t('dashboard.notePlaceholder')}
        placeholderTextColor={theme.textMuted}
        multiline
        autoFocus
      />
      <View style={styles.noteActions}>
        <TextButton label={t('common.cancel')} onPress={() => setEditingNote(false)} />
        <Pressable accessibilityRole="button" onPress={saveNote} hitSlop={8}>
          <ThemedText type="smallBold" themeColor="accent">
            {t('common.save')}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  ) : (
    <>
      <ThemedText type="small" themeColor="textSecondary">
        {quickLog.state === 'distilling'
          ? t('dashboard.distilling')
          : quickLog.state === 'error'
            ? t('dashboard.distillError')
            : quickLog.state === 'done' && quickLog.summary
              ? quickLog.summary
              : distillation || t('dashboard.notLoggedToday')}
      </ThemedText>
      {todayEntry?.note ? (
        <ThemedText type="small" themeColor="text" style={styles.noteText}>
          {todayEntry.note}
        </ThemedText>
      ) : null}
    </>
  );

  // Bare: no card — folds into the reasoning recap so today's facts + note read
  // as part of the verdict prose above them (R2-C C3).
  if (bare) {
    return (
      <View style={styles.bare}>
        {head}
        {body}
      </View>
    );
  }

  return (
    <Card style={styles.summary}>
      {head}
      {body}
    </Card>
  );
}

const styles = StyleSheet.create({
  summary: { gap: Spacing.two },
  bare: { gap: Spacing.two, marginTop: Spacing.one },
  summaryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  summaryHeadRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  noteText: { fontStyle: 'italic' },
  noteEditor: { gap: Spacing.two },
  noteInput: {
    minHeight: 60,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 2,
    padding: Spacing.two,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  noteActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
