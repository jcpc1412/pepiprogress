import { useRouter } from 'expo-router';

import { VerdictReasoning } from '@/features/home/verdict-reasoning';

export default function ReasoningRoute() {
  const router = useRouter();
  return <VerdictReasoning onClose={() => router.back()} />;
}
