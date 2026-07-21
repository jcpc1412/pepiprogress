import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TextButton } from '@/components/form';
import { ChevronRightIcon } from '@/components/icons';
import {
  CompletenessDots,
  SourceBadge,
  ValueRow,
  WeekStrip,
  type WeekDay,
} from '@/components/journal-primitives';
import { Card, Divider, EngravedLabel, Placeholder } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { compoundBySlug } from '@/data/compound-catalog';
import { formatDateKey, shiftDateKey } from '@/lib/dates';
import { surfaceFields, type CheckinField } from '@/lib/field-surfacing';
import {
  checkinFieldSource,
  completeness,
  dayHasData,
  dosesForDay,
  photosForDay,
  symptomsForDay,
  type LogSource,
} from '@/lib/journal-day';
import { localDateKey, useStore } from '@/lib/store';
import { useOverlay } from '@/lib/nav-overlay';
import { useToday } from '@/lib/today';

/**
 * Journal — the day in review (F4, item 41b). A read view over the day's already-
 * written entities (check-in, doses, symptoms, photos): quick-log, Pepi, the dose
 * drawer, and integrations wrote them, so nothing is logged twice. Week-strip
 * history nav, a graceful distillation header, source-badged rows, and one quiet
 * "add to this day" that routes to the detailed log for the selected day (the
 * backfill path). Anti-chore: it describes what IS there, never scolds what isn't.
 */
