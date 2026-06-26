import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BackIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/** Back affordance + title for a full-screen overlay (Settings/Logging/Add-compound). */
export function OverlayHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        onPress={onClose}
        hitSlop={8}>
        <BackIcon />
      </Pressable>
      <ThemedText type="display">{title}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
});
