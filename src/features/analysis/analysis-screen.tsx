import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GearIcon } from '@/components/icons';
import { EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { MeasureNextNudge } from '@/features/home/measure-next-nudge';
import { EnergyBalanceCard } from '@/features/insights/energy-balance-card';
import { NarrativeTimeline } from '@/features/insights/narrative-timeline';
import { ReasoningRecap, SignalStack } from '@/features/home/verdict-reasoning';
import { Insights } from '@/features/insights/insights';
import { ChartsSection, MIN_CHECKINS, SummaryCards, UnlockCard } from '@/features/insights/insights-screen';
import { useOverlay } from '@/lib/nav-overlay';
import { useStore } from '@/lib/store';

/**
 * The Analysis tab (redesign R2-C C4) — replaces the old Insights tab. Leads with
 * the verdict decompose (recap + weighted signal stack, promoted from the nested
 * reasoning overlay), then the editable trend charts and the AI analysis. One
 * surface for "why today reads this way" and "how it's trending".
 */
export function AnalysisScreen() {
  const { t } = useTranslation();
  const { openSettings } = useOverlay();
  const { entries } = useStore();

  // Below the AI threshold the Insights card renders null; show the educational
  // unlock state instead so new users learn the feature exists (UX audit P1).
  const checkinCount = Object.keys(entries).length;

  return (
    <ThemedView style={styles.container}>
      {/* Keyboard handling (UX audit P1): the AI ask input sits at the bottom of
          this scroll and used to be covered by the keyboard on iOS. */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
            <MeasureNextNudge variant="section" />
            <SummaryCards />
            <NarrativeTimeline />
            <ChartsSection />
            <EnergyBalanceCard />
            {checkinCount < MIN_CHECKINS ? (
              <UnlockCard remaining={Math.max(1, MIN_CHECKINS - checkinCount)} />
            ) : null}
            {/* AI analysis — self-gates below the check-in threshold. */}
            <Insights />
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  flex: { flex: 1 },
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
