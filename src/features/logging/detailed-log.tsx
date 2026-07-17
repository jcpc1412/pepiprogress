import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { LabeledInput, PrimaryButton, ScaleSelector, SingleSelectChips } from '@/components/form';
import { Card, Divider, EngravedLabel, SignalText, Sunken } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { LabImport } from '@/features/lab/lab-import';
import { TrainingLog } from '@/features/training/training-log';
import { SymptomEvents } from '@/features/symptoms/symptom-events';
import { formatDateKey, localHour, shiftDateKey } from '@/lib/dates';
import { metricForDate, weightInUnits } from '@/lib/integrations/autofill';
import { applyFieldCustomization, partitionByTime, surfaceFields } from '@/lib/field-surfacing';
import { localDateKey, useStore, type CheckinEntry } from '@/lib/store';
import {
  baselineFor,
  currentTypicalLevel,
  type TypicalLevel,
} from '@/lib/typical-day';

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
  const router = useRouter();
  const {
    profile,
    entries,
    photos,
    protocolItems,
    doseEvents,
    metricReadings,
    upsertCheckin,
    recordTypicalDeviation,
    silentFillTypical,
  } = useStore();

  const today = localDateKey();
  const [date, setDate] = useState(today);
  const [showDeferred, setShowDeferred] = useState(false);
  const [showExactNutrition, setShowExactNutrition] = useState(false);
  const [weightError, setWeightError] = useState<string | undefined>(undefined);
  const [nutritionError, setNutritionError] = useState<Partial<Record<NutritionField, string>>>({});
  const [measurementError, setMeasurementError] = useState<Partial<Record<'waist' | 'hips' | 'extra', string>>>({});
  const isToday = date === today;
  const entry = entries[date];

  // Measurements are entered during a body-photo capture; surface them here so
  // they can be reviewed/corrected afterward (bug: previously edit-only at capture).
  const measurementUnit = profile.units === 'imperial' ? t('measurements.unitIn') : t('measurements.unitCm');
  const hasBodyPhotos = photos.some((p) => p.session === 'body');
  const showMeasurements =
    hasBodyPhotos ||
    entry?.waist !== undefined ||
    entry?.hips !== undefined ||
    entry?.extraMeasurementValue !== undefined;

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

  // Typical-day nutrition (spec 15): when an enabled baseline exists the nutrition
  // section collapses to usual/less/more chips (with an "enter exact" escape hatch).
  const nutritionBaseline = useMemo(
    () => baselineFor(profile.typicalBaselines, 'nutrition'),
    [profile.typicalBaselines],
  );
  const nutritionLevel = useMemo<TypicalLevel | null>(
    () => (nutritionBaseline ? currentTypicalLevel(metricReadings, nutritionBaseline, date) : null),
    [nutritionBaseline, metricReadings, date],
  );
  const typicalLevelOptions: { value: TypicalLevel; label: string }[] = [
    { value: 'usual', label: t('typical.usual') },
    { value: 'less', label: t('typical.less') },
    { value: 'more', label: t('typical.more') },
  ];

  // Passive fill: when a synced nutrition reading exists and the field is still
  // empty, write it and record the field in `entry.autoFilled`. Auto-filled
  // fields TRACK later re-syncs of the same day (master-plan W1-1: the copy is
  // never frozen at the first partial-day total); a user-typed value is never
  // overwritten (manual edits remove the field from autoFilled) — that case
  // shows the tap-to-apply link below the input instead. The session ref only
  // guards against re-filling a field the user cleared this session.
  const clearedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    // One combined upsert per run: per-field upserts would each snapshot the same
    // pre-update autoFilled array and clobber each other's additions.
    const e = entries[date];
    const patch: Partial<Omit<CheckinEntry, 'date' | 'updatedAt'>> = {};
    let auto = e?.autoFilled ?? [];
    let changed = false;
    for (const n of nutritionActive) {
      const reading = metricForDate(metricReadings, n.metric, date);
      if (!reading) continue;
      const synced = Math.round(reading.value);
      const cur = e?.[n.field];
      if (cur === undefined) {
        if (clearedRef.current.has(`${date}-${n.field}`)) continue;
        patch[n.field] = synced;
        if (!auto.includes(n.field)) auto = [...auto, n.field];
        changed = true;
      } else if (auto.includes(n.field) && cur !== synced) {
        patch[n.field] = synced;
        changed = true;
      }
    }
    if (changed) upsertCheckin(date, { ...patch, autoFilled: auto });
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

  const num = (key: keyof CheckinEntry) =>
    typeof entry?.[key] === 'number' ? (entry[key] as number) : undefined;
  const str = (key: keyof CheckinEntry) =>
    typeof entry?.[key] === 'string' ? (entry[key] as string) : '';

  const scaleFields = SCALE_FIELDS.filter((f) => fields.includes(f));
  // Time-aware ordering (R2-E): morning scales lead in the morning, evening ones
  // after ~15:00; the off-time set folds behind a "Show …" anchor.
  const { primary: primaryScales, deferred: deferredScales, deferredIsEvening } = partitionByTime(
    scaleFields,
    localHour(),
  );

  const nutritionRow = (n: (typeof NUTRITION_FIELDS)[number]) => {
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
            // A manual edit takes the field out of autoFilled tracking so the
            // user's value is never overwritten by a later sync.
            const manualAuto = (entry?.autoFilled ?? []).filter((f) => f !== n.field);
            if (raw === '') {
              setNutritionError((p) => ({ ...p, [n.field]: undefined }));
              clearedRef.current.add(`${date}-${n.field}`);
              upsertCheckin(date, { [n.field]: undefined, autoFilled: manualAuto });
              return;
            }
            const v = parseFloat(raw);
            if (!Number.isFinite(v) || v < 0 || v > n.max) {
              setNutritionError((p) => ({ ...p, [n.field]: t('checkin.weightInvalid') }));
              return;
            }
            setNutritionError((p) => ({ ...p, [n.field]: undefined }));
            upsertCheckin(date, { [n.field]: v, autoFilled: manualAuto });
          }}
        />
        {synced !== undefined && num(n.field) !== synced && (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              // Applying the synced value re-enters autoFilled tracking: the user
              // chose "whatever Health says", so later re-syncs keep it fresh.
              upsertCheckin(date, {
                [n.field]: synced,
                autoFilled: [...(entry?.autoFilled ?? []).filter((f) => f !== n.field), n.field],
              })
            }
          >
            <ThemedText type="monoSm" themeColor="textSecondary" style={styles.autofill}>
              {t(n.autofillKey, { value: synced })}
            </ThemedText>
          </Pressable>
        )}
      </View>
    );
  };

  const scaleRow = (f: ScaleField, i: number) => (
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
  );

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

      {nutritionBaseline ? (
        <Card style={styles.section}>
          <EngravedLabel>{t('checkin.nutrition')}</EngravedLabel>
          {showExactNutrition ? (
            <>
              {NUTRITION_FIELDS.map(nutritionRow)}
              <Pressable accessibilityRole="button" onPress={() => setShowExactNutrition(false)}>
                <ThemedText type="monoSm" themeColor="textSecondary" style={styles.autofill}>
                  {t('typical.useChips')}
                </ThemedText>
              </Pressable>
            </>
          ) : (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                {t('typical.chipHint')}
              </ThemedText>
              <SingleSelectChips
                options={typicalLevelOptions}
                value={nutritionLevel ?? undefined}
                onChange={(lvl) => recordTypicalDeviation('nutrition', date, lvl)}
              />
              <Pressable accessibilityRole="button" onPress={() => setShowExactNutrition(true)}>
                <ThemedText type="monoSm" themeColor="textSecondary" style={styles.autofill}>
                  {t('typical.enterExact')}
                </ThemedText>
              </Pressable>
            </>
          )}
        </Card>
      ) : nutritionActive.length > 0 ? (
        <Card style={styles.section}>
          <EngravedLabel>{t('checkin.nutrition')}</EngravedLabel>
          {nutritionActive.map(nutritionRow)}
        </Card>
      ) : null}

      {showMeasurements && (
        <Card style={styles.section}>
          <EngravedLabel>{t('fields.measurements')}</EngravedLabel>
          {(['waist', 'hips'] as const).map((field) => (
            <View key={`${date}-${field}`} style={styles.weightInput}>
              <LabeledInput
                key={`${date}-${field}-${num(field) ?? ''}`}
                label={`${t(`measurements.${field}`)} (${measurementUnit})`}
                keyboardType="decimal-pad"
                defaultValue={num(field) !== undefined ? String(num(field)) : ''}
                error={measurementError[field]}
                onEndEditing={(e) => {
                  const raw = e.nativeEvent.text.trim().replace(',', '.');
                  if (raw === '') {
                    setMeasurementError((p) => ({ ...p, [field]: undefined }));
                    upsertCheckin(date, { [field]: undefined });
                    return;
                  }
                  const v = parseFloat(raw);
                  if (!Number.isFinite(v) || v <= 0 || v > 500) {
                    setMeasurementError((p) => ({ ...p, [field]: t('checkin.weightInvalid') }));
                    return;
                  }
                  setMeasurementError((p) => ({ ...p, [field]: undefined }));
                  upsertCheckin(date, { [field]: v });
                }}
              />
            </View>
          ))}
          {entry?.extraMeasurementKey && (
            <View style={styles.weightInput}>
              <LabeledInput
                key={`${date}-extra-${entry.extraMeasurementValue ?? ''}`}
                label={`${t(`measurements.${entry.extraMeasurementKey}`)} (${measurementUnit})`}
                keyboardType="decimal-pad"
                defaultValue={entry.extraMeasurementValue !== undefined ? String(entry.extraMeasurementValue) : ''}
                error={measurementError.extra}
                onEndEditing={(e) => {
                  const raw = e.nativeEvent.text.trim().replace(',', '.');
                  if (raw === '') {
                    setMeasurementError((p) => ({ ...p, extra: undefined }));
                    upsertCheckin(date, { extraMeasurementValue: undefined });
                    return;
                  }
                  const v = parseFloat(raw);
                  if (!Number.isFinite(v) || v <= 0 || v > 500) {
                    setMeasurementError((p) => ({ ...p, extra: t('checkin.weightInvalid') }));
                    return;
                  }
                  setMeasurementError((p) => ({ ...p, extra: undefined }));
                  upsertCheckin(date, { extraMeasurementValue: v });
                }}
              />
            </View>
          )}
        </Card>
      )}

      {scaleFields.length > 0 && (
        <View>
          <EngravedLabel style={styles.sectionLabel}>{t('checkin.telemetry')}</EngravedLabel>
          {(primaryScales as ScaleField[]).map(scaleRow)}
          {deferredScales.length > 0 && (
            <>
              <Pressable
                accessibilityRole="button"
                style={styles.deferredToggle}
                onPress={() => setShowDeferred((v) => !v)}>
                <ThemedText type="monoSm" themeColor="textSecondary" style={styles.autofill}>
                  {t(
                    showDeferred
                      ? 'checkin.hideFields'
                      : deferredIsEvening
                        ? 'checkin.showEveningFields'
                        : 'checkin.showMorningFields',
                  )}
                </ThemedText>
              </Pressable>
              {showDeferred && (deferredScales as ScaleField[]).map(scaleRow)}
            </>
          )}
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

      {/* Training log — strength sessions + benchmarks (W5-21). */}
      <View style={styles.section}>
        <TrainingLog date={date} />
      </View>

      {/* Lab results upload — photo (AI-parsed) or PDF (H-06). */}
      <Card style={styles.section}>
        <LabImport />
      </Card>

      {/* Customization moved to Settings (R2-E, E3); the log just links to it. */}
      <View style={styles.section}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/whatilog' as Href)}>
          <ThemedText type="mono" themeColor="textSecondary" style={styles.autofill}>
            {t('checkin.customizeLink')}
          </ThemedText>
        </Pressable>
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

      {/* Fields persist on blur; SAVE LOG confirms + closes the overlay (mockup).
          Saving is a check-in interaction, so silently fill "usual" for any enabled
          typical group left untouched that day (spec 15 §UX.3). */}
      {onDismiss && (
        <PrimaryButton
          label={t('checkin.saveLog')}
          onPress={() => {
            silentFillTypical(date);
            onDismiss();
          }}
        />
      )}
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
  deferredToggle: { paddingVertical: Spacing.two },
});
