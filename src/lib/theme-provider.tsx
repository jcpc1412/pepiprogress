/**
 * Resolves the active theme from the user's preference (D-01) + the device
 * scheme, and exposes both the palette and the resolved scheme name. `'auto'`
 * follows the device; `'light'`/`'dark'` force it.
 *
 * A dedicated context (rather than each themed component reading the whole
 * store) keeps re-renders cheap: only a preference/scheme change repaints.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { useStore } from '@/lib/store';

type ResolvedScheme = 'light' | 'dark';
type Palette = (typeof Colors)[ResolvedScheme];

type ThemeContextValue = {
  scheme: ResolvedScheme;
  theme: Palette;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const { profile } = useStore();
  const pref = profile.themePreference ?? 'auto';

  const value = useMemo<ThemeContextValue>(() => {
    const scheme: ResolvedScheme = pref === 'auto' ? (system === 'dark' ? 'dark' : 'light') : pref;
    return { scheme, theme: Colors[scheme] };
  }, [pref, system]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** The active palette. Falls back to light if used outside the provider. */
export function useTheme() {
  return useContext(ThemeContext)?.theme ?? Colors.light;
}

/** The resolved scheme name ('light' | 'dark') — for the expo-router navigation
 *  theme and the native tab bar colors. */
export function useResolvedScheme(): ResolvedScheme {
  return useContext(ThemeContext)?.scheme ?? 'light';
}
