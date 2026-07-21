import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton, TextButton } from '@/components/form';
import { HeroFigure, ReasonButton } from '@/components/hero-figure';
import { GearIcon } from '@/components/icons';
import { LineChart, type ChartPoint } from '@/components/line-chart';
import { Divider, EngravedLabel, Placeholder, StatusPill } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { ConfidenceBadge } from '@/components/confidence-badge';
import { MeasureNextNudge } from '@/features/home/measure-next-nudge';
import { TodayDoses } from '@/features/home/today-doses';
import { TodayRecordStrip } from '@/features/home/today-record-strip';
import { formatHeroValue, resolveMsg, useVerdict, type TFn } from '@/features/home/use-verdict';
import { daysBetween } from '@/lib/dates';
import { useOverlay } from '@/lib/nav-overlay';
import { useStore } from '@/lib/store';
import { useToday } from '@/lib/today';

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
  const { openSettings, openLogging } = useOverlay();
  const { photos, protocolItems, profile } = useStore();

  const verdict = useVerdict();
  // Loose alias for the verdict presentation helpers (avoids the huge typed-key
  // union tripping TS's instantiation-depth limit).
  const tx = t as unknown as TFn;
  const hero = verdict.hero; // narrowed const so unions hold inside closures/JSX

  const today = useToday();

  // Condensed mono eyebrow: DD MMM · TYPE · WEEK N (redesign §2.5).
  const eyebrow = useMemo(() => {
    // Built from the shared `today` key, not `new Date()`: this memo only
    // re-runs on its deps, so a raw clock read here would keep showing the day
    // the screen was mounted on after midnight (W7-46).
    const [y, m, d] = today.split('-').map(Number);
    const date = new Date(y, m - 1, d)
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

  // The decompose now lives on the Analysis tab (R2-C C4).
  const openReasoning = () => router.navigate('/insights');

  // Evidence (R2-B B1): a recent photo compare wins when one exists — the mockup
  // default — otherwise the hero metric's own chart. Photo pair = the most recent
  // shot within 14 days plus the earliest shot of its own session+part (baseline).
  const evidencePair = useMemo(() => {
    if (!photos.length) return null;
    const latest = [...photos].sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1))[0];
    // daysBetween is pure (deterministic in its args) — avoids Date.now() in render.
    if (daysBetween(latest.takenAt.slice(0, 10), today) > 14) return null;
    const baseline = photos
      .filter((p) => p.session === latest.session && (p.part ?? undefined) === (latest.part ?? undefined))
      .sort((a, b) => (a.takenAt < b.takenAt ? -1 : 1))[0];
    if (!baseline || baseline.id === latest.id) return null;
    return { latest, baseline };
  }, [photos, today]);

  // Photo hero (W3-11): a fresh comparable photo with a visible change leads;
  // resolve it to a baseline/latest pair for the compare block.
  const heroPhotoPair = useMemo(() => {
    if (hero?.kind !== 'photo') return null;
    const latest = photos.find((p) => p.id === hero.photoId);
    if (!latest) return null;
    const baseline = photos
      .filter((p) => p.session === latest.session && (p.part ?? undefined) === (latest.part ?? undefined))
      .sort((a, b) => (a.takenAt < b.takenAt ? -1 : 1))[0];
    if (!baseline || baseline.id === latest.id) return null;
    return { latest, baseline };
  }, [hero, photos]);

  const heroSignal =
    hero?.kind === 'metric'
      ? verdict.signals.find((s) => s.metricId === hero?.metricId)
      : // Photo hero: the evidence slot shows the top-weighted signal instead.
        verdict.signals[0];

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

  // Hero footer (H-1): the signals the verdict is watching, so the number has
  // visible context. Top few by contribution weight; already translated names.
  const trackingList =
    verdict.state !== 'building'
      ? verdict.signals.slice(0, 3).map((s) => t(s.labelKey as 'fields.weight')).join(' · ')
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
                <ConfidenceBadge
                  level={verdict.confidence}
                  rationale={resolveMsg(tx, verdict.confidenceRationale)}
                />
              ) : null}
            </View>

            {heroPhotoPair ? (
              // The photo compare AS the hero (W3-11): visible change leads.
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('verdict.photoHero')}
                accessibilityHint={t('photos.heading')}
                onPress={() => router.push('/photos')}>
                <View style={styles.compareRow}>
                  <View style={styles.compareCol}>
                    <Image source={{ uri: heroPhotoPair.baseline.uri }} style={styles.photo} contentFit="cover" />
                    <ThemedText type="monoSm" themeColor="textMuted">
                      {t('photos.baseline')}
                    </ThemedText>
                  </View>
                  <View style={styles.compareCol}>
                    <Image source={{ uri: heroPhotoPair.latest.uri }} style={styles.photo} contentFit="cover" />
                    <ThemedText type="monoSm" themeColor="textMuted">
                      {t('photos.latest')}
                    </ThemedText>
                  </View>
                </View>
                {heroPhotoPair.latest.changeNote ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.heroSub}>
                    {heroPhotoPair.latest.changeNote}
                  </ThemedText>
                ) : null}
              </Pressable>
            ) : null}

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
                {trackingList ? (
                  <ThemedText type="monoSm" themeColor="textMuted" style={styles.tracking}>
                    {t('verdict.trackingFooter', { list: trackingList })}
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

            {/* The verdict names its own biggest evidence gap (W4-17). */}
            <MeasureNextNudge variant="nudge" />
          </View>

          <Divider style={styles.rule} />

          {/* ── Evidence — a recent photo compare wins (unless the photo already
              IS the hero, W3-11), else the hero chart (R2-B B1) ── */}
          {evidencePair && hero?.kind !== 'photo' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('verdict.evidenceTitle')}
              accessibilityHint={t('photos.heading')}
              onPress={() => router.push('/photos')}
              style={styles.evidence}>
              <EngravedLabel>{t('verdict.evidenceTitle')}</EngravedLabel>
              <View style={styles.compareRow}>
                <View style={styles.compareCol}>
                  <Image source={{ uri: evidencePair.baseline.uri }} style={styles.photo} contentFit="cover" />
                  <ThemedText type="monoSm" themeColor="textMuted">
                    {t('photos.baseline')}
                  </ThemedText>
                </View>
                <View style={styles.compareCol}>
                  <Image source={{ uri: evidencePair.latest.uri }} style={styles.photo} contentFit="cover" />
                  <ThemedText type="monoSm" themeColor="textMuted">
                    {t('photos.latest')}
                  </ThemedText>
                </View>
              </View>
            </Pressable>
          ) : heroSignal ? (
            <View style={styles.evidence}>
              <EngravedLabel>{t('verdict.evidenceTitle')}</EngravedLabel>
              <LineChart
                data={heroSignal.series.map((p): ChartPoint => ({ label: p.dateKey.slice(5), value: p.value }))}
                emptyLabel={t('common.noData')}
              />
            </View>
          ) : verdict.state === 'building' ? (
            <View style={styles.evidence}>
              <EngravedLabel>{t('verdict.evidenceTitle')}</EngravedLabel>
              <Placeholder label={t('verdict.baselineCta')} height={96} />
              <TextButton label={t('tabs.photos')} onPress={() => router.push('/photos')} />
            </View>
          ) : null}

          {/* Log — medium-weight, encourages logging (§7 open item resolved). */}
          <PrimaryButton label={t('dashboard.log')} onPress={() => openLogging('quick')} />

          {/* Today's record (F4, item 38) — a one-line window into the day-in-
              review, above the doses (owner 2026-07-21). */}
          <TodayRecordStrip />

          {/* One-tap dose logging (the MyTherapy-style checklist). Today's log
              recap + note moved to the reasoning screen (merged with the "why"). */}
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
  tracking: { marginTop: 2, textTransform: 'uppercase' },
  rule: { marginVertical: -Spacing.two },
  reconcile: { fontStyle: 'italic' },
  evidence: { gap: Spacing.two },
  compareRow: { flexDirection: 'row', gap: Spacing.two },
  compareCol: { flex: 1, gap: Spacing.one, alignItems: 'center' },
  photo: { width: '100%', aspectRatio: 3 / 4, borderRadius: 2 },
});
