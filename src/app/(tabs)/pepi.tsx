import { PepiScreen } from '@/features/chat/pepi-screen';
import { useStore } from '@/lib/store';

export default function PepiRoute() {
  const { ready, profile } = useStore();
  if (!ready || !profile.onboardingComplete) return null;
  return <PepiScreen />;
}
