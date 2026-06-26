import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OverlayHeader } from '@/components/overlay-header';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { AccountSection } from '@/features/auth/account-section';
import { AppearanceSettings } from '@/features/settings/appearance-settings';
import { CycleSettings } from '@/features/settings/cycle-settings';
import { IntegrationSettings } from '@/features/settings/integration-settings';
import { NotificationSettings } from '@/features/settings/notification-settings';
import { PrivacySettings } from '@/features/settings/privacy-settings';

/** App-wide settings, shown as a full-screen overlay from a gear icon (P-01). */
export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <OverlayHeader title={t('settings.title')} onClose={onClose} />
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <AccountSection />
          <AppearanceSettings />
          <NotificationSettings />
          <IntegrationSettings />
          <CycleSettings />
          <PrivacySettings />
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
    gap: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  scroll: { gap: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.six },
});
