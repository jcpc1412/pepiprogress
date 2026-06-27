import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ChartPoint = { label: string; value: number };
/** A vertical reference line (e.g. a dose/protocol start) at a 0–1 x-fraction. */
export type ChartMarker = { fraction: number };

/** Minimal line chart on react-native-svg, themed to the instrument aesthetic (H-01). */
export function LineChart({
  data,
  height = 160,
  unit,
  markers,
}: {
  data: ChartPoint[];
  height?: number;
  unit?: string;
  markers?: ChartMarker[];
}) {
  const theme = useTheme();
  const width = 320;
  const padX = 8;
  const padY = 14;

  if (data.length < 2) {
    return (
      <View style={[styles.empty, { height }]}>
        <ThemedText type="small" themeColor="textMuted">
          {unit ? unit : ''}
        </ThemedText>
      </View>
    );
  }

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = (width - padX * 2) / (data.length - 1);

  const points = data
    .map((d, i) => {
      const x = padX + i * stepX;
      const y = padY + (1 - (d.value - min) / span) * (height - padY * 2);
      return `${x},${y}`;
    })
    .join(' ');

  const last = data[data.length - 1];

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <ThemedText type="metricSm">{`${last.value}${unit ? ` ${unit}` : ''}`}</ThemedText>
        <ThemedText type="monoSm" themeColor="textMuted">
          {`${min} – ${max}`}
        </ThemedText>
      </View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Dose/protocol-start markers — faint vertical reference lines. */}
        {markers?.map((m, i) => {
          const x = padX + Math.max(0, Math.min(1, m.fraction)) * (width - padX * 2);
          return (
            <Line
              key={`m${i}`}
              x1={x}
              y1={padY}
              x2={x}
              y2={height - padY}
              stroke={theme.border}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          );
        })}
        <Polyline
          points={points}
          fill="none"
          stroke={theme.accent}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {data.map((d, i) => (
          <Circle
            key={i}
            cx={padX + i * stepX}
            cy={padY + (1 - (d.value - min) / span) * (height - padY * 2)}
            r={i === data.length - 1 ? 3 : 1.5}
            fill={theme.accent}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  empty: { alignItems: 'center', justifyContent: 'center' },
});
