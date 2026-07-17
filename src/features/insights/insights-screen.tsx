import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { OptionChip } from '@/components/form';
import { LineChart, type BandPoint, type ChartMarker, type ChartPoint } from '@/components/line-chart';
import { Card, EngravedLabel, Metric, SignalText } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { compoundBySlug } from '@/data/compound-catalog';
import { useVerdict } from '@/features/home/use-verdict';
import { CHART_METRICS } from '@/lib/chart-series';
import { selectChartSeries } from '@/lib/data-facade';
import { daysBetween } from '@/lib/dates';
import { localDateKey, useStore, type CheckinEntry } from '@/lib/store';
import { projectSeries } from '@/lib/trajectory';

/** Min check-ins before the AI text features unlock (matches the Insights component). */
export const MIN_CHECKINS = 4;

/** How far the weight chart's projected trajectory reaches (days). Kept modest so
 *  the dotted forward line never dwarfs the logged history. */
const PROJECTION_HORIZON_DAYS = 21;

type DeltaTone = 'good' | 'bad' | 'neutral';

/** Core subjective/weight metrics used by the summary "biggest change" card. */
const CORE_METRICS = CHART_METRICS.filter((m) => m.checkinKey);

// The old InsightsScreen shell was retired by the Analysis tab (R2-C C4); this
// module now exports its reusable sections (SummaryCards / ChartsSection /
// UnlockCard), which Analysis composes. (UX audit 2026-07-11: dead code removed.)

/** Local, always-on summary cards (no AI call). */
export function SummaryCards() {
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
 *  wearable-derived data, not just manual check-ins.
 *
 *  UX audit 2026-07-11: a metric chip-row filters which charts render. Default =
 *  the verdict's top signals plus weight (the metrics the read actually rests on),
 *  so the tab stops being a wall of every chart; any metric is one tap away. */
export function ChartsSection() {
  const { t } = useTranslation();
  const { entries, metricReadings, protocolItems, profile } = useStore();
  const verdict = useVerdict();

  // Default focus: top-3 verdict signals + weight. Falls back to "all" while the
  // verdict is still building (no signals to focus on yet).
  const defaultIds = useMemo(() => {
    const ids = new Set<string>(verdict.signals.slice(0, 3).map((s) => s.metricId));
    ids.add('weight');
    return ids;
    // Signals shift rarely (goal/compound changes); keying on length is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdict.signals.length]);
  const [picked, setPicked] = useState<Set<string> | null>(null); // null = default focus
  const active = picked ?? (verdict.signals.length > 0 ? defaultIds : null);

  const toggle = (id: string) => {
    const base = new Set(active ?? CHART_METRICS.map((m) => m.id));
    if (base.has(id)) base.delete(id);
    else base.add(id);
    if (base.size === 0) return; // never allow zero charts
    setPicked(base);
  };

  // Single source of truth for the trend series (facade A-4): identical merge of
  // manual + integration + derived + estimated that every other surface reads.
  const { series, startKeys } = useMemo(
    () =>
      selectChartSeries({ entries, metricReadings, protocolItems, profile }, localDateKey(), {
        selectedIds: active ? [...active] : undefined,
      }),
    [entries, metricReadings, protocolItems, profile, active],
  );

  // Always render the chart frames — empty ones show a dashed placeholder axis.
  return (
    <View style={styles.charts}>
      <EngravedLabel>{t('insights.trendsLabel')}</EngravedLabel>
      <View style={styles.metricChips}>
        {CHART_METRICS.map((m) => {
          const on = !active || active.has(m.id);
          return (
            <OptionChip
              key={m.id}
              label={t(m.labelKey as 'fields.weight')}
              selected={on}
              onPress={() => toggle(m.id)}
            />
          );
        })}
      </View>
      {series.map((s) => {
        const points: ChartPoint[] = s.primary.map((p) => ({ label: p.dateKey.slice(5), value: p.value }));
        const estimated: ChartPoint[] = s.estimated.map((p) => ({ label: p.dateKey.slice(5), value: p.value }));

        // TRAJ-1: an honest projected trajectory + widening band on the weight
        // chart only (the metric with a modeled forecast + optional goal line).
        const proj =
          s.id === 'weight' && s.primary.length >= 3 ? projectSeries(s.primary, PROJECTION_HORIZON_DAYS) : null;
        const projected: ChartPoint[] | undefined = proj?.points.map((p) => ({ label: p.dateKey.slice(5), value: p.value }));
        const band: BandPoint[] | undefined = proj?.points.map((p) => ({ label: p.dateKey.slice(5), lower: p.lower, upper: p.upper }));
        const goalValue =
          s.id === 'weight' && typeof profile.targetWeight === 'number' ? profile.targetWeight : undefined;
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
              projected={projected}
              band={band}
              goalValue={goalValue}
              markers={markers}
              unit={s.unitKey ? t(s.unitKey as 'units.g') : undefined}
              emptyLabel={t('common.noData')}
            />
            {proj ? (
              <ThemedText type="monoSm" themeColor="textMuted">
                {t(proj.plateau ? 'insights.projectedFlat' : 'insights.projected')}
              </ThemedText>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

/** Educational unlock state shown below the AI threshold. */
export function UnlockCard({ remaining }: { remaining: number }) {
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
  cardRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  summaryCard: { flexGrow: 1, minWidth: '45%', gap: Spacing.one },
  charts: { gap: Spacing.two },
  metricChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chartCard: { gap: Spacing.two },
  unlock: { gap: Spacing.two },
});
