import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LabeledInput, PrimaryButton, TextButton } from '@/components/form';
import { Divider, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { compoundBySlug } from '@/data/compound-catalog';
import { useResolvedScheme, useTheme } from '@/hooks/use-theme';
import { localDateKey } from '@/lib/dates';
import {
  clampToNow,
  combineDateTime,
  isDoseInputValid,
  parseDoseInput,
  protocolChangePrompt,
} from '@/lib/dose-draft';
import type { ProtocolItem } from '@/lib/store';

/** What the drawer hands back when the user confirms. */
export type DoseDraftResult = {
  dose?: number;
  doseUnit?: string;
  takenAt: string;
  /** True when the user chose to carry the new amount into their protocol.
   *  Only ever true when they were asked, and they were only asked when the
   *  amount actually changed. */
  applyToProtocol: boolean;
};

function compoundName(slug: string | undefined): string {
  return (slug && compoundBySlug(slug)?.canonicalName) || slug || '';
}

/**
 * Dose logging drawer (W7-34) — the default dose-logging surface, replacing
 * one-tap-to-confirm.
 *
 * One tap was fast but assumed every dose matches the protocol exactly, taken
 * at the moment you happened to open the app. Neither holds: people log late,
 * and they adjust. The drawer makes the two things that actually vary (how
 * much, and when) editable in place, while keeping confirm a single tap away
 * for the common case where the defaults are already right.
 *
 * The protocol-change question is asked *after* the dose is safely logged, and
 * only when the amount really differs, so the logging never depends on
 * answering it.
 */
export function DoseDrawer({
  item,
  visible,
  onCancel,
  onConfirm,
}: {
  item: ProtocolItem | null;
  visible: boolean;
  onCancel: () => void;
  onConfirm: (result: DoseDraftResult) => void;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const scheme = useResolvedScheme();

  // Seeded from the protocol, then owned by the user. The caller keys this
  // component by item id, so each open remounts with fresh defaults and a
  // previous edit can never leak into the next dose.
  const [doseText, setDoseText] = useState(() => (item?.dose != null ? String(item.dose) : ''));
  const [dateKey, setDateKey] = useState(() => localDateKey());
  const [time, setTime] = useState(() => new Date());
  const [picker, setPicker] = useState<'none' | 'date' | 'time'>('none');
  // The protocol-change question, raised inline rather than as a system alert
  // so it reads as part of the same flow.
  const [askProtocol, setAskProtocol] = useState<number | null>(null);

  if (!item) return null;

  const valid = isDoseInputValid(doseText);
  const takenAt = clampToNow(combineDateTime(dateKey, time.getHours(), time.getMinutes()));

  const dateLabel = new Date(takenAt).toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'short',
  });
  const timeLabel = new Date(takenAt).toLocaleTimeString(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
  });

  const finish = (applyToProtocol: boolean) => {
    onConfirm({
      dose: parseDoseInput(doseText) ?? undefined,
      doseUnit: item.doseUnit,
      takenAt,
      applyToProtocol,
    });
  };

  const submit = () => {
    if (!valid) return;
    const prompt = protocolChangePrompt(doseText, item.dose);
    // Asking happens in the drawer, but the dose is logged either way: the
    // question is about the protocol's future, not about this dose.
    if (prompt.ask && prompt.newDose !== undefined) {
      setAskProtocol(prompt.newDose);
      return;
    }
    finish(false);
  };

  const pickerValue = new Date(takenAt);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityRole="button" />
      <SafeAreaView edges={['bottom']} style={styles.sheetWrap} pointerEvents="box-none">
        <View style={[styles.sheet, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}>
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: theme.border }]} />
          </View>

          <EngravedLabel>{t('dose.drawerTitle')}</EngravedLabel>
          <ThemedText type="display">{compoundName(item.compoundSlug)}</ThemedText>

          {askProtocol === null ? (
            <>
              <LabeledInput
                label={item.doseUnit ? t('dose.amountWithUnit', { unit: item.doseUnit }) : t('dose.amount')}
                value={doseText}
                onChangeText={setDoseText}
                keyboardType="decimal-pad"
                placeholder={t('dose.amountPlaceholder')}
                error={valid ? undefined : t('dose.amountInvalid')}
              />

              <View style={styles.whenRow}>
                <View style={styles.whenCol}>
                  <ThemedText type="label">{t('dose.date')}</ThemedText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('dose.date')} ${dateLabel}`}
                    onPress={() => setPicker('date')}
                    style={({ pressed }) => [
                      styles.pill,
                      { backgroundColor: theme.surfaceSunken, borderColor: theme.border },
                      pressed && styles.pillPressed,
                    ]}>
                    <ThemedText type="mono">{dateLabel}</ThemedText>
                  </Pressable>
                </View>
                <View style={styles.whenCol}>
                  <ThemedText type="label">{t('dose.time')}</ThemedText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('dose.time')} ${timeLabel}`}
                    onPress={() => setPicker('time')}
                    style={({ pressed }) => [
                      styles.pill,
                      { backgroundColor: theme.surfaceSunken, borderColor: theme.border },
                      pressed && styles.pillPressed,
                    ]}>
                    <ThemedText type="mono">{timeLabel}</ThemedText>
                  </Pressable>
                </View>
              </View>

              <Divider />
              <PrimaryButton label={t('dose.confirm')} onPress={submit} disabled={!valid} />
              <TextButton label={t('common.cancel')} onPress={onCancel} />
            </>
          ) : (
            // Asked only because the amount changed. "Just this dose" is first
            // and is what dismissing resolves to: the safe, non-destructive read.
            <>
              <ThemedText type="body" themeColor="textSecondary" style={styles.askBody}>
                {t('dose.applyFutureBody', {
                  dose: askProtocol,
                  unit: item.doseUnit ?? '',
                  previous: item.dose ?? '',
                })}
              </ThemedText>
              <ThemedText type="monoSm" themeColor="textMuted">
                {t('dose.applyFutureNote')}
              </ThemedText>
              <Divider />
              <PrimaryButton label={t('dose.applyThisOnly')} onPress={() => finish(false)} />
              <PrimaryButton
                label={t('dose.applyFuture')}
                variant="secondary"
                onPress={() => finish(true)}
              />
            </>
          )}
        </View>
      </SafeAreaView>

      {/* Native pickers. Android opens the system dialog directly; iOS gets an
          inline spinner inside its own sheet. */}
      {Platform.OS === 'android' && picker !== 'none' && (
        <DateTimePicker
          mode={picker}
          value={pickerValue}
          maximumDate={picker === 'date' ? new Date() : undefined}
          onChange={(event, selected) => {
            setPicker('none');
            if (event.type === 'dismissed' || !selected) return;
            if (picker === 'date') setDateKey(localDateKey(selected));
            else setTime(selected);
          }}
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal
          visible={picker !== 'none'}
          transparent
          animationType="fade"
          onRequestClose={() => setPicker('none')}>
          <View style={styles.backdrop}>
            <SafeAreaView
              edges={['bottom']}
              style={[styles.pickerSheet, { backgroundColor: theme.surfaceRaised }]}>
              <View style={styles.pickerHeader}>
                <Pressable accessibilityRole="button" onPress={() => setPicker('none')}>
                  <ThemedText type="label" themeColor="accent">
                    {t('common.done')}
                  </ThemedText>
                </Pressable>
              </View>
              {picker !== 'none' && (
                <DateTimePicker
                  mode={picker}
                  display="spinner"
                  value={pickerValue}
                  maximumDate={picker === 'date' ? new Date() : undefined}
                  themeVariant={scheme === 'dark' ? 'dark' : 'light'}
                  onChange={(_, selected) => {
                    if (!selected) return;
                    if (picker === 'date') setDateKey(localDateKey(selected));
                    else setTime(selected);
                  }}
                />
              )}
            </SafeAreaView>
          </View>
        </Modal>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: {
    gap: Spacing.three,
    padding: Spacing.four,
    borderTopLeftRadius: Radii.panel,
    borderTopRightRadius: Radii.panel,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  grabber: { alignItems: 'center', paddingBottom: Spacing.one },
  grabberBar: { width: 36, height: 3, borderRadius: 2 },
  whenRow: { flexDirection: 'row', gap: Spacing.three },
  whenCol: { flex: 1, gap: Spacing.one },
  pill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radii.chamfer,
    paddingHorizontal: Spacing.three,
    minHeight: 44,
    justifyContent: 'center',
  },
  pillPressed: { opacity: 0.7 },
  askBody: { lineHeight: 22 },
  pickerSheet: {
    marginTop: 'auto',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingBottom: Spacing.four,
  },
  pickerHeader: { flexDirection: 'row', justifyContent: 'flex-end', padding: Spacing.three },
});
