import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChevronRightIcon } from '@/components/icons';
import { OverlayHeader } from '@/components/overlay-header';
import { Card } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

/** Full-screen scaffold for a nested settings page (R3-B). Mirrors the overlay
 *  chrome (safe-area top + back header + hidden scrollbar). */
export function SettingsPage({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <OverlayHeader title={title} onClose={onClose} />
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** A tappable navigation row (label + optional sublabel + chevron) used on the
 *  main Settings screen to push nested pages. */
export function SettingsRow({
  label,
  sublabel,
  onPress,
}: {
  label: string;
  sublabel?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}>
      <Card style={styles.row}>
        <View style={styles.rowText}>
          <ThemedText type="mono">{label}</ThemedText>
          {sublabel ? (
            <ThemedText type="monoSm" themeColor="textMuted">
              {sublabel}
            </ThemedText>
          ) : null}
        </View>
        <ChevronRightIcon color="textSecondary" />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  scroll: { gap: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.six },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  rowText: { gap: 2, flex: 1 },
  pressed: { opacity: 0.6 },
});
