import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Divider, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { AskPepi } from '@/features/ask/ask-pepi';
import { QuickLog } from '@/features/chat/quick-log';

/**
 * Pepi (redesign §4.3) — the conversational surface. AI is invisible
 * infrastructure here: the user logs in one box (QuickLog, background parse) and
 * asks about their own data (AskPepi, deterministic query bar). Named "Pepi",
 * never "AI" or "Chat" (owner decision 2026-07-06).
 */
export function PepiScreen() {
  const { t } = useTranslation();
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <EngravedLabel>{t('tabs.pepi')}</EngravedLabel>
        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          {t('pepi.subtitle')}
        </ThemedText>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Card>
            <QuickLog />
          </Card>
          <Divider />
          <AskPepi />
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
    gap: Spacing.one,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  subtitle: { marginBottom: Spacing.two },
  scroll: { gap: Spacing.three, paddingTop: Spacing.two, paddingBottom: Spacing.six },
});
