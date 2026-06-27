import { useRouter } from 'expo-router';

import { AddCompoundScreen } from '@/features/protocol/add-compound-screen';

export default function AddCompoundRoute() {
  const router = useRouter();
  return <AddCompoundScreen onClose={() => router.back()} />;
}
