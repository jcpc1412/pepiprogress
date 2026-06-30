import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Line } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer';
import { LabeledInput, PrimaryButton, TextButton } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Chamfer, Fonts, MaxContentWidth, Radii, Spacing } from '@/constants/theme';
import { BodySilhouette } from '@/features/onboarding/body-silhouette';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import type { Goal } from '@/lib/field-surfacing';
import { availableProviders } from '@/lib/integrations/registry';
import { useStore, type Sex } from '@/lib/store';
import { mergeStates, migrateToCloud, pullFromCloud, pullSnapshot, pushSnapshot } from '@/lib/sync';
import { isSupabaseConfigured } from '@/lib/supabase';
import { Constants } from '@/types/database';

import { AgeGate } from './age-gate';
import { ConsentPhotoAI, ConsentPhotoStorage } from './consent-photos';

const GOALS = Constants.public.Enums.goal;

// Steps:
// 0 = Age gate
// 1 = Sex picker
// 2 = Weight baseline
// 3 = Photo-storage consent
// 4 = Photo-AI consent
// 5 = Goals
// 6 = Account (optional)
// 7 = Health connector (optional)
const TOTAL_STEPS = 8;

// ─── Progress bar ────────────────────────────────────────────────────────────

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

// ─── Diagonal etch ───────────────────────────────────────────────────────────

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

// ─── Shared frame ────────────────────────────────────────────────────────────

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
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

// ─── Goal chip ───────────────────────────────────────────────────────────────

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

// ─── Sex chip ────────────────────────────────────────────────────────────────

function SexChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.sexChip,
        {
          backgroundColor: selected ? theme.accent : theme.surfaceSunken,
          borderColor: selected ? theme.accent : theme.border,
        },
      ]}>
      <ThemedText type="mono" themeColor={selected ? 'onAccent' : 'text'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

// ─── Step 1: Sex picker ───────────────────────────────────────────────────────

const CYCLE_SEXES: Sex[] = ['female', 'ftm'];

function SexStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { t } = useTranslation();
  const { profile, setProfile } = useStore();
  const [showTrans, setShowTrans] = useState(profile.sex === 'ftm' || profile.sex === 'mtf');

  const setSex = (s: Sex | undefined) => setProfile({ sex: s });
  const showCycle = !!profile.sex && CYCLE_SEXES.includes(profile.sex);
  const cycleOn = !!profile.lastPeriodDate;

  return (
    <View style={styles.section}>
      <View style={styles.titleBlock}>
        <ThemedText type="label" themeColor="textMuted">{t('onboarding.intakeProcedure')}</ThemedText>
        <ThemedText type="display">{t('onboarding.sex.title')}</ThemedText>
        <ThemedText themeColor="textSecondary">{t('onboarding.sex.subtitle')}</ThemedText>
      </View>

      <View style={styles.sexRow}>
        <SexChip
          label={t('sex.male')}
          selected={profile.sex === 'male'}
          onPress={() => { setSex('male'); setShowTrans(false); }}
        />
        <SexChip
          label={t('sex.female')}
          selected={profile.sex === 'female'}
          onPress={() => { setSex('female'); setShowTrans(false); }}
        />
        <SexChip
          label={t('onboarding.sex.other')}
          selected={showTrans && profile.sex !== 'male' && profile.sex !== 'female'}
          onPress={() => {
            setShowTrans(true);
            if (profile.sex === 'male' || profile.sex === 'female') setSex(undefined);
          }}
        />
      </View>

      {showTrans && (
        <View style={styles.sexRow}>
          <SexChip
            label={t('sex.ftm')}
            selected={profile.sex === 'ftm'}
            onPress={() => setSex('ftm')}
          />
          <SexChip
            label={t('sex.mtf')}
            selected={profile.sex === 'mtf'}
            onPress={() => setSex('mtf')}
          />
        </View>
      )}

      {showCycle && (
        <View style={styles.cycleRow}>
          <SexChip
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

      <View style={styles.footer}>
        <View style={styles.backButton}>
          <PrimaryButton label={t('onboarding.back')} variant="secondary" onPress={onBack} />
        </View>
        <View style={styles.nextButton}>
          <PrimaryButton label={t('onboarding.skip')} onPress={onNext} />
        </View>
      </View>
    </View>
  );
}

// ─── Step 2: Weight baseline ──────────────────────────────────────────────────

function WeightStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { profile, setProfile } = useStore();
  const [raw, setRaw] = useState(profile.weightBaseline ? String(profile.weightBaseline) : '');
  const [error, setError] = useState<string | null>(null);
  const unit = profile.units === 'imperial' ? t('units.lb') : t('units.kg');

  const submit = () => {
    if (!raw.trim()) { onNext(); return; }
    const n = parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0 || n > 999) {
      setError(t('checkin.weightInvalid'));
      return;
    }
    setProfile({ weightBaseline: n });
    onNext();
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={styles.section}>
        <View style={styles.titleBlock}>
          <ThemedText type="label" themeColor="textMuted">{t('onboarding.intakeProcedure')}</ThemedText>
          <ThemedText type="display">{t('onboarding.weight.title')}</ThemedText>
          <ThemedText themeColor="textSecondary">{t('onboarding.weight.subtitle')}</ThemedText>
        </View>

        <View style={[styles.weightInputRow, { borderColor: error ? theme.signalBad : theme.border }]}>
          <TextInput
            style={[styles.weightInput, { color: theme.text, fontFamily: Fonts.mono }]}
            placeholder={t('onboarding.weight.placeholder')}
            placeholderTextColor={theme.textMuted}
            keyboardType="decimal-pad"
            value={raw}
            onChangeText={(v) => { setRaw(v); setError(null); }}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          <ThemedText type="monoSm" themeColor="textMuted">{unit}</ThemedText>
        </View>
        {error && (
          <ThemedText type="monoSm" style={{ color: theme.signalBad }}>{error}</ThemedText>
        )}

        <View style={styles.footer}>
          <View style={styles.backButton}>
            <PrimaryButton label={t('onboarding.back')} variant="secondary" onPress={onBack} />
          </View>
          <View style={styles.nextButton}>
            <PrimaryButton label={raw.trim() ? t('onboarding.weight.save') : t('onboarding.skip')} onPress={submit} />
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Step 6: Account (optional) ───────────────────────────────────────────────

function AccountStep({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { signUp, signInWithPassword } = useAuth();
  const { exportState, replaceState } = useStore();
  const [mode, setMode] = useState<'signUp' | 'signIn'>('signUp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isSupabaseConfigured) {
    return (
      <View style={styles.section}>
        <ThemedText type="display">{t('auth.signUpTitle')}</ThemedText>
        <ThemedText themeColor="textSecondary">{t('auth.signUpSubtitle')}</ThemedText>
        <PrimaryButton label={t('onboarding.account.skip')} onPress={onNext} />
      </View>
    );
  }

  const submit = async () => {
    if (!email.trim() || !password) { setError(t('auth.errorMissingFields')); return; }
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signUp') {
        await signUp(email.trim(), password);
        const { data } = await (await import('@/lib/supabase')).supabase.auth.getUser();
        if (data.user) {
          const local = exportState();
          await migrateToCloud(local, data.user.id);
          await pushSnapshot(local, data.user.id);
        }
      } else {
        await signInWithPassword(email.trim(), password);
        const { data } = await (await import('@/lib/supabase')).supabase.auth.getUser();
        if (data.user) {
          const cloudState =
            (await pullSnapshot(data.user.id)) ?? (await pullFromCloud(data.user.id));
          if (cloudState) replaceState(mergeStates(exportState(), cloudState));
        }
      }
      onNext();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.errorServer'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={styles.section}>
        <View style={styles.titleBlock}>
          <ThemedText type="label" themeColor="textMuted">{t('onboarding.intakeProcedure')}</ThemedText>
          <ThemedText type="display">
            {mode === 'signUp' ? t('auth.signUpTitle') : t('auth.signInTitle')}
          </ThemedText>
          <ThemedText themeColor="textSecondary">
            {mode === 'signUp' ? t('auth.signUpSubtitle') : t('auth.signInSubtitle')}
          </ThemedText>
        </View>

        <LabeledInput
          label={t('auth.email')}
          value={email}
          onChangeText={(v) => { setEmail(v); setError(null); }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <LabeledInput
          label={t('auth.password')}
          value={password}
          onChangeText={(v) => { setPassword(v); setError(null); }}
          secureTextEntry
          autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
        />
        {error && <ThemedText type="monoSm" style={{ color: theme.signalBad }}>{error}</ThemedText>}

        {busy ? (
          <ActivityIndicator color={theme.accent} />
        ) : (
          <PrimaryButton
            label={mode === 'signUp' ? t('auth.signUp') : t('auth.signIn')}
            onPress={submit}
          />
        )}

        <View style={styles.toggleRow}>
          <ThemedText type="monoSm" themeColor="textMuted">
            {mode === 'signUp' ? t('auth.haveAccount') : t('auth.noAccount')}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            onPress={() => { setMode(mode === 'signUp' ? 'signIn' : 'signUp'); setError(null); }}>
            <ThemedText type="monoSm" themeColor="accent">
              {mode === 'signUp' ? t('auth.signIn') : t('auth.signUp')}
            </ThemedText>
          </Pressable>
        </View>

        <TextButton label={t('onboarding.account.skip')} onPress={onNext} />
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Step 7: Health connector (optional) ─────────────────────────────────────

function HealthStep({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { integrations, setIntegration, addMetricReadings } = useStore();
  const [busy, setBusy] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const providers = availableProviders().filter((p) => p.id !== 'terra');
  const provider = providers[0];

  const connect = async () => {
    if (!provider) { onDone(); return; }
    setBusy(true);
    try {
      const { ok, patch } = await provider.authenticate();
      if (ok) {
        setIntegration(provider.id, { connectedAt: new Date().toISOString(), ...patch });
        setShowImport(true);
        return;
      }
    } finally {
      setBusy(false);
    }
    onDone();
  };

  const handleImport = async (range: 'lastYear' | 'allTime' | 'skip') => {
    setShowImport(false);
    if (range !== 'skip' && provider) {
      setBusy(true);
      try {
        const since =
          range === 'lastYear'
            ? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
            : undefined;
        const readings = await provider.pull({ since, connection: integrations[provider.id] });
        addMetricReadings(readings);
        setIntegration(provider.id, { lastSyncAt: new Date().toISOString() });
      } finally {
        setBusy(false);
      }
    }
    onDone();
  };

  const connected = provider && !!integrations[provider.id]?.connectedAt;

  return (
    <View style={styles.section}>
      <View style={styles.titleBlock}>
        <ThemedText type="label" themeColor="textMuted">{t('onboarding.intakeProcedure')}</ThemedText>
        <ThemedText type="display">{t('onboarding.health.title')}</ThemedText>
        <ThemedText themeColor="textSecondary">{t('onboarding.health.subtitle')}</ThemedText>
      </View>

      {providers.length === 0 ? (
        <ThemedText type="monoSm" themeColor="textMuted">{t('integrations.empty')}</ThemedText>
      ) : (
        <View style={styles.healthCard}>
          <ThemedText type="smallBold">{t(provider!.nameKey as never)}</ThemedText>
          {!provider!.nativeReady ? (
            <ThemedText type="monoSm" themeColor="textMuted">{t('integrations.comingSoon')}</ThemedText>
          ) : connected ? (
            <ThemedText type="monoSm" themeColor="signalGood">{t('onboarding.health.connected')}</ThemedText>
          ) : busy ? (
            <ActivityIndicator size="small" />
          ) : (
            <Pressable accessibilityRole="button" onPress={connect}>
              <ThemedText type="monoSm" themeColor="accent" style={styles.link}>{t('integrations.connect')}</ThemedText>
            </Pressable>
          )}
        </View>
      )}

      {showImport ? (
        <View style={styles.importCard}>
          <ThemedText type="smallBold">{t('integrations.importTitle')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{t('integrations.importSubtitle')}</ThemedText>
          <PrimaryButton
            label={busy ? t('integrations.importing') : t('integrations.importLastYear')}
            disabled={busy}
            onPress={() => handleImport('lastYear')}
          />
          <TextButton label={t('integrations.importAllTime')} onPress={() => handleImport('allTime')} />
          <TextButton label={t('integrations.importSkip')} onPress={() => handleImport('skip')} />
        </View>
      ) : (
        <PrimaryButton
          label={connected ? t('onboarding.finish') : t('onboarding.health.skip')}
          onPress={onDone}
        />
      )}
    </View>
  );
}

// ─── Main onboarding ─────────────────────────────────────────────────────────

export function Onboarding() {
  const { t } = useTranslation();
  const { profile, setProfile, completeOnboarding } = useStore();
  const [step, setStep] = useState(0);

  const next = () => setStep((s) => s + 1);
  const back = () => setStep((s) => s - 1);

  const toggle = <T,>(list: T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  // Step 0 — Age gate
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

  // Step 1 — Sex
  if (step === 1) {
    return (
      <Frame step={step}>
        <SexStep onNext={next} onBack={back} />
      </Frame>
    );
  }

  // Step 2 — Weight
  if (step === 2) {
    return (
      <Frame step={step}>
        <WeightStep onNext={next} onBack={back} />
      </Frame>
    );
  }

  // Step 3 — Photo storage consent
  if (step === 3) {
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

  // Step 4 — Photo AI consent
  if (step === 4) {
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

  // Step 5 — Goals
  if (step === 5) {
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
            <PrimaryButton label={t('onboarding.back')} variant="secondary" onPress={back} />
          </View>
          <View style={styles.nextButton}>
            <PrimaryButton
              label={
                profile.goals.length > 0
                  ? t('onboarding.beginSelected', { count: profile.goals.length })
                  : t('onboarding.goals.required')
              }
              disabled={profile.goals.length === 0}
              onPress={next}
            />
          </View>
        </View>
      </Frame>
    );
  }

  // Step 6 — Account (optional)
  if (step === 6) {
    return (
      <Frame step={step}>
        <AccountStep onNext={next} />
      </Frame>
    );
  }

  // Step 7 — Health connector (optional) → completeOnboarding
  return (
    <Frame step={step}>
      <HealthStep onDone={completeOnboarding} />
    </Frame>
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
  titleBlock: { gap: Spacing.one },
  goalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  goalChipWrap: { width: '48%' },
  goalChip: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, gap: Spacing.half },
  footer: { flexDirection: 'row', gap: Spacing.two, paddingBottom: Spacing.two },
  backButton: { flex: 1 },
  nextButton: { flex: 2 },
  etchWrap: { position: 'absolute', top: 0, right: 0 },
  // Sex step
  sexRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  cycleRow: { gap: Spacing.one },
  sexChip: {
    borderRadius: Radii.chamfer,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  // Weight step
  weightInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radii.chamfer,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  weightInput: { flex: 1, fontSize: 28, letterSpacing: -0.5 },
  // Account step
  toggleRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center', justifyContent: 'center' },
  // Health step
  healthCard: {
    borderRadius: Radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  importCard: {
    borderRadius: Radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  link: { textDecorationLine: 'underline' },
});
