import { DailyCheckin } from '@/features/checkin/daily-checkin';
import { Onboarding } from '@/features/onboarding/onboarding';
import { useStore } from '@/lib/store';

export default function HomeScreen() {
  const { ready, profile } = useStore();
  // Until the local store has loaded, the AnimatedSplashOverlay covers the screen.
  if (!ready) return null;
  return profile.onboardingComplete ? <DailyCheckin /> : <Onboarding />;
}
