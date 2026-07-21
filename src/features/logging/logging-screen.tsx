import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OverlayHeader } from '@/components/overlay-header';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { QuickLog } from '@/features/chat/quick-log';
import { DetailedLog } from '@/features/logging/detailed-log';
import type { LoggingMode } from '@/lib/nav-overlay';

/**
 * The logging surface. The Quick/Detailed toggle was removed (F4, item 38): the
 * main Log action is quick-only, and detailed editing is reached from the Journal
 * ("add to this day") or the lab-import nudge. The mode is therefore fixed by the
 * caller's intent (`initialMode`), no in-screen switch.
 */
export function LoggingScreen({
  onClose,
  initialMode,
  seedPrompt,
  initialDate,
}: {
  onClose: () => void;
  initialMode: LoggingMode;
  seedPrompt?: 'macros';
  /** Day (YYYY-MM-DD) to open the detailed log on — the Journal backfill path. */
  initialDate?: string;
}) {
  const { t } = useTranslation();

  return (
    <ThemedView style={styles.container}>
      {/* Keyboard handling (UX audit P1): without this the keyboard covered the
          quick-log input and the lower detailed-form fields on iOS. */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.safe} edges={['top']}>
          <OverlayHeader title={t('logging.title')} onClose={onClose} />
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {initialMode === 'quick' ? (
              <QuickLog seedPrompt={seedPrompt} onDismiss={onClose} />
            ) : (
              <DetailedLog onDismiss={onClose} initialDate={initialDate} />
            )}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  safe: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  scroll: { gap: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.six },
});
