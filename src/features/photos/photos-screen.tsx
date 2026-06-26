import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { Insights } from '@/features/insights/insights';
import { ProgressPhotos } from '@/features/photos/progress-photos';

/**
 * The Photos tab — the product's wedge as a first-class destination (spec 04).
 * Co-locates the visual progress timeline with the AI analysis of your own data,
 * so "your progress" (visual + analytical) lives in one place rather than buried
 * mid-scroll inside the daily check-in.
 */
export function PhotosScreen() {
  const { t } = useTranslation();
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ThemedText type="display">{t('photos.title')}</ThemedText>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <ProgressPhotos />
          <Insights />
        </ScrollView>
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
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  scroll: { gap: Spacing.four, paddingBottom: Spacing.six },
});
