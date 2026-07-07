import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton, TextButton } from '@/components/form';
import { HeroFigure, ReasonButton } from '@/components/hero-figure';
import { GearIcon, PencilIcon } from '@/components/icons';
import { LineChart, type ChartPoint } from '@/components/line-chart';
import { Card, Divider, EngravedLabel, Placeholder, StatusPill } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { compoundBySlug } from '@/data/compound-catalog';
import { TodayDoses } from '@/features/home/today-doses';
import { formatHeroValue, resolveMsg, useVerdict, type TFn } from '@/features/home/use-verdict';
import { useTheme } from '@/hooks/use-theme';
import { daysBetween } from '@/lib/dates';
import { useOverlay } from '@/lib/nav-overlay';
import { useQuickLogActivity } from '@/lib/quick-log-runner';
import { localDateKey, useStore } from '@/lib/store';

/**
 * Today — verdict-first (redesign §4.1). Conclusion before data: a condensed
 * eyebrow, the engine-picked hero figure + one-sentence reading + a quiet
 * "reasoning" button into the decompose screen, then a single piece of evidence,
 * the Log action, the distillation summary, and one-tap dose logging. The old
 * carousel-of-equal-charts is retired; deep trends live on the Insights tab.
 */
export function Dashboard() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const { openSettings, openLogging } = useOverlay();
  const { entries, photos, doseEvents, protocolItems, profile, upsertCheckin } = useStore();

  const verdict = useVerdict();
  // Loose alias for the verdict presentation helpers (avoids the huge typed-key
  // union tripping TS's instantiation-depth limit).
  const tx = t as unknown as TFn;
  const hero = verdict.hero; // narrowed const so unions hold inside closures/JSX
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');

  const today = localDateKey();
  const todayEntry = entries[today];
  const loggedToday = !!todayEntry;
  const quickLog = useQuickLogActivity();
  const dosesToday = doseEvents.filter((d) => localDateKey(new Date(d.takenAt)) === today);

  // Condensed mono eyebrow: DD MMM · TYPE · WEEK N (redesign §2.5).
  const eyebrow = useMemo(() => {
    const date = new Date()
      .toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })
      .toUpperCase();
    const goal = profile.goals[0];
    const type = goal ? t(`verdict.type.${goal}` as 'verdict.type.weight_loss') : null;
    const started = protocolItems
      .map((p) => p.startedAt)
      .filter((d): d is string => !!d)
      .sort()[0];
    const week = started ? t('verdict.week', { n: Math.floor(daysBetween(started, today) / 7) + 1 }) : null;
    return [date, type, week].filter(Boolean).join(' · ');
  }, [i18n.language, profile.goals, protocolItems, today, t]);

  const distillation = useMemo(() => {
    const names = Array.from(
      new Set(dosesToday.map((d) => (d.compoundSlug ? compoundBySlug(d.compoundSlug)?.canonicalName : null)).filter(Boolean)),
    ).slice(0, 2) as string[];
    const unit = profile.units === 'imperial' ? t('units.lb') : t('units.kg');
    const munit = profile.units === 'imperial' ? t('measurements.unitIn') : t('measurements.unitCm');
    const parts = [
      names.length ? t('dashboard.compoundsLogged', { names: names.join(' + ') }) : null,
      typeof todayEntry?.weight === 'number' ? `${todayEntry.weight} ${unit}` : null,
      typeof todayEntry?.protein === 'number' ? `+${todayEntry.protein}${t('units.g')}` : null,
      typeof todayEntry?.waist === 'number' ? `${t('measurements.waist')} ${todayEntry.waist}${munit}` : null,
      typeof todayEntry?.hips === 'number' ? `${t('measurements.hips')} ${todayEntry.hips}${munit}` : null,
    ].filter(Boolean);
    return parts.join(' · ');
  }, [dosesToday, todayEntry, profile.units, t]);

  const startEditNote = () => {
    setNoteDraft(todayEntry?.note ?? '');
    setEditingNote(true);
  };
  const saveNote = () => {
    upsertCheckin(today, { note: noteDraft.trim() || undefined });
    setEditingNote(false);
  };

  const openReasoning = () => router.push('/reasoning');

  // Evidence: the hero metric's own series (matching signal), or a photo compare.
  const heroSignal =
    hero?.kind === 'metric'
      ? verdict.signals.find((s) => s.metricId === hero?.metricId)
      : undefined;
  const heroPhoto = hero?.kind === 'photo' ? photos.find((p) => p.id === hero?.photoId) : undefined;
  const heroPhotoBaseline = heroPhoto
    ? photos
        .filter((p) => p.session === heroPhoto.session)
        .sort((a, b) => (a.takenAt < b.takenAt ? -1 : 1))[0]
    : undefined;

  const stateTone =
    verdict.state === 'on_track'
      ? 'good'
      : verdict.state === 'off_track'
        ? 'bad'
        : verdict.state === 'watch'
          ? 'watch'
          : 'neutral';

  // The hero shows the movement over the trend window (signed delta), not the
  // absolute value — the number IS the progress (redesign §4.1, mockup frame 1).
  const heroFmt =
    hero?.kind === 'metric'
      ? formatHeroValue(hero.delta, hero.unit, profile.units, tx, { signed: true })
      : null;

  // Mono subline under the hero: "N-DAY TREND" plus a hedged days-to-target
  // projection when a goal weight is set. Punctuation join, like the eyebrow.
  const heroSub =
    hero?.kind === 'metric'
      ? [t('verdict.trendWindow', { n: hero.windowDays }), verdict.forecast ? resolveMsg(tx, verdict.forecast) : null]
          .filter(Boolean)
          .join(' · ')
      : '';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <ThemedText type="monoSm" themeColor="textMuted">
            {eyebrow}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.title')}
            onPress={openSettings}
            hitSlop={8}>
            <GearIcon />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* ── The verdict (conclusion first, on the canvas — no card, mockup §4.1) ── */}
          <View style={styles.verdict}>
            <View style={styles.verdictHead}>
              <StatusPill label={t(`verdict.state.${verdict.state}` as 'verdict.state.on_track')} tone={stateTone} />
              {verdict.state !== 'building' ? (
                <ThemedText type="monoSm" themeColor="textMuted">
                  {t(`verdict.confidence.${verdict.confidence}` as 'verdict.confidence.low')}
                </ThemedText>
              ) : null}
            </View>

            {hero?.kind === 'metric' && heroFmt ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${heroFmt.value} ${heroFmt.unit}. ${resolveMsg(tx, verdict.explanation)}`}
                accessibilityHint={t('verdict.tapHeroHint')}
                onPress={openReasoning}>
                <HeroFigure
                  value={heroFmt.value}
                  unit={heroFmt.unit}
                  trend={hero.trend}
                  favour={hero.favour}
                />
                {heroSub ? (
                  <ThemedText type="monoSm" themeColor="textMuted" style={styles.heroSub}>
                    {heroSub}
                  </ThemedText>
                ) : null}
              </Pressable>
            ) : null}

            <ThemedText type="body" themeColor="textSecondary">
              {resolveMsg(tx, verdict.explanation)}
            </ThemedText>

            {verdict.reconciliation ? (
              <ThemedText type="small" themeColor="textMuted" style={styles.reconcile}>
                {resolveMsg(tx, verdict.reconciliation)}
              </ThemedText>
            ) : null}

            {verdict.state !== 'building' ? (
              <ReasonButton
                label={t('verdict.seeReasoning')}
                onPress={openReasoning}
                accessibilityHint={t('verdict.reasoningHint')}
              />
            ) : null}
          </View>

          <Divider style={styles.rule} />

          {/* ── Evidence (engine-picked, on the canvas) ── */}
          {heroSignal ? (
            <View style={styles.evidence}>
              <EngravedLabel>{t('verdict.evidenceTitle')}</EngravedLabel>
              <LineChart
                data={heroSignal.series.map((p): ChartPoint => ({ label: p.dateKey.slice(5), value: p.value }))}
                emptyLabel={t('common.noData')}
              />
            </View>
          ) : heroPhoto ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('verdict.evidenceTitle')}
              accessibilityHint={t('photos.heading')}
              onPress={() => router.push('/photos')}
              style={styles.evidence}>
              <EngravedLabel>{t('verdict.evidenceTitle')}</EngravedLabel>
              <View style={styles.compareRow}>
                {heroPhotoBaseline && heroPhotoBaseline.id !== heroPhoto.id ? (
                  <View style={styles.compareCol}>
                    <Image source={{ uri: heroPhotoBaseline.uri }} style={styles.photo} contentFit="cover" />
                    <ThemedText type="monoSm" themeColor="textMuted">
                      {t('photos.baseline')}
                    </ThemedText>
                  </View>
                ) : null}
                <View style={styles.compareCol}>
                  <Image source={{ uri: heroPhoto.uri }} style={styles.photo} contentFit="cover" />
                  <ThemedText type="monoSm" themeColor="textMuted">
                    {t('photos.latest')}
                  </ThemedText>
                </View>
              </View>
            </Pressable>
          ) : verdict.state === 'building' ? (
            <View style={styles.evidence}>
              <EngravedLabel>{t('verdict.evidenceTitle')}</EngravedLabel>
              <Placeholder label={t('verdict.baselineCta')} height={96} />
              <TextButton label={t('tabs.photos')} onPress={() => router.push('/photos')} />
            </View>
          ) : null}

          {/* Log — medium-weight, encourages logging (§7 open item resolved). */}
          <PrimaryButton label={t('dashboard.log')} onPress={() => openLogging('quick')} />

          {/* Distillation summary + editable note. */}
          <Card style={styles.summary}>
            <View style={styles.summaryHead}>
              <EngravedLabel>{t('dashboard.distillation')}</EngravedLabel>
              <View style={styles.summaryHeadRight}>
                {quickLog.state === 'distilling' ? (
                  <StatusPill label={t('dashboard.distillingPill')} tone="neutral" />
                ) : quickLog.state === 'error' ? (
                  <StatusPill label={t('dashboard.distillErrorPill')} tone="bad" />
                ) : (
                  <StatusPill
                    label={loggedToday ? t('dashboard.onTrack') : t('dashboard.pending')}
                    tone={loggedToday ? 'good' : 'neutral'}
                  />
                )}
                {quickLog.state !== 'distilling' && !editingNote && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('dashboard.editNote')}
                    onPress={startEditNote}
                    hitSlop={8}>
                    <PencilIcon size={16} color="textMuted" />
                  </Pressable>
                )}
              </View>
            </View>

            {editingNote ? (
              <View style={styles.noteEditor}>
                <TextInput
                  style={[styles.noteInput, { color: theme.text, borderColor: theme.border }]}
                  value={noteDraft}
                  onChangeText={setNoteDraft}
                  placeholder={t('dashboard.notePlaceholder')}
                  placeholderTextColor={theme.textMuted}
                  multiline
                  autoFocus
                />
                <View style={styles.noteActions}>
                  <TextButton label={t('common.cancel')} onPress={() => setEditingNote(false)} />
                  <Pressable accessibilityRole="button" onPress={saveNote} hitSlop={8}>
                    <ThemedText type="smallBold" themeColor="accent">
                      {t('common.save')}
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                <ThemedText type="small" themeColor="textSecondary">
                  {quickLog.state === 'distilling'
                    ? t('dashboard.distilling')
                    : quickLog.state === 'error'
                      ? t('dashboard.distillError')
                      : quickLog.state === 'done' && quickLog.summary
                        ? quickLog.summary
                        : distillation || t('dashboard.notLoggedToday')}
                </ThemedText>
                {todayEntry?.note ? (
                  <ThemedText type="small" themeColor="text" style={styles.noteText}>
                    {todayEntry.note}
                  </ThemedText>
                ) : null}
              </>
            )}
          </Card>

          {/* One-tap dose logging (the MyTherapy-style checklist). */}
          <TodayDoses />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  // Transparent so the root breathing lattice (redesign §2.3) shows through.
  container: { flex: 1, backgroundColor: 'transparent' },
  safe: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scroll: { gap: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.six },
  verdict: { gap: Spacing.two },
  verdictHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroSub: { marginTop: Spacing.one },
  rule: { marginVertical: -Spacing.two },
  reconcile: { fontStyle: 'italic' },
  evidence: { gap: Spacing.two },
  compareRow: { flexDirection: 'row', gap: Spacing.two },
  compareCol: { flex: 1, gap: Spacing.one, alignItems: 'center' },
  photo: { width: '100%', aspectRatio: 3 / 4, borderRadius: 2 },
  summary: { gap: Spacing.two },
  summaryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  summaryHeadRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  noteText: { fontStyle: 'italic' },
  noteEditor: { gap: Spacing.two },
  noteInput: {
    minHeight: 60,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 2,
    padding: Spacing.two,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  noteActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
