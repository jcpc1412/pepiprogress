import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { SettingsPage } from '@/components/settings-page';
import { NotificationSettings } from '@/features/settings/notification-settings';

export default function NotificationsSettingsRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <SettingsPage title={t('notify.section')} onClose={() => router.back()}>
      <NotificationSettings />
    </SettingsPage>
  );
}
