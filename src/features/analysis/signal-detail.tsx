import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LineChart, type ChartPoint } from '@/components/line-chart';
import { OverlayHeader } from '@/components/overlay-header';
import { Card, Divider, EngravedLabel, Placeholder, StatusPill } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, type ThemeColor } from '@/constants/theme';
import { compoundBySlug } from '@/data/compound-catalog';
import { useTheme } from '@/hooks/use-theme';
import { getSignalLedger, type SignalLedgerResult } from '@/lib/ai';
import { formatHeroValue, useVerdict, type TFn } from '@/features/home/use-verdict';
import { CHART_METRICS } from '@/lib/chart-series';
import { lutealWindows } from '@/lib/cycle';
import { CanonicalMetric } from '@/lib/integrations/types';
import { selectMetricDirections } from '@/lib/data-facade';
import { daysBetween, formatDateKey, shiftDateKey } from '@/lib/dates';
import { extractLedger, metricExplainer } from '@/lib/signal-ledger';
import { useStore } from '@/lib/store';
import { metricHeroUnit, type SignalTone } from '@/lib/verdict-engine';
import { useToday } from '@/lib/today';

const TONE_COLOR: Record<SignalTone, ThemeColor> = {
  good: 'signalGood',
  watch: 'signalWatch',
  bad: 'signalBad',
  neutral: 'textMuted',
};

/**
 * Signal detail (redesign R2-D): tap a signal row → what this metric is, what
 * feeds it, its chart, and the ledger of real logged events that plausibly moved
 * it (with hedged impact estimates). Deterministic + offline; the AI pass refines
 * the copy when the service is reachable. Legal rung 1: real events only, impacts
 * are estimates, doses are context rows without impact numbers.
 */
