import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LabeledInput, PrimaryButton, TextButton } from '@/components/form';
import { BackIcon, ChevronRightIcon, GearIcon } from '@/components/icons';
import { Divider, EngravedLabel, StatusPill } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { compoundBySlug } from '@/data/compound-catalog';
import { useTheme } from '@/hooks/use-theme';
import { daysBetween } from '@/lib/dates';
import { itemNeedsAttention } from '@/lib/inventory';
import { useOverlay } from '@/lib/nav-overlay';
import { roundTo } from '@/lib/reconstitution';
import { localDateKey, useStore, type InventoryItem, type ProtocolItem } from '@/lib/store';

function name(slug: string | undefined): string {
  return (slug && compoundBySlug(slug)?.canonicalName) || slug || '';
}

/**
 * Protocol (redesign R2) — clean instrument list. Each row: name, stock status
 * pill, mono detail line (dose · route · freq · last), a depletion bar, and the
 * vial-count readout. Tap a row → compound detail. Dose logging + adding live in
 * the two bottom buttons. Inventory editing moved to compound detail; recent
 * doses moved to Today.
 */
export function ProtocolScreen({ onClose }: { onClose?: () => void } = {}) {
  const { t } = useTranslation();
  const { openSettings, openAddCompound, openCompoundDetail, openLogging } = useOverlay();
  const { protocolItems, doseEvents, inventory } = useStore();

  // Linked vials per compound (aggregate depletion + count + low-stock status).
  const vialsByCompound = useMemo(() => {
    const map: Record<string, InventoryItem[]> = {};
    for (const i of inventory) {
      if (i.kind === 'vial' && i.compoundSlug) (map[i.compoundSlug] ??= []).push(i);
    }
    return map;
  }, [inventory]);

  // Most recent dose date-key per compound, for the "LAST:" detail.
  const lastDoseByCompound = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of doseEvents) {
      if (!d.compoundSlug) continue;
      const key = localDateKey(new Date(d.takenAt));
      if (!map[d.compoundSlug] || map[d.compoundSlug] < key) map[d.compoundSlug] = key;
    }
    return map;
  }, [doseEvents]);

  const flaggedCount = useMemo(
    () => Object.values(vialsByCompound).filter((vs) => vs.some((v) => itemNeedsAttention(v))).length,
    [vialsByCompound],
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          {onClose ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              onPress={onClose}
              hitSlop={8}
              style={styles.back}>
              <BackIcon />
            </Pressable>
          ) : null}
          <View style={styles.headerText}>
            <EngravedLabel>{t('protocol.title')}</EngravedLabel>
            <ThemedText type="display">
              {t('protocol.compoundCount', { count: protocolItems.length })}
            </ThemedText>
            {flaggedCount > 0 && (
              <ThemedText type="monoSm" themeColor="signalBad" style={styles.flagged}>
                {t('protocol.flaggedCount', { count: flaggedCount })}
              </ThemedText>
            )}
          </View>
          {onClose ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('settings.title')}
              onPress={openSettings}
              hitSlop={8}>
              <GearIcon />
            </Pressable>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {protocolItems.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('protocol.addFirstPrompt')}
            </ThemedText>
          ) : (
            <View>
              {protocolItems.map((item, i) => (
                <View key={item.id}>
                  {i > 0 && <Divider style={styles.rowDivider} />}
                  <CompoundRow
                    item={item}
                    vials={vialsByCompound[item.compoundSlug] ?? []}
                    lastDoseKey={lastDoseByCompound[item.compoundSlug]}
                    onPress={() => openCompoundDetail(item.id)}
                  />
                </View>
              ))}
            </View>
          )}

          <Divider />
          <View style={styles.buttons}>
            <View style={styles.buttonHalf}>
              <PrimaryButton label={t('protocol.logDose')} onPress={() => openLogging('quick', undefined, true)} />
            </View>
            <View style={styles.buttonHalf}>
              <PrimaryButton
                label={t('protocol.addCompound')}
                variant="secondary"
                onPress={openAddCompound}
              />
            </View>
          </View>

          <ConsumablesSection />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function CompoundRow({
  item,
  vials,
  lastDoseKey,
  onPress,
}: {
  item: ProtocolItem;
  vials: InventoryItem[];
  lastDoseKey?: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();

  const low = vials.some((v) => itemNeedsAttention(v));
  const totalInit = vials.reduce((s, v) => s + (v.amountInitial ?? 0), 0);
  const totalRem = vials.reduce((s, v) => s + (v.amountRemaining ?? 0), 0);
  const pct = totalInit > 0 ? Math.max(0, Math.min(1, totalRem / totalInit)) : null;

  const lastWhen = !lastDoseKey
    ? t('protocol.never')
    : (() => {
        const days = daysBetween(lastDoseKey, localDateKey());
        return days <= 0 ? t('protocol.lastToday') : t('protocol.lastDaysAgo', { count: days });
      })();

  const detail = [
    item.dose != null ? `${item.dose}${item.doseUnit ?? ''}` : null,
    item.frequency ? t(`frequencies.${item.frequency}` as const) : null,
    t('protocol.lastPrefix', { when: lastWhen }),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.rowMain}>
        <View style={styles.rowHead}>
          <ThemedText type="smallBold" style={styles.compoundName}>
            {name(item.compoundSlug).toUpperCase()}
          </ThemedText>
          {vials.length > 0 && (
            <StatusPill label={low ? t('inventory.lowStock') : t('protocol.nominal')} tone={low ? 'bad' : 'good'} />
          )}
        </View>
        <ThemedText type="monoSm" themeColor="textSecondary" style={styles.detail}>
          {detail.toUpperCase()}
        </ThemedText>
        {/* Always show the depletion row — an empty track signals "add a vial". */}
        <View style={styles.depRow}>
          <View style={[styles.depTrack, { backgroundColor: theme.surfaceSunken }]}>
            {pct != null && (
              <View
                style={[
                  styles.depFill,
                  { width: `${pct * 100}%`, backgroundColor: low ? theme.signalBad : theme.numeral },
                ]}
              />
            )}
          </View>
          <ThemedText type="monoSm" themeColor={low ? 'signalBad' : 'textMuted'}>
            {vials.length > 0 ? t('protocol.vialCount', { count: vials.length }) : t('protocol.noVial')}
          </ThemedText>
        </View>
      </View>
      <ChevronRightIcon color="textMuted" />
    </Pressable>
  );
}

