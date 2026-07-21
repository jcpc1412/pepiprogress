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
    // legacy (mapped) — kept in sync with the semantic tokens below (D-01)
    text: '#1A1918',
    background: '#EDEBE7',
    backgroundElement: '#FBFAF8', // raised surface — now lighter than bg so cards lift
    backgroundSelected: '#DBD9D4', // sunken surface — darker than bg so wells recede
    textSecondary: '#5A5752', // ~5.7:1 (AA)

    // semantic (D-01 contrast pass)
    textMuted: '#66625D', // ~4.7:1 on background — AA body
    label: '#6E6A65', // engraved panel labels — ~4:1 (large/label tier)
    surfaceRaised: '#FBFAF8', // lighter than bg → embossed card
    surfaceSunken: '#DBD9D4', // darker than bg → inset well
    numeral: '#3A3834', // primary metric ink
    border: 'rgba(0,0,0,0.12)', // carved groove — shadow side
    borderHighlight: 'rgba(255,255,255,0.80)', // carved groove — lit side
    engrave: 'rgba(255,255,255,0.85)', // label text-shadow (lit edge below)
    accent: '#2A2825', // solid control / selected
    onAccent: '#FBFAF8',
    structure: 'rgba(26,25,24,0.05)', // faint diagonal lattice lines
    lattice: '#6E8C7E', // breathing molecular-lattice stroke (applied at low opacity)

    // signal — ONLY for data semantics (deltas, status). Three-state certainty
    // scale for the verdict: good / watch / bad (redesign).
    signalGood: '#2B6947',
    signalWatch: '#8A6A2C',
    signalBad: '#7A2E2E',
    signalGoodBg: 'rgba(43,105,71,0.10)',
    signalWatchBg: 'rgba(138,106,44,0.12)',
    signalBadBg: 'rgba(122,46,46,0.10)',
  },
  // ── AT NIGHT ──────────────────────────────────────────────────────────────
  dark: {
    // legacy (mapped) — kept in sync with the semantic tokens below (D-01)
    // R2-A: near-black canvas (mockup --bg #0A0B0C), panels carry the dark grey.
    text: '#E4E1DB', // more pop
    background: '#0A0B0C', // near-black base (was warm #121110)
    backgroundElement: '#14171A', // raised panel — dark grey, lifts above the black
    backgroundSelected: '#070809', // sunken well — recedes below the base
    textSecondary: '#9C9892', // ~6.4:1

    // semantic (D-01 contrast pass)
    textMuted: '#837F79', // ~4.8:1 on background — AA body
    label: '#787470', // engraved panel labels — ~4:1
    surfaceRaised: '#14171A',
    surfaceSunken: '#070809',
    numeral: '#B0ACA6',
    border: 'rgba(255,255,255,0.10)', // deepened groove
    borderHighlight: 'rgba(0,0,0,0.50)',
    engrave: 'rgba(0,0,0,0.60)',
    accent: '#E8E5DF',
    onAccent: '#131210',
    structure: 'rgba(212,209,203,0.035)',
    lattice: '#7CA993', // breathing molecular-lattice stroke (applied at low opacity)

    signalGood: '#3A8A58',
    signalWatch: '#B5883C',
    signalBad: '#9A3535',
    signalGoodBg: 'rgba(58,138,88,0.12)',
    signalWatchBg: 'rgba(181,136,60,0.14)',
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

/** Corner treatment. Edges are chamfered (octagonal), not rounded — the
 *  instrument look. `Chamfer` sizes feed the SVG <ChamferBox> (px corner cut);
 *  `Radii` are tight fallbacks for plain views. */
export const Radii = {
  chamfer: 2,
  panel: 3,
  pill: 2,
} as const;

/** Octagonal corner-cut sizes (px), matching the design board. */
export const Chamfer = {
  pill: 4,
  chip: 6,
  button: 6,
  card: 8,
  hero: 10,
} as const;

/**
 * Motion tokens (Wave 7 item 35, F2). One vocabulary for durations + easing so
 * every screen animates on the same rhythm. Curves are ease-OUT (decelerating):
 * no bounce, no elastic — the instrument register is precise, not playful.
 * Durations are milliseconds; `easing` values are cubic-bezier control points
 * `[x1, y1, x2, y2]` consumed by `src/lib/motion.ts` (reanimated `Easing.bezier`).
 * Do not animate layout props directly — use the reanimated presets built on these.
 */
export const Motion = {
  duration: {
    instant: 90, // micro-feedback: press scale, chip select
    fast: 160, // small elements entering/leaving, toasts
    base: 240, // standard transitions + layout shifts (the default)
    slow: 360, // large surfaces, screen-level reveals
  },
  /** cubic-bezier control points [x1, y1, x2, y2]. */
  easing: {
    standard: [0.22, 1, 0.36, 1], // ease-out-quint — the default decelerate
    decelerate: [0.16, 1, 0.3, 1], // ease-out-expo — big entrances land softly
    exit: [0.4, 0, 1, 1], // ease-in — leaving elements accelerate away
  },
  /** Press-down scale for tappable surfaces (centralizes the ad-hoc 0.97). */
  pressScale: 0.97,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
