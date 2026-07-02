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
import { SyncStatus } from '@/components/sync-status';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Chamfer, MaxContentWidth, Radii, Spacing } from '@/constants/theme';
import { compoundBySlug } from '@/data/compound-catalog';
import { deriveMetrics, type DerivedMetricKey } from '@/lib/derived-metrics';
import { TodayDoses } from '@/features/home/today-doses';
import { useTheme } from '@/hooks/use-theme';
import { useOverlay } from '@/lib/nav-overlay';
import { useQuickLogActivity } from '@/lib/quick-log-runner';
import { localDateKey, useStore, type CheckinEntry, type PhotoEntry } from '@/lib/store';

/** Dashboard chart metric config.
 *  `id`: unique key used for selection/storage.
 *  `checkinKey`: manual check-in field (omit for wearable-only insight metrics).
 *  `derivedKey`: wearable-derived metric key from deriveMetrics().
 *  `canonicalMetric`: supplement chart from integration metricReadings. */
type MetricConfig = {
  id: string;
  checkinKey?: keyof CheckinEntry;
  labelKey: string;
  unitKey?: string;
  canonicalMetric?: string;
  derivedKey?: DerivedMetricKey;
};

const CHECKIN_METRICS: MetricConfig[] = [
  // ── Core subjective + integration ──────────────────────────────────────────
  { id: 'weight',       checkinKey: 'weight',        labelKey: 'fields.weight',       canonicalMetric: 'body.weight' },
  { id: 'energy',       checkinKey: 'energy',        labelKey: 'fields.energy',       derivedKey: 'energy' },
  { id: 'sleep_quality',checkinKey: 'sleep_quality', labelKey: 'fields.sleep_quality',derivedKey: 'sleep_quality' },
  { id: 'soreness',     checkinKey: 'soreness',      labelKey: 'fields.soreness',     derivedKey: 'soreness' },
  // ── Wearable-only insight metrics (opt-in, no manual entry) ────────────────
  { id: 'sleep_deep_pct',     labelKey: 'fields.sleep_deep_pct',     derivedKey: 'sleep_deep_pct' },
  { id: 'sleep_rem_pct',      labelKey: 'fields.sleep_rem_pct',      derivedKey: 'sleep_rem_pct' },
  { id: 'protein_adequacy',   labelKey: 'fields.protein_adequacy',   derivedKey: 'protein_adequacy' },
  { id: 'caloric_balance',    labelKey: 'fields.caloric_balance',    derivedKey: 'caloric_balance' },
  { id: 'body_comp_velocity', labelKey: 'fields.body_comp_velocity', derivedKey: 'body_comp_velocity' },
  { id: 'cv_strain',          labelKey: 'fields.cv_strain',          derivedKey: 'cv_strain' },
  { id: 'inflammation',       labelKey: 'fields.inflammation',       derivedKey: 'inflammation' },
];

// Insight-only metrics are opt-in; default to showing the original 4.
const DEFAULT_METRIC_IDS = ['weight', 'energy', 'sleep_quality', 'soreness'];

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
    () => (profile.dashboardMetrics?.length ? profile.dashboardMetrics : DEFAULT_METRIC_IDS),
    [profile.dashboardMetrics],
  );

  const series = useMemo(() => {
    // Build a date→value map from metricReadings for each canonical metric,
    // taking the most-recent reading per day (readings are stored newest-first).
    const readingsByMetricAndDate = new Map<string, Map<string, number>>();
    for (const r of metricReadings) {
      if (typeof r.value !== 'number') continue;
      let byDate = readingsByMetricAndDate.get(r.metric);
      if (!byDate) { byDate = new Map(); readingsByMetricAndDate.set(r.metric, byDate); }
      // addMetricReadings inserts newest first, so first write wins (most recent).
      if (!byDate.has(r.ts.slice(0, 10))) byDate.set(r.ts.slice(0, 10), r.value);
    }

    // Union of dates from manual entries + integration readings.
    const entryDates = new Set(Object.keys(entries));
    const allDates = new Set(entryDates);
    for (const byDate of readingsByMetricAndDate.values()) {
      for (const d of byDate.keys()) allDates.add(d);
    }
    const dates = Array.from(allDates).sort();

    const estMode = profile.estimatedMetricsMode ?? 'fill';
    const derived = estMode === 'off' ? null : deriveMetrics(metricReadings, { dobISO: profile.dobISO, sex: profile.sex });

    return CHECKIN_METRICS.filter((m) => selected.includes(m.id)).map((m) => {
      const byDate = m.canonicalMetric ? readingsByMetricAndDate.get(m.canonicalMetric) : undefined;
      const derivedForMetric = m.derivedKey ? derived?.[m.derivedKey] : undefined;
      const insightOnly = !m.checkinKey && !!m.derivedKey;

      // Insight-only metrics (no manual check-in) render derived data as the primary
      // solid series so they look like real data, not an overlay.
      if (insightOnly) {
        const points: ChartPoint[] = derivedForMetric
          ? Array.from(derivedForMetric.values()).map((pt) => ({ label: pt.dateKey.slice(5), value: pt.value }))
          : [];
        return { ...m, points, estimated: undefined };
      }

      const points: ChartPoint[] = dates
        .map((d) => {
          const manual = m.checkinKey ? entries[d]?.[m.checkinKey] : undefined;
          const value = typeof manual === 'number' ? manual : byDate?.get(d);
          return { label: d.slice(5), value };
        })
        .filter((p): p is ChartPoint => typeof p.value === 'number');

      // Estimated overlay: dashed + hollow, only for metrics with a derivedKey.
      let estimated: ChartPoint[] | undefined;
      if (derivedForMetric) {
        estimated = [];
        for (const [d, pt] of derivedForMetric) {
          const hasManual = m.checkinKey ? typeof entries[d]?.[m.checkinKey] === 'number' : false;
          if (estMode === 'fill' && hasManual) continue;
          estimated.push({ label: d.slice(5), value: pt.value });
        }
      }
      return { ...m, points, estimated };
    });
  }, [entries, metricReadings, selected, profile.estimatedMetricsMode, profile.dobISO, profile.sex]);

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
    const parts = [
      names.length ? t('dashboard.compoundsLogged', { names: names.join(' + ') }) : null,
      typeof todayEntry?.weight === 'number' ? `${todayEntry.weight} ${unit}` : null,
      typeof todayEntry?.protein === 'number' ? `+${todayEntry.protein}${t('units.g')}` : null,
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
        <SyncStatus />

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
                      estimated={s.estimated}
                      unit={s.unitKey ? t(s.unitKey as 'units.g') : undefined}
                      emptyLabel={t('common.noData')}
                    />
                    {s.estimated && s.estimated.length > 0 && (
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
            {CHECKIN_METRICS.map((m) => {
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
  container: { flex: 1 },
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
