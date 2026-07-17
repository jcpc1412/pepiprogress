import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { Card, Divider, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { computeEnergyBalance } from '@/lib/energy-balance';
import { useStore } from '@/lib/store';

/**
 * Energy-balance readout (TRAJ-2). A personal maintenance (TDEE) estimate solved
 * from logged intake + the weight trend, plus — when Health activity data flows —
 * a device-bias calibration and a disagreement-as-insight line. Self-gates to
 * null until there is enough logged intake to be honest (graceful degradation to
 * TRAJ-1 alone).
 */
export function EnergyBalanceCard() {
  const { t } = useTranslation();
  const { entries, metricReadings, profile } = useStore();

  const eb = useMemo(
    () => computeEnergyBalance({ entries, metricReadings, profile }),
    [entries, metricReadings, profile],
  );
  if (!eb) return null;

  // Device calibration line (only when activity data supplied a reference burn).
  let biasLine: string | null = null;
  if (typeof eb.deviceBias === 'number' && eb.deviceBias !== 1) {
    const pct = Math.round(Math.abs(1 - eb.deviceBias) * 100);
    if (pct >= 3) {
      biasLine = t(eb.deviceBias < 1 ? 'energyBalance.biasOver' : 'energyBalance.biasUnder', { pct });
    }
  }

  // Disagreement / proactive intake-shift insight (device disagreement wins).
  let insight: string | null = null;
  if (eb.disagreement === 'slower') insight = t('energyBalance.disagreeSlower');
  else if (eb.disagreement === 'faster') insight = t('energyBalance.disagreeFaster');
  else if (eb.intakeShift === 'lower') insight = t('energyBalance.intakeLower');
  else if (eb.intakeShift === 'higher') insight = t('energyBalance.intakeHigher');

  return (
    <Card style={styles.card}>
      <EngravedLabel>{t('energyBalance.title')}</EngravedLabel>
      <ThemedText type="body">{t('energyBalance.maintenance', { kcal: eb.maintenanceKcal })}</ThemedText>
      <ThemedText type="monoSm" themeColor="textMuted">
        {t('energyBalance.basis', { days: eb.days })}
      </ThemedText>
      {biasLine ? (
        <ThemedText type="small" themeColor="textSecondary">
          {biasLine}
        </ThemedText>
      ) : null}
      {insight ? (
        <>
          <Divider />
          <ThemedText type="small" themeColor="textSecondary">
            {insight}
          </ThemedText>
        </>
      ) : null}
      <ThemedText type="monoSm" themeColor="textMuted">
        {t('energyBalance.disclaimer')}
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two },
});
