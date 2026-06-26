import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { LabeledInput, PrimaryButton, ScaleSelector } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { isVisualSymptom } from '@/lib/photo-cadence';
import { useStore, type SymptomEvent } from '@/lib/store';

function formatWhen(iso: string, locale: string): string {
  const d = new Date(iso);
  return d.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Quick-add + recent list for discrete side-effect/symptom events (spec 03). */
export function SymptomEvents() {
  const { t, i18n } = useTranslation();
  const { symptomEvents, addSymptomEvent, deleteSymptomEvent } = useStore();

  const [type, setType] = useState('');
  const [severity, setSeverity] = useState<number | undefined>();
  const [duration, setDuration] = useState('');
  const [note, setNote] = useState('');
  const [photoSuggestion, setPhotoSuggestion] = useState(false);

  const reset = () => {
    setType('');
    setSeverity(undefined);
    setDuration('');
    setNote('');
  };

  const submit = () => {
    if (!type.trim()) return;
    const minutes = parseInt(duration, 10);
    addSymptomEvent({
      type: type.trim(),
      onsetAt: new Date().toISOString(),
      severity,
      durationMinutes: Number.isFinite(minutes) ? minutes : undefined,
      note: note.trim() || undefined,
    });
    if (isVisualSymptom(type.trim())) {
      setPhotoSuggestion(true);
    }
    reset();
  };

  const recent = symptomEvents.slice(0, 5);

  return (
    <View style={styles.container}>
      <ThemedText type="smallBold">{t('symptoms.title')}</ThemedText>

      <LabeledInput
        label={t('symptoms.type')}
        placeholder={t('symptoms.typePlaceholder')}
        value={type}
        onChangeText={setType}
      />

      <View style={styles.field}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {t('symptoms.severity')}
        </ThemedText>
        <ScaleSelector value={severity} onChange={setSeverity} />
      </View>

      <LabeledInput
        label={t('symptoms.duration')}
        placeholder={t('symptoms.durationPlaceholder')}
        keyboardType="number-pad"
        value={duration}
        onChangeText={setDuration}
      />

      <LabeledInput
        label={t('fields.note')}
        multiline
        value={note}
        onChangeText={setNote}
      />

      <PrimaryButton label={t('symptoms.log')} onPress={submit} disabled={!type.trim()} />

      {photoSuggestion && (
        <View style={styles.suggestion}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.suggestionText}>
            {t('symptoms.photoSuggestion')}
          </ThemedText>
          <Pressable accessibilityRole="button" onPress={() => setPhotoSuggestion(false)}>
            <ThemedText type="small" themeColor="textMuted">
              {t('symptoms.photoSuggestionDismiss')}
            </ThemedText>
          </Pressable>
        </View>
      )}

      {recent.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('symptoms.empty')}
        </ThemedText>
      ) : (
        <View style={styles.list}>
          {recent.map((e: SymptomEvent) => (
            <View key={e.id} style={styles.row}>
              <View style={styles.rowText}>
                <ThemedText type="smallBold">{e.type}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatWhen(e.onsetAt, i18n.language)}
                  {e.severity ? ` · ${t('symptoms.severityShort', { value: e.severity })}` : ''}
                  {e.durationMinutes ? ` · ${t('symptoms.minutesShort', { value: e.durationMinutes })}` : ''}
                </ThemedText>
              </View>
              <Pressable accessibilityRole="button" onPress={() => deleteSymptomEvent(e.id)}>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('common.cancel')}
                </ThemedText>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  field: { gap: Spacing.two },
  list: { gap: Spacing.two, marginTop: Spacing.one },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  rowText: { flex: 1, gap: Spacing.half },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: 4,
    borderLeftWidth: 2,
  },
  suggestionText: { flex: 1 },
});
