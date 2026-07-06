import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dimensions,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChamferBox } from '@/components/chamfer';
import { PrimaryButton, TextButton } from '@/components/form';
import { GearIcon, PencilIcon } from '@/components/icons';
import { LineChart, type ChartPoint } from '@/components/line-chart';
import { Card, EngravedLabel, StatusPill } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Chamfer, MaxContentWidth, Radii, Spacing } from '@/constants/theme';
import { compoundBySlug } from '@/data/compound-catalog';
import {
  buildMetricSeries,
  CHART_METRICS,
  DEFAULT_CHART_METRIC_IDS,
  latestDataDate,
} from '@/lib/chart-series';
import { TodayDoses } from '@/features/home/today-doses';
import { useTheme } from '@/hooks/use-theme';
import { shiftDateKey } from '@/lib/dates';
import { useOverlay } from '@/lib/nav-overlay';
import { useQuickLogActivity } from '@/lib/quick-log-runner';
import { localDateKey, useStore, type PhotoEntry } from '@/lib/store';

/** The dashboard shows a short, glanceable trailing window (the Insights tab shows
 *  the full protocol span). Keeps the charts readable instead of a dense barcode. */
const DASHBOARD_WINDOW_DAYS = 10;

/** Today as a glanceable dashboard (H-01): swipeable photo/chart card + single log
 *  button above a distillation summary. Charts default to all 4; pencil icon opens
 *  a modal to toggle which show (R3-C). */
