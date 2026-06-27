import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { LabeledInput } from '@/components/form';
import { Card, Divider, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useStore } from '@/lib/store';

/** Menstrual cycle calibration (stored in LocalProfile). Body composition lives
 *  on the Me page now (R3-B); this is cycle-only. */
export function CycleSettings() {
  const { t } = useTranslation();
  const { profile, setProfile } = useStore();

  const enabled = !!(profile?.lastPeriodDate);
  const [lastPeriod, setLastPeriod] = useState(profile?.lastPeriodDate ?? '');
  const [cycleLen, setCycleLen] = useState(String(profile?.cycleLength ?? 28));

  const save = () => {
    const len = parseInt(cycleLen, 10);
    setProfile({
      lastPeriodDate: lastPeriod.trim() || undefined,
      cycleLength: Number.isFinite(len) && len >= 21 && len <= 40 ? len : 28,
    });
  };

  const disable = () => {
    setLastPeriod('');
    setProfile({ lastPeriodDate: undefined, cycleLength: undefined });
  };

  return (
    <Card>
      <EngravedLabel>{t('cycle.section')}</EngravedLabel>
      <Divider />
      <ThemedText type="small" themeColor="textSecondary">
        {t('cycle.description')}
      </ThemedText>

      {enabled ? (
        <View style={styles.fields}>
          <LabeledInput
            label={t('cycle.lastPeriod')}
            placeholder={t('cycle.datePlaceholder')}
            value={lastPeriod}
            onChangeText={setLastPeriod}
            onBlur={save}
          />
          <LabeledInput
            label={t('cycle.cycleLength')}
            placeholder="28"
            keyboardType="number-pad"
            value={cycleLen}
            onChangeText={setCycleLen}
            onBlur={save}
          />
          <Pressable accessibilityRole="button" onPress={disable}>
            <ThemedText type="small" themeColor="textMuted">
              {t('cycle.disable')}
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            const today = new Date().toISOString().slice(0, 10);
            setLastPeriod(today);
            setProfile({ lastPeriodDate: today, cycleLength: 28 });
          }}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {t('cycle.enable')}
          </ThemedText>
        </Pressable>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  fields: { gap: Spacing.two },
});
