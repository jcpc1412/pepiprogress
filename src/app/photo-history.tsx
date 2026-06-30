import { useRouter } from 'expo-router';

import { PhotoHistoryScreen } from '@/features/photos/photo-history-screen';

export default function PhotoHistoryRoute() {
  const router = useRouter();
  return <PhotoHistoryScreen onClose={() => router.back()} />;
}
