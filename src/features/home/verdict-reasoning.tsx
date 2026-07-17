import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ConfidenceBadge } from '@/components/confidence-badge';
import { Card, Divider, EngravedLabel, Placeholder, StatusPill } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { HeroFigure } from '@/components/hero-figure';
import { TodayLog } from '@/features/home/today-log';
import { formatHeroValue, resolveMsg, useVerdict, type TFn } from '@/features/home/use-verdict';
import { useTheme } from '@/hooks/use-theme';
import { sparkline } from '@/lib/sparkline';
import { useStore } from '@/lib/store';
import { metricHeroUnit, type SignalContribution, type SignalTone } from '@/lib/verdict-engine';

/**
 * The decompose / reasoning sections (redesign §4.2, now the top of the Analysis
 * tab per R2-C C4). Cracks the verdict open into its weighted signal stack, and
 * (C3) folds today's log + note into the recap prose so the "what" reads as part
 * of the "why". Exported as two pieces so the Analysis tab can interleave them
 * with the trend charts.
 */

/** Contextual row tone → theme colour (R2-C C2). Neutral falls to muted ink. */
const TONE_COLOR: Record<SignalTone, ThemeColor> = {
  good: 'signalGood',
  watch: 'signalWatch',
  bad: 'signalBad',
  neutral: 'textMuted',
};

/** Verdict recap: state pill + hero delta + explanation + reconciliation, with
 *  today's log + editable note woven in beneath the prose (C3). */
export function ReasoningRecap() {
  const { t } = useTranslation();
  const router = useRouter();
  const { profile } = useStore();
  const verdict = useVerdict();
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
  const heroMetricId = verdict.hero?.kind === 'metric' ? verdict.hero.metricId : null;

  return (
    <Card style={styles.recap}>
      <View style={styles.recapHead}>
        <StatusPill
          label={t(`verdict.state.${verdict.state}` as 'verdict.state.on_track')}
          tone={stateTone}
        />
        <ConfidenceBadge
          level={verdict.confidence}
          rationale={resolveMsg(tx, verdict.confidenceRationale)}
        />
      </View>
      {verdict.hero?.kind === 'metric' && heroFmt ? (
        // The hero drills into that metric's signal ledger, same as the stack
        // rows below (recap says "weight is the story" -> tap -> the weight ledger).
        <Pressable
          accessibilityRole="button"
          accessibilityHint={t('signal.explainLabel')}
          onPress={() => router.push(`/signal/${heroMetricId}` as Href)}
          style={({ pressed }) => pressed && styles.rowPressed}>
          <HeroFigure
            value={heroFmt.value}
            unit={heroFmt.unit}
            trend={verdict.hero.trend}
            favour={verdict.hero.favour}
          />
        </Pressable>
      ) : null}
      <ThemedText type="body" themeColor="textSecondary">
        {resolveMsg(tx, verdict.explanation)}
      </ThemedText>
      {verdict.reconciliation ? (
        <ThemedText type="small" themeColor="textMuted" style={styles.reconcile}>
          {resolveMsg(tx, verdict.reconciliation)}
        </ThemedText>
      ) : null}
      {/* Today's log + note, woven into the recap (C3) rather than a separate card. */}
      <TodayLog bare />
    </Card>
  );
}

/** The weighted signal stack (compact mockup-frame-2 rows). */
export function SignalStack() {
  const { t } = useTranslation();
  const { profile } = useStore();
  const verdict = useVerdict();
  const tx = t as unknown as TFn;
  const maxWeight = Math.max(...verdict.signals.map((s) => s.weight), 1e-6);

  return (
    <View style={styles.stackWrap}>
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
    </View>
  );
}

/**
 * Compact signal row (redesign R2-C, mockup frame 2): a favour/tone dot, the
 * metric name, its role + current value, then a tone-coloured text sparkline and
 * contribution-weight dots.
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
  const router = useRouter();
  const fmt = formatHeroValue(signal.value, metricHeroUnit(signal.metricId), units, t);
  const valueStr = `${fmt.value}${fmt.unit === '%' ? '%' : ` ${fmt.unit}`}`;
  const toneC = theme[TONE_COLOR[signal.tone]];
  const spark = sparkline(signal.series.map((p) => p.value));
  const dots = Math.max(1, Math.min(4, Math.round((signal.weight / maxWeight) * 4)));
  const name = t(signal.labelKey as 'fields.weight');

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityHint={t('signal.explainLabel')}
      onPress={() => router.push(`/signal/${signal.metricId}` as Href)}
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  recap: { gap: Spacing.two },
  recapHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reconcile: { fontStyle: 'italic' },
  stackWrap: { gap: Spacing.two },
  stack: { gap: Spacing.two },
  rowDivider: { marginVertical: Spacing.one },
  row: { gap: Spacing.one, paddingVertical: Spacing.one },
  rowPressed: { opacity: 0.6 },
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
