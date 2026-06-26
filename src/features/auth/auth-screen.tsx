import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, StyleSheet, View } from 'react-native';

import { LabeledInput, PrimaryButton } from '@/components/form';
import { Card, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
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
  const { signUp, signInWithPassword } = useAuth();
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, padding: Spacing.four, gap: Spacing.four },
  header: { gap: Spacing.two, paddingTop: Spacing.four },
  form: { gap: Spacing.three },
  toggleRow: { flexDirection: 'row', gap: Spacing.one, flexWrap: 'wrap' },
  toggleLink: { textDecorationLine: 'underline' },
  centered: { gap: Spacing.three, alignItems: 'center', flex: 1, justifyContent: 'center' },
  syncLabel: { marginTop: Spacing.two },
  dismiss: { textAlign: 'center', textDecorationLine: 'underline' },
});
