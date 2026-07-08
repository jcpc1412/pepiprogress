import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { OptionChip } from '@/components/form';
import { EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  applyFieldCustomization,
  CUSTOMIZABLE_FIELDS,
  surfaceFields,
  type CheckinField,
} from '@/lib/field-surfacing';
import { useStore } from '@/lib/store';

/**
 * "What I log" (redesign R2-E, E3). The manual field customization that used to
 * sit at the bottom of the detailed log now lives in Settings. Defaults still
 * come from the locked rule (goals union effect-tags union monitoring-tags);
 * this only layers the user's add/remove overrides on top.
 */
export function WhatILogSettings() {
  const { t } = useTranslation();
  const { profile, setProfile } = useStore();

  const { fields: baseFields } = useMemo(
    () => surfaceFields(profile.goals, profile.compoundSlugs),
    [profile.goals, profile.compoundSlugs],
  );
  const shown = useMemo(
    () =>
      new Set(applyFieldCustomization(baseFields, profile.addedFields, profile.removedFields)),
    [baseFields, profile.addedFields, profile.removedFields],
  );

  const toggleField = (field: CheckinField, makeVisible: boolean) => {
    const added = makeVisible
      ? Array.from(new Set([...profile.addedFields, field]))
      : profile.addedFields.filter((f) => f !== field);
    const removed = makeVisible
      ? profile.removedFields.filter((f) => f !== field)
      : Array.from(new Set([...profile.removedFields, field]));
    setProfile({ addedFields: added, removedFields: removed });
  };

  return (
    <View style={styles.wrap}>
      <EngravedLabel>{t('whatILog.title')}</EngravedLabel>
      <ThemedText type="small" themeColor="textSecondary">
        {t('whatILog.hint')}
      </ThemedText>
      <View style={styles.chips}>
        {CUSTOMIZABLE_FIELDS.map((f) => (
          <OptionChip
            key={f}
            label={t(`fields.${f}` as const)}
            selected={shown.has(f)}
            onPress={() => toggleField(f, !shown.has(f))}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
