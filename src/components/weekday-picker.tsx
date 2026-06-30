import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Compact Mon–Sun toggle bar. Tap individual days to select/deselect.
 * Values are JS day numbers (0 = Sun, 1 = Mon … 6 = Sat).
 * Also exposes an "As needed" option which sets value to [].
 */
export function WeekdayPicker({
  value,
  onChange,
}: {
  value: number[] | undefined;
  onChange: (days: number[]) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();

  // Mon first display order: 1,2,3,4,5,6,0
  const displayOrder = [1, 2, 3, 4, 5, 6, 0];
  const dayLabels: Record<number, string> = {
    0: t('weekdays.sun'),
    1: t('weekdays.mon'),
    2: t('weekdays.tue'),
    3: t('weekdays.wed'),
    4: t('weekdays.thu'),
    5: t('weekdays.fri'),
    6: t('weekdays.sat'),
  };

  const selected = value ?? [];
  const asNeeded = selected.length === 0 && value !== undefined;

  const toggle = (day: number) => {
    const set = new Set(selected);
    if (set.has(day)) set.delete(day);
    else set.add(day);
    onChange([...set]);
  };

  return (
    <View style={styles.wrap}>
      {/* Day cells */}
      <View style={styles.row}>
        {displayOrder.map((day) => {
          const active = selected.includes(day);
          return (
            <Pressable
              key={day}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                // Tapping a day when "as needed" is active: start a fresh selection
                if (asNeeded) {
                  onChange([day]);
                } else {
                  toggle(day);
                }
              }}
              style={[
                styles.cell,
                {
                  backgroundColor: active ? theme.accent : theme.surfaceSunken,
                  borderColor: theme.border,
                },
              ]}>
              <ThemedText type="monoSm" themeColor={active ? 'onAccent' : 'textMuted'}>
                {dayLabels[day]}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {/* "As needed" toggle */}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: asNeeded }}
        onPress={() => onChange(asNeeded ? [] : [])}
        style={[
          styles.asNeeded,
          {
            backgroundColor: asNeeded ? theme.accent : theme.surfaceSunken,
            borderColor: theme.border,
          },
        ]}>
        <ThemedText type="monoSm" themeColor={asNeeded ? 'onAccent' : 'textSecondary'}>
          {t('frequencies.as_needed').toUpperCase()}
        </ThemedText>
      </Pressable>
    </View>
  );
}

/**
 * Given doseDays (from WeekdayPicker), returns whether the given JS Date
 * falls on one of the selected days. If doseDays is empty, returns false
 * (as-needed = never auto-scheduled). If doseDays is undefined, falls back
 * to the legacy frequency check in today-doses.tsx.
 */
export function isDueOnDay(doseDays: number[] | undefined, date: Date): boolean {
  if (!doseDays) return false; // let legacy logic handle it
  if (doseDays.length === 0) return false; // as-needed
  return doseDays.includes(date.getDay());
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.one },
  cell: {
    flex: 1,
    minHeight: 40,
    borderRadius: Radii.chamfer,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  asNeeded: {
    minHeight: 40,
    borderRadius: Radii.chamfer,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
});
