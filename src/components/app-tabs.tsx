import {
  Tabs,
  TabList,
  TabSlot,
  TabTrigger,
  type TabTriggerSlotProps,
} from 'expo-router/ui';
import { type ReactNode, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CameraIcon, ChatIcon, HomeIcon, InsightsIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IconCmp = (props: { size?: number; color?: ThemeColor }) => ReactNode;

/**
 * Custom CyberLife tab bar (redesign R2): 64px, engraved top groove, mono
 * uppercase labels, icon at 20px. Active = accent, inactive = textSecondary @
 * 0.5. One cross-platform implementation (replaces the native + web split).
 */
export default function AppTabs() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs>
      <TabSlot />
      {/* TabTriggers must be DIRECT children of the element TabList adopts —
          expo-router/ui discovers the navigator's screens from them. The groove
          + highlight ride on the bar's borders so no wrapper View is needed. */}
      <TabList asChild>
        <View
          style={StyleSheet.flatten([
            styles.bar,
            {
              backgroundColor: theme.background,
              borderTopColor: theme.border,
              paddingBottom: insets.bottom,
              height: BAR_HEIGHT + insets.bottom,
            },
          ])}>
          <TabTrigger name="index" href="/" asChild>
            <TabButton icon={HomeIcon} label={t('tabs.today')} />
          </TabTrigger>
          <TabTrigger name="photos" href="/photos" asChild>
            <TabButton icon={CameraIcon} label={t('tabs.photos')} />
          </TabTrigger>
          <TabTrigger name="pepi" href="/pepi" asChild>
            <TabButton icon={ChatIcon} label={t('tabs.pepi')} />
          </TabTrigger>
          {/* Insights kept for now (owner: do not demote yet). Protocol config
              moved into Settings (redesign §4.5). */}
          <TabTrigger name="insights" href="/insights" asChild>
            <TabButton icon={InsightsIcon} label={t('tabs.insights')} />
          </TabTrigger>
        </View>
      </TabList>
    </Tabs>
  );
}

const TabButton = forwardRef<View, TabTriggerSlotProps & { icon: IconCmp; label: string }>(
  function TabButton({ icon: Icon, label, isFocused, ...props }, ref) {
    const color: ThemeColor = isFocused ? 'accent' : 'textSecondary';
    return (
      <Pressable
        ref={ref}
        {...props}
        accessibilityRole="button"
        accessibilityState={{ selected: !!isFocused }}
        style={[styles.item, !isFocused && styles.itemInactive]}>
        <Icon size={20} color={color} />
        <ThemedText type="label" themeColor={color} style={styles.label}>
          {label}
        </ThemedText>
      </Pressable>
    );
  },
);

const BAR_HEIGHT = 64;

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.one },
  itemInactive: { opacity: 0.5 },
  label: { fontSize: 9 },
});
