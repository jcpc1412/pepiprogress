import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Card, Divider, EngravedLabel, Placeholder, StatusPill } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { TextButton } from '@/components/form';
import { Spacing } from '@/constants/theme';
import { compoundBySlug } from '@/data/compound-catalog';
import { DoseDrawer, type DoseDraftResult } from '@/features/protocol/dose-drawer';
import { formatDateKey } from '@/lib/dates';
import {
  anchorFor,
  classifyDose,
  dueSlot,
  intervalFor,
  type ScheduledDose,
} from '@/lib/dose-schedule';
import { hapticTap } from '@/lib/haptics';
import { itemNeedsAttention } from '@/lib/inventory';
import { isDueOnDay } from '@/components/weekday-picker';
import { useTheme } from '@/hooks/use-theme';
import { localDateKey, useStore, type ProtocolItem } from '@/lib/store';
import { useToday } from '@/lib/today';

/** The off-slot prompt's pending state (P-04): which just-logged dose landed off
 *  the schedule grid, and which slot it most plausibly belongs to. */
type OffSlotPrompt = { itemId: string; doseId: string; slotKey: string };

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
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { protocolItems, doseEvents, inventory, logDose, updateDose, updateProtocolItem, deleteDose } =
    useStore();
  const today = useToday();

  // Doses logged from this card in this session, so a fat-thumbed tap can be
  // reversed in place. itemId -> the dose event id the tap created.
  const [undoable, setUndoable] = useState<Record<string, string>>({});
  // P-04: a just-logged dose that landed off the schedule grid awaits the user's
  // call (counts-for-slot / restart-schedule / extra). Never decided silently.
  const [offSlot, setOffSlot] = useState<OffSlotPrompt | null>(null);
  // W7-34: the item whose dose drawer is open. The drawer is now the default
  // logging surface, so LOG opens it rather than writing immediately.
  const [drafting, setDrafting] = useState<ProtocolItem | null>(null);

  // Per-item schedule inputs for the anchored grid (P-04).
  const dosesByItem = useMemo(() => {
    const map: Record<string, ScheduledDose[]> = {};
    for (const d of doseEvents) {
      if (!d.protocolItemId) continue;
      (map[d.protocolItemId] ??= []).push({
        dateKey: localDateKey(new Date(d.takenAt)),
        slotKey: d.slotKey,
        extra: d.extra,
      });
    }
    return map;
  }, [doseEvents]);

  const rows = useMemo(() => {
    const doneTodayItems = new Set<string>();
    for (const d of doseEvents) {
      if (d.protocolItemId && localDateKey(new Date(d.takenAt)) === today) {
        doneTodayItems.add(d.protocolItemId);
      }
    }

    // Derived from the shared `today` key rather than read from the clock, so
    // the weekday-due check follows the day rollover instead of staying on the
    // day this screen mounted (W7-46).
    const [ty, tm, td] = today.split('-').map(Number);
    const todayDate = new Date(ty, tm - 1, td);

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
          // Anchored interval grid (P-04): slots are anchor + N*interval; a
          // logged dose completes a slot instead of sliding the whole cadence.
          const interval = intervalFor(p.frequency);
          if (interval == null) {
            dueToday = true; // 'custom' free-text cadence: always shown (unchanged)
          } else {
            const doses = dosesByItem[p.id] ?? [];
            const anchor = anchorFor(p, doses.map((d) => d.dateKey), today);
            dueToday = anchor == null ? true : dueSlot(anchor, interval, doses, today) != null;
          }
        }

        return { item: p, done, show: dueToday || done };
      })
      .filter((r) => r.show);
  }, [protocolItems, doseEvents, dosesByItem, today]);

  // Low-stock/expiry flag, surfaced here because Protocol is a nested screen.
  const flagged = useMemo(
    () => inventory.some((i) => i.kind === 'vial' && itemNeedsAttention(i)),
    [inventory],
  );

  /**
   * Writes the dose the drawer drafted (W7-34). The schedule anchoring below is
   * unchanged from the one-tap flow, but keys off the drafted date rather than
   * today, since the drawer lets the user log a dose they took yesterday.
   */
  const commitDose = (item: ProtocolItem, draft: DoseDraftResult) => {
    const id = logDose({
      protocolItemId: item.id,
      compoundSlug: item.compoundSlug,
      takenAt: draft.takenAt,
      dose: draft.dose,
      doseUnit: draft.doseUnit,
    });
    setUndoable((m) => ({ ...m, [item.id]: id }));

    // Only when the user explicitly said "update my protocol too". Forward
    // looking by construction: this patches the item, never logged history.
    if (draft.applyToProtocol && draft.dose !== undefined) {
      updateProtocolItem(item.id, { dose: draft.dose });
    }

    // The day the dose actually landed on, which is what the schedule grid cares
    // about — not the day the user happened to open the drawer.
    const doseDay = localDateKey(new Date(draft.takenAt));

    // P-04 anchoring: interval schedules get a persistent grid reference.
    const interval = item.doseDays === undefined ? intervalFor(item.frequency) : null;
    if (interval != null) {
      const doses = dosesByItem[item.id] ?? [];
      const anchor = anchorFor(item, doses.map((d) => d.dateKey), doseDay);
      if (anchor == null) {
        // First ever dose: it starts the grid.
        updateProtocolItem(item.id, { scheduleAnchor: doseDay });
      } else {
        const c = classifyDose(anchor, interval, doseDay);
        if (!c.onSlot) {
          // Off the grid: ask, never silently re-anchor.
          setOffSlot({ itemId: item.id, doseId: id, slotKey: c.slotKey });
        } else if (!item.scheduleAnchor && !item.startedAt) {
          // On-grid log against a derived (floating) anchor: persist it.
          updateProtocolItem(item.id, { scheduleAnchor: anchor });
        }
      }
    }
    hapticTap();
  };

  const onUndo = (itemId: string) => {
    const doseId = undoable[itemId];
    if (!doseId) return;
    deleteDose(doseId);
    if (offSlot?.doseId === doseId) setOffSlot(null);
    setUndoable((m) => {
      const next = { ...m };
      delete next[itemId];
      return next;
    });
  };

  // The three off-slot resolutions (P-04). Dismissing by choosing nothing keeps
  // the default: the dose completes its nearest slot, anchor untouched.
  const onOffSlotKeep = () => {
    if (!offSlot) return;
    updateDose(offSlot.doseId, { slotKey: offSlot.slotKey });
    setOffSlot(null);
    hapticTap();
  };
  const onOffSlotShift = () => {
    if (!offSlot) return;
    updateProtocolItem(offSlot.itemId, { scheduleAnchor: today });
    setOffSlot(null);
    hapticTap();
  };
  const onOffSlotExtra = () => {
    if (!offSlot) return;
    updateDose(offSlot.doseId, { extra: true });
    setOffSlot(null);
    hapticTap();
  };

  const header = (
    <View style={styles.headerRow}>
      <EngravedLabel>{t('dashboard.dosesTitle')}</EngravedLabel>
      {/* Front door to Protocol (set up once, rarely touched). A labeled text
          link, not a gear: the screen already has a header gear for Settings, and
          two identical gears to different destinations was a recognition tax
          (critique P3). "Manage" says where it goes. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('dashboard.dosesManage')}
        onPress={() => router.push('/protocol')}
        hitSlop={8}>
        <ThemedText type="monoSm" themeColor="textSecondary" style={styles.manageLink}>
          {t('dashboard.manage')}
        </ThemedText>
      </Pressable>
    </View>
  );

  // Always show the section — an empty state signals where doses appear and
  // carries its own action (UX audit: empty states must act). Two distinct empty
  // states, never conflated: no protocol yet (teach + set up) vs a protocol that
  // simply has nothing due today, e.g. a weekly compound on an off day (neutral,
  // no nag — never tell a user with an active protocol to "add a protocol").
  if (rows.length === 0) {
    const hasProtocol = protocolItems.length > 0;
    return (
      <Card style={styles.card}>
        {header}
        <Placeholder
          label={hasProtocol ? t('dashboard.dosesNoneToday') : t('dashboard.dosesPlaceholder')}
          height={64}
        />
        {hasProtocol ? null : (
          <TextButton label={t('dashboard.dosesSetup')} onPress={() => router.push('/protocol')} />
        )}
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
            onLog={() => setDrafting(item)}
            onUndo={() => onUndo(item.id)}
          />
          {offSlot?.itemId === item.id ? (
            <View style={styles.offSlotBox}>
              <ThemedText type="monoSm" themeColor="textSecondary" style={styles.offSlotTitle}>
                {t('dashboard.offSlotTitle')}
              </ThemedText>
              <View style={styles.offSlotChips}>
                <TextButton
                  label={t('dashboard.offSlotKeep', {
                    date: formatDateKey(offSlot.slotKey, i18n.language),
                  })}
                  onPress={onOffSlotKeep}
                />
                <TextButton label={t('dashboard.offSlotShift')} onPress={onOffSlotShift} />
                <TextButton label={t('dashboard.offSlotExtra')} onPress={onOffSlotExtra} />
              </View>
            </View>
          ) : null}
        </View>
      ))}

      <DoseDrawer
        // Keyed so each open remounts with defaults drawn from that item.
        key={drafting?.id ?? 'none'}
        item={drafting}
        visible={drafting !== null}
        onCancel={() => setDrafting(null)}
        onConfirm={(draft) => {
          if (drafting) commitDose(drafting, draft);
          setDrafting(null);
        }}
      />
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
  manageLink: { textTransform: 'uppercase', textDecorationLine: 'underline', letterSpacing: 0.5 },
  flagged: { textTransform: 'uppercase' },
  rowDivider: { marginVertical: 0 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, paddingVertical: Spacing.two },
  rowText: { flex: 1, gap: Spacing.half },
  detail: {},
  doneCol: { alignItems: 'flex-end', gap: Spacing.half },
  logChip: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2, borderRadius: 2, minWidth: 56, alignItems: 'center' },
  logChipPressed: { transform: [{ scale: 0.94 }] },
  logChipText: { letterSpacing: 1.3 },
  offSlotBox: { gap: Spacing.one, paddingBottom: Spacing.two },
  offSlotTitle: { textTransform: 'uppercase' },
  offSlotChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, alignItems: 'center' },
});
