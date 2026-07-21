import { useLocalSearchParams, useRouter } from 'expo-router';

import { LoggingScreen } from '@/features/logging/logging-screen';
import type { LoggingMode } from '@/lib/nav-overlay';

export default function LoggingRoute() {
  const router = useRouter();
  const { mode, seedPrompt, date } = useLocalSearchParams<{
    mode?: string;
    seedPrompt?: string;
    date?: string;
  }>();
  return (
    <LoggingScreen
      onClose={() => router.back()}
      initialMode={(mode as LoggingMode) ?? 'quick'}
      seedPrompt={seedPrompt === 'macros' ? 'macros' : undefined}
      initialDate={typeof date === 'string' ? date : undefined}
    />
  );
}
