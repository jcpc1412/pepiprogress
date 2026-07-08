import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OverlayHeader } from '@/components/overlay-header';
import { Card, Divider, EngravedLabel, Placeholder, StatusPill } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, type ThemeColor } from '@/constants/theme';
import { HeroFigure } from '@/components/hero-figure';
import { TodayLog } from '@/features/home/today-log';
import { formatHeroValue, resolveMsg, useVerdict, type TFn } from '@/features/home/use-verdict';
import { useTheme } from '@/hooks/use-theme';
import { sparkline } from '@/lib/sparkline';
import { useStore } from '@/lib/store';
import { metricHeroUnit, type SignalContribution, type SignalTone } from '@/lib/verdict-engine';

/** Contextual row tone → theme colour (R2-C C2). Neutral falls to muted ink. */
const TONE_COLOR: Record<SignalTone, ThemeColor> = {
  good: 'signalGood',
  watch: 'signalWatch',
  bad: 'signalBad',
  neutral: 'textMuted',
};

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
  // Loose alias so the large typed-key union doesn't trip TS's depth limit.
  const tx = t as unknown as TFn;

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
      ? formatHeroValue(verdict.hero.delta, verdict.hero.unit, profile.units, tx, { signed: true })
      : null;

  // Contribution-weight dots are relative to the strongest signal in the stack.
  const maxWeight = Math.max(...verdict.signals.map((s) => s.weight), 1e-6);

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
              {resolveMsg(tx, verdict.explanation)}
            </ThemedText>
            {verdict.reconciliation ? (
              <ThemedText type="small" themeColor="textMuted" style={styles.reconcile}>
                {resolveMsg(tx, verdict.reconciliation)}
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
                  <SignalRow signal={s} units={profile.units} t={tx} maxWeight={maxWeight} />
                </View>
              ))}
            </Card>
          )}

          {/* Today's log recap + note — the "what I logged" beside the "why".
              The card carries its own engraved header (dashboard.distillation). */}
          <TodayLog />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * Compact signal row (redesign R2-C, mockup frame 2): a favour/tone dot, the
 * metric name, its role + current value, then a tone-coloured text sparkline and
 * contribution-weight dots. Replaces the old full-width chart per signal.
 */
function SignalRow({
  signal,
  units,
  t,
  maxWeight,
}: {
  signal: SignalContribution;
  units: 'metric' | 'imperial';
  t: TFn;
  maxWeight: number;
}) {
  const theme = useTheme();
  const fmt = formatHeroValue(signal.value, metricHeroUnit(signal.metricId), units, t);
  const valueStr = `${fmt.value}${fmt.unit === '%' ? '%' : ` ${fmt.unit}`}`;
  const toneC = theme[TONE_COLOR[signal.tone]];
  const spark = sparkline(signal.series.map((p) => p.value));
  // 1–4 dots from the signal's share of the strongest contribution.
  const dots = Math.max(1, Math.min(4, Math.round((signal.weight / maxWeight) * 4)));
  const name = t(signal.labelKey as 'fields.weight');

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${name}. ${t(`verdict.role.${signal.role}` as 'verdict.role.supports')}. ${valueStr}.`}>
      <View style={styles.rowTop}>
        <View style={[styles.dot, { backgroundColor: toneC }]} />
        <ThemedText type="smallBold" style={styles.name} numberOfLines={1}>
          {name}
        </ThemedText>
        <ThemedText type="monoSm" style={{ color: toneC }}>
          {t(`verdict.role.${signal.role}` as 'verdict.role.supports')}
        </ThemedText>
        <ThemedText type="mono" themeColor="numeral" style={styles.value}>
          {valueStr}
        </ThemedText>
      </View>
      <View style={styles.rowBot}>
        <ThemedText type="mono" style={[styles.spark, { color: toneC }]} numberOfLines={1}>
          {spark}
        </ThemedText>
        <View style={styles.dots}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={[styles.wd, { backgroundColor: i < dots ? theme.textSecondary : theme.surfaceSunken }]}
            />
          ))}
        </View>
      </View>
      {signal.explained ? (
        <ThemedText type="monoSm" themeColor="textMuted" style={styles.explained}>
          {resolveMsg(t, signal.explained)}
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
  row: { gap: Spacing.one, paddingVertical: Spacing.one },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { flex: 1 },
  value: { minWidth: 56, textAlign: 'right' },
  rowBot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  spark: { flex: 1, fontSize: 13, letterSpacing: 1 },
  dots: { flexDirection: 'row', gap: 3 },
  wd: { width: 5, height: 5, borderRadius: 2.5 },
  explained: { fontStyle: 'italic' },
});
