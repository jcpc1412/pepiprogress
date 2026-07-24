import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

/**
 * OAuth deep-link target (`pepi://auth-callback`, see auth.tsx OAUTH_REDIRECT).
 *
 * Without a real route here, Expo Router has nothing to match the redirect
 * against and shows "Unmatched Route" — on Android this fires even when
 * `signInWithProvider`'s own `openAuthSessionAsync` call resolves fine,
 * because the OS can deliver the same custom-scheme redirect as a fresh
 * launch intent that Router's linking listener handles independently. So
 * this screen does its own exchange rather than assuming the caller already
 * finished: whichever path wins the race sets the session, the other's
 * exchange attempt just fails on an already-consumed code and is ignored.
 */
export default function AuthCallback() {
  const { t } = useTranslation();
  const theme = useTheme();
  const params = useLocalSearchParams<{ code?: string }>();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const code = typeof params.code === 'string' ? params.code : undefined;
    (async () => {
      if (code) {
        await supabase.auth.exchangeCodeForSession(code).catch(() => {});
      }
      router.replace('/');
    })();
  }, [params.code]);

  return (
    <ThemedView style={styles.wrap}>
      <ActivityIndicator size="small" color={theme.accent} />
      <ThemedText type="monoSm" themeColor="textMuted">
        {t('auth.completingSignIn')}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
});
