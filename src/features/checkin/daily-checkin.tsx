import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LabeledInput, OptionChip, ScaleSelector, TextButton } from '@/components/form';
import { Card, Divider, EngravedLabel, SignalText, Sunken } from '@/components/surface';
import { SyncStatus } from '@/components/sync-status';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { QuickLog } from '@/features/chat/quick-log';
import { SymptomEvents } from '@/features/symptoms/symptom-events';
import { formatDateKey, shiftDateKey } from '@/lib/dates';
import { metricForDate, weightInUnits } from '@/lib/integrations/autofill';
import {
  applyFieldCustomization,
  CUSTOMIZABLE_FIELDS,
  surfaceFields,
  type CheckinField,
} from '@/lib/field-surfacing';
import { localDateKey, useStore, type CheckinEntry } from '@/lib/store';

type DeltaTone = 'good' | 'bad' | 'neutral';

type ScaleField =
  | 'sleep_quality'
  | 'wellness'
  | 'appetite'
  | 'energy'
  | 'soreness'
  | 'workout_effort'
  | 'libido';
type TextField = 'skin_notes' | 'measurements' | 'note';
type NutritionField = 'protein' | 'calories';

/** Manual nutrition fields (spec 06). `metric` is the canonical key a Health
 * source fills, so the autofill link mirrors weight. `max` is a sanity bound. */
const NUTRITION_FIELDS: {
  field: NutritionField;
  metric: 'nutrition.protein' | 'nutrition.energy';
  unitKey: 'units.g' | 'units.kcal';
  autofillKey: 'checkin.autofillProtein' | 'checkin.autofillCalories';
  max: number;
}[] = [
  { field: 'protein', metric: 'nutrition.protein', unitKey: 'units.g', autofillKey: 'checkin.autofillProtein', max: 1000 },
  { field: 'calories', metric: 'nutrition.energy', unitKey: 'units.kcal', autofillKey: 'checkin.autofillCalories', max: 20000 },
];

const SCALE_FIELDS: ScaleField[] = [
  'sleep_quality',
  'wellness',
  'appetite',
  'energy',
  'soreness',
  'workout_effort',
  'libido',
];
const TEXT_FIELDS: TextField[] = ['skin_notes', 'measurements', 'note'];

