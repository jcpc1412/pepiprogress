import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSyncStatus } from '@/lib/cloud-sync';

/** Quiet cloud-backup status. Renders nothing when sync isn't applicable
 *  (local-first / signed out), so it only appears for signed-in users. */
export function SyncStatus() {
  const { t } = useTranslation();
  const theme = useTheme();
  const status = useSyncStatus();
  if (status === 'off') return null;

  const color =
    status === 'error' ? theme.signalBad : status === 'synced' ? theme.signalGood : theme.textMuted;
  const label =
    status === 'syncing' ? t('sync.syncing') : status === 'synced' ? t('sync.synced') : t('sync.error');

  return (
    <View style={styles.row} accessibilityRole="text">
      <View style={[styles.dot, { backgroundColor: color }]} />
      <ThemedText type="monoSm" themeColor="textMuted">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
