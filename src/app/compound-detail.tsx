import { useLocalSearchParams, useRouter } from 'expo-router';

import { CompoundDetailScreen } from '@/features/protocol/compound-detail-screen';

export default function CompoundDetailRoute() {
  const router = useRouter();
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  return <CompoundDetailScreen itemId={itemId ?? ''} onClose={() => router.back()} />;
}
