import type { ParseKeys } from 'i18next';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, Divider, EngravedLabel, StatusPill } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { selectCompoundMonitoring, type MarkerMonitoring } from '@/lib/lab-monitoring';
import { useStore } from '@/lib/store';
import { useToday } from '@/lib/today';

/**
 * Bloodwork-to-compound monitoring mapping (spec §3 item 4, W4-16). Lists the
 * markers this compound wants watched, the latest imported value, and how long
 * ago it was checked, flagging never-checked and overdue markers. Hidden for
 * compounds with no bloodwork monitoring tags. Deterministic.
 */
export function MonitoringMarkersCard({ slug }: { slug: string }) {
  const { t, i18n } = useTranslation();
  const { entries } = useStore();
  const today = useToday();

  const markers = useMemo(
    () => selectCompoundMonitoring(slug, entries, today),
    [slug, entries, today],
  );
  if (markers.length === 0) return null;

  return (
    <Card style={styles.card}>
      <EngravedLabel>{t('monitoring.section')}</EngravedLabel>
      <ThemedText type="small" themeColor="textSecondary">
        {t('monitoring.description')}
      </ThemedText>

      <View style={styles.list}>
        {markers.map((m, i) => (
          <View key={m.marker}>
            {i > 0 && <Divider />}
            <MarkerRow marker={m} lang={i18n.language} />
          </View>
        ))}
      </View>
    </Card>
  );
}

function MarkerRow({ marker, lang }: { marker: MarkerMonitoring; lang: string }) {
  const { t } = useTranslation();
  const label = t(`markers.${marker.marker}` as ParseKeys, { defaultValue: marker.marker });

  const status =
    marker.status === 'never'
      ? { tone: 'watch' as const, label: t('monitoring.never') }
      : marker.status === 'stale'
        ? { tone: 'watch' as const, label: t('monitoring.due') }
        : { tone: 'good' as const, label: t('monitoring.recent') };

  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <ThemedText type="small">{label as string}</ThemedText>
        {marker.value !== undefined && marker.date ? (
          <ThemedText type="monoSm" themeColor="textSecondary">
            {t('monitoring.lastValue', {
              value: marker.value,
              date: new Date(`${marker.date}T00:00:00`).toLocaleDateString(lang, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              }),
            })}
          </ThemedText>
        ) : (
          <ThemedText type="monoSm" themeColor="textMuted">
            {t('monitoring.noValue')}
          </ThemedText>
        )}
      </View>
      <StatusPill tone={status.tone} label={status.label} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  list: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, paddingVertical: Spacing.one },
  rowMain: { flex: 1, gap: 2 },
});
