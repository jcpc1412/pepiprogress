/**
 * CyberLife instrument primitives — the engraved/debossed surface system.
 *
 * Everything reads from the theme tokens in constants/theme.ts so the two themes
 * are a single value swap. Fidelity within React Native:
 *  - Chamfers use Radii.chamfer (tight radius) until react-native-svg lands.
 *  - The carved divider is two stacked 1px lines (shadow over highlight) — the
 *    closest cross-platform stand-in for an inset groove.
 *  - Engraved labels carry one highlight text-shadow (`engrave` token).
 */

import { type ReactNode, useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A raised, chamfered panel — the default card. */
export function Card({ style, children, ...rest }: ViewProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: theme.surfaceRaised, borderColor: theme.border },
        style,
      ]}
      {...rest}>
      {children}
    </View>
  );
}

/** A sunken/inset panel — quick-log box, notes. */
export function Sunken({ style, children, ...rest }: ViewProps) {
  const theme = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: theme.surfaceSunken }, style]} {...rest}>
      {children}
    </View>
  );
}

/** Carved hairline divider — a shadow line over a highlight line reads as an
 *  incised groove in both themes. */
export function Divider({ style }: { style?: ViewStyle }) {
  const theme = useTheme();
  return (
    <View style={[styles.dividerWrap, style]}>
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border }} />
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.borderHighlight }} />
    </View>
  );
}

/** Engraved uppercase mono label — panel signage. */
export function EngravedLabel({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const theme = useTheme();
  return (
    <ThemedText
      type="label"
      style={[
        // single highlight shadow on the lit edge = faint carved-in feel
        { textShadowColor: theme.engrave, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
        style as object,
      ]}>
      {children}
    </ThemedText>
  );
}

/** The one big tabular number per card, with an optional trailing unit. */
export function Metric({ value, unit }: { value: string; unit?: string }) {
  return (
    <View style={styles.metricRow}>
      <ThemedText type="metric">{value}</ThemedText>
      {unit ? (
        <ThemedText type="monoSm" themeColor="textMuted" style={styles.metricUnit}>
          {unit}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** A signed/semantic value (delta, status). Pass the resolved direction —
 *  callers decide good/bad against the user's goal, never the sign alone. */
export function SignalText({
  children,
  tone = 'neutral',
  size = 'metricSm',
}: {
  children: ReactNode;
  tone?: 'good' | 'bad' | 'neutral';
  size?: 'metric' | 'metricSm' | 'mono';
}) {
  const color: ThemeColor = tone === 'good' ? 'signalGood' : tone === 'bad' ? 'signalBad' : 'numeral';
  return (
    <ThemedText type={size} themeColor={color}>
      {children}
    </ThemedText>
  );
}

/** A small chamfered status chip (LOW STOCK / NOMINAL / EXPIRING). */
export function StatusPill({ label, tone = 'neutral' }: { label: string; tone?: 'good' | 'bad' | 'neutral' }) {
  const theme = useTheme();
  const bg = tone === 'good' ? theme.signalGoodBg : tone === 'bad' ? theme.signalBadBg : theme.surfaceSunken;
  const fg: ThemeColor = tone === 'good' ? 'signalGood' : tone === 'bad' ? 'signalBad' : 'textMuted';
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <ThemedText type="monoSm" themeColor={fg}>
        {label}
      </ThemedText>
    </View>
  );
}

/** Content-shaped loading placeholder — gently pulsing sunken bars. Use instead
 *  of a centered spinner when the result is text/content (Emil: show the shape). */
export function Skeleton({ lines = 3 }: { lines?: number }) {
  const theme = useTheme();
  const [opacity] = useState(() => new Animated.Value(0.4));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.85, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <View style={styles.skeletonWrap} accessibilityRole="progressbar" accessible accessibilityLabel="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <Animated.View
          key={i}
          style={[
            styles.skeletonBar,
            { backgroundColor: theme.surfaceSunken, opacity, width: i === lines - 1 ? '60%' : '100%' },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: Radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
  skeletonWrap: { gap: Spacing.two },
  skeletonBar: { height: 12, borderRadius: Radii.chamfer },
  dividerWrap: { marginVertical: Spacing.three },
  metricRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.one },
  metricUnit: { marginBottom: 4 },
  pill: {
    borderRadius: Radii.chamfer,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
});
