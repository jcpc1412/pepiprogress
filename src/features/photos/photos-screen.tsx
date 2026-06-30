import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/form';
import { Divider, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { Insights } from '@/features/insights/insights';
import { ProgressPhotos } from '@/features/photos/progress-photos';
import { type PhotoSession } from '@/lib/store';

/**
 * The Photos tab — progress timeline + AI analysis (spec 04, R3-D).
 *
 * session / capture state are lifted here so the floating "Take a photo" button
 * can live outside the ScrollView and stay pinned above the tab bar.
 */
export function PhotosScreen() {
  const { t } = useTranslation();
  const [session, setSession] = useState<PhotoSession>('face');
  const captureRef = useRef<(() => void) | null>(null);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.headerBlock}>
          <EngravedLabel>{t('photos.progressLabel')}</EngravedLabel>
          <ThemedText type="display">{t('photos.heading')}</ThemedText>
        </View>
        <Divider />
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <ProgressPhotos
            session={session}
            onSessionChange={setSession}
            captureRef={captureRef}
          />
          <Insights />
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
  headerBlock: {},
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
