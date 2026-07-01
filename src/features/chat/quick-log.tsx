import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { LabeledInput, OptionChip, PrimaryButton } from '@/components/form';
import { EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useStore } from '@/lib/store';

/** How long the on-button confirmation shows before the sheet closes. */
const CONFIRM_MS = 650;

/**
 * Natural-language quick-log input (spec 13). Fire-and-forget: submitting queues
 * the text for background parsing (quick-log-runner), flashes a confirmation on
 * the button, and closes — the user never waits on the network. Progress + the
 * result surface in the Today dashboard's distillation card. Failures are saved
 * and retried automatically.
 */
export function QuickLog({
  seedPrompt,
  onDismiss,
}: { seedPrompt?: 'macros'; onDismiss?: () => void } = {}) {
  const { t } = useTranslation();
  const { i18n } = useTranslation();
  const { enqueueQuickLog } = useStore();
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const placeholder = seedPrompt === 'macros' ? t('quicklog.macroSeed') : t('quicklog.placeholder');

  const submit = () => {
    const input = text.trim();
    if (!input || submitted) return;
    enqueueQuickLog(input, i18n.language);
    setSubmitted(true);
    setText('');
    // Let the confirmation register, then hand back to the caller (closes the sheet).
    setTimeout(() => onDismiss?.(), CONFIRM_MS);
  };

  const appendSuggestion = (label: string) =>
    setText((cur) => (cur.trim() ? `${cur.trim()}, ${label}` : label));

  return (
    <View style={styles.container}>
      <LabeledInput
        label={t('quicklog.title')}
        placeholder={placeholder}
        value={text}
        onChangeText={setText}
        multiline
        style={styles.inputWell}
        onSubmitEditing={submit}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {t('quicklog.voiceHint')}
      </ThemedText>

      {/* Quick-add suggestion chips — append to the input */}
      <EngravedLabel>{t('quicklog.suggestionsLabel')}</EngravedLabel>
      <View style={styles.suggestions}>
        {(
          [
            'quicklog.sugSleep',
            'quicklog.sugWeight',
            'quicklog.sugEnergy',
            'quicklog.sugDose',
            'quicklog.sugSymptom',
          ] as const
        ).map((key) => (
          <OptionChip
            key={key}
            label={t(key)}
            selected={false}
            onPress={() => appendSuggestion(t(key))}
          />
        ))}
      </View>

      <PrimaryButton
        label={submitted ? t('quicklog.distilling') : t('quicklog.parseApply')}
        onPress={submit}
        disabled={submitted || !text.trim()}
      />

      {/* Reassure the user their entry is being processed in the background. */}
      <ThemedText type="monoSm" themeColor="textMuted">
        {t('quicklog.backgroundHint')}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  inputWell: { minHeight: 120, textAlignVertical: 'top' },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
