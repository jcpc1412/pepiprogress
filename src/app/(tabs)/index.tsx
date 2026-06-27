import { Dashboard } from '@/features/home/dashboard';
import { useStore } from '@/lib/store';

export default function HomeScreen() {
  const { ready } = useStore();
  if (!ready) return null;
  return <Dashboard />;
}
