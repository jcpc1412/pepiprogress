import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChevronRightIcon } from '@/components/icons';
import { CompletenessDots } from '@/components/journal-primitives';
import { EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { compoundBySlug } from '@/data/compound-catalog';
import { surfaceFields, type CheckinField } from '@/lib/field-surfacing';
import { completeness, dosesForDay } from '@/lib/journal-day';
import { localDateKey, useStore } from '@/lib/store';
import { useToday } from '@/lib/today';

/**
 * Today's record (F4, item 38) — a one-line window into the day-in-review, placed
 * on Home above the doses. Distillation + completeness dots + a chevron into the
 * Journal tab. It describes what's logged, never nags what isn't (spec 03).
 */
export function TodayRecordStrip() {
  const { t } = useTranslation();
  const router = useRouter();
  const { entries, doseEvents, profile } = useStore();
  const today = useToday();
  const dayKeyOf = (iso: string) => localDateKey(new Date(iso));

  const entry = entries[today];
  const dayDoses = useMemo(() => dosesForDay(doseEvents, today, dayKeyOf), [doseEvents, today]);

  const trackedFields = useMemo(
    () =>
      surfaceFields(profile.goals, profile.compoundSlugs).fields.filter(
        (f): f is CheckinField => f !== 'face_photo' && f !== 'body_photo' && f !== 'note',
      ),
    [profile.goals, profile.compoundSlugs],
  );
  const comp = completeness(entry, trackedFields);

  const unit = profile.units === 'imperial' ? t('units.lb') : t('units.kg');
  const distillation = useMemo(() => {
    const names = Array.from(
      new Set(dayDoses.map((d) => (d.compoundSlug ? compoundBySlug(d.compoundSlug)?.canonicalName : null)).filter(Boolean)),
    ).slice(0, 2) as string[];
    const parts = [
      names.length ? t('dashboard.compoundsLogged', { names: names.join(' + ') }) : null,
      typeof entry?.weight === 'number' ? `${entry.weight} ${unit}` : null,
      typeof entry?.protein === 'number' ? `+${entry.protein}${t('units.g')}` : null,
    ].filter(Boolean);
    return parts.join(' · ');
  }, [dayDoses, entry, unit, t]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('journal.todayRecord')}
      accessibilityHint={t('tabs.journal')}
      onPress={() => router.push('/journal')}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.body}>
        <EngravedLabel>{t('journal.todayRecord')}</EngravedLabel>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {distillation || t('journal.emptyToday')}
        </ThemedText>
        {comp.total > 0 ? <CompletenessDots filled={comp.filled} total={comp.total} /> : null}
      </View>
      <ChevronRightIcon size={18} color="textMuted" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  pressed: { opacity: 0.6 },
  body: { flex: 1, gap: Spacing.one },
});
