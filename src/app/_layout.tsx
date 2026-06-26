import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_700Bold,
} from '@expo-google-fonts/ibm-plex-mono';
import { Inter_300Light, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import '@/i18n';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { AuthProvider } from '@/lib/auth';
import { CloudSync } from '@/lib/cloud-sync';
import { NotificationManager } from '@/lib/notification-manager';
import { StoreProvider } from '@/lib/store';

export default function TabLayout() {
  const colorScheme = useColorScheme();
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
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AnimatedSplashOverlay />
          {/* Local reminders: check-in, doses, photo milestones, low stock (renders nothing). */}
          <NotificationManager />
          {/* Continuous cloud backup while signed in; also provides sync status to the UI.
              Wraps the navigator so screens can read useSyncStatus(). Onboarding is gated
              inside the Home tab (src/app/index.tsx) so the tab navigator stays mounted. */}
          <CloudSync>
            <AppTabs />
          </CloudSync>
        </ThemeProvider>
      </StoreProvider>
    </AuthProvider>
  );
}
