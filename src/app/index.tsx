import { Dashboard } from '@/features/home/dashboard';
import { useStore } from '@/lib/store';

export default function HomeScreen() {
  const { ready } = useStore();
  // Until the local store has loaded, the AnimatedSplashOverlay covers the screen.
  // Onboarding is gated at the root layout (O-01), so this only renders post-onboarding.
  if (!ready) return null;
  return <Dashboard />;
}