export function DailyCheckin() {
  const { t, i18n } = useTranslation();
  const { profile, entries, protocolItems, doseEvents, metricReadings, upsertCheckin, setProfile } =
    useStore();

  // Date being edited. Defaults to today; the stepper allows backfilling past
  // days (spec 03 — missed days editable, no shame mechanics). No future days.
  const today = localDateKey();
  const [date, setDate] = useState(today);
  const [showCustomize, setShowCustomize] = useState(false);
  const [weightError, setWeightError] = useState<string | undefined>(undefined);
  const [nutritionError, setNutritionError] = useState<Partial<Record<NutritionField, string>>>({});
  const isToday = date === today;
  const entry = entries[date];
  const router = useRouter();

  // ── "Saved" microconfirmation (autosave is otherwise invisible) ──────────
  // Pulse a quiet "saved" note whenever the current day's entry changes, so the
  // user gets confirmation their edit took. Baseline resets on a date switch so
  // stepping days doesn't falsely flash "saved".
  const [savedPulse, setSavedPulse] = useState(false);
  const seenUpdatedAt = useRef<string | null>(null);
  const seenDate = useRef(date);
  useEffect(() => {
    const u = entries[date]?.updatedAt ?? null;
    if (seenDate.current !== date) {
      seenDate.current = date;
      seenUpdatedAt.current = u;
      return;
    }
    if (seenUpdatedAt.current !== null && u !== seenUpdatedAt.current) setSavedPulse(true);
    seenUpdatedAt.current = u;
  }, [entries, date]);
  useEffect(() => {
    if (!savedPulse) return;
    const id = setTimeout(() => setSavedPulse(false), 1800);
    return () => clearTimeout(id);
  }, [savedPulse]);

  // Sporadic ("as needed") compounds only surface their fields on days they were
  // used — a dose for the selected day or the day before (spec 02/03).
  const { sporadicSlugs, activeSporadicSlugs } = useMemo(() => {
    const sporadic = protocolItems
      .filter((p) => p.frequency === 'as_needed')
      .map((p) => p.compoundSlug);
    const windowDays = new Set([date, shiftDateKey(date, -1)]);
    const active = doseEvents
      .filter((d) => d.compoundSlug && sporadic.includes(d.compoundSlug) && windowDays.has(localDateKey(new Date(d.takenAt))))
      .map((d) => d.compoundSlug as string);
    return { sporadicSlugs: sporadic, activeSporadicSlugs: active };
  }, [protocolItems, doseEvents, date]);

  const { fields: baseFields, bloodworkMarkers } = useMemo(
    () => surfaceFields(profile.goals, profile.compoundSlugs, { sporadicSlugs, activeSporadicSlugs }),
    [profile.goals, profile.compoundSlugs, sporadicSlugs, activeSporadicSlugs],
  );
  const fields = useMemo(
    () => applyFieldCustomization(baseFields, profile.addedFields, profile.removedFields),
    [baseFields, profile.addedFields, profile.removedFields],
  );
  const shown = useMemo(() => new Set(fields), [fields]);

  // Recent days with a saved entry, newest first — tap to backfill/edit (spec 03).
  const history = useMemo(
    () => Object.keys(entries).sort((a, b) => (a < b ? 1 : -1)).slice(0, 7),
    [entries],
  );

  // Weight delta vs the most recent prior logged weight. Tone is goal-aware:
  // for a weight-loss goal a drop reads "good" and a gain "bad"; for muscle/
  // body-comp a gain reads "good"; otherwise neutral (a change isn't universally
  // good/bad without a goal to interpret it).
  const weightDelta = useMemo<{ text: string; tone: DeltaTone } | undefined>(() => {
    const cur = entry?.weight;
    if (typeof cur !== 'number') return undefined;
    const prevKey = Object.keys(entries)
      .filter((k) => k < date && typeof entries[k]?.weight === 'number')
      .sort((a, b) => (a < b ? 1 : -1))[0];
    const prev = prevKey ? (entries[prevKey].weight as number) : undefined;
    if (typeof prev !== 'number') return undefined;
    const d = cur - prev;
    const text = `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toFixed(1)}`;

    const wantsLoss = profile.goals.includes('weight_loss');
    const wantsGain = profile.goals.includes('body_comp');
    let tone: DeltaTone = 'neutral';
    if (d !== 0 && wantsLoss !== wantsGain) {
      // Only color when the direction is unambiguous for the user's goal set.
      const goodDirection = wantsLoss ? d < 0 : d > 0;
      tone = goodDirection ? 'good' : 'bad';
    }
    return { text, tone };
  }, [entries, date, entry?.weight, profile.goals]);

  const toggleField = (field: CheckinField, makeVisible: boolean) => {
    const added = makeVisible
      ? Array.from(new Set([...profile.addedFields, field]))
      : profile.addedFields.filter((f) => f !== field);
    const removed = makeVisible
      ? profile.removedFields.filter((f) => f !== field)
      : Array.from(new Set([...profile.removedFields, field]));
    setProfile({ addedFields: added, removedFields: removed });
  };

  const num = (key: keyof CheckinEntry) =>
    typeof entry?.[key] === 'number' ? (entry[key] as number) : undefined;
  const str = (key: keyof CheckinEntry) =>
    typeof entry?.[key] === 'string' ? (entry[key] as string) : '';

  const scaleFields = SCALE_FIELDS.filter((f) => fields.includes(f));

  // Today counts as "logged" once any field carries a value — gates the closing moment.
  const loggedToday =
    isToday &&
    !!entry &&
    Object.entries(entry).some(([k, v]) => k !== 'date' && k !== 'updatedAt' && v != null);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* ── Engraved header (panel signage + display date) ─────────────── */}
        <EngravedLabel>{t('checkin.title')}</EngravedLabel>
        <ThemedText type="display">
          {isToday ? t('checkin.today') : formatDateKey(date, i18n.language)}
        </ThemedText>

        {/* Quiet status row: cloud-sync state (signed-in only) + a transient "saved" pulse. */}
        <View style={styles.headerStatus}>
          <SyncStatus />
          {savedPulse && (
            <ThemedText type="monoSm" themeColor="signalGood">
              {t('checkin.saved')}
            </ThemedText>
          )}
        </View>

        <View style={styles.stepper}>
          <Pressable accessibilityRole="button" onPress={() => setDate((d) => shiftDateKey(d, -1))}>
            <ThemedText type="mono" themeColor="textSecondary">
              {t('checkin.prevDay')}
            </ThemedText>
          </Pressable>
          <ThemedText type="mono" themeColor="textMuted">
            {formatDateKey(date, i18n.language)}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            disabled={isToday}
            onPress={() => setDate((d) => shiftDateKey(d, 1))}>
            <ThemedText type="mono" themeColor={isToday ? 'surfaceSunken' : 'textSecondary'}>
              {t('checkin.nextDay')}
            </ThemedText>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Conversational quick-log — "wake up and log in one box" (spec 13).
              Only for today (parses resolve relative time against now). */}
          {isToday && <QuickLog />}

          {/* ── Weight: editable input + neutral delta readout ───────────── */}
          {fields.includes('weight') && (
            <Card style={styles.weightCard}>
              <View style={styles.weightInput}>
                <LabeledInput
                  key={`${date}-weight-${num('weight') ?? ''}`}
                  label={`${t('fields.weight')} (${t(`units.${profile.units === 'imperial' ? 'lb' : 'kg'}` as const)})`}
                  keyboardType="decimal-pad"
                  defaultValue={num('weight') !== undefined ? String(num('weight')) : ''}
                  error={weightError}
                  onEndEditing={(e) => {
                    const raw = e.nativeEvent.text.trim().replace(',', '.');
                    if (raw === '') {
                      setWeightError(undefined);
                      upsertCheckin(date, { weight: undefined });
                      return;
                    }
                    const v = parseFloat(raw);
                    // Reject non-numeric / implausible input instead of silently dropping it.
                    if (!Number.isFinite(v) || v <= 0 || v > 1500) {
                      setWeightError(t('checkin.weightInvalid'));
                      return;
                    }
                    setWeightError(undefined);
                    upsertCheckin(date, { weight: v });
                  }}
                />
                {/* Auto-fill from a synced source when we have a reading and no matching entry. */}
                {(() => {
                  const reading = metricForDate(metricReadings, 'body.weight', date);
                  if (!reading) return null;
                  const synced = weightInUnits(reading.value, profile.units);
                  if (num('weight') === synced) return null;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => upsertCheckin(date, { weight: synced })}>
                      <ThemedText type="monoSm" themeColor="textSecondary" style={styles.autofill}>
                        {t('checkin.autofillWeight', { value: synced })}
                      </ThemedText>
                    </Pressable>
                  );
                })()}
              </View>
              {weightDelta !== undefined && (
                <View style={styles.delta}>
                  <EngravedLabel>{t('checkin.delta')}</EngravedLabel>
                  <SignalText tone={weightDelta.tone}>{weightDelta.text}</SignalText>
                </View>
              )}
            </Card>
          )}

          {/* ── Nutrition: manual protein/calories (autofilled from Health when synced) ── */}
          {NUTRITION_FIELDS.some((n) => fields.includes(n.field)) && (
            <Card style={styles.section}>
              <EngravedLabel>{t('checkin.nutrition')}</EngravedLabel>
              {NUTRITION_FIELDS.filter((n) => fields.includes(n.field)).map((n) => {
                const reading = metricForDate(metricReadings, n.metric, date);
                const synced = reading ? Math.round(reading.value) : undefined;
                return (
                  <View key={`${date}-${n.field}`} style={styles.weightInput}>
                    <LabeledInput
                      key={`${date}-${n.field}-${num(n.field) ?? ''}`}
                      label={`${t(`fields.${n.field}` as const)} (${t(n.unitKey)})`}
                      keyboardType="decimal-pad"
                      defaultValue={num(n.field) !== undefined ? String(num(n.field)) : ''}
                      error={nutritionError[n.field]}
                      onEndEditing={(e) => {
                        const raw = e.nativeEvent.text.trim().replace(',', '.');
                        if (raw === '') {
                          setNutritionError((p) => ({ ...p, [n.field]: undefined }));
                          upsertCheckin(date, { [n.field]: undefined });
                          return;
                        }
                        const v = parseFloat(raw);
                        if (!Number.isFinite(v) || v < 0 || v > n.max) {
                          setNutritionError((p) => ({ ...p, [n.field]: t('checkin.weightInvalid') }));
                          return;
                        }
                        setNutritionError((p) => ({ ...p, [n.field]: undefined }));
                        upsertCheckin(date, { [n.field]: v });
                      }}
                    />
                    {synced !== undefined && num(n.field) !== synced && (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => upsertCheckin(date, { [n.field]: synced })}>
                        <ThemedText type="monoSm" themeColor="textSecondary" style={styles.autofill}>
                          {t(n.autofillKey, { value: synced })}
                        </ThemedText>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </Card>
          )}

          {/* ── Subjective telemetry: scale rows, carved dividers ─────────── */}
          {scaleFields.length > 0 && (
            <View>
              <EngravedLabel style={styles.sectionLabel}>{t('checkin.telemetry')}</EngravedLabel>
              {scaleFields.map((f, i) => (
                <View key={f}>
                  {i > 0 && <Divider style={styles.rowDivider} />}
                  <View style={styles.scaleField}>
                    <ThemedText type="mono">{t(`fields.${f}` as const)}</ThemedText>
                    <ScaleSelector
                      value={num(f as keyof CheckinEntry)}
                      onChange={(v) => upsertCheckin(date, { [f]: v })}
                    />
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ── Notes / free-text fields ─────────────────────────────────── */}
          {TEXT_FIELDS.filter((f) => fields.includes(f)).map((f) => (
            <Sunken key={`${date}-${f}`} style={styles.notes}>
              <EngravedLabel>{t(`fields.${f}` as const)}</EngravedLabel>
              <LabeledInput
                multiline
                defaultValue={str(f as keyof CheckinEntry)}
                onEndEditing={(e) => upsertCheckin(date, { [f]: e.nativeEvent.text })}
              />
            </Sunken>
          ))}

          {bloodworkMarkers.length > 0 && (
            <Card style={styles.section}>
              <EngravedLabel>{t('checkin.bloodwork.title')}</EngravedLabel>
              {bloodworkMarkers.map((m) => (
                <ThemedText key={m} type="mono" themeColor="textSecondary">
                  {t(`markers.${m}` as const)}
                </ThemedText>
              ))}
            </Card>
          )}

          <SymptomEvents />

          {/* ── Closing moment: confirm the day is logged + nudge the USP (peak-end) ── */}
          {loggedToday && (
            <Card style={styles.section}>
              <SignalText tone="good">{t('checkin.doneTitle')}</SignalText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('checkin.donePhotoPrompt')}
              </ThemedText>
              <TextButton
                label={t('checkin.donePhotoCta')}
                tone="accent"
                onPress={() => router.push('/photos')}
              />
            </Card>
          )}

          {/* ── Customize what I log (spec 02) ───────────────────────────── */}
          <View style={styles.section}>
            <Pressable accessibilityRole="button" onPress={() => setShowCustomize((v) => !v)}>
              <EngravedLabel>{t('checkin.customize')}</EngravedLabel>
            </Pressable>
            {showCustomize && (
              <View style={styles.chips}>
                {CUSTOMIZABLE_FIELDS.map((f) => (
                  <OptionChip
                    key={f}
                    label={t(`fields.${f}` as const)}
                    selected={shown.has(f)}
                    onPress={() => toggleField(f, !shown.has(f))}
                  />
                ))}
              </View>
            )}
          </View>

          {/* ── History — jump back to a past day to edit (spec 03) ───────── */}
          <View style={styles.section}>
            <EngravedLabel>{t('checkin.history')}</EngravedLabel>
            {history.length === 0 ? (
              <ThemedText type="mono" themeColor="textMuted">
                {t('checkin.historyEmpty')}
              </ThemedText>
            ) : (
              history.map((d) => (
                <Pressable key={d} accessibilityRole="button" onPress={() => setDate(d)}>
                  <ThemedText type="mono" themeColor={d === date ? 'text' : 'textSecondary'}>
                    {d === today ? t('checkin.today') : formatDateKey(d, i18n.language)}
                  </ThemedText>
                </Pressable>
              ))
            )}
          </View>
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
    gap: Spacing.one,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  headerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 14,
    paddingTop: Spacing.one,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
  },
  scroll: { gap: Spacing.four, paddingTop: Spacing.four, paddingBottom: Spacing.six },
  weightCard: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.three },
  weightInput: { flex: 1, gap: Spacing.one },
  autofill: { textDecorationLine: 'underline' },
  delta: { alignItems: 'flex-end', gap: Spacing.one },
  sectionLabel: { marginBottom: Spacing.two },
  scaleField: { gap: Spacing.two, paddingVertical: Spacing.two },
  rowDivider: { marginVertical: 0 },
  notes: { gap: Spacing.two },
  section: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
