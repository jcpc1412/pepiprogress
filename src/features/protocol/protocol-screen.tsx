import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LabeledInput, PrimaryButton, SingleSelectChips } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { COMPOUND_CATALOG, compoundBySlug } from '@/data/compound-catalog';
import { CycleSettings } from '@/features/settings/cycle-settings';
import { IntegrationSettings } from '@/features/settings/integration-settings';
import { NotificationSettings } from '@/features/settings/notification-settings';
import { PrivacySettings } from '@/features/settings/privacy-settings';
import { LabImport } from '@/features/lab/lab-import';
import { daysBetween } from '@/lib/dates';
import { EXPIRY_SOON_DAYS, inventoryAttention } from '@/lib/inventory';
import {
  concentrationMgPerMl,
  doseToDraw,
  roundTo,
  type DoseUnit,
} from '@/lib/reconstitution';
import {
  localDateKey,
  useStore,
  type DoseRoute,
  type Frequency,
  type InventoryItem,
  type InventoryKind,
  type ProtocolItem,
} from '@/lib/store';
import { Constants } from '@/types/database';

const DOSE_UNITS = ['mg', 'mcg', 'iu'] as const;
const ROUTES = Constants.public.Enums.dose_route;
const INV_KINDS = Constants.public.Enums.inventory_kind;
const FREQUENCIES: Frequency[] = ['daily', 'eod', 'twice_weekly', 'weekly', 'as_needed', 'custom'];

function name(slug: string | undefined): string {
  return (slug && compoundBySlug(slug)?.canonicalName) || slug || '';
}

