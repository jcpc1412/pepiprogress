import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { SettingsPage } from '@/components/settings-page';
import { MeSettings } from '@/features/settings/me-settings';

export default function MeRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <SettingsPage title={t('me.title')} onClose={() => router.back()}>
      <MeSettings />
    </SettingsPage>
  );
}
