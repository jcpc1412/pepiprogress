/**
 * Design tokens — "CyberLife Instrument" (see docs/design).
 *
 * Monochrome, two co-equal themes (luminous "daylight" + "at night") that share
 * one engraved/debossed treatment. The whole system is value-swappable: a theme
 * is the same structure with inverted material tones, so switching is one lookup.
 *
 * Legacy keys (`text`, `background`, `backgroundElement`, `backgroundSelected`,
 * `textSecondary`) are kept and mapped onto the new palette so existing screens
 * keep working while we migrate them onto the richer semantic tokens below.
 *
 * RN-fidelity notes (this is React Native, not the HTML mock):
 *  - No `clip-path` → chamfers approximated via `Radii.chamfer`; upgrade to true
 *    45° cuts later with react-native-svg.
 *  - `Text` supports one shadow only → engraving uses a single highlight shadow
 *    (`engrave`), carved dividers use two stacked 1px lines (see <Divider/>).
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  // ── DAYLIGHT ──────────────────────────────────────────────────────────────
  light: {
    // legacy (mapped)
    text: '#1A1918',
    background: '#F0EFEC',
    backgroundElement: '#E6E4E0', // raised surface
    backgroundSelected: '#DDDCD8', // sunken surface
    textSecondary: '#6E6B67',

    // semantic
    textMuted: '#817D78', // ~3.4:1 on background — quiet but legible (was #9A9590 ≈ 2.5:1, sub-AA)
    label: '#88847F', // engraved panel labels — faintest legible tier (~3.1:1; ornament, not data)
    surfaceRaised: '#E6E4E0',
    surfaceSunken: '#DDDCD8',
    numeral: '#3A3834', // primary metric ink
    border: 'rgba(0,0,0,0.10)', // carved groove — shadow side
    borderHighlight: 'rgba(255,255,255,0.70)', // carved groove — lit side
    engrave: 'rgba(255,255,255,0.85)', // label text-shadow (lit edge below)
    accent: '#2A2825', // solid control / selected
    onAccent: '#F0EFEC',
    structure: 'rgba(26,25,24,0.05)', // faint diagonal lattice lines

    // signal — ONLY for data semantics (deltas, status)
    signalGood: '#2B6947',
    signalBad: '#7A2E2E',
    signalGoodBg: 'rgba(43,105,71,0.10)',
    signalBadBg: 'rgba(122,46,46,0.10)',
  },
  // ── AT NIGHT ──────────────────────────────────────────────────────────────
  dark: {
    // legacy (mapped)
    text: '#D4D1CB',
    background: '#131210',
    backgroundElement: '#1D1C1A',
    backgroundSelected: '#0F0E0D',
    textSecondary: '#7A7671',

    // semantic
    textMuted: '#6A6661', // ~3.3:1 on background — quiet but legible (was #4E4B47 ≈ 2.2:1, sub-AA)
    label: '#65615C', // engraved panel labels — faintest legible tier (~3.2:1; ornament, not data)
    surfaceRaised: '#1D1C1A',
    surfaceSunken: '#0F0E0D',
    numeral: '#B0ACA6',
    border: 'rgba(255,255,255,0.07)',
    borderHighlight: 'rgba(0,0,0,0.50)',
    engrave: 'rgba(0,0,0,0.60)',
    accent: '#E8E5DF',
    onAccent: '#131210',
    structure: 'rgba(212,209,203,0.035)',

    signalGood: '#3A8A58',
    signalBad: '#9A3535',
    signalGoodBg: 'rgba(58,138,88,0.12)',
    signalBadBg: 'rgba(154,53,53,0.16)',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * Font families. Each weight is a separate family name on native (expo-google-fonts
 * ships distinct TTF assets per weight). On web, CSS variables point to a variable
 * font that responds to `fontWeight`, so all weight variants map to the same var.
 */
export const Fonts = Platform.select({
  web: {
    sans: 'var(--font-display)',
    sansLight: 'var(--font-display)',
    sansSemiBold: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
    monoMedium: 'var(--font-mono)',
    monoBold: 'var(--font-mono)',
  },
  default: {
    // Inter (sans) — loaded via @expo-google-fonts/inter in _layout.tsx
    sans: 'Inter_400Regular',
    sansLight: 'Inter_300Light',
    sansSemiBold: 'Inter_600SemiBold',
    serif: 'serif',
    rounded: 'normal',
    // IBM Plex Mono — loaded via @expo-google-fonts/ibm-plex-mono in _layout.tsx
    mono: 'IBMPlexMono_400Regular',
    monoMedium: 'IBMPlexMono_500Medium',
    monoBold: 'IBMPlexMono_700Bold',
  },
}) as {
  sans: string;
  sansLight: string;
  sansSemiBold: string;
  serif: string;
  rounded: string;
  mono: string;
  monoMedium: string;
  monoBold: string;
};

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Corner treatment. `chamfer` stands in for the 45° cut until react-native-svg
 *  lands; keep edges tight — the instrument look is square, not rounded. */
export const Radii = {
  chamfer: 2,
  panel: 3,
  pill: 2,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
