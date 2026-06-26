import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dimensions, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OptionChip, PrimaryButton } from '@/components/form';
import { GearIcon } from '@/components/icons';
import { LineChart, type ChartPoint } from '@/components/line-chart';
import { Card, Divider, EngravedLabel } from '@/components/surface';
import { SyncStatus } from '@/components/sync-status';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useOverlay } from '@/lib/nav-overlay';
import { localDateKey, useStore, type CheckinEntry, type PhotoEntry } from '@/lib/store';

/** Chartable series the dashboard can pull from check-in entries. */
const CHECKIN_METRICS: { key: keyof CheckinEntry; labelKey: string; unitKey?: string }[] = [
  { key: 'weight', labelKey: 'fields.weight' },
  { key: 'protein', labelKey: 'fields.protein', unitKey: 'units.g' },
  { key: 'calories', labelKey: 'fields.calories', unitKey: 'units.kcal' },
  { key: 'energy', labelKey: 'fields.energy' },
  { key: 'sleep_quality', labelKey: 'fields.sleep_quality' },
  { key: 'wellness', labelKey: 'fields.wellness' },
];

/** Today as a glanceable dashboard (H-01): swipeable photo/chart card + two log
 *  buttons + a small distillation summary. No form. */
export function Dashboard() {
  const { t } = useTranslation();
  const router = useRouter();
  const { openSettings, openLogging } = useOverlay();
  const { entries, photos, doseEvents, profile, setProfile } = useStore();

  const width = Math.min(Dimensions.get('window').width - Spacing.four * 2, MaxContentWidth);
  const selected = useMemo(
    () => (profile.dashboardMetrics?.length ? profile.dashboardMetrics : ['weight']),
    [profile.dashboardMetrics],
  );

  const series = useMemo(() => {
    const dates = Object.keys(entries).sort();
    return CHECKIN_METRICS.filter((m) => selected.includes(m.key as string)).map((m) => {
      const points: ChartPoint[] = dates
        .map((d) => ({ label: d.slice(5), value: entries[d]?.[m.key] }))
        .filter((p): p is ChartPoint => typeof p.value === 'number');
      return { ...m, points };
    });
  }, [entries, selected]);

  const latest = (session: 'face' | 'body') =>
    photos.filter((p) => p.session === session).sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1));

  const photoPages: { session: 'face' | 'body'; baseline: PhotoEntry; latest: PhotoEntry }[] = [];
  for (const s of ['body', 'face'] as const) {
    const list = latest(s);
    if (list.length >= 1) {
      const newest = list[0];
      const baseline = list[list.length - 1];
      photoPages.push({ session: s, baseline, latest: newest });
    }
  }

  const today = localDateKey();
  const loggedToday = !!entries[today];
  const dosesToday = doseEvents.filter((d) => localDateKey(new Date(d.takenAt)) === today).length;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <View>
            <EngravedLabel>{t('checkin.title')}</EngravedLabel>
            <ThemedText type="display">{t('checkin.today')}</ThemedText>
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
          {/* Swipeable progress card: photo compares then charts (H-01). */}
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={{ width }}>
            {photoPages.map((p) => (
              <Pressable
                key={p.session}
                style={[styles.page, { width }]}
                onPress={() => router.push('/photos')}>
                <Card style={styles.cardFill}>
                  <EngravedLabel>{t(p.session === 'face' ? 'photos.sessionFace' : 'photos.sessionBody')}</EngravedLabel>
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
                  <LineChart data={s.points} unit={s.unitKey ? t(s.unitKey as 'units.g') : undefined} />
                </Card>
              </View>
            ))}

            {photoPages.length === 0 && series.every((s) => s.points.length < 2) && (
              <View style={[styles.page, { width }]}>
                <Card style={styles.cardFill}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('dashboard.empty')}
                  </ThemedText>
                </Card>
              </View>
            )}
          </ScrollView>

          {/* Metric selector */}
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

          {/* Distillation summary */}
          <Card style={styles.summary}>
            <ThemedText type="small" themeColor="textSecondary">
              {loggedToday ? t('dashboard.loggedToday') : t('dashboard.notLoggedToday')}
            </ThemedText>
            <Divider />
            <ThemedText type="small" themeColor="textSecondary">
              {t('dashboard.dosesToday', { count: dosesToday })}
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
    gap: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  scroll: { gap: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.six },
  page: { paddingRight: 0 },
  cardFill: { gap: Spacing.two, minHeight: 200 },
  compareRow: { flexDirection: 'row', gap: Spacing.two },
  compareCol: { flex: 1, gap: Spacing.one, alignItems: 'center' },
  photo: { width: '100%', aspectRatio: 3 / 4, borderRadius: 2 },
  metricChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  summary: { gap: Spacing.two },
  buttons: { flexDirection: 'row', gap: Spacing.two },
  buttonHalf: { flex: 1 },
});
