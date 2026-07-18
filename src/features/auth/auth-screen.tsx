import * as AppleAuthentication from 'expo-apple-authentication';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { LabeledInput, PrimaryButton } from '@/components/form';
import { Card, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radii, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useStore } from '@/lib/store';
import { isSupabaseConfigured } from '@/lib/supabase';
import { mergeStates, migrateToCloud, pullFromCloud, pullSnapshot, pushSnapshot } from '@/lib/sync';

type Mode = 'signUp' | 'signIn';
type Phase = 'form' | 'syncing' | 'done' | 'error';

/**
 * Modal auth screen: email + password sign-up or sign-in.
 * Sign-up triggers a one-time migration of all local data to the cloud.
 * Sign-in pulls cloud data back to the device (restores data on new installs).
 */
export function AuthScreen({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { signUp, signInWithPassword, signInWithProvider, signInWithApple, appleAuthAvailable } = useAuth();
  const { exportState, replaceState } = useStore();

  const [mode, setMode] = useState<Mode>('signUp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<Phase>('form');
  const [syncErrors, setSyncErrors] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const reset = () => {
    setMode('signUp');
    setEmail('');
    setPassword('');
    setPhase('form');
    setSyncErrors([]);
    setFormError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    if (!email.trim() || !password) {
      setFormError(t('auth.errorMissingFields'));
      return;
    }
    setFormError(null);
    setPhase('syncing');

    try {
      if (mode === 'signUp') {
        await signUp(email.trim(), password);
        // signUp sets session in AuthProvider; user is now available
        // We re-read from auth rather than relying on the state update timing
        const { data } = await (await import('@/lib/supabase')).supabase.auth.getUser();
        if (data.user) {
          const local = exportState();
          // Normalized tables (for community aggregates) + the snapshot blob that
          // the continuous-sync engine reads back on other devices.
          const result = await migrateToCloud(local, data.user.id);
          await pushSnapshot(local, data.user.id);
          setSyncErrors(result.errors);
        }
      } else {
        await signInWithPassword(email.trim(), password);
        const { data } = await (await import('@/lib/supabase')).supabase.auth.getUser();
        if (data.user) {
          // Prefer the snapshot (exact round-trip); fall back to the normalized
          // reconstruction for accounts created before snapshots existed.
          const cloudState =
            (await pullSnapshot(data.user.id)) ?? (await pullFromCloud(data.user.id));
          if (cloudState) {
            // Merge rather than replace: preserves all local anonymous data
            // created before sign-in, resolving conflicts by last-write-wins.
            replaceState(mergeStates(exportState(), cloudState));
          }
        }
      }
      setPhase('done');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(msg);
      setPhase('form');
    }
  };

  // Social sign-in is one button for both new and returning users (the provider
  // decides). We detect which by whether a cloud snapshot already exists: restore
  // + merge for a returning account, migrate the local data up for a new one.
  const handleSocial = async (start: () => Promise<boolean>) => {
    setFormError(null);
    try {
      const ok = await start();
      if (!ok) return; // user cancelled the provider sheet
      setPhase('syncing');
      const { supabase } = await import('@/lib/supabase');
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        const cloud = (await pullSnapshot(data.user.id)) ?? (await pullFromCloud(data.user.id));
        if (cloud) {
          replaceState(mergeStates(exportState(), cloud));
        } else {
          const local = exportState();
          const result = await migrateToCloud(local, data.user.id);
          await pushSnapshot(local, data.user.id);
          setSyncErrors(result.errors);
        }
      }
      setPhase('done');
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : String(err));
      setPhase('form');
    }
  };

  if (!isSupabaseConfigured) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <ThemedView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.inner}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

          {/* Header */}
          <View style={styles.header}>
            <EngravedLabel>
              {mode === 'signUp' ? t('auth.signUpLabel') : t('auth.signInLabel')}
            </EngravedLabel>
            <ThemedText type="display">
              {mode === 'signUp' ? t('auth.signUpTitle') : t('auth.signInTitle')}
            </ThemedText>
            <ThemedText type="body" themeColor="textSecondary">
              {mode === 'signUp' ? t('auth.signUpSubtitle') : t('auth.signInSubtitle')}
            </ThemedText>
          </View>

          {phase === 'form' && (
            <Card style={styles.form}>
              <LabeledInput
                label={t('auth.email')}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <LabeledInput
                label={t('auth.password')}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
              {formError ? (
                <ThemedText type="monoSm" themeColor="signalBad">
                  {formError}
                </ThemedText>
              ) : null}
              <PrimaryButton
                label={mode === 'signUp' ? t('auth.signUp') : t('auth.signIn')}
                onPress={submit}
              />
              <View style={styles.toggleRow}>
                <ThemedText type="monoSm" themeColor="textMuted">
                  {mode === 'signUp' ? t('auth.haveAccount') : t('auth.noAccount')}
                </ThemedText>
                <ThemedText
                  type="monoSm"
                  themeColor="textSecondary"
                  style={styles.toggleLink}
                  onPress={() => {
                    setFormError(null);
                    setMode(mode === 'signUp' ? 'signIn' : 'signUp');
                  }}>
                  {mode === 'signUp' ? t('auth.switchSignIn') : t('auth.switchSignUp')}
                </ThemedText>
              </View>
            </Card>
          )}

          {/* Social sign-in (spec 10): Apple native on iOS, browser OAuth for
              Google + Apple-on-Android. Same account-linking + sync as email. */}
          {phase === 'form' && (
            <View style={styles.social}>
              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <ThemedText type="monoSm" themeColor="textMuted">{t('auth.or')}</ThemedText>
                <View style={styles.orLine} />
              </View>
              {Platform.OS === 'ios' && appleAuthAvailable ? (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                  cornerRadius={Radii.chamfer}
                  style={styles.appleButton}
                  onPress={() => handleSocial(signInWithApple)}
                />
              ) : (
                <SocialButton
                  label={t('auth.continueApple')}
                  onPress={() => handleSocial(() => signInWithProvider('apple'))}
                />
              )}
              <SocialButton
                label={t('auth.continueGoogle')}
                onPress={() => handleSocial(() => signInWithProvider('google'))}
              />
            </View>
          )}

          {phase === 'syncing' && (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={Colors.dark.accent} />
              <ThemedText type="mono" themeColor="textSecondary" style={styles.syncLabel}>
                {mode === 'signUp' ? t('auth.migrating') : t('auth.restoring')}
              </ThemedText>
            </View>
          )}

          {phase === 'done' && (
            <View style={styles.centered}>
              <ThemedText type="display">
                {mode === 'signUp' ? t('auth.migratedTitle') : t('auth.restoredTitle')}
              </ThemedText>
              <ThemedText type="body" themeColor="textSecondary">
                {mode === 'signUp' ? t('auth.migratedBody') : t('auth.restoredBody')}
              </ThemedText>
              {syncErrors.length > 0 && (
                <ThemedText type="monoSm" themeColor="signalBad">
                  {t('auth.partialSync', { count: syncErrors.length })}
                </ThemedText>
              )}
              <PrimaryButton label={t('common.done')} onPress={handleClose} />
            </View>
          )}

          {phase === 'form' && (
            <ThemedText
              type="monoSm"
              themeColor="textMuted"
              style={styles.dismiss}
              onPress={handleClose}>
              {t('common.cancel')}
            </ThemedText>
          )}
        </KeyboardAvoidingView>
      </ThemedView>
    </Modal>
  );
}

/** Outlined provider button (instrument register) for the browser-OAuth paths. */
function SocialButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.socialButton, pressed && styles.socialButtonPressed]}>
      <ThemedText type="mono" themeColor="text">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  inner: { flex: 1, padding: Spacing.four, gap: Spacing.four },
  header: { gap: Spacing.two, paddingTop: Spacing.four },
  form: { gap: Spacing.three },
  social: { gap: Spacing.two },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: Colors.dark.border },
  appleButton: { height: 48, width: '100%' },
  socialButton: {
    height: 48,
    borderRadius: Radii.chamfer,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialButtonPressed: { opacity: 0.7 },
  toggleRow: { flexDirection: 'row', gap: Spacing.one, flexWrap: 'wrap' },
  toggleLink: { textDecorationLine: 'underline' },
  centered: { gap: Spacing.three, alignItems: 'center', flex: 1, justifyContent: 'center' },
  syncLabel: { marginTop: Spacing.two },
  dismiss: { textAlign: 'center', textDecorationLine: 'underline' },
});
