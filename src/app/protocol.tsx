import { useRouter } from 'expo-router';

import { ProtocolScreen } from '@/features/protocol/protocol-screen';

/** Protocol config, now reached from Settings (redesign §4.5) instead of a tab. */
export default function ProtocolRoute() {
  const router = useRouter();
  return <ProtocolScreen onClose={() => router.back()} />;
}
