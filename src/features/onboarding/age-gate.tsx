import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import { PrimaryButton } from '@/components/form';
import { EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function isAtLeast18(day: number, month: number, year: number): boolean {
  const today = new Date();
  const dob = new Date(year, month - 1, day);
  const age18 = new Date(dob.getFullYear() + 18, dob.getMonth(), dob.getDate());
  return today >= age18;
}

function isValidDate(day: number, month: number, year: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;
  if (year < 1900 || year > new Date().getFullYear()) return false;
  const d = new Date(year, month - 1, day);
  return d.getMonth() === month - 1 && d.getDate() === day;
}

/**
 * Step 0 of onboarding: neutral DOB gate (spec 11).
 * Stores the DOB + isAgeVerified flag; blocks under-18s.
 */
export function AgeGate({ onVerified }: { onVerified: (dobISO: string) => void }) {
  const { t } = useTranslation();
  const theme = useTheme();

  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState<string | null>(null);

  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  const inputStyle = [
    styles.input,
    { borderColor: theme.border, backgroundColor: theme.surfaceSunken, color: theme.numeral },
  ];

  const submit = () => {
    const d = parseInt(day, 10);
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);

    if (!isValidDate(d, m, y)) {
      setError(t('ageGate.errorInvalid'));
      return;
    }
    if (!isAtLeast18(d, m, y)) {
      setError(t('ageGate.errorAge'));
      return;
    }
    setError(null);
    const dob = new Date(y, m - 1, d).toISOString();
    onVerified(dob);
  };

  return (
    <View style={styles.wrap}>
      <EngravedLabel>{t('ageGate.label')}</EngravedLabel>
      <ThemedText type="display">{t('ageGate.title')}</ThemedText>
      <ThemedText type="body" themeColor="textSecondary">
        {t('ageGate.subtitle')}
      </ThemedText>

      <View style={styles.row}>
        <View style={styles.fieldDay}>
          <EngravedLabel>{t('ageGate.day')}</EngravedLabel>
          <TextInput
            style={inputStyle}
            value={day}
            onChangeText={(v) => {
              setDay(v);
              if (v.length === 2) monthRef.current?.focus();
            }}
            placeholder={t('ageGate.dayPlaceholder')}
            placeholderTextColor={theme.textMuted}
            keyboardType="number-pad"
            maxLength={2}
            returnKeyType="next"
            onSubmitEditing={() => monthRef.current?.focus()}
          />
        </View>
        <View style={styles.fieldMonth}>
          <EngravedLabel>{t('ageGate.month')}</EngravedLabel>
          <TextInput
            ref={monthRef}
            style={inputStyle}
            value={month}
            onChangeText={(v) => {
              setMonth(v);
              if (v.length === 2) yearRef.current?.focus();
            }}
            placeholder={t('ageGate.monthPlaceholder')}
            placeholderTextColor={theme.textMuted}
            keyboardType="number-pad"
            maxLength={2}
            returnKeyType="next"
            onSubmitEditing={() => yearRef.current?.focus()}
          />
        </View>
        <View style={styles.fieldYear}>
          <EngravedLabel>{t('ageGate.year')}</EngravedLabel>
          <TextInput
            ref={yearRef}
            style={inputStyle}
            value={year}
            onChangeText={setYear}
            placeholder={t('ageGate.yearPlaceholder')}
            placeholderTextColor={theme.textMuted}
            keyboardType="number-pad"
            maxLength={4}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
        </View>
      </View>

      {error ? (
        <ThemedText type="monoSm" themeColor="signalBad">
          {error}
        </ThemedText>
      ) : null}

      <PrimaryButton
        label={t('ageGate.confirm')}
        onPress={submit}
        disabled={day.length < 1 || month.length < 1 || year.length < 4}
      />

      <ThemedText type="monoSm" themeColor="textMuted" style={styles.disclaimer}>
        {t('ageGate.whyWeAsk')}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.two },
  fieldDay: { flex: 1 },
  fieldMonth: { flex: 1 },
  fieldYear: { flex: 2 },
  input: {
    height: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radii.chamfer,
    paddingHorizontal: Spacing.three,
    fontSize: 18,
    fontVariant: ['tabular-nums'],
  },
  disclaimer: { lineHeight: 18 },
});
