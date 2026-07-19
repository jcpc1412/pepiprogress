import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/form';
import { GearIcon } from '@/components/icons';
import { Divider, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { ProgressPhotos } from '@/features/photos/progress-photos';
import { useOverlay } from '@/lib/nav-overlay';

/**
 * The Photos tab — reel-first progress timeline + AI analysis (spec 04, R3-D).
 *
 * There is no upfront Face/Body choice (W6-26c): capture routing lives inside
 * the reel-centric ProgressPhotos. The floating "Take a photo" button is lifted
 * here so it can stay pinned above the tab bar, triggering the capture chooser
 * via captureRef.
 */
export function PhotosScreen() {
  const { t } = useTranslation();
  const { openSettings } = useOverlay();
  const captureRef = useRef<(() => void) | null>(null);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.headerBlock}>
          <View>
            <EngravedLabel>{t('photos.progressLabel')}</EngravedLabel>
            <ThemedText type="display">{t('photos.heading')}</ThemedText>
          </View>
          {/* Gear on every tab header (UX audit: header consistency). */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.title')}
            onPress={openSettings}
            hitSlop={8}>
            <GearIcon />
          </Pressable>
        </View>
        <Divider />
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* The generic AI Insights card moved off this tab (UX audit P2): it
              analyzed check-in trends, not photos, and duplicated Analysis. */}
          <ProgressPhotos captureRef={captureRef} />
        </ScrollView>
      </SafeAreaView>

      {/* Floating capture button — pinned above the tab bar, always visible. */}
      <SafeAreaView edges={['bottom']} style={styles.floatingWrapper}>
        <View style={styles.floatingInner}>
          <PrimaryButton
            label={t('photos.open')}
            onPress={() => captureRef.current?.()}
          />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  safe: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  headerBlock: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  scroll: { gap: Spacing.four, paddingBottom: Spacing.six + 64, paddingTop: Spacing.two },
  floatingWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  floatingInner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
});
