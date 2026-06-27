import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { SettingsPage } from '@/components/settings-page';
import { PrivacySettings } from '@/features/settings/privacy-settings';

export default function PrivacyRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <SettingsPage title={t('privacy.pageTitle')} onClose={() => router.back()}>
      <PrivacySettings />
    </SettingsPage>
  );
}
