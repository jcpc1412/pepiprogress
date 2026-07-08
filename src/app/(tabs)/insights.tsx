import { AnalysisScreen } from '@/features/analysis/analysis-screen';
import { useStore } from '@/lib/store';

// Route id stays `insights` for stability; the surface is now Analysis (R2-C C4).
export default function AnalysisRoute() {
  const { ready, profile } = useStore();
  if (!ready || !profile.onboardingComplete) return null;
  return <AnalysisScreen />;
}
