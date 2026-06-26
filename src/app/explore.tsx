import { ProtocolScreen } from '@/features/protocol/protocol-screen';
import { useStore } from '@/lib/store';

export default function ExploreScreen() {
  const { ready } = useStore();
  if (!ready) return null;
  return <ProtocolScreen />;
}
