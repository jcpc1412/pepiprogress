import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GearIcon } from '@/components/icons';
import { LineChart, type ChartMarker, type ChartPoint } from '@/components/line-chart';
import { Card, EngravedLabel, Metric, SignalText } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { compoundBySlug } from '@/data/compound-catalog';
import { AskPepi } from '@/features/ask/ask-pepi';
import { Insights } from '@/features/insights/insights';
import { buildMetricSeries, CHART_METRICS, DEFAULT_CHART_METRIC_IDS } from '@/lib/chart-series';
import { daysBetween } from '@/lib/dates';
import { useOverlay } from '@/lib/nav-overlay';
import { localDateKey, useStore, type CheckinEntry } from '@/lib/store';

/** Min check-ins before the AI text features unlock (matches the Insights component). */
const MIN_CHECKINS = 4;

type DeltaTone = 'good' | 'bad' | 'neutral';

/** Core subjective/weight metrics used by the summary "biggest change" card. */
const CORE_METRICS = CHART_METRICS.filter((m) => m.checkinKey);

/**
 * The Insights tab (redesign R2 #3) — local summary cards + trend charts (always
 * available from partial data) plus the AI analysis surface (gated at 4 check-ins
 * with an educational unlock state below the threshold).
 */
export function InsightsScreen() {
  const { t } = useTranslation();
  const { openSettings } = useOverlay();
  const { entries } = useStore();

  const checkinCount = Object.keys(entries).length;
  const unlocked = checkinCount >= MIN_CHECKINS;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <View>
            <EngravedLabel>{t('tabs.insights')}</EngravedLabel>
            <ThemedText type="display">{t('insights.heading')}</ThemedText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.title')}
            onPress={openSettings}
            hitSlop={8}>
            <GearIcon />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <AskPepi />
          <SummaryCards />
          <ChartsSection />
          {!unlocked && (
            <UnlockCard remaining={Math.max(1, MIN_CHECKINS - checkinCount)} />
          )}
          {/* AI analysis — self-gates at MIN_CHECKINS (renders null below). */}
          <Insights />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** Local, always-on summary cards (no AI call). */
function SummaryCards() {
  const { t } = useTranslation();
  const { entries, protocolItems, profile } = useStore();

  const data = useMemo(() => {
    const list = Object.values(entries).sort((a, b) => a.date.localeCompare(b.date));

    // Earliest protocol start → "since {compound}" weeks.
    const starts = protocolItems
      .filter((p) => p.startedAt)
      .sort((a, b) => (a.startedAt! < b.startedAt! ? -1 : 1));
    const since = starts[0]
      ? {
          compound: compoundBySlug(starts[0].compoundSlug)?.canonicalName ?? starts[0].compoundSlug,
          weeks: Math.max(0, Math.floor(daysBetween(starts[0].startedAt!, localDateKey()) / 7)),
        }
      : null;

    // Biggest normalized change across tracked metrics.
    let biggest: { labelKey: string; delta: number; tone: DeltaTone; mag: number } | null = null;
    for (const m of CORE_METRICS) {
      const key = m.checkinKey as keyof CheckinEntry;
      const pts = list.filter((e) => typeof e[key] === 'number') as (CheckinEntry & Record<string, number>)[];
      if (pts.length < 2) continue;
      const first = pts[0][key] as number;
      const last = pts[pts.length - 1][key] as number;
      const delta = last - first;
      if (delta === 0) continue;
      const mag = m.id === 'weight' ? Math.abs(delta) / (first || 1) : Math.abs(delta) / 4;
      let tone: DeltaTone = 'neutral';
      if (m.id === 'weight') {
        const wantsLoss = profile.goals.includes('weight_loss');
        const wantsGain = profile.goals.includes('body_comp');
        if (wantsLoss !== wantsGain) tone = (wantsLoss ? delta < 0 : delta > 0) ? 'good' : 'bad';
      } else {
        tone = delta > 0 ? 'good' : 'bad';
      }
      if (!biggest || mag > biggest.mag) biggest = { labelKey: m.labelKey, delta, tone, mag };
    }

    return { count: list.length, since, biggest };
  }, [entries, protocolItems, profile.goals]);

  const fmtDelta = (d: number) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toFixed(1)}`;

  // Always render all three cards — missing values show "—" to signal what fills in.
  return (
    <View style={styles.cardRow}>
      <Card style={styles.summaryCard}>
        <EngravedLabel>{t('insights.sinceStarted', { compound: data.since?.compound ?? '—' })}</EngravedLabel>
        <Metric value={data.since ? t('insights.weeks', { count: data.since.weeks }) : '—'} />
      </Card>
      <Card style={styles.summaryCard}>
        <EngravedLabel>{t('insights.biggestChange')}</EngravedLabel>
        {data.biggest ? (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              {t(data.biggest.labelKey as 'fields.weight')}
            </ThemedText>
            <SignalText tone={data.biggest.tone}>{fmtDelta(data.biggest.delta)}</SignalText>
          </>
        ) : (
          <Metric value="—" />
        )}
      </Card>
      <Card style={styles.summaryCard}>
        <EngravedLabel>{t('insights.daysLogged')}</EngravedLabel>
        <Metric value={String(data.count)} />
      </Card>
    </View>
  );
}

/** Trend charts over the full protocol span, with protocol-start markers (redesign
 *  R2). Unlike the dashboard's 10-day glance, this shows the whole cycle from when
 *  the earliest compound started, and — like the dashboard — merges integration +
 *  wearable-derived data, not just manual check-ins. */
function ChartsSection() {
  const { t } = useTranslation();
  const { entries, metricReadings, protocolItems, profile } = useStore();

  const selected = useMemo(
    () => (profile.dashboardMetrics?.length ? profile.dashboardMetrics : DEFAULT_CHART_METRIC_IDS),
    [profile.dashboardMetrics],
  );

  const { series, startKeys } = useMemo(() => {
    const starts = protocolItems
      .map((p) => p.startedAt)
      .filter((s): s is string => !!s)
      .map((s) => s.slice(0, 10))
      .sort();
    // Anchor the window at the earliest protocol start (the "since X weeks" date).
    const windowStart = starts[0];
    const windowEnd = localDateKey();

    const built = buildMetricSeries({
      selectedIds: selected,
      entries,
      metricReadings,
      profile,
      windowStart,
      windowEnd,
    });
    return { series: built, startKeys: starts };
  }, [entries, metricReadings, protocolItems, selected, profile]);

  // Always render the chart frames — empty ones show a dashed placeholder axis.
  return (
    <View style={styles.charts}>
      <EngravedLabel>{t('insights.trendsLabel')}</EngravedLabel>
      {series.map((s) => {
        const points: ChartPoint[] = s.primary.map((p) => ({ label: p.dateKey.slice(5), value: p.value }));
        const estimated: ChartPoint[] = s.estimated.map((p) => ({ label: p.dateKey.slice(5), value: p.value }));
        // Protocol-start markers positioned across the chart's actual date span.
        const span = [...s.primary, ...s.estimated];
        let markers: ChartMarker[] = [];
        if (span.length >= 2) {
          const first = span.reduce((a, b) => (a.dateKey < b.dateKey ? a : b)).dateKey;
          const last = span.reduce((a, b) => (a.dateKey > b.dateKey ? a : b)).dateKey;
          const days = daysBetween(first, last) || 1;
          markers = startKeys
            .map((k) => daysBetween(first, k) / days)
            .filter((f) => f >= 0 && f <= 1)
            .map((fraction) => ({ fraction }));
        }
        return (
          <Card key={s.id} style={styles.chartCard}>
            <EngravedLabel>{t(s.labelKey as 'fields.weight')}</EngravedLabel>
            <LineChart
              data={points}
              estimated={estimated}
              markers={markers}
              unit={s.unitKey ? t(s.unitKey as 'units.g') : undefined}
              emptyLabel={t('common.noData')}
            />
          </Card>
        );
      })}
    </View>
  );
}

/** Educational unlock state shown below the AI threshold. */
function UnlockCard({ remaining }: { remaining: number }) {
  const { t } = useTranslation();
  return (
    <Card style={styles.unlock}>
      <EngravedLabel>{t('insights.unlockTitle')}</EngravedLabel>
      <ThemedText type="small" themeColor="textSecondary">
        {t('insights.unlockBody')}
      </ThemedText>
      <ThemedText type="monoSm" themeColor="textMuted">
        {t('insights.unlockProgress', { count: remaining })}
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  scroll: { gap: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.six },
  cardRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  summaryCard: { flexGrow: 1, minWidth: '45%', gap: Spacing.one },
  charts: { gap: Spacing.two },
  chartCard: { gap: Spacing.two },
  unlock: { gap: Spacing.two },
});
