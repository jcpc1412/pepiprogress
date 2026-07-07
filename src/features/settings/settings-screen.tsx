import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OverlayHeader } from '@/components/overlay-header';
import { SettingsRow } from '@/components/settings-page';
import { SyncStatus } from '@/components/sync-status';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { AccountSection } from '@/features/auth/account-section';
import { AppearanceSettings } from '@/features/settings/appearance-settings';
import { IntegrationSettings } from '@/features/settings/integration-settings';
import { useStore } from '@/lib/store';

const appVersion = Constants.expoConfig?.version ?? '1.0.0';

/** App-wide settings (P-01). A navigation hub: identity/body and the data-heavy
 *  sections live on nested pages (R3-B); compact controls stay inline. */
export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { profile } = useStore();

  const meSub = profile.displayName?.trim() || undefined;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <OverlayHeader title={t('settings.title')} onClose={onClose} />
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <AccountSection />
          {/* Cloud-backup status lives here now (redesign §2.5): removed from the
              top of screens, surfaced only in Settings. Renders nothing when
              signed out / local-first. */}
          <SyncStatus />

          {/* Nested navigation rows (R3-B). */}
          <View style={styles.rows}>
            {/* Protocol config lives here now (redesign §4.5), not a tab. */}
            <SettingsRow label={t('tabs.protocol')} onPress={() => router.push('/protocol')} />
            <SettingsRow label={t('me.title')} sublabel={meSub} onPress={() => router.push('/me')} />
            <SettingsRow label={t('notify.section')} onPress={() => router.push('/notifications-settings')} />
            <SettingsRow label={t('privacy.pageTitle')} onPress={() => router.push('/privacy')} />
          </View>

          {/* Compact, inline controls. */}
          <AppearanceSettings />
          <IntegrationSettings />

          <View style={styles.footer}>
            <ThemedText type="monoSm" themeColor="textMuted">
              {`${t('settings.footer')} · v${appVersion}`}
            </ThemedText>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  safe: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  scroll: { gap: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.six },
  rows: { gap: Spacing.two },
  footer: { alignItems: 'center', paddingVertical: Spacing.three },
});
