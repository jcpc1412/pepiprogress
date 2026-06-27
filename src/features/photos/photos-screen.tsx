import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Divider, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { Insights } from '@/features/insights/insights';
import { ProgressPhotos } from '@/features/photos/progress-photos';

/**
 * The Photos tab — the product's wedge as a first-class destination (spec 04).
 * The progress timeline + AI photo analysis, with the data-grounded AI insights
 * surface alongside. (The dedicated Insights tab adds summary cards + trend
 * charts on top of this — redesign R2.)
 */
export function PhotosScreen() {
  const { t } = useTranslation();
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.headerBlock}>
          <EngravedLabel>{t('photos.progressLabel')}</EngravedLabel>
          <ThemedText type="display">{t('photos.heading')}</ThemedText>
        </View>
        <Divider />
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
    gap: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  headerBlock: {},
  scroll: { gap: Spacing.four, paddingBottom: Spacing.six, paddingTop: Spacing.two },
});
