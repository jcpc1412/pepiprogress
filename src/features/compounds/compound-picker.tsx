import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { LabeledInput, OptionChip, PrimaryButton, TextButton } from '@/components/form';
import { EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { allCompounds, compoundBySlug, type CatalogCompound } from '@/data/compound-catalog';
import { useStore } from '@/lib/store';

const POPULAR_SLUGS = [
  'bpc-157', 'tb-500', 'semaglutide', 'testosterone', 'ipamorelin', 'mk-677',
] as const;

function kebab(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Compound picker: shows a "popular" set by default; typing narrows to up to
 * 8 matches. Avoids the wall-of-chips UX that grows unusable as the catalog
 * expands. Custom-compound escape hatch preserved (O-04).
 */
export function CompoundPicker({
  value,
  onChange,
}: {
  value?: string;
  onChange: (slug: string) => void;
}) {
  const { t } = useTranslation();
  const { addCustomCompound } = useStore();

  const [query, setQuery] = useState('');
  const [customOpen, setCustomOpen] = useState(false);

  const popular = useMemo(
    () => POPULAR_SLUGS.map((s) => compoundBySlug(s)).filter(Boolean) as CatalogCompound[],
    [],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return allCompounds()
      .filter(
        (c) =>
          c.canonicalName.toLowerCase().includes(q) ||
          c.aliases.some((a) => a.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [query]);

  const isSearching = results !== null;
  const selected = value ? compoundBySlug(value) : undefined;
  const selectedInView = !selected
    ? true
    : isSearching
      ? results!.some((r) => r.slug === value)
      : popular.some((p) => p.slug === value);

  const chips = (list: CatalogCompound[]) =>
    list.map((c) => (
      <OptionChip
        key={c.slug}
        label={c.canonicalName}
        selected={value === c.slug}
        onPress={() => onChange(c.slug)}
      />
    ));

  return (
    <View style={styles.container}>
      <LabeledInput
        label={t('compounds.search')}
        placeholder={t('compounds.searchPlaceholder')}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
      />

      {selected && !selectedInView && (
        <View style={styles.chips}>{chips([selected])}</View>
      )}

      {!isSearching && (
        <View style={styles.section}>
          <EngravedLabel>{t('compounds.popular')}</EngravedLabel>
          <View style={styles.chips}>{chips(popular)}</View>
        </View>
      )}

      {isSearching && results!.length > 0 && (
        <View style={styles.chips}>{chips(results!)}</View>
      )}

      {isSearching && results!.length === 0 && !customOpen && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('compounds.noResults')}
        </ThemedText>
      )}

      {customOpen ? (
        <CustomCompoundForm
          initialName={query}
          onCancel={() => setCustomOpen(false)}
          onCreate={(c) => {
            addCustomCompound(c);
            onChange(c.slug);
            setCustomOpen(false);
            setQuery('');
          }}
        />
      ) : (
        <TextButton label={t('compounds.addCustom')} onPress={() => setCustomOpen(true)} />
      )}
    </View>
  );
}

function CustomCompoundForm({
  initialName,
  onCreate,
  onCancel,
}: {
  initialName: string;
  onCreate: (c: CatalogCompound) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [injectable, setInjectable] = useState(false);
  const [reconstituted, setReconstituted] = useState(false);
  const [vialSizes, setVialSizes] = useState('');

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const sizes = vialSizes
      .split(',')
      .map((s) => parseFloat(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    onCreate({
      slug: `custom-${kebab(trimmed)}-${Math.random().toString(36).slice(2, 6)}`,
      canonicalName: trimmed,
      aliases: [],
      type: reconstituted ? 'peptide' : 'other',
      controlled: false,
      effectTags: [],
      monitoringTags: [],
      commonUses: [],
      injectable,
      reconstituted,
      commonVialSizesMg: sizes.length ? sizes : undefined,
      custom: true,
    });
  };

  return (
    <View style={styles.customForm}>
      <ThemedText type="smallBold">{t('compounds.customTitle')}</ThemedText>
      <LabeledInput label={t('compounds.customName')} value={name} onChangeText={setName} />
      <View style={styles.toggleRow}>
        <OptionChip
          label={t('compounds.injectable')}
          selected={injectable}
          onPress={() => setInjectable((v) => !v)}
        />
        <OptionChip
          label={t('compounds.reconstituted')}
          selected={reconstituted}
          onPress={() => setReconstituted((v) => !v)}
        />
      </View>
      {reconstituted && (
        <LabeledInput
          label={t('compounds.vialSizes')}
          placeholder={t('compounds.vialSizesPlaceholder')}
          keyboardType="decimal-pad"
          value={vialSizes}
          onChangeText={setVialSizes}
        />
      )}
      <View style={styles.formActions}>
        <Pressable accessibilityRole="button" onPress={onCancel}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('common.cancel')}
          </ThemedText>
        </Pressable>
        <View style={styles.createButton}>
          <PrimaryButton label={t('compounds.createCustom')} onPress={create} disabled={!name.trim()} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  section: { gap: Spacing.one },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  customForm: { gap: Spacing.two, marginTop: Spacing.one },
  toggleRow: { flexDirection: 'row', gap: Spacing.two },
  formActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  createButton: { flex: 1, maxWidth: 200 },
});
