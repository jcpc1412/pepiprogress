import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { LabeledInput, PrimaryButton, SingleSelectChips } from '@/components/form';
import { Card, Divider, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useStore } from '@/lib/store';
import {
  TYPICAL_GROUPS,
  TYPICAL_GROUP_ORDER,
  validateTypicalValue,
  type TypicalBaseline,
  type TypicalGroup,
} from '@/lib/typical-day';

/**
 * "Typical day" settings card (spec 15 §UX.4). Per group: baseline values, edit
 * inputs, an on/off toggle, a start-setup entry for users who never got the
 * prompt, and a "clear estimated history" action. Recording only, never
 * prescriptive (legal rung 1).
 */
export function TypicalDaySettings() {
  const { t } = useTranslation();
  const { profile } = useStore();
  return (
    <View style={styles.wrap}>
      <EngravedLabel>{t('typical.settingsTitle')}</EngravedLabel>
      <ThemedText type="small" themeColor="textSecondary">
        {t('typical.settingsHint')}
      </ThemedText>
      {TYPICAL_GROUP_ORDER.map((group) => (
        <GroupEditor
          key={group}
          group={group}
          baseline={(profile.typicalBaselines ?? []).find((b) => b.group === group)}
        />
      ))}
    </View>
  );
}

function GroupEditor({ group, baseline }: { group: TypicalGroup; baseline?: TypicalBaseline }) {
  const { t } = useTranslation();
  const { setTypicalBaseline, updateTypicalBaseline, clearTypicalHistory } = useStore();
  const def = TYPICAL_GROUPS[group];

  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const m of def.metrics) {
      const v = baseline?.values[m.metric];
      seed[m.metric] = typeof v === 'number' ? String(v) : '';
    }
    return seed;
  });
  const [error, setError] = useState<string | undefined>();

  const save = () => {
    const values: Record<string, number> = {};
    for (const m of def.metrics) {
      const parsed = parseFloat((draft[m.metric] ?? '').replace(',', '.'));
      const ok = validateTypicalValue(m, parsed);
      if (ok == null) {
        setError(t('typical.invalid', { min: m.min, max: m.max }));
        return;
      }
      values[m.metric] = ok;
    }
    setError(undefined);
    setTypicalBaseline({ group, values, setAt: new Date().toISOString(), enabled: true });
  };

  return (
    <Card style={styles.group}>
      <EngravedLabel>{t(`typical.group.${group}` as const)}</EngravedLabel>
      {def.metrics.map((m) => (
        <LabeledInput
          key={m.metric}
          label={`${t(m.labelKey as 'fields.calories')} (${t(m.unitKey as 'units.kcal')})`}
          keyboardType="decimal-pad"
          value={draft[m.metric]}
          onChangeText={(v) => setDraft((d) => ({ ...d, [m.metric]: v }))}
          error={m === def.metrics[0] ? error : undefined}
        />
      ))}
      <PrimaryButton label={baseline ? t('typical.saveEdit') : t('typical.startSetup')} onPress={save} />

      {baseline ? (
        <>
          <Divider />
          <View style={styles.toggleRow}>
            <ThemedText type="mono">{t('typical.enabledLabel')}</ThemedText>
            <SingleSelectChips
              options={[
                { value: 'on', label: t('typical.on') },
                { value: 'off', label: t('typical.off') },
              ]}
              value={baseline.enabled ? 'on' : 'off'}
              onChange={(v) => updateTypicalBaseline(group, { enabled: v === 'on' })}
            />
          </View>
          <Pressable accessibilityRole="button" onPress={() => clearTypicalHistory(group)}>
            <ThemedText type="monoSm" themeColor="signalBad" style={styles.clear}>
              {t('typical.clearHistory')}
            </ThemedText>
          </Pressable>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  group: { gap: Spacing.two },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: Spacing.two },
  clear: { textDecorationLine: 'underline' },
});
