import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import { OptionChip, PrimaryButton } from '@/components/form';
import { EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { localDateKey, useStore, type Sex, type UnitsSystem } from '@/lib/store';
import { Constants } from '@/types/database';

const UNITS = Constants.public.Enums.units_system;
const SEXES: Sex[] = ['male', 'female', 'ftm', 'mtf'];
const CYCLE_SEXES: Sex[] = ['female', 'ftm'];

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
 * "About you" — consolidated first step (O-02/O-03): 18+ DOB gate plus sex,
 * units, and an optional cycle opt-in (shown only for those who menstruate).
 */
export function AgeGate({ onVerified }: { onVerified: (dobISO: string) => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { profile, setProfile } = useStore();

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

  const cycleOn = !!profile.lastPeriodDate;
  const showCycle = !!profile.sex && CYCLE_SEXES.includes(profile.sex);
  const canSubmit = day.length >= 1 && month.length >= 1 && year.length === 4 && !!profile.sex;

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
    onVerified(new Date(y, m - 1, d).toISOString());
  };

  return (
    <View style={styles.wrap}>
      <EngravedLabel>{t('onboarding.intakeProcedure')}</EngravedLabel>
      <ThemedText type="display">{t('about.title')}</ThemedText>
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
          />
        </View>
      </View>

      {/* Sex (drives cycle relevance + AI change context) */}
      <EngravedLabel>{t('about.sex')}</EngravedLabel>
      <View style={styles.chips}>
        {SEXES.map((s) => (
          <OptionChip
            key={s}
            label={t(`sex.${s}` as const)}
            selected={profile.sex === s}
            onPress={() => setProfile({ sex: s })}
          />
        ))}
      </View>

      {/* Units */}
      <EngravedLabel>{t('onboarding.units.title')}</EngravedLabel>
      <View style={styles.chips}>
        {UNITS.map((u) => (
          <OptionChip
            key={u}
            label={t(`units.${u}` as const)}
            selected={profile.units === u}
            onPress={() => setProfile({ units: u as UnitsSystem })}
          />
        ))}
      </View>

      {/* Cycle opt-in (menstruating users only) */}
      {showCycle && (
        <>
          <EngravedLabel>{t('onboarding.cycle.title')}</EngravedLabel>
          <View style={styles.chips}>
            <OptionChip
              label={t('onboarding.cycle.optIn')}
              selected={cycleOn}
              onPress={() =>
                setProfile(
                  cycleOn
                    ? { lastPeriodDate: undefined, cycleLength: undefined }
                    : { lastPeriodDate: localDateKey(), cycleLength: 28 },
                )
              }
            />
          </View>
        </>
      )}

      {error ? (
        <ThemedText type="monoSm" themeColor="signalBad">
          {error}
        </ThemedText>
      ) : null}

      <PrimaryButton label={t('ageGate.confirm')} onPress={submit} disabled={!canSubmit} />

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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
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