export function Dashboard() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const { openSettings, openLogging } = useOverlay();
  const { entries, photos, doseEvents, metricReadings, profile, setProfile, upsertCheckin } = useStore();

  const [chartPickerOpen, setChartPickerOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');

  const width = Math.min(Dimensions.get('window').width - Spacing.four * 2, MaxContentWidth);

  const selected = useMemo(
    () => (profile.dashboardMetrics?.length ? profile.dashboardMetrics : DEFAULT_CHART_METRIC_IDS),
    [profile.dashboardMetrics],
  );

  const series = useMemo(() => {
    // Trailing 10-day window, anchored at the most recent data point so the chart
    // stays populated even if the latest sync is a day or two old.
    const latest = latestDataDate(entries, metricReadings) ?? localDateKey();
    const windowStart = shiftDateKey(latest, -(DASHBOARD_WINDOW_DAYS - 1));

    return buildMetricSeries({
      selectedIds: selected,
      entries,
      metricReadings,
      profile,
      windowStart,
      windowEnd: latest,
    }).map((s) => ({
      ...s,
      points: s.primary.map((p): ChartPoint => ({ label: p.dateKey.slice(5), value: p.value })),
      estimatedPoints: s.estimated.map((p): ChartPoint => ({ label: p.dateKey.slice(5), value: p.value })),
    }));
  }, [entries, metricReadings, selected, profile]);

  const latestPhotos = (session: 'face' | 'body') =>
    photos.filter((p) => p.session === session).sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1));

  const photoPages: { session: 'face' | 'body'; baseline: PhotoEntry; latest: PhotoEntry }[] = [];
  for (const s of ['body', 'face'] as const) {
    const list = latestPhotos(s);
    if (list.length >= 1) {
      photoPages.push({ session: s, baseline: list[list.length - 1], latest: list[0] });
    }
  }

  const today = localDateKey();
  const todayEntry = entries[today];
  const loggedToday = !!todayEntry;
  const quickLog = useQuickLogActivity();
  const dosesToday = doseEvents.filter((d) => localDateKey(new Date(d.takenAt)) === today);

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

  const pageCount = photoPages.length + series.length || 1;
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const onCarouselScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== page) setPage(i);
  };

  const goToPage = (p: number) => {
    const clamped = Math.max(0, Math.min(pageCount - 1, p));
    scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
    setPage(clamped);
  };

  const dayCount = Object.keys(entries).length;
  const dateStr = new Date()
    .toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })
    .toUpperCase();
  const compoundNames = profile.compoundSlugs
    .map((s) => compoundBySlug(s)?.canonicalName)
    .filter(Boolean)
    .slice(0, 2)
    .join(' + ');
  const headerSub = [
    dayCount > 0
      ? t('dashboard.dayBadge', { count: String(dayCount).padStart(3, '0') })
      : null,
    compoundNames || null,
  ]
    .filter(Boolean)
    .join(' · ');

  const toggleMetric = (id: string) => {
    const set = new Set(selected);
    if (set.has(id)) {
      if (set.size === 1) return; // keep at least one chart
      set.delete(id);
    } else {
      set.add(id);
    }
    setProfile({ dashboardMetrics: [...set] });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <View>
            <EngravedLabel>{t('dashboard.todayLabel')}</EngravedLabel>
            <ThemedText type="display">{dateStr}</ThemedText>
            {headerSub ? (
              <ThemedText type="monoSm" themeColor="textMuted">
                {headerSub}
              </ThemedText>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.title')}
            onPress={openSettings}
            hitSlop={8}>
            <GearIcon />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Swipeable chart/photo carousel with pencil icon to edit which charts show */}
          <View style={styles.carouselWrapper}>
            <ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onCarouselScroll}
              scrollEventThrottle={16}
              style={{ width }}>
              {photoPages.map((p) => (
                <Pressable
                  key={p.session}
                  style={[styles.page, { width }]}
                  onPress={() => router.push('/photos')}>
                  <Card style={styles.cardFill}>
                    <EngravedLabel>
                      {t(p.session === 'face' ? 'photos.sessionFace' : 'photos.sessionBody')}
                    </EngravedLabel>
                    <View style={styles.compareRow}>
                      <View style={styles.compareCol}>
                        <Image source={{ uri: p.baseline.uri }} style={styles.photo} contentFit="cover" />
                        <ThemedText type="monoSm" themeColor="textMuted">
                          {t('photos.baseline')}
                        </ThemedText>
                      </View>
                      <View style={styles.compareCol}>
                        <Image source={{ uri: p.latest.uri }} style={styles.photo} contentFit="cover" />
                        <ThemedText type="monoSm" themeColor="textMuted">
                          {t('photos.latest')}
                        </ThemedText>
                      </View>
                    </View>
                  </Card>
                </Pressable>
              ))}

              {series.map((s) => (
                <View key={s.id} style={[styles.page, { width }]}>
                  <Card style={styles.cardFill}>
                    <EngravedLabel>{t(s.labelKey as 'fields.weight')}</EngravedLabel>
                    <LineChart
                      data={s.points}
                      estimated={s.estimatedPoints}
                      unit={s.unitKey ? t(s.unitKey as 'units.g') : undefined}
                      emptyLabel={t('common.noData')}
                    />
                    {s.estimatedPoints.length > 0 && (
                      <ThemedText type="monoSm" themeColor="textMuted">
                        {t('dashboard.estimatedHint')}
                      </ThemedText>
                    )}
                  </Card>
                </View>
              ))}

              {photoPages.length === 0 && series.length === 0 && (
                <View style={[styles.page, { width }]}>
                  <Card style={styles.cardEmpty}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('dashboard.empty')}
                    </ThemedText>
                  </Card>
                </View>
              )}
            </ScrollView>

            {/* Pencil icon — top-right of carousel area, opens chart toggle modal */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('dashboard.editCharts')}
              onPress={() => setChartPickerOpen(true)}
              hitSlop={8}
              style={styles.pencilBtn}>
              <PencilIcon size={16} color="textMuted" />
            </Pressable>

            {/* Overhanging prev/next nav buttons */}
            {page > 0 && (
              <Pressable
                accessibilityRole="button"
                style={[styles.navBtn, styles.navBtnLeft]}
                onPress={() => goToPage(page - 1)}>
                <ChamferBox
                  chamfer={Chamfer.chip}
                  fill={theme.surfaceRaised}
                  borderColor={theme.border}>
                  <View style={styles.navBtnInner}>
                    <ThemedText type="mono" themeColor="textSecondary">{'‹'}</ThemedText>
                  </View>
                </ChamferBox>
              </Pressable>
            )}
            {page < pageCount - 1 && (
              <Pressable
                accessibilityRole="button"
                style={[styles.navBtn, styles.navBtnRight]}
                onPress={() => goToPage(page + 1)}>
                <ChamferBox
                  chamfer={Chamfer.chip}
                  fill={theme.surfaceRaised}
                  borderColor={theme.border}>
                  <View style={styles.navBtnInner}>
                    <ThemedText type="mono" themeColor="textSecondary">{'›'}</ThemedText>
                  </View>
                </ChamferBox>
              </Pressable>
            )}
          </View>

          {/* Page dots */}
          {pageCount > 1 && (
            <View style={styles.dots}>
              {Array.from({ length: pageCount }, (_, i) => (
                <Pressable key={i} onPress={() => goToPage(i)} hitSlop={6}>
                  <View
                    style={[
                      i === page ? styles.dotActive : styles.dot,
                      { backgroundColor: i === page ? theme.accent : theme.surfaceSunken },
                    ]}
                  />
                </Pressable>
              ))}
            </View>
          )}

          {/* Single Log button — above the distillation summary (R3-C) */}
          <PrimaryButton label={t('dashboard.log')} onPress={() => openLogging('quick')} />

          {/* Distillation summary — shows background quick-log status when active,
              and an editable personal note (pencil) the user can amend/append. */}
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

          {/* Today's doses */}
          <TodayDoses />
        </ScrollView>
      </SafeAreaView>

      {/* Chart toggle modal */}
      <Modal
        visible={chartPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setChartPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setChartPickerOpen(false)}>
          <View
            style={[styles.modalSheet, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}
            onStartShouldSetResponder={() => true}>
            <EngravedLabel style={styles.modalTitle}>{t('dashboard.chartsModal')}</EngravedLabel>
            {CHART_METRICS.map((m) => {
              const active = selected.includes(m.id);
              return (
                <Pressable
                  key={m.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                  onPress={() => toggleMetric(m.id)}
                  style={[styles.chartRow, { borderColor: theme.border }]}>
                  <ThemedText type="smallBold">{t(m.labelKey as 'fields.weight')}</ThemedText>
                  <View
                    style={[
                      styles.checkbox,
                      {
                        backgroundColor: active ? theme.accent : 'transparent',
                        borderColor: active ? theme.accent : theme.border,
                      },
                    ]}
                  />
                </Pressable>
              );
            })}
            {/* Estimated (wearable-derived) overlay mode. */}
            <EngravedLabel style={styles.modalTitle}>{t('dashboard.estimatedModeTitle')}</EngravedLabel>
            <View style={styles.estimatedModeRow}>
              {(['off', 'fill', 'always'] as const).map((mode) => {
                const active = (profile.estimatedMetricsMode ?? 'fill') === mode;
                return (
                  <Pressable
                    key={mode}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    onPress={() => setProfile({ estimatedMetricsMode: mode })}
                    style={[
                      styles.estimatedModeChip,
                      { borderColor: active ? theme.accent : theme.border, backgroundColor: active ? theme.accent : 'transparent' },
                    ]}>
                    <ThemedText type="monoSm" themeColor={active ? 'background' : 'textSecondary'}>
                      {t(`dashboard.estimatedMode_${mode}` as 'dashboard.estimatedMode_fill')}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
            <ThemedText type="monoSm" themeColor="textMuted" style={styles.modalTitle}>
              {t('dashboard.estimatedModeHint')}
            </ThemedText>
          </View>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const NAV_BTN_SIZE = 28;

const styles = StyleSheet.create({
  estimatedModeRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
  estimatedModeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderWidth: 1,
    borderRadius: Radii.panel,
  },
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
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  scroll: { gap: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.six },
  carouselWrapper: { position: 'relative' },
  page: {},
  cardFill: { gap: Spacing.two },
  cardEmpty: { padding: Spacing.four, alignItems: 'center', justifyContent: 'center', minHeight: 120 },
  compareRow: { flexDirection: 'row', gap: Spacing.two },
  compareCol: { flex: 1, gap: Spacing.one, alignItems: 'center' },
  photo: { width: '100%', aspectRatio: 3 / 4, borderRadius: 2 },
  pencilBtn: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    zIndex: 20,
    padding: Spacing.one,
  },
  navBtn: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 10,
  },
  navBtnLeft: { left: -13 },
  navBtnRight: { right: -13 },
  navBtnInner: {
    width: NAV_BTN_SIZE,
    height: NAV_BTN_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.one },
  dot: { width: 5, height: 5, borderRadius: 3 },
  dotActive: { width: 16, height: 5, borderRadius: 3 },
  summary: { gap: Spacing.two },
  summaryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  summaryHeadRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  noteText: { fontStyle: 'italic' },
  noteEditor: { gap: Spacing.two },
  noteInput: {
    minHeight: 60,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radii.chamfer,
    padding: Spacing.two,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  noteActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSheet: {
    width: 260,
    borderRadius: Radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  modalTitle: { marginBottom: Spacing.one },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 3,
    borderWidth: 1.5,
  },
});