export function JournalScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { openLogging } = useOverlay();
  const { entries, doseEvents, symptomEvents, photos, profile } = useStore();

  const today = useToday();
  const dayKeyOf = (iso: string) => localDateKey(new Date(iso));

  // Week window: 0 = the 7 days ending today; page back/forward by whole weeks.
  const [weekOffset, setWeekOffset] = useState(0);
  const [selected, setSelected] = useState(today);
  const windowEnd = shiftDateKey(today, -weekOffset * 7);

  const days = useMemo<WeekDay[]>(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const iso = shiftDateKey(windowEnd, -(6 - i)); // oldest → newest
      const [, , d] = iso.split('-').map(Number);
      const date = new Date(iso + 'T00:00:00');
      return {
        iso,
        weekday: date.toLocaleDateString(i18n.language, { weekday: 'short' }).toUpperCase().slice(0, 3),
        dayNum: String(d),
        logged: dayHasData(iso, { entries, doses: doseEvents, symptoms: symptomEvents, photos }, dayKeyOf),
        isFuture: false,
      };
    });
  }, [windowEnd, i18n.language, entries, doseEvents, symptomEvents, photos]);

  const pageBack = () => {
    const o = weekOffset + 1;
    setWeekOffset(o);
    setSelected(shiftDateKey(today, -o * 7));
  };
  const pageForward = () => {
    if (weekOffset === 0) return;
    const o = weekOffset - 1;
    setWeekOffset(o);
    setSelected(shiftDateKey(today, -o * 7));
  };

  // ── The selected day, assembled ──────────────────────────────────────────
  const entry = entries[selected];
  const dayDoses = useMemo(() => dosesForDay(doseEvents, selected, dayKeyOf), [doseEvents, selected]);
  const daySymptoms = useMemo(() => symptomsForDay(symptomEvents, selected, dayKeyOf), [symptomEvents, selected]);
  const dayPhotos = useMemo(() => photosForDay(photos, selected, dayKeyOf), [photos, selected]);

  const trackedFields = useMemo(
    () =>
      surfaceFields(profile.goals, profile.compoundSlugs).fields.filter(
        (f): f is CheckinField => f !== 'face_photo' && f !== 'body_photo' && f !== 'note',
      ),
    [profile.goals, profile.compoundSlugs],
  );
  const comp = completeness(entry, trackedFields);

  const unit = profile.units === 'imperial' ? t('units.lb') : t('units.kg');
  const munit = profile.units === 'imperial' ? t('measurements.unitIn') : t('measurements.unitCm');

  // Check-in rows: show what's actually there (calm — missing fields aren't listed).
  const rows = useMemo(() => {
    const out: { key: string; label: string; value: string; source?: LogSource }[] = [];
    if (!entry) return out;
    const src = (f: string) => checkinFieldSource(entry, f);
    if (typeof entry.weight === 'number') out.push({ key: 'weight', label: t('fields.weight'), value: `${entry.weight} ${unit}`, source: src('weight') });
    const scales: CheckinField[] = ['sleep_quality', 'wellness', 'appetite', 'energy', 'soreness', 'workout_effort', 'libido'];
    for (const s of scales) {
      const v = entry[s as keyof typeof entry];
      if (typeof v === 'number') out.push({ key: s, label: t(`fields.${s}` as 'fields.energy'), value: t('journal.scaleValue', { v }), source: src(s) });
    }
    if (typeof entry.protein === 'number') out.push({ key: 'protein', label: t('fields.protein'), value: `${entry.protein} ${t('units.g')}`, source: src('protein') });
    if (typeof entry.calories === 'number') out.push({ key: 'calories', label: t('fields.calories'), value: `${entry.calories} ${t('units.kcal')}`, source: src('calories') });
    const measures: ('waist' | 'hips' | 'neck' | 'chest' | 'arms' | 'thighs')[] = ['waist', 'hips', 'neck', 'chest', 'arms', 'thighs'];
    for (const m of measures) {
      const v = entry[m];
      if (typeof v === 'number') out.push({ key: m, label: t(`measurements.${m}` as 'measurements.waist'), value: `${v} ${munit}`, source: src(m) });
    }
    if (entry.skin_notes) out.push({ key: 'skin_notes', label: t('fields.skin_notes'), value: entry.skin_notes });
    if (entry.note) out.push({ key: 'note', label: t('fields.note'), value: entry.note });
    return out;
  }, [entry, unit, munit, t]);

  // Deterministic distillation, matching the Today recap (no per-view AI call).
  const distillation = useMemo(() => {
    const names = Array.from(
      new Set(dayDoses.map((d) => (d.compoundSlug ? compoundBySlug(d.compoundSlug)?.canonicalName : null)).filter(Boolean)),
    ).slice(0, 2) as string[];
    const parts = [
      names.length ? t('dashboard.compoundsLogged', { names: names.join(' + ') }) : null,
      typeof entry?.weight === 'number' ? `${entry.weight} ${unit}` : null,
      typeof entry?.protein === 'number' ? `+${entry.protein}${t('units.g')}` : null,
      daySymptoms.length ? t('journal.hadSymptoms') : null,
    ].filter(Boolean);
    return parts.join(' · ');
  }, [dayDoses, daySymptoms.length, entry, unit, t]);

  const photoRead = dayPhotos.find((p) => p.changeNote)?.changeNote;
  const isEmpty = !dayHasData(selected, { entries, doses: doseEvents, symptoms: symptomEvents, photos }, dayKeyOf);
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <EngravedLabel>{t('tabs.journal')}</EngravedLabel>
        </View>

        {/* Week pager + strip */}
        <View style={styles.pager}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('journal.prevWeek')} onPress={pageBack} hitSlop={8} style={styles.arrowLeft}>
            <ChevronRightIcon size={18} color="textSecondary" />
          </Pressable>
          <ThemedText type="monoSm" themeColor="textMuted">
            {formatDateKey(windowEnd, i18n.language)}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('journal.nextWeek')}
            accessibilityState={{ disabled: weekOffset === 0 }}
            disabled={weekOffset === 0}
            onPress={pageForward}
            hitSlop={8}
            style={[weekOffset === 0 && styles.arrowDisabled]}>
            <ChevronRightIcon size={18} color="textSecondary" />
          </Pressable>
        </View>
        <WeekStrip days={days} selected={selected} onSelect={setSelected} />

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Distillation header — describes the day, degrades gracefully. */}
          <View style={styles.distill}>
            <ThemedText type="display">{formatDateKey(selected, i18n.language)}</ThemedText>
            <ThemedText type="body" themeColor="textSecondary">
              {distillation || t('journal.emptyDay')}
            </ThemedText>
            {comp.total > 0 ? <CompletenessDots filled={comp.filled} total={comp.total} /> : null}
          </View>

          {/* F5 photo read — a reason to open that isn't data entry. */}
          {photoRead ? (
            <Card style={styles.readCard}>
              <EngravedLabel>{t('journal.photoRead')}</EngravedLabel>
              <ThemedText type="small" themeColor="textSecondary">
                {photoRead}
              </ThemedText>
            </Card>
          ) : null}

          {/* Check-in */}
          {rows.length ? (
            <View style={styles.section}>
              <EngravedLabel>{t('journal.checkin')}</EngravedLabel>
              <View>
                {rows.map((r, i) => (
                  <View key={r.key}>
                    {i > 0 ? <Divider /> : null}
                    <ValueRow label={r.label} value={r.value} source={r.source} />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Doses */}
          {dayDoses.length ? (
            <View style={styles.section}>
              <EngravedLabel>{t('journal.doses')}</EngravedLabel>
              <View>
                {dayDoses.map((d, i) => {
                  const name = d.compoundSlug ? compoundBySlug(d.compoundSlug)?.canonicalName ?? d.compoundSlug : t('journal.doseGeneric');
                  const doseStr = typeof d.dose === 'number' ? ` ${d.dose}${d.doseUnit ?? ''}` : '';
                  return (
                    <View key={d.id}>
                      {i > 0 ? <Divider /> : null}
                      <ValueRow label={`${name}${doseStr}`} value={fmtTime(d.takenAt)} source="tap" />
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Symptoms */}
          {daySymptoms.length ? (
            <View style={styles.section}>
              <EngravedLabel>{t('journal.symptoms')}</EngravedLabel>
              <View>
                {daySymptoms.map((s, i) => (
                  <View key={s.id}>
                    {i > 0 ? <Divider /> : null}
                    <ValueRow label={s.type} value={fmtTime(s.onsetAt)} />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Photos */}
          {dayPhotos.length ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('journal.photos')}
              accessibilityHint={t('photos.heading')}
              onPress={() => router.push('/photos')}
              style={styles.section}>
              <View style={styles.photosHead}>
                <EngravedLabel>{t('journal.photos')}</EngravedLabel>
                <SourceBadge source="tap" />
              </View>
              <View style={styles.thumbRow}>
                {dayPhotos.slice(0, 4).map((p) => (
                  <Image key={p.id} source={{ uri: p.uri }} style={styles.thumb} contentFit="cover" />
                ))}
              </View>
            </Pressable>
          ) : null}

          {isEmpty ? <Placeholder label={t('journal.emptyDay')} height={72} /> : null}

          <TextButton label={t('journal.addToDay')} onPress={() => openLogging('detailed', undefined, selected)} />
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
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrowLeft: { transform: [{ scaleX: -1 }] },
  arrowDisabled: { opacity: 0.3 },
  scroll: { gap: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.six },
  distill: { gap: Spacing.two },
  readCard: { gap: Spacing.two },
  section: { gap: Spacing.two },
  photosHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  thumbRow: { flexDirection: 'row', gap: Spacing.two },
  thumb: { width: 64, aspectRatio: 3 / 4, borderRadius: 2 },
});
