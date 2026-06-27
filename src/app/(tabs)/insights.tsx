import { InsightsScreen } from '@/features/insights/insights-screen';
import { useStore } from '@/lib/store';

export default function InsightsRoute() {
  const { ready, profile } = useStore();
  if (!ready || !profile.onboardingComplete) return null;
  return <InsightsScreen />;
}
