import { getLocales } from 'expo-localization';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import { OptionChip, PrimaryButton } from '@/components/form';
import { EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStore, type Sex, type UnitsSystem } from '@/lib/store';
import { Constants } from '@/types/database';

const UNITS = Constants.public.Enums.units_system;

/** Sexes for whom the menstrual-cycle opt-in is relevant. */
const CYCLE_SEXES: Sex[] = ['female', 'ftm'];

/** Applied once per app launch so revisiting the step doesn't clobber a manual
 *  units choice. Region → imperial for US/UK, metric elsewhere (decision: geo units). */
let geoUnitsApplied = false;

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
  const [showTrans, setShowTrans] = useState(profile.sex === 'ftm' || profile.sex === 'mtf');

  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  // Geo-based units default (once per launch, before the user touches the chips).
  useEffect(() => {
    if (geoUnitsApplied) return;
    geoUnitsApplied = true;
    const ms = getLocales()[0]?.measurementSystem;
    const geo: UnitsSystem = ms === 'us' || ms === 'uk' ? 'imperial' : 'metric';
    if (profile.units !== geo) setProfile({ units: geo });
  }, [profile.units, setProfile]);

  const setSex = (s: Sex | undefined) => setProfile({ sex: s });
  const showCycle = !!profile.sex && CYCLE_SEXES.includes(profile.sex);
  const cycleOn = !!profile.lastPeriodDate;

  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  const dateComplete = day.length >= 1 && month.length >= 1 && year.length === 4;
  const dateValid = dateComplete && isValidDate(d, m, y);
  const is18 = dateValid && isAtLeast18(d, m, y);
  const computedAge = dateValid ? new Date().getFullYear() - y : 0;

  const canSubmit = dateComplete;

  const submit = () => {
    if (!isValidDate(d, m, y)) { setError(t('ageGate.errorInvalid')); return; }
    if (!isAtLeast18(d, m, y)) { setError(t('ageGate.errorAge')); return; }
    setError(null);
    onVerified(new Date(y, m - 1, d).toISOString());
  };

  const inputColor = (val: string) => ({ color: val ? theme.numeral : theme.textMuted });

  return (
    <View style={styles.wrap}>
      <EngravedLabel>{t('onboarding.intakeProcedure')}</EngravedLabel>
      <ThemedText type="display">{t('about.title')}</ThemedText>
      <ThemedText type="body" themeColor="textSecondary">
        {t('ageGate.subtitle')}
      </ThemedText>

      {/* Unified DOB pill — DD · MM · YYYY with AGE NN · OK readout */}
      <View style={styles.dobWrap}>
        <EngravedLabel>{t('ageGate.title')}</EngravedLabel>
        <View style={[styles.dobPill, { backgroundColor: theme.surfaceSunken, borderColor: theme.border }]}>
          <TextInput
            style={[styles.dobDigits, inputColor(day)]}
            value={day}
            onChangeText={(v) => { setDay(v); if (v.length === 2) monthRef.current?.focus(); }}
            placeholder="DD"
            placeholderTextColor={theme.textMuted}
            keyboardType="number-pad"
            maxLength={2}
            returnKeyType="next"
          />
          <ThemedText type="mono" themeColor="textMuted" style={styles.sep}> · </ThemedText>
          <TextInput
            ref={monthRef}
            style={[styles.dobDigits, inputColor(month)]}
            value={month}
            onChangeText={(v) => { setMonth(v); if (v.length === 2) yearRef.current?.focus(); }}
            placeholder="MM"
            placeholderTextColor={theme.textMuted}
            keyboardType="number-pad"
            maxLength={2}
            returnKeyType="next"
          />
          <ThemedText type="mono" themeColor="textMuted" style={styles.sep}> · </ThemedText>
          <TextInput
            ref={yearRef}
            style={[styles.dobDigits, styles.dobYear, inputColor(year)]}
            value={year}
            onChangeText={setYear}
            placeholder="YYYY"
            placeholderTextColor={theme.textMuted}
            keyboardType="number-pad"
            maxLength={4}
            returnKeyType="done"
          />
          <View style={styles.dobSpacer} />
          {is18 && (
            <ThemedText type="monoSm" themeColor="signalGood">
              {t('ageGate.ageOk', { age: computedAge })}
            </ThemedText>
          )}
        </View>
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

      {/* Sex (optional) */}
      <EngravedLabel>{t('about.sex')}</EngravedLabel>
      <ThemedText type="monoSm" themeColor="textMuted">{t('onboarding.sex.subtitle')}</ThemedText>
      <View style={styles.chips}>
        <OptionChip
          label={t('sex.male')}
          selected={profile.sex === 'male'}
          onPress={() => { setSex('male'); setShowTrans(false); }}
        />
        <OptionChip
          label={t('sex.female')}
          selected={profile.sex === 'female'}
          onPress={() => { setSex('female'); setShowTrans(false); }}
        />
        <OptionChip
          label={t('onboarding.sex.other')}
          selected={showTrans && profile.sex !== 'male' && profile.sex !== 'female'}
          onPress={() => {
            setShowTrans(true);
            if (profile.sex === 'male' || profile.sex === 'female') setSex(undefined);
          }}
        />
      </View>
      {showTrans && (
        <View style={styles.chips}>
          <OptionChip label={t('sex.ftm')} selected={profile.sex === 'ftm'} onPress={() => setSex('ftm')} />
          <OptionChip label={t('sex.mtf')} selected={profile.sex === 'mtf'} onPress={() => setSex('mtf')} />
        </View>
      )}
      {showCycle && (
        <View style={styles.chips}>
          <OptionChip
            label={t('onboarding.cycle.optIn')}
            selected={cycleOn}
            onPress={() =>
              setProfile(
                cycleOn
                  ? { lastPeriodDate: undefined, cycleLength: undefined }
                  : { lastPeriodDate: new Date().toISOString().slice(0, 10), cycleLength: 28 },
              )
            }
          />
        </View>
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
  dobWrap: { gap: Spacing.one },
  dobPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radii.chamfer,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    height: 52,
  },
  dobDigits: {
    fontFamily: Fonts.mono,
    fontSize: 18,
    fontVariant: ['tabular-nums'],
    minWidth: 28,
    textAlign: 'center',
    padding: 0,
  },
  dobYear: { minWidth: 48 },
  sep: { paddingHorizontal: 2 },
  dobSpacer: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  disclaimer: { lineHeight: 18 },
});
