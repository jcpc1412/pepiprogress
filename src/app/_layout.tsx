import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_700Bold,
} from '@expo-google-fonts/ibm-plex-mono';
import { Inter_300Light, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';

import '@/i18n';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { Onboarding } from '@/features/onboarding/onboarding';
import { AuthProvider } from '@/lib/auth';
import { CloudSync } from '@/lib/cloud-sync';
import { MacroReminderHandler } from '@/lib/macro-reminder-handler';
import { OverlayProvider } from '@/lib/nav-overlay';
import { NotificationManager } from '@/lib/notification-manager';
import { StoreProvider, useStore } from '@/lib/store';
import { AppThemeProvider, useResolvedScheme } from '@/lib/theme-provider';

/**
 * Root content, mounted inside StoreProvider + AppThemeProvider so it can read
 * the resolved scheme and gate onboarding. Onboarding renders *instead of* the
 * tab navigator (O-01) so the tab bar can't be reached mid-onboarding.
 */
function RootContent() {
  const scheme = useResolvedScheme();
  const { ready, profile } = useStore();

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {/* Local reminders: check-in, doses, photo milestones, low stock (renders nothing). */}
      <NotificationManager />
      {/* Continuous cloud backup while signed in; provides sync status to the UI. */}
      <CloudSync>
        {!ready ? null : profile.onboardingComplete ? (
          <OverlayProvider>
            <AppTabs />
            <MacroReminderHandler />
          </OverlayProvider>
        ) : (
          <Onboarding />
        )}
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

  // Splash screen stays visible until fonts are loaded.
  // On web, useFonts resolves immediately so this is never null.
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