export function SignalDetail({ metricId, onClose }: { metricId: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const tx = t as unknown as TFn;
  const { entries, symptomEvents, doseEvents, metricReadings, protocolItems, profile } = useStore();
  const verdict = useVerdict();

  const signal = verdict.signals.find((s) => s.metricId === metricId);
  const labelKey = signal?.labelKey ?? `fields.${metricId}`;
  const name = t(labelKey as 'fields.weight');

  const today = useToday();
  const windowStart = signal?.series.length ? signal.series[0].dateKey : shiftDateKey(today, -13);
  const windowEnd = signal?.series.length ? signal.series[signal.series.length - 1].dateKey : today;

  // React Compiler memoizes this; a manual useMemo with the inline closure can't
  // be preserved. extractLedger is pure + cheap.
  const events = extractLedger({
    metricId,
    entries,
    symptomEvents,
    doseEvents,
    metricReadings,
    windowStart,
    windowEnd,
    compoundName: (slug) => compoundBySlug(slug)?.canonicalName,
    compoundEffectTags: (slug) => compoundBySlug(slug)?.effectTags,
  });
  const anyEstimate = events.some((e) => typeof e.impact === 'number');

  // Goal-aware "about this" (§4d): the direction is resolved the same way the
  // verdict resolves it, so the explainer's framing never contradicts the signal.
  // Cycle shading (item 1): only on the metrics a luteal water swing actually
  // distorts. Shading a sleep-quality chart would be noise — the point is to stop
  // a predictable water swing on the SCALE being read as lost progress.
  const CYCLE_SHADED = ['weight', 'body_fat_pct', 'waist', 'hips'];
  const lutealSpans =
    profile.sex === 'female' && CYCLE_SHADED.includes(metricId)
      ? lutealWindows({
          manualStart: profile.lastPeriodDate,
          statedLength: profile.cycleLength,
          flow: metricReadings.filter((r) => r.metric === CanonicalMetric.cycleFlow),
          from: windowStart,
          to: windowEnd,
        })
      : [];

  const dir = selectMetricDirections({ profile, protocolItems })[metricId] ?? 'neutral';
  const explainer = metricExplainer(metricId, dir === 'up_good' || dir === 'down_good' ? dir : 'neutral');

  // Real data sources feeding THIS metric over the window (§4d transparency): the
  // chip used to always claim "Manual". Derive it from what actually contributed.
  const metricCfg = CHART_METRICS.find((m) => m.id === metricId);
  const inWin = (dk: string) => dk >= windowStart && dk <= windowEnd;
  const sourceKeys: string[] = [];
  const hasManual =
    !!metricCfg?.checkinKey &&
    Object.values(entries).some((e) => inWin(e.date) && typeof e[metricCfg.checkinKey!] === 'number');
  const hasIntegration =
    !!metricCfg?.canonicalMetric &&
    metricReadings.some((r) => r.metric === metricCfg.canonicalMetric && inWin(r.ts.slice(0, 10)));
  const hasDerived =
    (!!metricCfg?.derivedKey || metricCfg?.computed === 'body_fat_pct') &&
    (profile.estimatedMetricsMode ?? 'fill') !== 'off';
  if (hasManual) sourceKeys.push('signal.source.manual');
  if (hasIntegration) sourceKeys.push('signal.source.integration');
  if (hasDerived) sourceKeys.push('signal.source.derived');
  if (sourceKeys.length === 0) sourceKeys.push('signal.source.manual');

  const fmt = signal ? formatHeroValue(signal.value, metricHeroUnit(metricId), profile.units, tx) : null;
  const toneC = TONE_COLOR[signal?.tone ?? 'neutral'];

  // Best-effort AI copy over the deterministic ledger (redesign R2-D). Falls back
  // silently to the offline ledger when the service is unreachable or unconfigured.
  // Tag each result with the event-set it was fetched for so stale copy from a
  // previous signal is ignored at render (no synchronous reset needed).
  const [fetched, setFetched] = useState<{ key: string; result: SignalLedgerResult | null }>();
  const eventsKey = events.map((e) => e.id).join(',');
  const trend: 'up' | 'down' | 'flat' | undefined = signal?.series.length
    ? signal.series[signal.series.length - 1].value > signal.series[0].value
      ? 'up'
      : signal.series[signal.series.length - 1].value < signal.series[0].value
        ? 'down'
        : 'flat'
    : undefined;
  const lang = i18n.language;
  useEffect(() => {
    let cancelled = false;
    if (events.length === 0) return;
    const input = events.map((e) => ({
      id: e.id,
      kind: e.kind,
      label: t(e.labelKey as 'signal.event.dose', e.labelParams),
      date: e.ts.slice(0, 10),
      impact: e.impact,
    }));
    getSignalLedger({
      metric: name,
      trend,
      windowDays: daysBetween(windowStart, windowEnd),
      events: input,
      locale: lang,
    }).then((r) => {
      if (!cancelled) setFetched({ key: eventsKey, result: r });
    });
    return () => {
      cancelled = true;
    };
    // Refetch only when the event set, metric, or language changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsKey, metricId, lang]);
  const ai = fetched?.key === eventsKey ? fetched.result : null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <OverlayHeader title={name} onClose={onClose} />
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* This signal, right now. */}
          {signal && fmt ? (
            <View style={styles.recapRow}>
              <ThemedText type="metric" themeColor="numeral">
                {`${fmt.value}${fmt.unit === '%' ? '%' : ` ${fmt.unit}`}`}
              </ThemedText>
              <StatusPill
                label={t(`verdict.role.${signal.role}` as 'verdict.role.supports')}
                tone={signal.tone === 'neutral' ? 'neutral' : signal.tone}
              />
            </View>
          ) : null}

          {/* About this metric. */}
          <Card style={styles.block}>
            <EngravedLabel>{t('signal.explainLabel')}</EngravedLabel>
            <ThemedText type="body" themeColor="textSecondary">
              {t(explainer.explainKey as 'signal.explain.default')}
              {explainer.goalKey ? ` ${t(explainer.goalKey as 'signal.goal.lower')}` : ''}
            </ThemedText>
          </Card>

          {/* Data sources. */}
          <View style={styles.block}>
            <EngravedLabel>{t('signal.sourcesLabel')}</EngravedLabel>
            <View style={styles.chips}>
              {sourceKeys.map((key) => (
                <View key={key} style={[styles.chip, { borderColor: theme.border }]}>
                  <ThemedText type="monoSm" themeColor="textSecondary">
                    {t(key as 'signal.source.manual')}
                  </ThemedText>
                </View>
              ))}
            </View>
          </View>

          {/* Chart over the read window. */}
          {signal?.series.length ? (
            <Card style={styles.block}>
              <LineChart
                data={signal.series.map((p): ChartPoint => ({ label: p.dateKey, value: p.value }))}
                spans={lutealSpans}
                emptyLabel={t('common.noData')}
              />
              {lutealSpans.length > 0 ? (
                <ThemedText type="monoSm" themeColor="textMuted">
                  {t('cycle.chartLegend')}
                </ThemedText>
              ) : null}
            </Card>
          ) : null}

          {/* AI context over the ledger (hedged, grounded in the events below). */}
          {ai?.summary ? (
            <View style={styles.block}>
              <EngravedLabel>{t('signal.contextLabel')}</EngravedLabel>
              <ThemedText type="body" themeColor="textSecondary">
                {ai.summary}
              </ThemedText>
            </View>
          ) : null}

          {/* The ledger: real logged events that plausibly moved it. */}
          <View style={styles.block}>
            <EngravedLabel>{t('signal.ledgerLabel')}</EngravedLabel>
            {events.length === 0 ? (
              <Placeholder label={t('signal.noEvents')} height={64} />
            ) : (
              <Card style={styles.ledger}>
                {events.map((e, i) => (
                  <View key={e.id}>
                    {i > 0 ? <Divider style={styles.rowDivider} /> : null}
                    <View style={styles.eventRow}>
                      <ThemedText type="monoSm" themeColor="textMuted" style={styles.eventDate}>
                        {formatDateKey(e.ts.slice(0, 10), i18n.language)}
                      </ThemedText>
                      <ThemedText type="small" style={styles.eventLabel} numberOfLines={1}>
                        {t(e.labelKey as 'signal.event.dose', e.labelParams)}
                      </ThemedText>
                      {typeof e.impact === 'number' ? (
                        <ThemedText type="mono" style={{ color: toneC }}>
                          {`≈ ${e.impact > 0 ? '+' : '−'}${Math.abs(e.impact)}`}
                        </ThemedText>
                      ) : (
                        <ThemedText type="monoSm" themeColor="textMuted">
                          {'·'}
                        </ThemedText>
                      )}
                    </View>
                    {ai?.notes[e.id] ? (
                      <ThemedText
                        type="monoSm"
                        themeColor="textMuted"
                        style={styles.eventNote}
                        numberOfLines={2}>
                        {ai.notes[e.id]}
                      </ThemedText>
                    ) : null}
                  </View>
                ))}
              </Card>
            )}
            {anyEstimate ? (
              <ThemedText type="monoSm" themeColor="textMuted" style={styles.estimated}>
                {`≈ ${t('signal.estimated')}`}
              </ThemedText>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
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
  scroll: { gap: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.six },
  recapRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  block: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    // borderColor applied inline from theme.border (token-drift fix, item 40).
  },
  ledger: { gap: Spacing.one },
  rowDivider: { marginVertical: Spacing.one },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  eventDate: { width: 64 },
  eventLabel: { flex: 1 },
  eventNote: { paddingLeft: 72, marginTop: 2, fontStyle: 'italic' },
  estimated: { fontStyle: 'italic' },
});
