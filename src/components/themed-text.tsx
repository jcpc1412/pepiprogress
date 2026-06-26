import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextType =
  // CyberLife instrument scale
  | 'display' // screen H1 — "21 JUN 2026", "Set parameters"
  | 'label' // engraved panel label (uppercase mono, low-contrast)
  | 'metric' // large tabular numeral — the one big number per card
  | 'metricSm' // secondary numeral (delta, stat)
  | 'mono' // mono body (data rows)
  | 'monoSm' // mono fine print
  | 'body' // sans body copy
  // sans body tiers — regular + strong emphasis (card titles, names, actions)
  | 'small'
  | 'smallBold';

export type ThemedTextProps = TextProps & {
  type?: ThemedTextType;
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'body', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  // Sensible default ink per role: labels are the faint engraved gray, numerals
  // the metric ink, everything else primary text.
  const defaultColor: ThemeColor =
    type === 'label'
      ? 'label'
      : type === 'metric' || type === 'metricSm'
        ? 'numeral'
        : type === 'mono' || type === 'monoSm'
          ? 'textSecondary'
          : 'text';

  return (
    <Text
      style={[{ color: theme[themeColor ?? defaultColor] }, styles[type], style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  // ── instrument scale ──
  // On native: font-family name already encodes the weight (expo-google-fonts).
  // On web: CSS variable responds to fontWeight, so keep the weight hint.
  display: { fontFamily: Fonts.sansLight, fontSize: 27, fontWeight: '300', letterSpacing: -0.3, lineHeight: 30 },
  label: {
    fontFamily: Fonts.monoMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  metric: { fontFamily: Fonts.mono, fontSize: 42, fontWeight: '400', lineHeight: 42 },
  metricSm: { fontFamily: Fonts.monoMedium, fontSize: 22, fontWeight: '500', lineHeight: 24 },
  mono: { fontFamily: Fonts.mono, fontSize: 12, fontWeight: '400', letterSpacing: 0.4 },
  monoSm: { fontFamily: Fonts.mono, fontSize: 10, fontWeight: '400', letterSpacing: 0.6 },
  body: { fontFamily: Fonts.sans, fontSize: 14, fontWeight: '400', lineHeight: 20 },

  // ── sans body tiers ──
  small: { fontFamily: Fonts.sans, fontSize: 14, lineHeight: 20, fontWeight: '400' },
  smallBold: { fontFamily: Fonts.sansSemiBold, fontSize: 14, lineHeight: 20, fontWeight: '600' },
});
