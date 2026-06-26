import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

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
          <ThemedText
            type="monoSm"
            themeColor="signalBad"
            style={styles.link}
            onPress={async () => {
              await signOut();
            }}>
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
