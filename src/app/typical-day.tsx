import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { SettingsPage } from '@/components/settings-page';
import { TypicalDaySettings } from '@/features/settings/typical-day-settings';

export default function TypicalDayRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <SettingsPage title={t('typical.settingsTitle')} onClose={() => router.back()}>
      <TypicalDaySettings />
    </SettingsPage>
  );
}
