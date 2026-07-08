import { useLocalSearchParams, useRouter } from 'expo-router';

import { SignalDetail } from '@/features/analysis/signal-detail';

export default function SignalRoute() {
  const router = useRouter();
  const { metricId } = useLocalSearchParams<{ metricId: string }>();
  if (!metricId) return null;
  return <SignalDetail metricId={metricId} onClose={() => router.back()} />;
}
