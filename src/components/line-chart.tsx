import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ChartPoint = { label: string; value: number };
/** A vertical reference line (e.g. a dose/protocol start) at a 0–1 x-fraction. */
export type ChartMarker = { fraction: number };

/** Minimal line chart on react-native-svg, themed to the instrument aesthetic (H-01).
 *  `estimated` is an optional secondary series (wearable-derived) drawn dashed +
 *  hollow so it reads as inferred, not logged. Both series share one x-domain
 *  (sorted unique labels) so they align by date rather than array index. */
export function LineChart({
  data,
  estimated,
  height = 160,
  unit,
  markers,
  emptyLabel,
}: {
  data: ChartPoint[];
  estimated?: ChartPoint[];
  height?: number;
  unit?: string;
  markers?: ChartMarker[];
  emptyLabel?: string;
}) {
  const theme = useTheme();
  const width = 320;
  const padX = 8;
  const padY = 14;

  const est = estimated ?? [];
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

  // Shared x-domain: sorted unique labels across both series.
  const domain = Array.from(new Set([...data, ...est].map((d) => d.label))).sort();
  const xIndex = new Map(domain.map((l, i) => [l, i]));
  const stepX = (width - padX * 2) / Math.max(1, domain.length - 1);
  const xFor = (label: string) => padX + (xIndex.get(label) ?? 0) * stepX;

  // Shared y-scale across both series so they're comparable.
  const allValues = [...data, ...est].map((d) => d.value);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const span = max - min || 1;
  const yFor = (v: number) => padY + (1 - (v - min) / span) * (height - padY * 2);

  const sortedData = [...data].sort((a, b) => a.label.localeCompare(b.label));
  const sortedEst = [...est].sort((a, b) => a.label.localeCompare(b.label));

  const mainPoints = sortedData.map((d) => `${xFor(d.label)},${yFor(d.value)}`).join(' ');
  const estPoints = sortedEst.map((d) => `${xFor(d.label)},${yFor(d.value)}`).join(' ');

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
          {`${fmt(min)} – ${fmt(max)}`}
        </ThemedText>
      </View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Dose/protocol-start markers — faint vertical reference lines. */}
        {markers?.map((m, i) => {
          const x = padX + Math.max(0, Math.min(1, m.fraction)) * (width - padX * 2);
          return (
            <Line key={`m${i}`} x1={x} y1={padY} x2={x} y2={height - padY} stroke={theme.border} strokeWidth={1} strokeDasharray="3 3" />
          );
        })}
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
