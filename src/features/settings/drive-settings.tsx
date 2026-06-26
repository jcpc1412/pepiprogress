import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/form';
import { Card, Divider, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { downloadBackup, listBackups, pruneOldBackups, uploadToDrive, type DriveBackupInfo } from '@/lib/drive-backup';
import { mergeStates } from '@/lib/sync';
import { useStore } from '@/lib/store';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

/**
 * Google Drive backup / restore UI (spec 06, Polish).
 * - Requires EXPO_PUBLIC_GOOGLE_CLIENT_ID in .env (see src/lib/drive-backup.ts for setup).
 * - Uses PKCE OAuth via expo-auth-session; no client secret needed.
 * - Backs up to Drive `appDataFolder` (private app storage — not visible in Drive UI).
 */
export function DriveSettings() {
  const { t } = useTranslation();
  const { exportState, replaceState } = useStore();

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: GOOGLE_CLIENT_ID ?? '',
    scopes: ['https://www.googleapis.com/auth/drive.appdata'],
  });

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [backing, setBacking] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [lastBackup, setLastBackup] = useState<DriveBackupInfo | null>(null);

  // Exchange auth code for access token when the OAuth flow completes.
  useEffect(() => {
    if (response?.type !== 'success') return;
    const { code } = response.params;
    if (!code || !request?.codeVerifier) return;

    AuthSession.exchangeCodeAsync(
      {
        clientId: GOOGLE_CLIENT_ID ?? '',
        code,
        redirectUri: AuthSession.makeRedirectUri({ scheme: 'pepi' }),
        extraParams: { code_verifier: request.codeVerifier },
      },
      { tokenEndpoint: 'https://oauth2.googleapis.com/token' },
    )
      .then((tokenRes) => setAccessToken(tokenRes.accessToken))
      .catch(() => Alert.alert(t('drive.error')));
  }, [response, request, t]);

  // On first connect (or on mount with token), fetch the latest backup info.
  useEffect(() => {
    if (!accessToken) return;
    listBackups(accessToken)
      .then((files) => setLastBackup(files[0] ?? null))
      .catch(() => {});
  }, [accessToken]);

  const backup = async () => {
    if (!accessToken) return;
    setBacking(true);
    try {
      const info = await uploadToDrive(exportState(), accessToken);
      setLastBackup(info);
      await pruneOldBackups(accessToken, 3);
      Alert.alert(t('drive.success'));
    } catch {
      Alert.alert(t('drive.error'));
    } finally {
      setBacking(false);
    }
  };

  const restore = async () => {
    if (!accessToken) return;
    const files = await listBackups(accessToken).catch(() => [] as DriveBackupInfo[]);
    if (!files.length) {
      Alert.alert(t('drive.noBackups'));
      return;
    }
    Alert.alert(
      t('drive.restoreTitle'),
      t('drive.restoreBody', { date: new Date(files[0].createdTime).toLocaleDateString() }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('drive.restore'),
          onPress: async () => {
            setRestoring(true);
            try {
              const cloudState = await downloadBackup(files[0].id, accessToken);
              if (cloudState) {
                replaceState(mergeStates(exportState(), cloudState));
                Alert.alert(t('drive.restoreSuccess'));
              }
            } catch {
              Alert.alert(t('drive.error'));
            } finally {
              setRestoring(false);
            }
          },
        },
      ],
    );
  };

  if (Platform.OS === 'web') {
    return (
      <View style={styles.wrap}>
        <EngravedLabel>{t('drive.section')}</EngravedLabel>
        <ThemedText type="monoSm" themeColor="textMuted">{t('drive.webUnsupported')}</ThemedText>
      </View>
    );
  }

  if (!GOOGLE_CLIENT_ID) {
    return (
      <View style={styles.wrap}>
        <EngravedLabel>{t('drive.section')}</EngravedLabel>
        <ThemedText type="monoSm" themeColor="textMuted">{t('drive.notConfigured')}</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <EngravedLabel>{t('drive.section')}</EngravedLabel>
      <ThemedText type="monoSm" themeColor="textSecondary">{t('drive.description')}</ThemedText>

      {!accessToken ? (
        <PrimaryButton
          label={t('drive.connectGoogle')}
          onPress={() => promptAsync()}
          disabled={!request}
        />
      ) : (
        <Card style={styles.card}>
          {lastBackup && (
            <>
              <ThemedText type="monoSm" themeColor="textMuted">
                {t('drive.lastBackup', { date: new Date(lastBackup.createdTime).toLocaleDateString() })}
              </ThemedText>
              <Divider />
            </>
          )}
          <PrimaryButton
            label={backing ? t('drive.backing') : t('drive.backup')}
            onPress={backup}
            disabled={backing || restoring}
          />
          <ThemedText
            type="monoSm"
            themeColor="textSecondary"
            style={styles.link}
            onPress={restore}>
            {restoring ? t('drive.restoring') : t('drive.restore')}
          </ThemedText>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  card: { gap: Spacing.two, padding: Spacing.three },
  link: { textDecorationLine: 'underline', textAlign: 'center' },
});
