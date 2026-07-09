import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { LabeledInput, OptionChip, SingleSelectChips } from '@/components/form';
import { Card, Divider, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { CycleSettings } from '@/features/settings/cycle-settings';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import type { Goal } from '@/lib/field-surfacing';
import { useStore, type Sex } from '@/lib/store';
import { Constants } from '@/types/database';

const SEXES: Sex[] = ['male', 'female', 'ftm', 'mtf'];
const GOALS = Constants.public.Enums.goal as unknown as Goal[];

const toggleGoal = (list: Goal[], g: Goal): Goal[] =>
  list.includes(g) ? list.filter((x) => x !== g) : [...list, g];
const BODY_TYPES = ['slim', 'average', 'athletic', 'heavyset'] as const;
type BodyType = (typeof BODY_TYPES)[number];

/** Native (non-localised) language names so each option reads in its own tongue. */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Español',
  pt: 'Português',
  fr: 'Français',
  de: 'Deutsch',
  ru: 'Русский',
};

function num(s: string): number | undefined {
  const v = parseFloat(s.replace(',', '.'));
  return Number.isFinite(v) ? v : undefined;
}

/**
 * "Me" profile page (R3-B). Identity + body baselines that used to be scattered
 * across onboarding and the Protocol tab: name, language, sex, height, weight,
 * body-fat, body composition, and cycle tracking.
 */
export function MeSettings() {
  const { t, i18n } = useTranslation();
  const { profile, setProfile, entries } = useStore();

  // Latest recorded check-in weight — used to prefill the baseline field.
  const latestWeight = useMemo(() => {
    const withWeight = Object.values(entries)
      .filter((e) => typeof e.weight === 'number')
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    return withWeight[0]?.weight;
  }, [entries]);

  const [name, setName] = useState(profile.displayName ?? '');
  const [height, setHeight] = useState(profile.height != null ? String(profile.height) : '');
  const [weight, setWeight] = useState(
    profile.weightBaseline != null
      ? String(profile.weightBaseline)
      : latestWeight != null
        ? String(latestWeight)
        : '',
  );
  const [bodyFat, setBodyFat] = useState(profile.bodyFatPct != null ? String(profile.bodyFatPct) : '');
  const [target, setTarget] = useState(profile.targetWeight != null ? String(profile.targetWeight) : '');

  const imperial = profile.units === 'imperial';
  const heightUnit = imperial ? t('measurements.unitIn') : t('measurements.unitCm');
  const weightUnit = imperial ? t('units.lb') : t('units.kg');

  const setLanguage = (lng: string) => {
    setProfile({ language: lng });
    i18n.changeLanguage(lng);
  };

  return (
    <View style={styles.wrap}>
      {/* Identity */}
      <Card style={styles.section}>
        <EngravedLabel>{t('me.identitySection')}</EngravedLabel>
        <LabeledInput
          label={t('me.name')}
          placeholder={t('me.namePlaceholder')}
          value={name}
          onChangeText={setName}
          onBlur={() => setProfile({ displayName: name.trim() || undefined })}
        />
        <View style={styles.field}>
          <ThemedText type="label">{t('me.language')}</ThemedText>
          <SingleSelectChips
            options={SUPPORTED_LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] ?? l }))}
            value={(profile.language ?? i18n.language) as (typeof SUPPORTED_LANGUAGES)[number]}
            onChange={setLanguage}
          />
        </View>
        <View style={styles.field}>
          <ThemedText type="label">{t('me.sex')}</ThemedText>
          <SingleSelectChips
            options={SEXES.map((s) => ({ value: s, label: t(`sex.${s}`) }))}
            value={profile.sex}
            onChange={(s) => setProfile({ sex: s })}
          />
        </View>
      </Card>

      {/* Goals — editable after onboarding (drives what surfaces in the log). */}
      <Card style={styles.section}>
        <EngravedLabel>{t('me.goalsSection')}</EngravedLabel>
        <ThemedText type="small" themeColor="textSecondary">
          {t('me.goalsHint')}
        </ThemedText>
        <View style={styles.chips}>
          {GOALS.map((g) => (
            <OptionChip
              key={g}
              label={t(`goals.${g}` as 'goals.weight_loss')}
              selected={profile.goals.includes(g)}
              onPress={() => setProfile({ goals: toggleGoal(profile.goals, g) })}
            />
          ))}
        </View>
      </Card>

      {/* Body baselines */}
      <Card style={styles.section}>
        <EngravedLabel>{t('me.bodySection')}</EngravedLabel>
        <View style={styles.row}>
          <View style={styles.rowField}>
            <LabeledInput
              label={`${t('me.height')} (${heightUnit})`}
              placeholder="—"
              keyboardType="decimal-pad"
              value={height}
              onChangeText={setHeight}
              onBlur={() => setProfile({ height: num(height) })}
            />
          </View>
          <View style={styles.rowField}>
            <LabeledInput
              label={`${t('me.weight')} (${weightUnit})`}
              placeholder="—"
              keyboardType="decimal-pad"
              value={weight}
              onChangeText={setWeight}
              onBlur={() => setProfile({ weightBaseline: num(weight) })}
            />
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.rowField}>
            <LabeledInput
              label={`${t('me.targetWeight')} (${weightUnit})`}
              placeholder="—"
              keyboardType="decimal-pad"
              value={target}
              onChangeText={setTarget}
              onBlur={() => setProfile({ targetWeight: num(target) })}
            />
          </View>
          <View style={styles.rowField} />
        </View>
        <LabeledInput
          label={`${t('me.bodyFat')} (%)`}
          placeholder="—"
          keyboardType="decimal-pad"
          value={bodyFat}
          onChangeText={setBodyFat}
          onBlur={() => setProfile({ bodyFatPct: num(bodyFat) })}
        />
        <Divider />
        <EngravedLabel>{t('bodyType.section')}</EngravedLabel>
        <ThemedText type="small" themeColor="textSecondary">
          {t('bodyType.description')}
        </ThemedText>
        <SingleSelectChips
          options={BODY_TYPES.map((v) => ({ value: v, label: t(`bodyType.${v}`) }))}
          value={(profile.bodyType as BodyType | undefined) ?? undefined}
          onChange={(v) => setProfile({ bodyType: v })}
        />
      </Card>

      {/* Cycle tracking */}
      <CycleSettings />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.three },
  section: { gap: Spacing.three, padding: Spacing.three },
  field: { gap: Spacing.one },
  row: { flexDirection: 'row', gap: Spacing.three },
  rowField: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
