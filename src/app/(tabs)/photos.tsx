import { PhotosScreen } from '@/features/photos/photos-screen';
import { useStore } from '@/lib/store';

export default function PhotosRoute() {
  const { ready, profile } = useStore();
  if (!ready || !profile.onboardingComplete) return null;
  return <PhotosScreen />;
}
