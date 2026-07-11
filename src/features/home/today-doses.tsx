import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Card, Divider, EngravedLabel, Placeholder, StatusPill } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { TextButton } from '@/components/form';
import { Spacing } from '@/constants/theme';
import { compoundBySlug } from '@/data/compound-catalog';
import { daysBetween } from '@/lib/dates';
import { hapticTap } from '@/lib/haptics';
import { itemNeedsAttention } from '@/lib/inventory';
import { isDueOnDay } from '@/components/weekday-picker';
import { useTheme } from '@/hooks/use-theme';
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
 * dashboard. Tap the LOG chip on a pending row to log; a logged row offers an
 * inline UNDO (UX audit P0: the one-tap log used to be irreversible). The card
 * header links to Protocol (UX audit P1: it was buried behind Settings) and
 * surfaces the low-stock flag where the user actually looks daily.
 */
export function TodayDoses() {
  const { t } = useTranslation();
  const router = useRouter();
  const { protocolItems, doseEvents, inventory, logDose, deleteDose } = useStore();
  const today = localDateKey();

  // Doses logged from this card in this session, so a fat-thumbed tap can be
  // reversed in place. itemId -> the dose event id the tap created.
  const [undoable, setUndoable] = useState<Record<string, string>>({});

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

  // Low-stock/expiry flag, surfaced here because Protocol is a nested screen.
  const flagged = useMemo(
    () => inventory.some((i) => i.kind === 'vial' && itemNeedsAttention(i)),
    [inventory],
  );

  const onLog = (item: ProtocolItem) => {
    const id = logDose({
      protocolItemId: item.id,
      compoundSlug: item.compoundSlug,
      takenAt: new Date().toISOString(),
      dose: item.dose,
      doseUnit: item.doseUnit,
    });
    setUndoable((m) => ({ ...m, [item.id]: id }));
    hapticTap();
  };

  const onUndo = (itemId: string) => {
    const doseId = undoable[itemId];
    if (!doseId) return;
    deleteDose(doseId);
    setUndoable((m) => {
      const next = { ...m };
      delete next[itemId];
      return next;
    });
  };

  const header = (
    <View style={styles.headerRow}>
      <EngravedLabel>{t('dashboard.dosesTitle')}</EngravedLabel>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('tabs.protocol')}
        onPress={() => router.push('/protocol')}
        hitSlop={8}>
        <ThemedText type="monoSm" themeColor="accent" style={styles.protocolLink}>
          {t('tabs.protocol').toUpperCase()}
        </ThemedText>
      </Pressable>
    </View>
  );

  // Always show the section — an empty state signals where doses appear and
  // carries its own action (UX audit: empty states must act).
  if (rows.length === 0) {
    return (
      <Card style={styles.card}>
        {header}
        <Placeholder label={t('dashboard.dosesPlaceholder')} height={64} />
        {protocolItems.length === 0 ? (
          <TextButton label={t('dashboard.dosesSetup')} onPress={() => router.push('/protocol')} />
        ) : null}
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      {header}
      {flagged ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/protocol')} hitSlop={4}>
          <ThemedText type="monoSm" themeColor="signalBad" style={styles.flagged}>
            {t('dashboard.stockFlag')}
          </ThemedText>
        </Pressable>
      ) : null}
      {rows.map(({ item, done }, i) => (
        <View key={item.id}>
          {i > 0 && <Divider style={styles.rowDivider} />}
          <DoseRow
            item={item}
            done={done}
            canUndo={done && item.id in undoable}
            onLog={() => onLog(item)}
            onUndo={() => onUndo(item.id)}
          />
        </View>
      ))}
    </Card>
  );
}

function DoseRow({
  item,
  done,
  canUndo,
  onLog,
  onUndo,
}: {
  item: ProtocolItem;
  done: boolean;
  canUndo: boolean;
  onLog: () => void;
  onUndo: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const detail = [
    item.dose != null ? `${item.dose}${item.doseUnit ?? ''}` : null,
    item.frequency ? t(`frequencies.${item.frequency}` as const) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <ThemedText type="smallBold">{name(item.compoundSlug)}</ThemedText>
        {detail ? (
          <ThemedText type="monoSm" themeColor="textSecondary" style={styles.detail}>
            {detail.toUpperCase()}
          </ThemedText>
        ) : null}
      </View>
      {done ? (
        <View style={styles.doneCol}>
          <StatusPill label={t('dashboard.doseDone')} tone="good" />
          {canUndo ? (
            <Pressable accessibilityRole="button" onPress={onUndo} hitSlop={8}>
              <ThemedText type="monoSm" themeColor="accent">
                {t('quicklog.undo')}
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      ) : (
        // The explicit action chip (UX audit: "Pending" read as status, not a
        // tap affordance). Filled instrument ink, same vocabulary as chips.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('dashboard.doseLog')} ${name(item.compoundSlug)}`}
          onPress={onLog}
          style={({ pressed }) => [
            styles.logChip,
            { backgroundColor: theme.accent },
            pressed && styles.logChipPressed,
          ]}>
          <ThemedText type="monoSm" themeColor="onAccent" style={styles.logChipText}>
            {t('dashboard.doseLog').toUpperCase()}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  protocolLink: { letterSpacing: 1 },
  flagged: { textTransform: 'uppercase' },
  rowDivider: { marginVertical: 0 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, paddingVertical: Spacing.two },
  rowText: { flex: 1, gap: Spacing.half },
  detail: {},
  doneCol: { alignItems: 'flex-end', gap: Spacing.half },
  logChip: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2, borderRadius: 2, minWidth: 56, alignItems: 'center' },
  logChipPressed: { transform: [{ scale: 0.94 }] },
  logChipText: { letterSpacing: 1.3 },
});
