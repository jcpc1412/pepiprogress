import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LabeledInput, PrimaryButton, SingleSelectChips, TextButton } from '@/components/form';
import { OverlayHeader } from '@/components/overlay-header';
import { Card, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { compoundBySlug } from '@/data/compound-catalog';
import { roundTo } from '@/lib/reconstitution';
import { useStore, type DoseRoute, type Frequency, type InventoryItem } from '@/lib/store';
import { Constants } from '@/types/database';

const DOSE_UNITS = ['mg', 'mcg', 'iu'] as const;
const ROUTES = Constants.public.Enums.dose_route;
const FREQUENCIES: Frequency[] = ['daily', 'eod', 'twice_weekly', 'weekly', 'as_needed', 'custom'];

/**
 * Compound detail (redesign R2) — reached by tapping a Protocol row. Houses what
 * the old inline Protocol form held: edit dose/route/frequency/started-on, this
 * compound's vials (amount + low-stock threshold + vendor; no expiry), its dose
 * history, and remove-from-protocol.
 */
export function CompoundDetailScreen({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const {
    protocolItems,
    doseEvents,
    inventory,
    updateProtocolItem,
    removeProtocolItem,
    addInventoryItem,
    removeInventoryItem,
    deleteDose,
  } = useStore();

  const item = protocolItems.find((p) => p.id === itemId);

  const doses = useMemo(
    () =>
      doseEvents
        .filter((d) => d.protocolItemId === itemId || (item && d.compoundSlug === item.compoundSlug))
        .sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1))
        .slice(0, 12),
    [doseEvents, itemId, item],
  );

  const vials = useMemo(
    () => inventory.filter((i) => i.kind === 'vial' && i.compoundSlug === item?.compoundSlug),
    [inventory, item?.compoundSlug],
  );

  if (!item) {
    onClose();
    return null;
  }

  const compoundName = compoundBySlug(item.compoundSlug)?.canonicalName ?? item.compoundSlug;

  const remove = () => {
    removeProtocolItem(item.id);
    onClose();
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <OverlayHeader title={compoundName} onClose={onClose} />
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Edit dose / route / frequency / started-on */}
          <Card style={styles.section}>
            <EngravedLabel>{t('addCompound.configure')}</EngravedLabel>

            <LabeledInput
              label={t('protocol.dose')}
              keyboardType="decimal-pad"
              defaultValue={item.dose != null ? String(item.dose) : ''}
              onEndEditing={(e) => {
                const v = parseFloat(e.nativeEvent.text.replace(',', '.'));
                updateProtocolItem(item.id, { dose: Number.isFinite(v) ? v : undefined });
              }}
            />

            <Field label={t('protocol.unit')}>
              <SingleSelectChips
                options={DOSE_UNITS.map((u) => ({ value: u, label: t(`doseUnits.${u}` as const) }))}
                value={item.doseUnit}
                onChange={(u) => updateProtocolItem(item.id, { doseUnit: u })}
              />
            </Field>

            <Field label={t('protocol.route')}>
              <SingleSelectChips
                options={ROUTES.map((r) => ({ value: r, label: t(`routes.${r}` as const) }))}
                value={item.route}
                onChange={(r) => updateProtocolItem(item.id, { route: r as DoseRoute })}
              />
            </Field>

            <Field label={t('protocol.frequency')}>
              <SingleSelectChips
                options={FREQUENCIES.map((f) => ({ value: f, label: t(`frequencies.${f}` as const) }))}
                value={item.frequency}
                onChange={(f) => updateProtocolItem(item.id, { frequency: f })}
              />
            </Field>

            <LabeledInput
              label={t('protocol.startedAt')}
              placeholder={t('protocol.startedAtPlaceholder')}
              autoCapitalize="none"
              defaultValue={item.startedAt ?? ''}
              onEndEditing={(e) =>
                updateProtocolItem(item.id, { startedAt: e.nativeEvent.text.trim() || undefined })
              }
            />
          </Card>

          {/* Vials */}
          <View style={styles.section}>
            <EngravedLabel>{t('compoundDetail.vials')}</EngravedLabel>
            {vials.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t('compoundDetail.noVials')}
              </ThemedText>
            ) : (
              <View style={styles.list}>
                {vials.map((v) => (
                  <VialRow key={v.id} vial={v} onRemove={() => removeInventoryItem(v.id)} />
                ))}
              </View>
            )}
            <AddVialForm
              onAdd={(amt, low, vendor) =>
                addInventoryItem({
                  kind: 'vial',
                  compoundSlug: item.compoundSlug,
                  amountRemaining: amt,
                  amountInitial: amt,
                  unit: 'mg',
                  lowThreshold: low,
                  vendor,
                  concentration: item.concentration,
                })
              }
            />
          </View>

          {/* Dose history */}
          <View style={styles.section}>
            <EngravedLabel>{t('compoundDetail.history')}</EngravedLabel>
            {doses.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t('compoundDetail.noDoses')}
              </ThemedText>
            ) : (
              <View style={styles.list}>
                {doses.map((d) => (
                  <View key={d.id} style={styles.row}>
                    <ThemedText type="mono" themeColor="textSecondary">
                      {new Date(d.takenAt).toLocaleString(i18n.language, {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                      {d.dose ? ` · ${d.dose}${d.doseUnit ?? ''}` : ''}
                      {d.site ? ` · ${d.site}` : ''}
                    </ThemedText>
                    <Pressable accessibilityRole="button" onPress={() => deleteDose(d.id)}>
                      <ThemedText type="small" themeColor="textSecondary">
                        {t('common.remove')}
                      </ThemedText>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>

          <TextButton label={t('compoundDetail.removeFromProtocol')} tone="bad" onPress={remove} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function VialRow({ vial, onRemove }: { vial: InventoryItem; onRemove: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <ThemedText type="mono" themeColor="textSecondary">
        {vial.amountRemaining != null ? `${roundTo(vial.amountRemaining, 2)} ${vial.unit ?? ''}`.trim() : '—'}
        {vial.vendor ? ` · ${vial.vendor}` : ''}
      </ThemedText>
      <Pressable accessibilityRole="button" onPress={onRemove}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('common.remove')}
        </ThemedText>
      </Pressable>
    </View>
  );
}

function AddVialForm({ onAdd }: { onAdd: (amount?: number, low?: number, vendor?: string) => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [low, setLow] = useState('');
  const [vendor, setVendor] = useState('');

  const num = (s: string) => {
    const v = parseFloat(s.replace(',', '.'));
    return Number.isFinite(v) ? v : undefined;
  };

  if (!open) {
    return <TextButton label={t('compoundDetail.addVial')} tone="accent" onPress={() => setOpen(true)} />;
  }

  return (
    <View style={[styles.addForm, { borderColor: theme.border }]}>
      <LabeledInput label={t('inventory.amount')} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
      <LabeledInput label={t('inventory.lowThreshold')} keyboardType="decimal-pad" value={low} onChangeText={setLow} />
      <LabeledInput
        label={t('inventory.vendor')}
        placeholder={t('inventory.vendorPlaceholder')}
        value={vendor}
        onChangeText={setVendor}
      />
      <PrimaryButton
        label={t('compoundDetail.addVial')}
        onPress={() => {
          onAdd(num(amount), num(low), vendor.trim() || undefined);
          setAmount('');
          setLow('');
          setVendor('');
          setOpen(false);
        }}
      />
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      {children}
    </View>
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
  section: { gap: Spacing.three },
  list: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  field: { gap: Spacing.two },
  addForm: { gap: Spacing.three, borderWidth: StyleSheet.hairlineWidth, borderRadius: 2, padding: Spacing.three },
});
