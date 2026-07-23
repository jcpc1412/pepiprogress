import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Line } from 'react-native-svg';

import { LabeledInput, PrimaryButton, TextButton } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth, type OAuthProvider } from '@/lib/auth';
import { useStore } from '@/lib/store';
import { mergeStates, migrateToCloud, pullFromCloud, pullSnapshot, pushSnapshot } from '@/lib/sync';
import { isSupabaseConfigured } from '@/lib/supabase';

import { AgeGate } from './age-gate';
import { ConsentPhotoAI, ConsentPhotoStorage } from './consent-photos';

// Steps (restructured after the 2026-07-23 onboarding review):
// 0 = Account (optional — sign in/up first, incl. Apple/Google)
// 1 = About you (DOB + sex + units + starting weight + cycle opt-in)
// 2 = Photo-storage consent
// 3 = Photo-AI consent
//
// Deliberately NOT here any more, all deferred to the post-onboarding setup
// cards on Home: the health connector (asks for trust before any value is
// delivered), the weight step (folded into About you — one number did not earn a
// screen), and goals (see below).
//
// Goals were the biggest cut. They feel like personalization but they are a poor
// onboarding question: the user does not yet know what a goal changes here, and
// the answer is freely editable later. They now sit behind a Home setup card
// instead. The one real cost is that `surfaceFields` derives the whole check-in
// from goals ∪ compound tags, so a goal-less user falls back to MINIMAL_DEFAULT
// (weight, wellness, body photo) — a thin but honest first Home, and the card is
// framed to convert precisely that.
const TOTAL_STEPS = 4;

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
        {/* No "04/07" readout: the count is the app's business, not the user's.
            People do not care whether it is seven steps, only whether it is
            nearly over — which the filled segments already say. */}
        <View style={styles.progressHead}>
          <View style={styles.progressFill}>
            <StepProgress current={step + 1} total={TOTAL_STEPS} />
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

// ─── Step 0: Account (optional, first) ────────────────────────────────────────

function AccountStep({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { signUp, signInWithPassword, signInWithProvider } = useAuth();
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

  // Unified post-auth: restore from an existing cloud snapshot, or seed the cloud
  // from local data for a brand-new account. Works for email + OAuth alike.
  const afterAuth = async (userId: string) => {
    const cloud = (await pullSnapshot(userId)) ?? (await pullFromCloud(userId));
    if (cloud) {
      replaceState(mergeStates(exportState(), cloud));
    } else {
      const local = exportState();
      await migrateToCloud(local, userId);
      await pushSnapshot(local, userId);
    }
  };

  const currentUserId = async () =>
    (await (await import('@/lib/supabase')).supabase.auth.getUser()).data.user?.id;

  const submitEmail = async () => {
    if (!email.trim() || !password) { setError(t('auth.errorMissingFields')); return; }
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signUp') await signUp(email.trim(), password);
      else await signInWithPassword(email.trim(), password);
      const uid = await currentUserId();
      if (uid) await afterAuth(uid);
      onNext();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.errorServer'));
    } finally {
      setBusy(false);
    }
  };

  const submitOAuth = async (provider: OAuthProvider) => {
    setError(null);
    setBusy(true);
    try {
      const ok = await signInWithProvider(provider);
      if (!ok) return; // cancelled
      const uid = await currentUserId();
      if (uid) await afterAuth(uid);
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

        {busy ? (
          <ActivityIndicator color={theme.accent} />
        ) : (
          <>
            {/* OAuth — providers configured in Supabase Auth (owner rigs up). */}
            <View style={styles.oauthCol}>
              {Platform.OS === 'ios' && (
                <PrimaryButton label={t('auth.continueApple')} onPress={() => submitOAuth('apple')} />
              )}
              <PrimaryButton
                label={t('auth.continueGoogle')}
                variant="secondary"
                onPress={() => submitOAuth('google')}
              />
            </View>

            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              <ThemedText type="monoSm" themeColor="textMuted">{t('auth.orEmail')}</ThemedText>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
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
              revealToggle
              autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
            />
            {error && <ThemedText type="monoSm" style={{ color: theme.signalBad }}>{error}</ThemedText>}

            <PrimaryButton
              label={mode === 'signUp' ? t('auth.signUp') : t('auth.signIn')}
              variant="secondary"
              onPress={submitEmail}
            />

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
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Main onboarding ─────────────────────────────────────────────────────────

export function Onboarding() {
  const { setProfile, completeOnboarding } = useStore();
  const [step, setStep] = useState(0);

  const next = () => setStep((s) => s + 1);

  // Step 0 — Account (optional, first)
  if (step === 0) {
    return (
      <Frame step={step}>
        <AccountStep onNext={next} />
      </Frame>
    );
  }

  // Step 1 — Age gate (DOB + sex + units)
  if (step === 1) {
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

  // Step 2 — Photo storage consent
  if (step === 2) {
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

  // Step 3 — Photo AI consent → completeOnboarding
  if (step === 3) {
    return (
      <Frame step={step}>
        <ConsentPhotoAI
          onAccept={() => {
            setProfile({ consentPhotoAI: true, consentTimestamp: new Date().toISOString() });
            completeOnboarding();
          }}
          onDecline={() => {
            setProfile({ consentPhotoAI: false });
            completeOnboarding();
          }}
        />
      </Frame>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
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
  // Account step — OAuth
  oauthCol: { gap: Spacing.two },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
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
