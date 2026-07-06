/**
 * Verdict presentation primitives (redesign §2.4). Purely presentational and
 * engine-agnostic: callers pass a resolved value + a `favour` flag; these
 * components never inspect the raw sign to decide good/bad. That decision lives
 * in the verdict engine (Phase 2), because "down" is good on a cut and bad on a
 * bulk.
 *
 *  - `HeroFigure`  — the one engine-picked protagonist figure on Today.
 *  - `TrendMarker` — the small ▲/▼ whose colour comes from `favour`.
 *  - `ReasonButton`— the quiet, blends-into-canvas "see the reasoning" action.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Whether the movement is favourable for the user's goal, decided upstream. */
export type Favour = 'good' | 'watch' | 'bad';

const favourColor: Record<Favour, ThemeColor> = {
  good: 'signalGood',
  watch: 'signalWatch',
  bad: 'signalBad',
};

/** A small directional marker (▲ up / ▼ down) tinted by favourability. The
 *  glyph encodes direction; the colour encodes whether that direction is good.
 *  Symbols, not copy — nothing here needs translating. */
export function TrendMarker({ trend, favour }: { trend: 'up' | 'down'; favour: Favour }) {
  const theme = useTheme();
  return (
    <ThemedText type="heroUnit" style={{ color: theme[favourColor[favour]] }}>
      {trend === 'up' ? '▲' : '▼'}
    </ThemedText>
  );
}

/**
 * The protagonist figure: a large tabular-mono number, a small trailing unit,
 * and an optional trend marker. One per screen (Today). `unit` and `value` are
 * pre-formatted by the caller (already unit-aware, already localized numerals).
 */
export function HeroFigure({
  value,
  unit,
  trend,
  favour = 'good',
}: {
  value: string;
  unit?: string;
  trend?: 'up' | 'down';
  favour?: Favour;
}) {
  return (
    <View style={styles.heroRow}>
      {trend ? <TrendMarker trend={trend} favour={favour} /> : null}
      <ThemedText type="hero">{value}</ThemedText>
      {unit ? (
        <ThemedText type="heroUnit" style={styles.heroUnit}>
          {unit}
        </ThemedText>
      ) : null}
    </View>
  );
}

/**
 * The quiet secondary action into the decompose screen. Deliberately low
 * contrast (blends into the canvas) so it never competes with the hero or the
 * primary Log action. `label` is passed in already translated; the arrow is a
 * glyph, not copy.
 */
export function ReasonButton({
  label,
  onPress,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  accessibilityHint?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.reasonRow, pressed && styles.pressed]}>
      <ThemedText type="mono" themeColor="textMuted">
        {label}
      </ThemedText>
      <ThemedText type="mono" style={{ color: theme.textMuted }}>
        {'→'}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  heroUnit: { marginBottom: 6 },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  pressed: { opacity: 0.6 },
});
