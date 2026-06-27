import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChamferBox } from '@/components/chamfer';
import { OptionChip, PrimaryButton } from '@/components/form';
import { GearIcon } from '@/components/icons';
import { LineChart, type ChartPoint } from '@/components/line-chart';
import { Card, EngravedLabel, StatusPill } from '@/components/surface';
import { SyncStatus } from '@/components/sync-status';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Chamfer, MaxContentWidth, Spacing } from '@/constants/theme';
import { compoundBySlug } from '@/data/compound-catalog';
import { TodayDoses } from '@/features/home/today-doses';
import { useTheme } from '@/hooks/use-theme';
import { useOverlay } from '@/lib/nav-overlay';
import { localDateKey, useStore, type CheckinEntry, type PhotoEntry } from '@/lib/store';

/** The 4 fixed dashboard chart metrics (mockup — Weight / Energy / Sleep / Recovery).
 *  "Recovery" reuses the soreness field (relabelled app-wide, redesign R2). */
const CHECKIN_METRICS: { key: keyof CheckinEntry; labelKey: string; unitKey?: string }[] = [
  { key: 'weight', labelKey: 'fields.weight' },
  { key: 'energy', labelKey: 'fields.energy' },
  { key: 'sleep_quality', labelKey: 'fields.sleep_quality' },
  { key: 'soreness', labelKey: 'fields.soreness' },
];

/** Today as a glanceable dashboard (H-01): swipeable photo/chart card + two log
 *  buttons + a small distillation summary. No form. */
export function Dashboard() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const { openSettings, openLogging } = useOverlay();
  const { entries, photos, doseEvents, profile, setProfile } = useStore();

  const width = Math.min(Dimensions.get('window').width - Spacing.four * 2, MaxContentWidth);
  const selected = useMemo(
    () => (profile.dashboardMetrics?.length ? profile.dashboardMetrics : ['weight']),
    [profile.dashboardMetrics],
  );

  const series = useMemo(() => {
    const dates = Object.keys(entries).sort();
    // Keep every selected metric — charts with <2 points render an empty frame
    // (a placeholder that signals "log to fill this in").
    return CHECKIN_METRICS.filter((m) => selected.includes(m.key as string)).map((m) => {
      const points: ChartPoint[] = dates
        .map((d) => ({ label: d.slice(5), value: entries[d]?.[m.key] }))
        .filter((p): p is ChartPoint => typeof p.value === 'number');
      return { ...m, points };
    });
  }, [entries, selected]);

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
  const dosesToday = doseEvents.filter((d) => localDateKey(new Date(d.takenAt)) === today);

  // Data-rich distillation line: "BPC-157 logged · 83.4 kg · +42g" (mockup).
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

  // Header: locale-formatted date (e.g. "25 JUN 2026") + day badge + compounds.
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

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Swipeable card with overhanging prev/next chamfer-square nav buttons (handoff §2). */}
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
                <View key={s.key as string} style={[styles.page, { width }]}>
                  <Card style={styles.cardFill}>
                    <EngravedLabel>{t(s.labelKey as 'fields.weight')}</EngravedLabel>
                    <LineChart
                      data={s.points}
                      unit={s.unitKey ? t(s.unitKey as 'units.g') : undefined}
                      emptyLabel={t('common.noData')}
                    />
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

            {/* Overhanging prev/next buttons at −13px from card edges */}
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

          {/* Page dots — active = 16px pill in accent; inactive = 5px circle */}
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

          {/* Metric selector chips */}
          <View style={styles.metricChips}>
            {CHECKIN_METRICS.map((m) => (
              <OptionChip
                key={m.key as string}
                label={t(m.labelKey as 'fields.weight')}
                selected={selected.includes(m.key as string)}
                onPress={() => {
                  const set = new Set(selected);
                  if (set.has(m.key as string)) set.delete(m.key as string);
                  else set.add(m.key as string);
                  setProfile({ dashboardMetrics: [...set] });
                }}
              />
            ))}
          </View>

          {/* Distillation summary — data-rich line + status pill (mockup) */}
          <Card style={styles.summary}>
            <View style={styles.summaryHead}>
              <EngravedLabel>{t('dashboard.distillation')}</EngravedLabel>
              <StatusPill
                label={loggedToday ? t('dashboard.onTrack') : t('dashboard.pending')}
                tone={loggedToday ? 'good' : 'neutral'}
              />
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {distillation || t('dashboard.notLoggedToday')}
            </ThemedText>
          </Card>

          {/* Two log buttons */}
          <View style={styles.buttons}>
            <View style={styles.buttonHalf}>
              <PrimaryButton label={t('dashboard.quickLog')} onPress={() => openLogging('quick')} />
            </View>
            <View style={styles.buttonHalf}>
              <PrimaryButton
                label={t('dashboard.detailedLog')}
                variant="secondary"
                onPress={() => openLogging('detailed')}
              />
            </View>
          </View>

          {/* Today's doses — pending/done checklist (redesign R2) */}
          <TodayDoses />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const NAV_BTN_SIZE = 28;

const styles = StyleSheet.create({
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
  metricChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  summary: { gap: Spacing.two },
  summaryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  buttons: { flexDirection: 'row', gap: Spacing.two },
  buttonHalf: { flex: 1 },
});
