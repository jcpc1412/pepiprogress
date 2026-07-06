import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LineChart, type ChartPoint } from '@/components/line-chart';
import { OverlayHeader } from '@/components/overlay-header';
import { Card, Divider, EngravedLabel, Placeholder, SignalText, StatusPill } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { HeroFigure } from '@/components/hero-figure';
import { formatHeroValue, resolveMsg, useVerdict, type TFn } from '@/features/home/use-verdict';
import { useStore } from '@/lib/store';
import { metricHeroUnit, type SignalContribution } from '@/lib/verdict-engine';

/**
 * The decompose / reasoning screen (redesign §4.2) — the signature interaction.
 * Cracks the verdict open into its weighted signal stack: what each signal is,
 * which way it moved, whether it supports or drags the verdict, and (crucially)
 * which drags are explained away rather than counted as failure.
 */
export function VerdictReasoning({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { profile } = useStore();
  const verdict = useVerdict();

  const stateTone =
    verdict.state === 'on_track'
      ? 'good'
      : verdict.state === 'off_track'
        ? 'bad'
        : verdict.state === 'watch'
          ? 'watch'
          : 'neutral';

  const heroFmt =
    verdict.hero?.kind === 'metric'
      ? formatHeroValue(verdict.hero.value, verdict.hero.unit, profile.units, t)
      : null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <OverlayHeader title={t('verdict.reasoningTitle')} onClose={onClose} />
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {/* Verdict recap */}
          <Card style={styles.recap}>
            <View style={styles.recapHead}>
              <StatusPill
                label={t(`verdict.state.${verdict.state}` as 'verdict.state.on_track')}
                tone={stateTone}
              />
              <ThemedText type="monoSm" themeColor="textMuted">
                {t(`verdict.confidence.${verdict.confidence}` as 'verdict.confidence.low')}
              </ThemedText>
            </View>
            {verdict.hero?.kind === 'metric' && heroFmt ? (
              <HeroFigure
                value={heroFmt.value}
                unit={heroFmt.unit}
                trend={verdict.hero.trend}
                favour={verdict.hero.favour}
              />
            ) : null}
            <ThemedText type="body" themeColor="textSecondary">
              {resolveMsg(t, verdict.explanation)}
            </ThemedText>
            {verdict.reconciliation ? (
              <ThemedText type="small" themeColor="textMuted" style={styles.reconcile}>
                {resolveMsg(t, verdict.reconciliation)}
              </ThemedText>
            ) : null}
          </Card>

          {/* Signal stack */}
          <EngravedLabel>{t('verdict.reasoningHint')}</EngravedLabel>
          {verdict.signals.length === 0 ? (
            <Placeholder label={t('verdict.signalsEmpty')} height={72} />
          ) : (
            <Card style={styles.stack}>
              {verdict.signals.map((s, i) => (
                <View key={s.metricId}>
                  {i > 0 ? <Divider style={styles.rowDivider} /> : null}
                  <SignalRow signal={s} units={profile.units} t={t} />
                </View>
              ))}
            </Card>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function SignalRow({
  signal,
  units,
  t,
}: {
  signal: SignalContribution;
  units: 'metric' | 'imperial';
  t: TFn;
}) {
  const fmt = formatHeroValue(signal.value, metricHeroUnit(signal.metricId), units, t);
  const roleTone =
    signal.role === 'supports' ? 'good' : signal.role === 'drags' ? (signal.explained ? 'watch' : 'bad') : 'neutral';
  const deltaTone = signal.favour === 'good' ? 'good' : signal.favour === 'bad' ? 'bad' : 'watch';
  const points: ChartPoint[] = signal.series.map((p) => ({ label: p.dateKey.slice(5), value: p.value }));

  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <View style={styles.rowLabel}>
          <ThemedText type="smallBold">{t(signal.labelKey as 'fields.weight')}</ThemedText>
          <StatusPill label={t(`verdict.role.${signal.role}` as 'verdict.role.supports')} tone={roleTone} />
        </View>
        <View style={styles.rowValue}>
          <ThemedText type="mono">{`${fmt.value}${fmt.unit === '%' ? '%' : ` ${fmt.unit}`}`}</ThemedText>
          <SignalText tone={deltaTone} size="mono">
            {signal.trend === 'up' ? '▲' : signal.trend === 'down' ? '▼' : '·'}
          </SignalText>
        </View>
      </View>
      <LineChart data={points} height={52} emptyLabel="" />
      {signal.explained ? (
        <ThemedText type="monoSm" themeColor="textMuted">
          {`${t('verdict.explained')}: ${resolveMsg(t, signal.explained)}`}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  safe: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  scroll: { gap: Spacing.three, paddingTop: Spacing.two, paddingBottom: Spacing.six },
  recap: { gap: Spacing.two },
  recapHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reconcile: { fontStyle: 'italic' },
  stack: { gap: Spacing.two },
  rowDivider: { marginVertical: Spacing.one },
  row: { gap: Spacing.two, paddingVertical: Spacing.one },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  rowLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexShrink: 1 },
  rowValue: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
