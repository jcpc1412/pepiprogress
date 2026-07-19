import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ConfidenceBadge } from '@/components/confidence-badge';
import { Card, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { computeAttributions, type MetricAttribution } from '@/lib/attribution';
import { levelFromScore } from '@/lib/confidence';
import { useStore } from '@/lib/store';
import { useToday } from '@/lib/today';

/** i18n label key per outcome metric (reuses the existing field/measurement keys). */
const METRIC_LABEL = {
  weight: 'fields.weight',
  waist: 'measurements.waist',
  hips: 'measurements.hips',
  energy: 'fields.energy',
  sleep_quality: 'fields.sleep_quality',
  soreness: 'fields.soreness',
} as const satisfies Record<MetricAttribution['metricId'], string>;

const BODY_METRICS = new Set<MetricAttribution['metricId']>(['weight', 'waist', 'hips']);

/**
 * Per-compound attribution readout (spec §3.1/§5.1, W4-14). Shows how each
 * relevant metric moved since this compound started, and ranks competing
 * explanations rather than crediting the protocol by coincidence. Deterministic;
 * hidden entirely when there is not enough data to say anything honest.
 */
export function AttributionCard({ slug }: { slug: string }) {
  const { t, i18n } = useTranslation();
  const { entries, metricReadings, protocolItems, profile } = useStore();
  const today = useToday();
  const unit = profile.units === 'imperial' ? 'lb' : 'kg';
  const lenUnit = profile.units === 'imperial' ? 'in' : 'cm';

  const attribution = useMemo(() => {
    const all = computeAttributions({
      entries,
      metricReadings,
      protocolItems: protocolItems.filter((p) => p.compoundSlug === slug),
      today,
    });
    return all[0] ?? null;
  }, [entries, metricReadings, protocolItems, slug, today]);

  if (!attribution) return null;

  const fmt = (m: MetricAttribution): string => {
    const abs = BODY_METRICS.has(m.metricId) ? Math.abs(m.delta) : Math.abs(m.delta);
    const rounded = Math.round(abs * 10) / 10;
    const sign = m.delta > 0 ? '+' : m.delta < 0 ? '−' : '';
    const num = rounded.toLocaleString(i18n.language, { maximumFractionDigits: 1 });
    const suffix = m.metricId === 'weight' ? ` ${unit}` : BODY_METRICS.has(m.metricId) ? ` ${lenUnit}` : '';
    return `${sign}${num}${suffix}`;
  };

  const leadKey = (m: MetricAttribution) => {
    const lead = m.factors[0]?.factor ?? 'compound';
    return lead === 'nutrition'
      ? ('attribution.leadNutrition' as const)
      : lead === 'training'
        ? ('attribution.leadTraining' as const)
        : ('attribution.leadCompound' as const);
  };

  return (
    <Card style={styles.card}>
      <EngravedLabel>{t('attribution.section', { weeks: attribution.weeksIn })}</EngravedLabel>

      <View style={styles.list}>
        {attribution.metrics.map((m) => (
          <View key={m.metricId} style={styles.row}>
            <View style={styles.line}>
              <ThemedText type="small">
                {t('attribution.metricLine', {
                  metric: t(METRIC_LABEL[m.metricId]),
                  delta: fmt(m),
                })}
              </ThemedText>
              <ConfidenceBadge level={levelFromScore(m.confidence)} />
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {t(leadKey(m))}
            </ThemedText>
          </View>
        ))}
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        {t('attribution.disclaimer')}
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  list: { gap: Spacing.three },
  row: { gap: Spacing.one },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
});
