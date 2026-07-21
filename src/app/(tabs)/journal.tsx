import { JournalScreen } from '@/features/journal/journal-screen';
import { useStore } from '@/lib/store';

export default function JournalRoute() {
  const { ready, profile } = useStore();
  if (!ready || !profile.onboardingComplete) return null;
  return <JournalScreen />;
}
