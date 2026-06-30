import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Divider, EngravedLabel, Placeholder, StatusPill } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { compoundBySlug } from '@/data/compound-catalog';
import { daysBetween } from '@/lib/dates';
import { isDueOnDay } from '@/components/weekday-picker';
import { localDateKey, useStore, type Frequency, type ProtocolItem } from '@/lib/store';

/** Days that must pass since the last dose for a given frequency to be "due" again. */
const DUE_AFTER: Partial<Record<Frequency, number>> = {
  eod: 2,
  twice_weekly: 3,
  weekly: 7,
};

function name(slug: string | undefined): string {
  return (slug && compoundBySlug(slug)?.canonicalName) || slug || '';
}

/**
 * Today's doses (redesign R2) — the pending/done checklist at the bottom of the
 * dashboard, replacing the old Recent-doses list on Protocol. Shows protocol
 * items due today (per frequency); tap a pending one to log + mark done.
 */
export function TodayDoses() {
  const { t } = useTranslation();
  const { protocolItems, doseEvents, logDose } = useStore();
  const today = localDateKey();

  const rows = useMemo(() => {
    // Last dose date-key per protocol item (by item id, falling back to compound).
    const lastByItem: Record<string, string> = {};
    const doneTodayItems = new Set<string>();
    for (const d of doseEvents) {
      const key = localDateKey(new Date(d.takenAt));
      const itemId = d.protocolItemId;
      if (itemId) {
        if (!lastByItem[itemId] || lastByItem[itemId] < key) lastByItem[itemId] = key;
        if (key === today) doneTodayItems.add(itemId);
      }
    }

    const todayDate = new Date();

    return protocolItems
      .map((p) => {
        const done = doneTodayItems.has(p.id);
        let dueToday: boolean;

        if (p.doseDays !== undefined) {
          // New weekday schedule: empty = as_needed (never auto-due)
          dueToday = isDueOnDay(p.doseDays, todayDate);
        } else if (p.frequency === 'as_needed') {
          dueToday = false;
        } else {
          // Legacy frequency cadence
          const last = lastByItem[p.id];
          const lastBeforeToday = last && last < today ? last : undefined;
          const daysSince = lastBeforeToday ? daysBetween(lastBeforeToday, today) : Infinity;
          const dueAfter = p.frequency ? DUE_AFTER[p.frequency] : undefined;
          dueToday = dueAfter == null ? true : daysSince >= dueAfter;
        }

        return { item: p, done, show: dueToday || done };
      })
      .filter((r) => r.show);
  }, [protocolItems, doseEvents, today]);

  // Always show the section — an empty placeholder signals where doses appear.
  if (rows.length === 0) {
    return (
      <Card style={styles.card}>
        <EngravedLabel>{t('dashboard.dosesTitle')}</EngravedLabel>
        <Placeholder label={t('dashboard.dosesPlaceholder')} height={64} />
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <EngravedLabel>{t('dashboard.dosesTitle')}</EngravedLabel>
      {rows.map(({ item, done }, i) => (
        <View key={item.id}>
          {i > 0 && <Divider style={styles.rowDivider} />}
          <DoseRow item={item} done={done} onLog={() => logDose({
            protocolItemId: item.id,
            compoundSlug: item.compoundSlug,
            takenAt: new Date().toISOString(),
            dose: item.dose,
            doseUnit: item.doseUnit,
          })} />
        </View>
      ))}
    </Card>
  );
}

function DoseRow({ item, done, onLog }: { item: ProtocolItem; done: boolean; onLog: () => void }) {
  const { t } = useTranslation();
  const detail = [
    item.dose != null ? `${item.dose}${item.doseUnit ?? ''}` : null,
    item.frequency ? t(`frequencies.${item.frequency}` as const) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ checked: done }}
      disabled={done}
      onPress={onLog}
      style={({ pressed }) => [styles.row, pressed && !done && styles.rowPressed]}>
      <View style={styles.rowText}>
        <ThemedText type="smallBold">{name(item.compoundSlug)}</ThemedText>
        {detail ? (
          <ThemedText type="monoSm" themeColor="textSecondary" style={styles.detail}>
            {detail.toUpperCase()}
          </ThemedText>
        ) : null}
      </View>
      <StatusPill
        label={done ? t('dashboard.doseDone') : t('dashboard.dosePending')}
        tone={done ? 'good' : 'neutral'}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two },
  rowDivider: { marginVertical: 0 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, paddingVertical: Spacing.two },
  rowPressed: { opacity: 0.6 },
  rowText: { flex: 1, gap: Spacing.half },
  detail: {},
});
