import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Switch, View } from 'react-native';

import { LabeledInput } from '@/components/form';
import { Card, Divider, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import { useStore } from '@/lib/store';

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <ThemedText type="mono" themeColor="textSecondary" style={styles.rowLabel}>
        {label}
      </ThemedText>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: theme.signalGood, false: theme.border }}
      />
    </View>
  );
}

/** Local-reminder preferences (spec 06). Times are 24h "HH:mm". Web shows a
 * note that reminders are mobile-only. */
export function NotificationSettings() {
  const { t } = useTranslation();
  const { profile, setProfile } = useStore();

  return (
    <Card>
      <EngravedLabel>{t('notify.section')}</EngravedLabel>
      <Divider />
      {Platform.OS === 'web' ? (
        <ThemedText type="small" themeColor="textMuted">
          {t('notify.webUnsupported')}
        </ThemedText>
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {t('notify.description')}
          </ThemedText>

          <ToggleRow
            label={t('notify.checkin')}
            value={!!profile.notifyCheckinEnabled}
            onChange={(v) => setProfile({ notifyCheckinEnabled: v })}
          />
          {profile.notifyCheckinEnabled && (
            <LabeledInput
              label={t('notify.time')}
              placeholder="20:00"
              value={profile.notifyCheckinTime ?? '20:00'}
              onChangeText={(v) => setProfile({ notifyCheckinTime: v })}
            />
          )}

          <Divider />
          <ToggleRow
            label={t('notify.doses')}
            value={!!profile.notifyDosesEnabled}
            onChange={(v) => setProfile({ notifyDosesEnabled: v })}
          />
          {profile.notifyDosesEnabled && (
            <LabeledInput
              label={t('notify.time')}
              placeholder="09:00"
              value={profile.notifyDoseTime ?? '09:00'}
              onChangeText={(v) => setProfile({ notifyDoseTime: v })}
            />
          )}

          <Divider />
          <ToggleRow
            label={t('notify.macros')}
            value={!!profile.notifyMacrosEnabled}
            onChange={(v) => setProfile({ notifyMacrosEnabled: v })}
          />
          {profile.notifyMacrosEnabled && (
            <LabeledInput
              label={t('notify.time')}
              placeholder="20:30"
              value={profile.notifyMacroTime ?? '20:30'}
              onChangeText={(v) => setProfile({ notifyMacroTime: v })}
            />
          )}

          <Divider />
          <ToggleRow
            label={t('notify.inventory')}
            value={!!profile.notifyInventoryEnabled}
            onChange={(v) => setProfile({ notifyInventoryEnabled: v })}
          />

          <Divider />
          <ToggleRow
            label={t('notify.photos')}
            value={!!profile.notifyPhotosEnabled}
            onChange={(v) => setProfile({ notifyPhotosEnabled: v })}
          />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  rowLabel: { flex: 1 },
});
