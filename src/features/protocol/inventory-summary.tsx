import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, EngravedLabel, StatusPill } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { compoundBySlug } from '@/data/compound-catalog';
import { useTheme } from '@/hooks/use-theme';
import { daysBetween } from '@/lib/dates';
import { EXPIRY_SOON_DAYS } from '@/lib/inventory';
import { roundTo } from '@/lib/reconstitution';
import { localDateKey, useStore, type InventoryItem } from '@/lib/store';

function name(item: InventoryItem, consumableLabel: string): string {
  if (item.kind === 'vial') return compoundBySlug(item.compoundSlug ?? '')?.canonicalName ?? item.compoundSlug ?? '';
  return item.label || consumableLabel;
}

/** Read-only stock summary at the top of Protocol (P-02). Hidden when empty;
 *  absorbs the old attention banner via per-item status pills. */
export function InventorySummary() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { inventory } = useStore();

  if (inventory.length === 0) return null;
  const today = localDateKey();

  return (
    <Card style={styles.card}>
      <EngravedLabel>{t('inventory.summaryTitle')}</EngravedLabel>
      {inventory.map((item) => {
        const low =
          item.amountRemaining != null &&
          item.lowThreshold != null &&
          item.amountRemaining <= item.lowThreshold;
        const expDays = item.expiry ? daysBetween(today, item.expiry) : null;
        const expired = expDays != null && expDays < 0;
        const expiringSoon = expDays != null && expDays >= 0 && expDays <= EXPIRY_SOON_DAYS;

        const tone = expired || low ? 'bad' : expiringSoon ? 'neutral' : 'good';
        const pillLabel = expired
          ? t('inventory.expired')
          : low
            ? t('inventory.lowStock')
            : expiringSoon
              ? t('inventory.expiringSoon')
              : t('inventory.ok');

        const pct =
          item.amountInitial && item.amountRemaining != null
            ? Math.max(0, Math.min(1, item.amountRemaining / item.amountInitial))
            : null;

        return (
          <View key={item.id} style={styles.row}>
            <View style={styles.rowHead}>
              <ThemedText type="smallBold">{name(item, t('inventory.consumable'))}</ThemedText>
              <StatusPill label={pillLabel} tone={tone} />
            </View>
            <ThemedText type="monoSm" themeColor="textSecondary">
              {item.amountRemaining != null
                ? `${roundTo(item.amountRemaining, 2)} ${item.unit ?? ''}`.trim()
                : '—'}
            </ThemedText>
            {pct != null && (
              <View style={[styles.track, { backgroundColor: theme.surfaceSunken }]}>
                <View
                  style={[
                    styles.fill,
                    { width: `${pct * 100}%`, backgroundColor: tone === 'bad' ? theme.signalBad : theme.accent },
                  ]}
                />
              </View>
            )}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  row: { gap: Spacing.one },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
});
