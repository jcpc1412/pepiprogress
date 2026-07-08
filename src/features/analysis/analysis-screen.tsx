import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GearIcon } from '@/components/icons';
import { EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { ReasoningRecap, SignalStack } from '@/features/home/verdict-reasoning';
import { Insights } from '@/features/insights/insights';
import { ChartsSection, SummaryCards } from '@/features/insights/insights-screen';
import { useOverlay } from '@/lib/nav-overlay';

/**
 * The Analysis tab (redesign R2-C C4) — replaces the old Insights tab. Leads with
 * the verdict decompose (recap + weighted signal stack, promoted from the nested
 * reasoning overlay), then the editable trend charts and the AI analysis. One
 * surface for "why today reads this way" and "how it's trending".
 */
export function AnalysisScreen() {
  const { t } = useTranslation();
  const { openSettings } = useOverlay();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <View>
            <EngravedLabel>{t('tabs.analysis')}</EngravedLabel>
            <ThemedText type="display">{t('analysis.heading')}</ThemedText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.title')}
            onPress={openSettings}
            hitSlop={8}>
            <GearIcon />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <ReasoningRecap />
          <SignalStack />
          <SummaryCards />
          <ChartsSection />
          {/* AI analysis — self-gates below the check-in threshold. */}
          <Insights />
        </ScrollView>
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
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  scroll: { gap: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.six },
});