export function ProtocolScreen() {
  const { t, i18n } = useTranslation();
  const {
    protocolItems,
    doseEvents,
    inventory,
    addProtocolItem,
    removeProtocolItem,
    logDose,
    deleteDose,
    addInventoryItem,
    removeInventoryItem,
  } = useStore();

  // Most-recent injection site per protocol item, for rotation hints (spec 03).
  const lastSiteByItem = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of doseEvents) {
      if (d.protocolItemId && d.site && !map[d.protocolItemId]) map[d.protocolItemId] = d.site;
    }
    return map;
  }, [doseEvents]);

  // In-app low-stock / expiry surface (also drives the inventory reminder, src/lib/notifications).
  const attention = useMemo(() => inventoryAttention(inventory), [inventory]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ThemedText type="display">{t('protocol.title')}</ThemedText>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* ── Needs attention (low stock / expiry) ───────────────────── */}
          {attention.length > 0 && (
            <View style={styles.banner}>
              <ThemedText type="smallBold">{t('inventory.attention')}</ThemedText>
              {attention.map((i) => (
                <ThemedText key={i.id} type="small" themeColor="textSecondary">
                  {i.kind === 'vial' ? name(i.compoundSlug) : i.label || t('inventory.consumable')}
                </ThemedText>
              ))}
            </View>
          )}

          {/* ── Protocol items ─────────────────────────────────────────── */}
          {protocolItems.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('protocol.empty')}
            </ThemedText>
          ) : (
            <View style={styles.list}>
              {protocolItems.map((item) => (
                <ProtocolRow
                  key={item.id}
                  item={item}
                  lastSite={lastSiteByItem[item.id]}
                  onLog={(site) =>
                    logDose({
                      protocolItemId: item.id,
                      compoundSlug: item.compoundSlug,
                      takenAt: new Date().toISOString(),
                      dose: item.dose,
                      doseUnit: item.doseUnit,
                      site,
                    })
                  }
                  onRemove={() => removeProtocolItem(item.id)}
                />
              ))}
            </View>
          )}

          <AddProtocolForm onAdd={addProtocolItem} />

          {/* ── Inventory ──────────────────────────────────────────────── */}
          <View style={styles.section}>
            <ThemedText type="display">{t('inventory.title')}</ThemedText>
            {inventory.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t('inventory.empty')}
              </ThemedText>
            ) : (
              <View style={styles.list}>
                {inventory.map((item) => (
                  <InventoryRow key={item.id} item={item} onRemove={() => removeInventoryItem(item.id)} />
                ))}
              </View>
            )}
            <AddInventoryForm onAdd={addInventoryItem} />
          </View>

          {/* ── Recent doses ───────────────────────────────────────────── */}
          <View style={styles.section}>
            <ThemedText type="display">{t('protocol.dosesTitle')}</ThemedText>
            {doseEvents.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t('protocol.dosesEmpty')}
              </ThemedText>
            ) : (
              <View style={styles.list}>
                {doseEvents.slice(0, 8).map((d) => (
                  <View key={d.id} style={styles.row}>
                    <View style={styles.rowText}>
                      <ThemedText type="smallBold">{name(d.compoundSlug)}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {new Date(d.takenAt).toLocaleString(i18n.language, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                        {d.dose ? ` · ${d.dose}${d.doseUnit ?? ''}` : ''}
                        {d.site ? ` · ${d.site}` : ''}
                      </ThemedText>
                    </View>
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

          {/* ── Reconstitution calculator ──────────────────────────────── */}
          <ReconstitutionCalculator />

          {/* ── Lab values import (spec 05/06) ────────────────────────── */}
          <LabImport />

          {/* ── Data sources (integrations, spec 06) ──────────────────── */}
          <IntegrationSettings />

          {/* ── Reminders (local notifications, spec 06) ──────────────── */}
          <NotificationSettings />

          {/* ── Cycle tracking (optional, female users) ───────────────── */}
          <CycleSettings />

          {/* ── Privacy & data (spec 11) ───────────────────────────────── */}
          <PrivacySettings />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function ProtocolRow({
  item,
  lastSite,
  onLog,
  onRemove,
}: {
  item: ProtocolItem;
  lastSite?: string;
  onLog: (site?: string) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const [site, setSite] = useState('');
  const parts = [
    item.dose ? `${item.dose}${item.doseUnit ?? ''}` : null,
    item.route ? t(`routes.${item.route}` as const) : null,
    item.frequency ? t(`frequencies.${item.frequency}` as const) : null,
  ].filter(Boolean);

  const log = () => {
    onLog(site.trim() || undefined);
    setSite('');
  };

  return (
    <View style={styles.itemCard}>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <ThemedText type="smallBold">{name(item.compoundSlug)}</ThemedText>
          {parts.length > 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {parts.join(' · ')}
            </ThemedText>
          )}
          {lastSite ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('protocol.lastSite', { site: lastSite })}
            </ThemedText>
          ) : null}
        </View>
        <Pressable accessibilityRole="button" onPress={onRemove}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('common.remove')}
          </ThemedText>
        </Pressable>
      </View>
      <View style={styles.logRow}>
        <View style={styles.siteInput}>
          <LabeledInput
            label={t('protocol.site')}
            placeholder={t('protocol.sitePlaceholder')}
            value={site}
            onChangeText={setSite}
          />
        </View>
        <View style={styles.logButton}>
          <PrimaryButton label={t('protocol.logDose')} onPress={log} />
        </View>
      </View>
    </View>
  );
}

function InventoryRow({ item, onRemove }: { item: InventoryItem; onRemove: () => void }) {
  const { t } = useTranslation();
  const today = localDateKey();
  const low =
    item.amountRemaining != null &&
    item.lowThreshold != null &&
    item.amountRemaining <= item.lowThreshold;
  const expiryDays = item.expiry ? daysBetween(today, item.expiry) : null;
  const expired = expiryDays != null && expiryDays < 0;
  const expiringSoon = expiryDays != null && expiryDays >= 0 && expiryDays <= EXPIRY_SOON_DAYS;

  const label = item.kind === 'vial' ? name(item.compoundSlug) : item.label || t('inventory.consumable');

  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <ThemedText type="smallBold">{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {item.amountRemaining != null ? `${roundTo(item.amountRemaining, 2)} ${item.unit ?? ''}`.trim() : '—'}
          {low ? ` · ${t('inventory.lowStock')}` : ''}
          {expired ? ` · ${t('inventory.expired')}` : expiringSoon ? ` · ${t('inventory.expiringSoon')}` : ''}
        </ThemedText>
      </View>
      <Pressable accessibilityRole="button" onPress={onRemove}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('common.remove')}
        </ThemedText>
      </Pressable>
    </View>
  );
}

function AddProtocolForm({ onAdd }: { onAdd: (item: Omit<ProtocolItem, 'id'>) => void }) {
  const { t } = useTranslation();
  const [slug, setSlug] = useState<string>();
  const [dose, setDose] = useState('');
  const [doseUnit, setDoseUnit] = useState<string>('mg');
  const [route, setRoute] = useState<DoseRoute>();
  const [frequency, setFrequency] = useState<Frequency>();
  const [startedAt, setStartedAt] = useState('');

  const submit = () => {
    if (!slug) return;
    const doseNum = parseFloat(dose.replace(',', '.'));
    onAdd({
      compoundSlug: slug,
      dose: Number.isFinite(doseNum) ? doseNum : undefined,
      doseUnit,
      route,
      frequency,
      startedAt: startedAt.trim() || undefined,
    });
    setSlug(undefined);
    setDose('');
    setRoute(undefined);
    setFrequency(undefined);
    setStartedAt('');
  };

  return (
    <View style={styles.section}>
      <ThemedText type="display">{t('protocol.addTitle')}</ThemedText>

      <Field label={t('protocol.compound')}>
        <SingleSelectChips
          options={COMPOUND_CATALOG.map((c) => ({ value: c.slug, label: c.canonicalName }))}
          value={slug}
          onChange={setSlug}
        />
      </Field>

      <LabeledInput label={t('protocol.dose')} keyboardType="decimal-pad" value={dose} onChangeText={setDose} />

      <Field label={t('protocol.unit')}>
        <SingleSelectChips
          options={DOSE_UNITS.map((u) => ({ value: u, label: t(`doseUnits.${u}` as const) }))}
          value={doseUnit}
          onChange={setDoseUnit}
        />
      </Field>

      <Field label={t('protocol.route')}>
        <SingleSelectChips
          options={ROUTES.map((r) => ({ value: r, label: t(`routes.${r}` as const) }))}
          value={route}
          onChange={setRoute}
        />
      </Field>

      <Field label={t('protocol.frequency')}>
        <SingleSelectChips
          options={FREQUENCIES.map((f) => ({ value: f, label: t(`frequencies.${f}` as const) }))}
          value={frequency}
          onChange={setFrequency}
        />
      </Field>

      <LabeledInput
        label={t('protocol.startedAt')}
        placeholder={t('protocol.startedAtPlaceholder')}
        value={startedAt}
        onChangeText={setStartedAt}
      />

      <PrimaryButton label={t('protocol.add')} onPress={submit} disabled={!slug} />
    </View>
  );
}

function AddInventoryForm({ onAdd }: { onAdd: (item: Omit<InventoryItem, 'id'>) => void }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<InventoryKind>('vial');
  const [slug, setSlug] = useState<string>();
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('');
  const [lowThreshold, setLowThreshold] = useState('');
  const [expiry, setExpiry] = useState('');
  const [vendor, setVendor] = useState('');

  const numOrUndef = (s: string) => {
    const v = parseFloat(s.replace(',', '.'));
    return Number.isFinite(v) ? v : undefined;
  };

  const canAdd = kind === 'vial' ? !!slug : !!label.trim();

  const submit = () => {
    if (!canAdd) return;
    onAdd({
      kind,
      compoundSlug: kind === 'vial' ? slug : undefined,
      label: kind === 'consumable' ? label.trim() : undefined,
      amountRemaining: numOrUndef(amount),
      unit: unit.trim() || (kind === 'vial' ? 'mg' : undefined),
      lowThreshold: numOrUndef(lowThreshold),
      expiry: expiry.trim() || undefined,
      vendor: vendor.trim() || undefined,
    });
    setSlug(undefined);
    setLabel('');
    setAmount('');
    setUnit('');
    setLowThreshold('');
    setExpiry('');
    setVendor('');
  };

  return (
    <View style={styles.subForm}>
      <ThemedText type="smallBold">{t('inventory.addTitle')}</ThemedText>

      <Field label={t('inventory.kind')}>
        <SingleSelectChips
          options={INV_KINDS.map((k) => ({ value: k, label: t(`inventoryKinds.${k}` as const) }))}
          value={kind}
          onChange={setKind}
        />
      </Field>

      {kind === 'vial' ? (
        <Field label={t('protocol.compound')}>
          <SingleSelectChips
            options={COMPOUND_CATALOG.map((c) => ({ value: c.slug, label: c.canonicalName }))}
            value={slug}
            onChange={setSlug}
          />
        </Field>
      ) : (
        <LabeledInput label={t('inventory.label')} value={label} onChangeText={setLabel} />
      )}

      <LabeledInput
        label={t('inventory.amount')}
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
      />
      <LabeledInput label={t('inventory.unit')} value={unit} onChangeText={setUnit} />
      <LabeledInput
        label={t('inventory.lowThreshold')}
        keyboardType="decimal-pad"
        value={lowThreshold}
        onChangeText={setLowThreshold}
      />
      <LabeledInput
        label={t('inventory.expiry')}
        placeholder={t('inventory.expiryPlaceholder')}
        autoCapitalize="none"
        value={expiry}
        onChangeText={setExpiry}
      />
      <LabeledInput
        label={t('inventory.vendor')}
        placeholder={t('inventory.vendorPlaceholder')}
        value={vendor}
        onChangeText={setVendor}
      />

      <PrimaryButton label={t('inventory.add')} onPress={submit} disabled={!canAdd} />
    </View>
  );
}

function ReconstitutionCalculator() {
  const { t } = useTranslation();
  const [vialMg, setVialMg] = useState('');
  const [waterMl, setWaterMl] = useState('');
  const [dose, setDose] = useState('');
  const [doseUnit, setDoseUnit] = useState<string>('mcg');

  const concentration = useMemo(
    () => concentrationMgPerMl(parseFloat(vialMg), parseFloat(waterMl)),
    [vialMg, waterMl],
  );

  const draw = useMemo(() => {
    if (concentration == null) return null;
    return doseToDraw(parseFloat(dose), doseUnit as DoseUnit, concentration);
  }, [concentration, dose, doseUnit]);

  return (
    <View style={styles.section}>
      <ThemedText type="display">{t('recon.title')}</ThemedText>

      <LabeledInput label={t('recon.vialMg')} keyboardType="decimal-pad" value={vialMg} onChangeText={setVialMg} />
      <LabeledInput label={t('recon.waterMl')} keyboardType="decimal-pad" value={waterMl} onChangeText={setWaterMl} />

      {concentration != null && (
        <ThemedText type="smallBold">
          {t('recon.concentration', { value: roundTo(concentration, 2) })}
        </ThemedText>
      )}

      <LabeledInput label={t('recon.dose')} keyboardType="decimal-pad" value={dose} onChangeText={setDose} />
      <Field label={t('protocol.unit')}>
        <SingleSelectChips
          options={(['mcg', 'mg'] as const).map((u) => ({
            value: u,
            label: t(`doseUnits.${u}` as const),
          }))}
          value={doseUnit}
          onChange={setDoseUnit}
        />
      </Field>

      {draw ? (
        <ThemedText type="smallBold">
          {t('recon.draw', {
            volume: roundTo(draw.volumeMl, 3),
            units: roundTo(draw.syringeUnits, 1),
          })}
        </ThemedText>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          {t('recon.enterValues')}
        </ThemedText>
      )}
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
  subForm: { gap: Spacing.three, marginTop: Spacing.two },
  list: { gap: Spacing.three },
  field: { gap: Spacing.two },
  itemCard: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  rowText: { flex: 1, gap: Spacing.half },
  logRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  siteInput: { flex: 1 },
  logButton: { width: 120 },
  banner: {
    gap: Spacing.half,
    padding: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#caa83a',
  },
});
