import { PhotosScreen } from '@/features/photos/photos-screen';
import { useStore } from '@/lib/store';

export default function PhotosRoute() {
  const { ready, profile } = useStore();
  // Mirror the Home gate: nothing until the store is ready or onboarding is done.
  if (!ready || !profile.onboardingComplete) return null;
  return <PhotosScreen />;
}
