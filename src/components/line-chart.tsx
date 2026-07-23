import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polygon, Polyline, Rect } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const DAY_MS = 86400000;
/** Whole days between two YYYY-MM-DD labels. */
function dayDiff(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00.000Z`).getTime() - new Date(`${a}T00:00:00.000Z`).getTime()) / DAY_MS,
  );
}

export type ChartPoint = { label: string; value: number };
/** A vertical reference line (e.g. a dose/protocol start) at a 0–1 x-fraction. */
export type ChartMarker = { fraction: number };
/** One point of the projected uncertainty band (TRAJ-1). */
export type BandPoint = { label: string; lower: number; upper: number };
/** A shaded vertical span across the full chart height, by x-label range. Used
 *  for cycle luteal windows: without them a predictable water swing reads as
 *  lost progress. */
export type ChartSpan = { start: string; end: string };

/** Minimal line chart on react-native-svg, themed to the instrument aesthetic (H-01).
 *  `estimated` is an optional secondary series (wearable-derived) drawn dashed +
 *  hollow so it reads as inferred, not logged. `projected` + `band` draw the
 *  TRAJ-1 forward trajectory: a dotted continuation inside a shaded uncertainty
 *  band. `goalValue` draws a horizontal target line. All series share one
 *  x-domain (sorted unique labels) so they align by date rather than array index. */
export function LineChart({
  data,
  estimated,
  projected,
  band,
  goalValue,
  height = 160,
  unit,
  markers,
  spans,
  emptyLabel,
}: {
  data: ChartPoint[];
  estimated?: ChartPoint[];
  projected?: ChartPoint[];
  band?: BandPoint[];
  goalValue?: number;
  height?: number;
  unit?: string;
  markers?: ChartMarker[];
  spans?: ChartSpan[];
  emptyLabel?: string;
}) {
  const theme = useTheme();
  const width = 320;
  const padX = 8;
  const padY = 14;

  const est = estimated ?? [];
  const proj = projected ?? [];
  const bnd = band ?? [];
  const totalPoints = data.length + est.length;

  // Empty/insufficient — draw a dashed baseline + axis so it reads as a chart
  // waiting for data (encourages logging).
  if (totalPoints < 2) {
    return (
      <View style={styles.wrap}>
        <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
          <Line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke={theme.border} strokeWidth={1} />
          <Line
            x1={padX}
            y1={height / 2}
            x2={width - padX}
            y2={height / 2}
            stroke={theme.border}
            strokeWidth={1}
            strokeDasharray="3 4"
          />
        </Svg>
        <View style={styles.emptyOverlay} pointerEvents="none">
          <ThemedText type="monoSm" themeColor="textMuted">
            {emptyLabel ?? unit ?? ''}
          </ThemedText>
        </View>
      </View>
    );
  }

  // Shared x-domain: sorted unique labels across every series (incl. the future).
  const domain = Array.from(
    new Set([...data, ...est, ...proj, ...bnd.map((b) => ({ label: b.label }))].map((d) => d.label)),
  ).sort();
  const xIndex = new Map(domain.map((l, i) => [l, i]));
  const stepX = (width - padX * 2) / Math.max(1, domain.length - 1);
  const xFor = (label: string) => padX + (xIndex.get(label) ?? 0) * stepX;
  // Spans carry arbitrary dates, not necessarily labels that exist in the data,
  // so interpolate their position against the domain's first/last label rather
  // than looking them up. Without this a luteal window whose edge falls on a day
  // with no logged reading would silently collapse to x = padX.
  const first = domain[0];
  const lastLabel = domain[domain.length - 1];
  const domainDays = Math.max(1, dayDiff(first, lastLabel));
  const xForDate = (date: string) =>
    padX + (dayDiff(first, date) / domainDays) * (width - padX * 2);

  // Header range reflects only the ACTUAL data (manual + estimated), so the
  // projection + band never inflate the "N – M" readout.
  const displayValues = [...data, ...est].map((d) => d.value);
  const displayMin = Math.min(...displayValues);
  const displayMax = Math.max(...displayValues);

  // Y-scale spans everything drawn — data, estimated, projection, band edges and
  // the goal line — so nothing clips.
  const scaleValues = [
    ...displayValues,
    ...proj.map((p) => p.value),
    ...bnd.flatMap((b) => [b.lower, b.upper]),
    ...(typeof goalValue === 'number' ? [goalValue] : []),
  ];
  const min = Math.min(...scaleValues);
  const max = Math.max(...scaleValues);
  const span = max - min || 1;
  const yFor = (v: number) => padY + (1 - (v - min) / span) * (height - padY * 2);

  const sortedData = [...data].sort((a, b) => a.label.localeCompare(b.label));
  const sortedEst = [...est].sort((a, b) => a.label.localeCompare(b.label));
  const sortedProj = [...proj].sort((a, b) => a.label.localeCompare(b.label));
  const sortedBand = [...bnd].sort((a, b) => a.label.localeCompare(b.label));

  const mainPoints = sortedData.map((d) => `${xFor(d.label)},${yFor(d.value)}`).join(' ');
  const estPoints = sortedEst.map((d) => `${xFor(d.label)},${yFor(d.value)}`).join(' ');

  // The projected line connects to the last actual point so it reads as one arc.
  const lastActual = sortedData[sortedData.length - 1];
  const projLine = [
    ...(lastActual ? [lastActual] : []),
    ...sortedProj,
  ].map((d) => `${xFor(d.label)},${yFor(d.value)}`);
  // Band polygon: upper edge left→right, then lower edge right→left.
  const bandPolygon = [
    ...sortedBand.map((b) => `${xFor(b.label)},${yFor(b.upper)}`),
    ...[...sortedBand].reverse().map((b) => `${xFor(b.label)},${yFor(b.lower)}`),
  ].join(' ');

  // With many points, per-point dots turn the line into a dense "barcode". Past a
  // threshold, draw the line alone — the solid series keeps only its trailing dot
  // as the current-value marker.
  const DOT_LIMIT = 16;
  const showDataDots = sortedData.length <= DOT_LIMIT;
  const showEstDots = sortedEst.length <= DOT_LIMIT;

  // Header shows the most recent value we have (manual preferred, else estimated).
  const last = sortedData[sortedData.length - 1] ?? sortedEst[sortedEst.length - 1];
  // Round for display so derived metrics don't leak float noise (e.g. 3.34999…).
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <ThemedText type="metricSm">{`${fmt(last.value)}${unit ? ` ${unit}` : ''}`}</ThemedText>
        <ThemedText type="monoSm" themeColor="textMuted">
          {`${fmt(displayMin)} – ${fmt(displayMax)}`}
        </ThemedText>
      </View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Shaded spans (cycle luteal windows) — drawn first so every series sits
            on top. Deliberately very faint: this is context for reading the line,
            never a signal competing with it. */}
        {spans?.map((s, i) => {
          // Clamp to the drawn domain: a span may extend past the data on either
          // side, and an unclamped rect would spill outside the plot area.
          const clamp = (x: number) => Math.max(padX, Math.min(width - padX, x));
          const x1 = clamp(xForDate(s.start));
          const x2 = clamp(xForDate(s.end));
          if (x2 <= x1) return null;
          return (
            <Rect
              key={`s${i}`}
              x={x1}
              y={padY}
              width={x2 - x1}
              height={height - padY * 2}
              fill={theme.textMuted}
              fillOpacity={0.1}
            />
          );
        })}
        {/* Dose/protocol-start markers — faint vertical reference lines. */}
        {markers?.map((m, i) => {
          const x = padX + Math.max(0, Math.min(1, m.fraction)) * (width - padX * 2);
          return (
            <Line key={`m${i}`} x1={x} y1={padY} x2={x} y2={height - padY} stroke={theme.border} strokeWidth={1} strokeDasharray="3 3" />
          );
        })}
        {/* Projected uncertainty band (TRAJ-1) — a faint shaded wedge behind the line. */}
        {sortedBand.length >= 2 && (
          <Polygon points={bandPolygon} fill={theme.accent} fillOpacity={0.16} stroke="none" />
        )}
        {/* Goal line — horizontal target where set. */}
        {typeof goalValue === 'number' && (
          <Line
            x1={padX}
            y1={yFor(goalValue)}
            x2={width - padX}
            y2={yFor(goalValue)}
            stroke={theme.textMuted}
            strokeWidth={1}
            strokeDasharray="2 4"
          />
        )}
        {/* Estimated (wearable-derived) overlay — dashed line, hollow dots. */}
        {sortedEst.length >= 2 && (
          <Polyline
            points={estPoints}
            fill="none"
            stroke={theme.textMuted}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {showEstDots &&
          sortedEst.map((d, i) => (
            <Circle key={`e${i}`} cx={xFor(d.label)} cy={yFor(d.value)} r={2} fill={theme.background} stroke={theme.textMuted} strokeWidth={1} />
          ))}
        {/* Projected trajectory — dotted continuation of the solid series. */}
        {projLine.length >= 2 && (
          <Polyline
            points={projLine.join(' ')}
            fill="none"
            stroke={theme.accent}
            strokeWidth={1.5}
            strokeDasharray="2 4"
            strokeOpacity={0.8}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {/* Subjective (logged) series — solid accent line, filled dots. */}
        {sortedData.length >= 2 && (
          <Polyline points={mainPoints} fill="none" stroke={theme.accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {sortedData.map((d, i) => {
          const isLast = i === sortedData.length - 1;
          if (!showDataDots && !isLast) return null;
          return (
            <Circle
              key={i}
              cx={xFor(d.label)}
              cy={yFor(d.value)}
              r={isLast ? 3 : 1.5}
              fill={theme.accent}
            />
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  emptyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
