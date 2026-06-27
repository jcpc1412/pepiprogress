import { useTranslation } from 'react-i18next';

import { SegmentedControl } from '@/components/form';
import { Card, Divider, EngravedLabel } from '@/components/surface';
import { useStore, type ThemePreference } from '@/lib/store';

const OPTIONS: ThemePreference[] = ['light', 'dark', 'auto'];

/** Light / Dark / Auto override (D-01). 'auto' follows the device setting. */
export function AppearanceSettings() {
  const { t } = useTranslation();
  const { profile, setProfile } = useStore();
  const value = profile.themePreference ?? 'auto';

  return (
    <Card>
      <EngravedLabel>{t('appearance.section')}</EngravedLabel>
      <Divider />
      <SegmentedControl
        options={OPTIONS.map((o) => ({ value: o, label: t(`appearance.${o}` as const) }))}
        value={value}
        onChange={(v) => setProfile({ themePreference: v as ThemePreference })}
      />
    </Card>
  );
}
