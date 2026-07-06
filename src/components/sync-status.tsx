import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { StatusPill } from '@/components/surface';
import { Spacing } from '@/constants/theme';
import { useSyncStatus } from '@/lib/cloud-sync';

/** Quiet cloud-backup status, shown only in Settings (redesign §2.5). Renders
 *  nothing when sync isn't applicable (local-first / signed out). No status dot
 *  (§2.4 retires that pattern) — a chamfered certainty pill instead. */
export function SyncStatus() {
  const { t } = useTranslation();
  const status = useSyncStatus();
  if (status === 'off') return null;

  const tone = status === 'error' ? 'bad' : status === 'synced' ? 'good' : 'neutral';
  const label =
    status === 'syncing' ? t('sync.syncing') : status === 'synced' ? t('sync.synced') : t('sync.error');

  return (
    <View style={styles.row}>
      <StatusPill label={label} tone={tone} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.two },
});
