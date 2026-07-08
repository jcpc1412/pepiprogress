import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { SettingsPage } from '@/components/settings-page';
import { WhatILogSettings } from '@/features/settings/what-i-log-settings';

export default function WhatILogRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <SettingsPage title={t('whatILog.title')} onClose={() => router.back()}>
      <WhatILogSettings />
    </SettingsPage>
  );
}
