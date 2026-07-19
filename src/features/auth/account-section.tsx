import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/form';
import { Card, Divider, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabase';

import { AuthScreen } from './auth-screen';

/**
 * Account status card shown in settings.
 * Signed out: shows a prompt to save data to cloud.
 * Signed in: shows email + sign-out button.
 */
export function AccountSection() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  if (!isSupabaseConfigured) return null;

  // W7-33: sign-out ends the cloud session but deliberately keeps local data
  // (the app is usable with no account by design) — there is no in-app erase,
  // that's what deleting the app is for. The confirm dialog exists so a
  // mis-tap doesn't end the session by accident, and states the "your data
  // stays" behavior up front rather than leaving it to be discovered.
  const confirmSignOut = () => {
    Alert.alert(t('account.signOutConfirmTitle'), t('account.signOutConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('account.signOut'),
        style: 'destructive',
        onPress: () => {
          signOut().catch(() => Alert.alert(t('account.signOutError')));
        },
      },
    ]);
  };

  return (
    <>
      <EngravedLabel>{t('account.section')}</EngravedLabel>

      {user ? (
        <Card style={styles.card}>
          <ThemedText type="mono" themeColor="textSecondary">
            {t('account.signedInAs')}
          </ThemedText>
          <ThemedText type="label">{user.email}</ThemedText>
          <Divider />
          <ThemedText type="monoSm" themeColor="signalBad" style={styles.link} onPress={confirmSignOut}>
            {t('account.signOut')}
          </ThemedText>
        </Card>
      ) : (
        <Card style={styles.card}>
          <ThemedText type="mono" themeColor="textSecondary">
            {t('account.noAccountBody')}
          </ThemedText>
          <View style={styles.bullets}>
            <ThemedText type="monoSm" themeColor="textMuted">{`—  ${t('account.benefit1')}`}</ThemedText>
            <ThemedText type="monoSm" themeColor="textMuted">{`—  ${t('account.benefit2')}`}</ThemedText>
            <ThemedText type="monoSm" themeColor="textMuted">{`—  ${t('account.benefit3')}`}</ThemedText>
          </View>
          <PrimaryButton label={t('account.saveData')} onPress={() => setShowAuth(true)} />
        </Card>
      )}

      <AuthScreen visible={showAuth} onClose={() => setShowAuth(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two },
  bullets: { gap: Spacing.one },
  link: { textDecorationLine: 'underline' },
});
