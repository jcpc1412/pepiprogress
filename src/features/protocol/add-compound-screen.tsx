import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LabeledInput, OptionChip, PrimaryButton, SingleSelectChips } from '@/components/form';
import { OverlayHeader } from '@/components/overlay-header';
import { Card, EngravedLabel, Sunken } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { compoundBySlug } from '@/data/compound-catalog';
import { CompoundPicker } from '@/features/compounds/compound-picker';
import { roundTo, suggestReconstitution } from '@/lib/reconstitution';
import { useStore, type DoseRoute, type Frequency } from '@/lib/store';
import { Constants } from '@/types/database';

const DOSE_UNITS = ['mg', 'mcg', 'iu'] as const;
const ROUTES = Constants.public.Enums.dose_route;
const FREQUENCIES: Frequency[] = ['daily', 'eod', 'twice_weekly', 'weekly', 'as_needed', 'custom'];

function toMg(dose: number, unit: string): number | null {
  if (unit === 'mcg') return dose / 1000;
  if (unit === 'mg') return dose;
  return null; // iu not mass-convertible
}

/** Dedicated add-compound flow with live reconstitution + optional vial logging (P-03). */
export function AddCompoundScreen({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { addProtocolItem, addInventoryItem, inventory } = useStore();

  const [slug, setSlug] = useState<string>();
  const [dose, setDose] = useState('');
  const [doseUnit, setDoseUnit] = useState<string>('mg');
  const [route, setRoute] = useState<DoseRoute>();
  const [frequency, setFrequency] = useState<Frequency>();
  const [startedAt, setStartedAt] = useState('');
  const [vialMgInput, setVialMgInput] = useState('');
  const [logVial, setLogVial] = useState(true);

  const compound = slug ? compoundBySlug(slug) : undefined;
  const canReconstitute = !!compound?.injectable && !!compound?.reconstituted;

  // Vial size: explicit input → logged inventory vial → catalog default.
  const inventoryVialMg = useMemo(() => {
    const v = inventory.find((i) => i.kind === 'vial' && i.compoundSlug === slug && i.amountInitial);
    return v?.amountInitial;
  }, [inventory, slug]);
  const defaultVialMg = compound?.commonVialSizesMg?.[0];
  const vialMg =
    parseFloat(vialMgInput.replace(',', '.')) || inventoryVialMg || defaultVialMg || 0;

  const doseNum = parseFloat(dose.replace(',', '.'));
  const doseMg = Number.isFinite(doseNum) ? toMg(doseNum, doseUnit) : null;

  const suggestion = useMemo(() => {
    if (!canReconstitute || doseMg == null || vialMg <= 0) return null;
    return suggestReconstitution(vialMg, doseMg);
  }, [canReconstitute, doseMg, vialMg]);

  const submit = () => {
    if (!slug) return;
    const concentration = suggestion?.concentrationMgPerMl;
    addProtocolItem({
      compoundSlug: slug,
      dose: Number.isFinite(doseNum) ? doseNum : undefined,
      doseUnit,
      route,
      frequency,
      startedAt: startedAt.trim() || undefined,
      concentration,
    });
    if (canReconstitute && logVial && vialMg > 0) {
      addInventoryItem({
        kind: 'vial',
        compoundSlug: slug,
        amountRemaining: vialMg,
        amountInitial: vialMg,
        unit: 'mg',
        concentration,
      });
    }
    onClose();
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <OverlayHeader title={t('addCompound.title')} onClose={onClose} />
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Step 1: search + select a compound */}
          <Field label={t('protocol.compound')}>
            <CompoundPicker value={slug} onChange={setSlug} />
          </Field>

          {/* Step 2: configure section reveals after a compound is selected */}
          {slug && (
            <Card style={styles.configureCard}>
              <EngravedLabel>{`${compound?.canonicalName ?? slug} · ${t('addCompound.configure')}`}</EngravedLabel>

              {/* Dose as a big debossed numeral well (mockup) */}
              <Sunken style={styles.doseWell}>
                <TextInput
                  style={[styles.doseNumeral, { color: theme.numeral }]}
                  keyboardType="decimal-pad"
                  value={dose}
                  onChangeText={setDose}
                  placeholder="0"
                  placeholderTextColor={theme.textMuted}
                />
                <ThemedText type="monoSm" themeColor="textMuted">
                  {[t(`doseUnits.${doseUnit}` as 'doseUnits.mg'), frequency ? t(`frequencies.${frequency}` as const) : null]
                    .filter(Boolean)
                    .join(' · ')
                    .toUpperCase()}
                </ThemedText>
              </Sunken>

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

              {canReconstitute && (
                <Card style={styles.reconCard}>
                  <EngravedLabel>{t('addCompound.reconTitle')}</EngravedLabel>
                  <LabeledInput
                    label={t('addCompound.vialMg')}
                    keyboardType="decimal-pad"
                    placeholder={defaultVialMg ? String(defaultVialMg) : t('addCompound.vialMgPlaceholder')}
                    value={vialMgInput}
                    onChangeText={setVialMgInput}
                  />
                  {suggestion ? (
                    <>
                      <ThemedText type="smallBold">
                        {t('addCompound.reconSuggestion', {
                          water: suggestion.waterMl,
                          conc: suggestion.concentrationMgPerMl,
                        })}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {t('addCompound.reconDraw', {
                          units: suggestion.perDoseUnits,
                          volume: roundTo(suggestion.perDoseVolumeMl, 2),
                        })}
                      </ThemedText>
                      <View style={styles.vialToggle}>
                        <OptionChip
                          label={t('addCompound.logVial')}
                          selected={logVial}
                          onPress={() => setLogVial((v) => !v)}
                        />
                      </View>
                    </>
                  ) : (
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('addCompound.reconHint')}
                    </ThemedText>
                  )}
                </Card>
              )}
            </Card>
          )}

          <PrimaryButton label={t('protocol.add')} onPress={submit} disabled={!slug} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
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
  scroll: { gap: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.six },
  field: { gap: Spacing.two },
  configureCard: { gap: Spacing.three },
  doseWell: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.three },
  doseNumeral: { flex: 1, fontFamily: Fonts.mono, fontSize: 40, fontVariant: ['tabular-nums'], padding: 0 },
  reconCard: { gap: Spacing.two },
  vialToggle: { flexDirection: 'row', marginTop: Spacing.one },
});
