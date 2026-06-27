import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SegmentedControl } from '@/components/form';
import { OverlayHeader } from '@/components/overlay-header';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { QuickLog } from '@/features/chat/quick-log';
import { DetailedLog } from '@/features/logging/detailed-log';
import type { LoggingMode } from '@/lib/nav-overlay';
import { useState } from 'react';

/** The logging surface (H-03): Quick (chat) + Detailed (form) with parity. */
export function LoggingScreen({
  onClose,
  initialMode,
  seedPrompt,
  quickOnly,
}: {
  onClose: () => void;
  initialMode: LoggingMode;
  seedPrompt?: 'macros';
  /** When true (e.g. opened from Protocol's Log Dose), hide the Quick/Detailed
   * toggle and stay in quick mode. */
  quickOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<LoggingMode>(initialMode);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <OverlayHeader title={t('logging.title')} onClose={onClose} />
        {!quickOnly && (
          <SegmentedControl
            options={[
              { value: 'quick', label: t('logging.quick') },
              { value: 'detailed', label: t('logging.detailed') },
            ]}
            value={mode}
            onChange={(v) => setMode(v as LoggingMode)}
          />
        )}
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {mode === 'quick' ? (
            <QuickLog seedPrompt={seedPrompt} onDismiss={onClose} />
          ) : (
            <DetailedLog onDismiss={onClose} />
          )}
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
  scroll: { gap: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.six },
});
