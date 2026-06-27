import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Line } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer';
import { PrimaryButton } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Chamfer, MaxContentWidth, Radii, Spacing } from '@/constants/theme';
import { BodySilhouette } from '@/features/onboarding/body-silhouette';
import { useTheme } from '@/hooks/use-theme';
import type { Goal } from '@/lib/field-surfacing';
import { useStore } from '@/lib/store';
import { Constants } from '@/types/database';

import { AgeGate } from './age-gate';
import { ConsentPhotoAI, ConsentPhotoStorage } from './consent-photos';

const GOALS = Constants.public.Enums.goal;

// Steps: 0 = About you (DOB/sex/units/cycle), 1-2 = photo consent, 3 = goals.
// Compound selection moved out of onboarding (O-04). Units/cycle folded into
// the About-you step (O-02/O-03).
const TOTAL_STEPS = 4;

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

  if (step === 0) {
    return (
      <Frame step={step}>
        <AgeGate
          onVerified={(dobISO) => {
            setProfile({ dobISO, isAgeVerified: true });
            next();
          }}
        />
      </Frame>
    );
  }

  if (step === 1) {
    return (
      <Frame step={step}>
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
      </Frame>
    );
  }

  if (step === 2) {
    return (
      <Frame step={step}>
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
      </Frame>
    );
  }

  // Step 3 — goals, with the interactive body diagram (O-07).
  return (
    <Frame step={step}>
      <View style={styles.section}>
        <ThemedText type="display">{t('onboarding.goals.title')}</ThemedText>
        <ThemedText themeColor="textSecondary">{t('onboarding.goals.subtitle')}</ThemedText>

        <BodySilhouette goals={profile.goals} />

        <View style={styles.goalGrid}>
          {GOALS.map((g) => (
            <GoalChip
              key={g}
              goal={g}
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

      <View style={styles.footer}>
        <View style={styles.backButton}>
          <PrimaryButton label={t('onboarding.back')} variant="secondary" onPress={() => setStep((s) => s - 1)} />
        </View>
        <View style={styles.nextButton}>
          <PrimaryButton
            label={
              profile.goals.length > 0
                ? t('onboarding.beginSelected', { count: profile.goals.length })
                : t('onboarding.finish')
            }
            disabled={profile.goals.length === 0}
            onPress={completeOnboarding}
          />
        </View>
      </View>
    </Frame>
  );
}

/** Goal chip with a small mono category label above the name (handoff step 4). */
function GoalChip({ goal, selected, onPress }: { goal: Goal; selected: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={styles.goalChipWrap}>
      <ChamferBox
        chamfer={Chamfer.chip}
        fill={selected ? theme.accent : theme.surfaceSunken}
        borderColor={selected ? undefined : theme.border}>
        <View style={styles.goalChip}>
          <ThemedText type="label" themeColor={selected ? 'onAccent' : 'textMuted'}>
            {t(`goalCat.${goal}` as 'goalCat.weight_loss')}
          </ThemedText>
          <ThemedText type="smallBold" themeColor={selected ? 'onAccent' : 'text'}>
            {t(`goals.${goal}` as 'goals.weight_loss')}
          </ThemedText>
        </View>
      </ChamferBox>
    </Pressable>
  );
}

/** Faint 45° hatching lines in the top-right corner — instrument panel etch. */
function DiagonalEtch() {
  const theme = useTheme();
  const size = 88;
  const gap = 10;
  return (
    <View style={styles.etchWrap} pointerEvents="none">
      <Svg width={size} height={size}>
        {Array.from({ length: 9 }, (_, i) => (
          <Line
            key={i}
            x1={size - (i + 1) * gap}
            y1={0}
            x2={size}
            y2={(i + 1) * gap}
            stroke={theme.border}
            strokeWidth={0.8}
          />
        ))}
      </Svg>
    </View>
  );
}

/** Shared fullscreen frame with the step progress bar + NN/04 counter. */
function Frame({ step, children }: { step: number; children: React.ReactNode }) {
  return (
    <ThemedView style={styles.container}>
      <DiagonalEtch />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.progressHead}>
          <View style={styles.progressFill}>
            <StepProgress current={step + 1} total={TOTAL_STEPS} />
          </View>
          <ThemedText type="monoSm" themeColor="textMuted">
            {`${String(step + 1).padStart(2, '0')}/${String(TOTAL_STEPS).padStart(2, '0')}`}
          </ThemedText>
        </View>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
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
  progressHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  progressFill: { flex: 1 },
  progressRow: { flexDirection: 'row', gap: Spacing.one },
  progressSeg: { flex: 1, height: 3, borderRadius: Radii.chamfer, borderWidth: StyleSheet.hairlineWidth },
  section: { gap: Spacing.three },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  goalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  goalChipWrap: { width: '48%' },
  goalChip: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, gap: Spacing.half },
  footer: { flexDirection: 'row', gap: Spacing.two, paddingBottom: Spacing.two },
  backButton: { flex: 1 },
  nextButton: { flex: 2 },
  etchWrap: { position: 'absolute', top: 0, right: 0 },
});
