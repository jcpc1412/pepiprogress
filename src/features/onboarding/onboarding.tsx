import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LabeledInput, OptionChip, PrimaryButton } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { COMPOUND_CATALOG } from '@/data/compound-catalog';
import type { Goal } from '@/lib/field-surfacing';
import { localDateKey, useStore, type UnitsSystem } from '@/lib/store';
import { Constants } from '@/types/database';

import { AgeGate } from './age-gate';
import { ConsentPhotoAI, ConsentPhotoStorage } from './consent-photos';

const GOALS = Constants.public.Enums.goal;
const UNITS = Constants.public.Enums.units_system;

// Steps 0-2 are privacy/consent (spec 11); 3-6 are profile setup (units, goals,
// compounds, optional cycle prompt).
const TOTAL_STEPS = 7;

/** Segmented progress bar shown on every onboarding step (consent + profile). */
function StepProgress({ current, total }: { current: number; total: number }) {
  const theme = useTheme();
  return (
    <View
      style={styles.progressRow}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: current }}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            styles.progressSeg,
            { backgroundColor: i < current ? theme.accent : theme.surfaceSunken, borderColor: theme.border },
          ]}
        />
      ))}
    </View>
  );
}

export function Onboarding() {
  const { t } = useTranslation();
  const { profile, setProfile, completeOnboarding } = useStore();
  const [step, setStep] = useState(0);

  const next = () => setStep((s) => s + 1);

  const toggle = <T,>(list: T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  // ── Privacy/consent steps (0-2) ─────────────────────────────────────────
  // These manage their own CTA buttons inside the component.

  if (step === 0) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <StepProgress current={step + 1} total={TOTAL_STEPS} />
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <AgeGate
              onVerified={(dobISO) => {
                setProfile({ dobISO, isAgeVerified: true });
                next();
              }}
            />
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (step === 1) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <StepProgress current={step + 1} total={TOTAL_STEPS} />
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <ConsentPhotoStorage
              onAccept={() => {
                setProfile({ consentPhotoStorage: true, consentTimestamp: new Date().toISOString() });
                next();
              }}
              onDecline={() => {
                setProfile({ consentPhotoStorage: false });
                next();
              }}
            />
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (step === 2) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <StepProgress current={step + 1} total={TOTAL_STEPS} />
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <ConsentPhotoAI
              onAccept={() => {
                setProfile({ consentPhotoAI: true, consentTimestamp: new Date().toISOString() });
                next();
              }}
              onDecline={() => {
                setProfile({ consentPhotoAI: false });
                next();
              }}
            />
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  // ── Profile setup steps (3-6) ────────────────────────────────────────────
  const profileStep = step - 3; // 0, 1, 2, 3
  const cycleOn = !!profile.lastPeriodDate;
  // Require at least one goal before leaving the goals step — goals drive what the
  // log surfaces, so an empty set yields a near-empty experience (spec 02).
  const canContinue = !(profileStep === 1 && profile.goals.length === 0);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <StepProgress current={step + 1} total={TOTAL_STEPS} />

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {profileStep === 0 && (
            <View style={styles.section}>
              <ThemedText type="display">{t('onboarding.units.title')}</ThemedText>
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
            </View>
          )}

          {profileStep === 1 && (
            <View style={styles.section}>
              <ThemedText type="display">{t('onboarding.goals.title')}</ThemedText>
              <ThemedText themeColor="textSecondary">{t('onboarding.goals.subtitle')}</ThemedText>
              <View style={styles.chips}>
                {GOALS.map((g) => (
                  <OptionChip
                    key={g}
                    label={t(`goals.${g}` as const)}
                    selected={profile.goals.includes(g)}
                    onPress={() => setProfile({ goals: toggle<Goal>(profile.goals, g) })}
                  />
                ))}
              </View>
              {profile.goals.length === 0 && (
                <ThemedText type="monoSm" themeColor="textMuted">
                  {t('onboarding.goals.required')}
                </ThemedText>
              )}
            </View>
          )}

          {profileStep === 2 && (
            <View style={styles.section}>
              <ThemedText type="display">{t('onboarding.compounds.title')}</ThemedText>
              <ThemedText themeColor="textSecondary">
                {t('onboarding.compounds.subtitle')}
              </ThemedText>
              <View style={styles.chips}>
                {COMPOUND_CATALOG.map((c) => (
                  <OptionChip
                    key={c.slug}
                    label={c.canonicalName}
                    selected={profile.compoundSlugs.includes(c.slug)}
                    onPress={() =>
                      setProfile({ compoundSlugs: toggle(profile.compoundSlugs, c.slug) })
                    }
                  />
                ))}
              </View>
              <LabeledInput label={t('onboarding.compounds.note')} editable={false} />
            </View>
          )}

          {profileStep === 3 && (
            <View style={styles.section}>
              <ThemedText type="display">{t('onboarding.cycle.title')}</ThemedText>
              <ThemedText themeColor="textSecondary">{t('onboarding.cycle.subtitle')}</ThemedText>
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
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {step > 3 && (
            <View style={styles.backButton}>
              <PrimaryButton
                label={t('onboarding.back')}
                variant="secondary"
                onPress={() => setStep((s) => s - 1)}
              />
            </View>
          )}
          <View style={styles.nextButton}>
            <PrimaryButton
              label={step === TOTAL_STEPS - 1 ? t('onboarding.finish') : t('common.continue')}
              disabled={!canContinue}
              onPress={() => {
                if (step === TOTAL_STEPS - 1) completeOnboarding();
                else next();
              }}
            />
          </View>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  scroll: { gap: Spacing.four, paddingBottom: Spacing.four },
  progressRow: { flexDirection: 'row', gap: Spacing.one },
  progressSeg: { flex: 1, height: 3, borderRadius: Radii.chamfer, borderWidth: StyleSheet.hairlineWidth },
  section: { gap: Spacing.three },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  footer: { flexDirection: 'row', gap: Spacing.two, paddingBottom: Spacing.two },
  backButton: { flex: 1 },
  nextButton: { flex: 2 },
});
