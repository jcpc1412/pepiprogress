import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_700Bold,
} from '@expo-google-fonts/ibm-plex-mono';
import { Inter_300Light, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';

import { StyleSheet, View } from 'react-native';

import '@/i18n';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { InstrumentBackground } from '@/components/instrument-background';
import { AuthProvider } from '@/lib/auth';
import { CloudSync } from '@/lib/cloud-sync';
import { IntegrationSync } from '@/lib/integration-sync';
import { LanguageSync } from '@/lib/language-sync';
import { NotificationManager } from '@/lib/notification-manager';
import { QuickLogRunner } from '@/lib/quick-log-runner';
import { StoreProvider } from '@/lib/store';
import { AppThemeProvider, useResolvedScheme } from '@/lib/theme-provider';
import { useTheme } from '@/hooks/use-theme';

/**
 * Root content, mounted inside all providers so it can read the resolved
 * colour scheme. The Stack is the root navigator; the (tabs) group is its
 * first screen. Overlay screens (settings / logging / add-compound /
 * compound-detail) are sibling screens pushed onto the stack — they render
 * above the tab bar and inherit native back-gesture support automatically.
 */
function RootContent() {
  const scheme = useResolvedScheme();
  const theme = useTheme();

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      {/* Covers the screen until fonts + store are ready. */}
      <AnimatedSplashOverlay />
      {/* Fires local notifications; renders nothing. */}
      <NotificationManager />
      {/* Applies the saved language preference on launch; renders nothing. */}
      <LanguageSync />
      {/* Passively pulls connected health sources on foreground; renders nothing. */}
      <IntegrationSync />
      {/* Parses queued natural-language quick-logs in the background; renders nothing. */}
      <QuickLogRunner />
      {/* Provides SyncStatus context + debounced cloud backup while signed in. */}
      <CloudSync>
        {/* Base canvas + the continuous breathing lattice, mounted once behind
            the whole navigator (redesign §2.3). Screens with a transparent
            container reveal it; opaque legacy screens simply cover it until
            they are rebuilt. */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }]} pointerEvents="none">
          <InstrumentBackground />
        </View>
        {/* Transparent content everywhere so the root breathing lattice shows
            through on every page (R2-A). True modals still paint their own
            opaque ThemedView, so they cover it while presented. */}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
          <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
          {/* Action overlays — modal presentation (slide up, swipe-down to dismiss). */}
          <Stack.Screen name="logging" options={{ presentation: 'modal' }} />
          <Stack.Screen name="add-compound" options={{ presentation: 'modal' }} />
          <Stack.Screen name="compound-detail" options={{ presentation: 'modal' }} />
          {/* Settings + its nested pages — card presentation so they push/pop
              with the native back gesture (settings → me → …). */}
          <Stack.Screen name="settings" />
          <Stack.Screen name="reasoning" />
          <Stack.Screen name="protocol" />
          <Stack.Screen name="me" />
          <Stack.Screen name="notifications-settings" />
          <Stack.Screen name="privacy" />
          <Stack.Screen name="photo-history" />
        </Stack>
      </CloudSync>
    </ThemeProvider>
  );
}

export default function TabLayout() {
  const [fontsLoaded] = useFonts({
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_700Bold,
    Inter_300Light,
    Inter_400Regular,
    Inter_600SemiBold,
  });

  if (!fontsLoaded) return null;

  return (
    <AuthProvider>
      <StoreProvider>
        <AppThemeProvider>
          <RootContent />
        </AppThemeProvider>
      </StoreProvider>
    </AuthProvider>
  );
}
