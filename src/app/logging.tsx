import { useLocalSearchParams, useRouter } from 'expo-router';

import { LoggingScreen } from '@/features/logging/logging-screen';
import type { LoggingMode } from '@/lib/nav-overlay';

export default function LoggingRoute() {
  const router = useRouter();
  const { mode, seedPrompt, quickOnly } = useLocalSearchParams<{
    mode?: string;
    seedPrompt?: string;
    quickOnly?: string;
  }>();
  return (
    <LoggingScreen
      onClose={() => router.back()}
      initialMode={(mode as LoggingMode) ?? 'quick'}
      seedPrompt={seedPrompt === 'macros' ? 'macros' : undefined}
      quickOnly={quickOnly === '1'}
    />
  );
}
