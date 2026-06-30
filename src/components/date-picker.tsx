import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** YYYY-MM-DD string ↔ Date helpers */
function toDate(iso: string | undefined): Date {
  if (!iso) return new Date();
  const d = new Date(iso + 'T00:00:00');
  return Number.isFinite(d.getTime()) ? d : new Date();
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Cross-platform date selector (R3-C).
 * - iOS / Android: shows a Pressable pill that opens the native DateTimePicker.
 *   On iOS the picker appears inline in a modal sheet; on Android it opens the
 *   system calendar dialog directly.
 * - Web: falls back to a plain text input (type="date" via TextInput).
 *
 * Calls `onChange(isoDate)` with a YYYY-MM-DD string.
 */
export function DatePicker({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string | undefined;
  onChange: (iso: string) => void;
  label?: string;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.field}>
        {label ? <ThemedText type="label">{label}</ThemedText> : null}
        <Pressable
          style={[styles.pill, { backgroundColor: theme.surfaceSunken, borderColor: theme.border }]}>
          <input
            type="date"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            style={{
              border: 'none',
              background: 'transparent',
              color: theme.text,
              fontFamily: 'monospace',
              fontSize: 15,
              width: '100%',
              outline: 'none',
            }}
          />
        </Pressable>
      </View>
    );
  }

  const date = toDate(value);
  const display = value
    ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : placeholder ?? t('protocol.startedAtPlaceholder');

  return (
    <View style={styles.field}>
      {label ? <ThemedText type="label">{label}</ThemedText> : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: theme.surfaceSunken, borderColor: theme.border },
          pressed && { opacity: 0.7 },
        ]}>
        <ThemedText type="mono" themeColor={value ? 'text' : 'textMuted'}>
          {display}
        </ThemedText>
      </Pressable>

      {Platform.OS === 'android' && open && (
        <DateTimePicker
          mode="date"
          value={date}
          maximumDate={new Date()}
          onChange={(_, selected) => {
            setOpen(false);
            if (selected) onChange(toISO(selected));
          }}
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <View style={styles.backdrop}>
            <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: theme.surfaceRaised }]}>
              <View style={styles.sheetHeader}>
                <Pressable onPress={() => setOpen(false)}>
                  <ThemedText type="label" themeColor="accent">{t('common.done')}</ThemedText>
                </Pressable>
              </View>
              <DateTimePicker
                mode="date"
                display="spinner"
                value={date}
                maximumDate={new Date()}
                themeVariant="light"
                onChange={(_, selected) => {
                  if (selected) onChange(toISO(selected));
                }}
              />
            </SafeAreaView>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.one },
  pill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radii.chamfer,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 44,
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingBottom: Spacing.four,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: Spacing.three,
  },
});