/** Collapsible consumables (needles, swabs) — kept off the clean hero. */
function ConsumablesSection() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { inventory, addInventoryItem, removeInventoryItem } = useStore();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('');
  const [low, setLow] = useState('');

  const consumables = inventory.filter((i) => i.kind === 'consumable');

  const num = (s: string) => {
    const v = parseFloat(s.replace(',', '.'));
    return Number.isFinite(v) ? v : undefined;
  };

  if (!open && consumables.length === 0) {
    return (
      <View style={styles.suppliesToggle}>
        <TextButton label={t('inventory.summaryTitle')} onPress={() => setOpen(true)} />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <EngravedLabel>{t('inventory.summaryTitle')}</EngravedLabel>
      {consumables.map((c) => (
        <View key={c.id} style={styles.row}>
          <ThemedText type="mono" themeColor="textSecondary">
            {c.label || t('inventory.consumable')}
            {c.amountRemaining != null ? ` · ${roundTo(c.amountRemaining, 2)} ${c.unit ?? ''}`.trimEnd() : ''}
          </ThemedText>
          <Pressable accessibilityRole="button" onPress={() => removeInventoryItem(c.id)}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('common.remove')}
            </ThemedText>
          </Pressable>
        </View>
      ))}
      <View style={[styles.addForm, { borderColor: theme.border }]}>
        <LabeledInput label={t('inventory.label')} value={label} onChangeText={setLabel} />
        <LabeledInput label={t('inventory.amount')} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
        <LabeledInput label={t('inventory.unit')} value={unit} onChangeText={setUnit} />
        <LabeledInput label={t('inventory.lowThreshold')} keyboardType="decimal-pad" value={low} onChangeText={setLow} />
        <PrimaryButton
          label={t('inventory.add')}
          disabled={!label.trim()}
          onPress={() => {
            addInventoryItem({
              kind: 'consumable',
              label: label.trim(),
              amountRemaining: num(amount),
              amountInitial: num(amount),
              unit: unit.trim() || undefined,
              lowThreshold: num(low),
            });
            setLabel('');
            setAmount('');
            setUnit('');
            setLow('');
          }}
        />
      </View>
    </View>
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
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.three },
  headerText: { flex: 1 },
  back: { paddingTop: Spacing.half },
  flagged: { textTransform: 'uppercase' },
  scroll: { gap: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.six },
  rowDivider: { marginVertical: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.three },
  rowPressed: { opacity: 0.6 },
  rowMain: { flex: 1, gap: Spacing.one },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  compoundName: { letterSpacing: 0.5 },
  detail: {},
  depRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.one },
  depTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  depFill: { height: 4, borderRadius: 2 },
  buttons: { flexDirection: 'row', gap: Spacing.two },
  buttonHalf: { flex: 1 },
  section: { gap: Spacing.three },
  suppliesToggle: { alignItems: 'center' },
  addForm: { gap: Spacing.three, borderWidth: StyleSheet.hairlineWidth, borderRadius: 2, padding: Spacing.three },
});
