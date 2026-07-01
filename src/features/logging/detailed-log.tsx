import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { LabeledInput, OptionChip, PrimaryButton, ScaleSelector } from '@/components/form';
import { Card, Divider, EngravedLabel, SignalText, Sunken } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { LabImport } from '@/features/lab/lab-import';
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

/**
 * The manual logging form (H-03 detailed mode) — extracted from the old home
 * check-in. Surfaced fields, day-stepper backfill, customize, history, symptoms.
 * The conversational quick-log is the sibling Quick mode.
 */
export function DetailedLog({ onDismiss }: { onDismiss?: () => void } = {}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { profile, entries, protocolItems, doseEvents, metricReadings, upsertCheckin, setProfile } =
    useStore();

  const today = localDateKey();
  const [date, setDate] = useState(today);
  const [showCustomize, setShowCustomize] = useState(false);
  const [weightError, setWeightError] = useState<string | undefined>(undefined);
  const [nutritionError, setNutritionError] = useState<Partial<Record<NutritionField, string>>>({});
  const isToday = date === today;
  const entry = entries[date];

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

  const { sporadicSlugs, activeSporadicSlugs } = useMemo(() => {
    const sporadic = protocolItems
      .filter((p) => p.frequency === 'as_needed')
      .map((p) => p.compoundSlug);
    const windowDays = new Set([date, shiftDateKey(date, -1)]);
    const active = doseEvents
      .filter(
        (d) =>
          d.compoundSlug &&
          sporadic.includes(d.compoundSlug) &&
          windowDays.has(localDateKey(new Date(d.takenAt))),
      )
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

  // Nutrition surfaces when a goal/effect-tag asks for it OR a health source has
  // supplied a reading for the day — so passively-synced calories/macros always
  // have somewhere to land, even if the user's goals wouldn't surface them.
  const nutritionActive = useMemo(
    () =>
      NUTRITION_FIELDS.filter(
        (n) => fields.includes(n.field) || metricForDate(metricReadings, n.metric, date),
      ),
    [fields, metricReadings, date],
  );

  // Passive fill: when a synced nutrition reading exists and the field is still
  // empty, write it once (per date/field, per session) so the value is "filled
  // up by the integration". A conflicting user-typed value is never overwritten
  // — that case still shows the tap-to-apply link below the input.
  const autoFilledRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const n of nutritionActive) {
      const key = `${date}-${n.field}`;
      if (autoFilledRef.current.has(key)) continue;
      if (entries[date]?.[n.field] !== undefined) {
        autoFilledRef.current.add(key);
        continue;
      }
      const reading = metricForDate(metricReadings, n.metric, date);
      if (!reading) continue;
      autoFilledRef.current.add(key);
      upsertCheckin(date, { [n.field]: Math.round(reading.value) });
    }
  }, [nutritionActive, date, entries, metricReadings, upsertCheckin]);

  const history = useMemo(
    () => Object.keys(entries).sort((a, b) => (a < b ? 1 : -1)).slice(0, 7),
    [entries],
  );

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

  return (
    <View style={styles.wrap}>
      <View style={styles.stepper}>
        <Pressable accessibilityRole="button" onPress={() => setDate((d) => shiftDateKey(d, -1))}>
          <ThemedText type="mono" themeColor="textSecondary">
            {t('checkin.prevDay')}
          </ThemedText>
        </Pressable>
        <ThemedText type="mono" themeColor="textMuted">
          {isToday ? t('checkin.today') : formatDateKey(date, i18n.language)}
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
      {savedPulse && (
        <ThemedText type="monoSm" themeColor="signalGood">
          {t('checkin.saved')}
        </ThemedText>
      )}

      {fields.includes('weight') && (
        <View style={styles.section}>
          <EngravedLabel>{t('fields.weight')}</EngravedLabel>
          <Sunken style={styles.weightWell}>
            <TextInput
              key={`${date}-weight-${num('weight') ?? ''}`}
              style={[styles.weightNumeral, { color: theme.numeral }]}
              keyboardType="decimal-pad"
              defaultValue={num('weight') !== undefined ? String(num('weight')) : ''}
              placeholder="0"
              placeholderTextColor={theme.textMuted}
              onEndEditing={(e) => {
                const raw = e.nativeEvent.text.trim().replace(',', '.');
                if (raw === '') {
                  setWeightError(undefined);
                  upsertCheckin(date, { weight: undefined });
                  return;
                }
                const v = parseFloat(raw);
                if (!Number.isFinite(v) || v <= 0 || v > 1500) {
                  setWeightError(t('checkin.weightInvalid'));
                  return;
                }
                setWeightError(undefined);
                upsertCheckin(date, { weight: v });
              }}
            />
            <View style={styles.weightSide}>
              {weightDelta !== undefined && <SignalText tone={weightDelta.tone} size="metricSm">{weightDelta.text}</SignalText>}
              <ThemedText type="monoSm" themeColor="textMuted">
                {t(`units.${profile.units === 'imperial' ? 'lb' : 'kg'}` as const)}
              </ThemedText>
            </View>
          </Sunken>
          {weightError ? (
            <ThemedText type="monoSm" themeColor="signalBad">
              {weightError}
            </ThemedText>
          ) : null}
          {(() => {
            const reading = metricForDate(metricReadings, 'body.weight', date);
            if (!reading) return null;
            const synced = weightInUnits(reading.value, profile.units);
            if (num('weight') === synced) return null;
            return (
              <Pressable accessibilityRole="button" onPress={() => upsertCheckin(date, { weight: synced })}>
                <ThemedText type="monoSm" themeColor="textSecondary" style={styles.autofill}>
                  {t('checkin.autofillWeight', { value: synced })}
                </ThemedText>
              </Pressable>
            );
          })()}
        </View>
      )}

      {nutritionActive.length > 0 && (
        <Card style={styles.section}>
          <EngravedLabel>{t('checkin.nutrition')}</EngravedLabel>
          {nutritionActive.map((n) => {
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
                  <Pressable accessibilityRole="button" onPress={() => upsertCheckin(date, { [n.field]: synced })}>
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

      {/* Lab results upload — photo (AI-parsed) or PDF (H-06). */}
      <Card style={styles.section}>
        <LabImport />
      </Card>

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

      {/* Fields persist on blur; SAVE LOG confirms + closes the overlay (mockup). */}
      {onDismiss && <PrimaryButton label={t('checkin.saveLog')} onPress={onDismiss} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.four },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weightWell: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.three },
  weightNumeral: { flex: 1, fontFamily: Fonts.mono, fontSize: 40, fontVariant: ['tabular-nums'], padding: 0 },
  weightSide: { alignItems: 'flex-end', gap: Spacing.one },
  weightInput: { flex: 1, gap: Spacing.one },
  autofill: { textDecorationLine: 'underline' },
  sectionLabel: { marginBottom: Spacing.two },
  scaleField: { gap: Spacing.two, paddingVertical: Spacing.two },
  rowDivider: { marginVertical: 0 },
  notes: { gap: Spacing.two },
  section: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
