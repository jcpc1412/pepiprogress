import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { type MutableRefObject, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Dimensions, type LayoutChangeEvent, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { TextButton, SingleSelectChips } from '@/components/form';
import { Card, Divider, EngravedLabel, Placeholder, Skeleton, StatusPill } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { PhotoCapture } from '@/features/photos/photo-capture';
import { VisionCameraCapture } from '@/features/photos/vision-camera-capture';
import { useTheme } from '@/hooks/use-theme';
import {
  aiErrorKind,
  analyzePhoto,
  runEncouragementAnalysis,
  type PhotoAnalysis,
} from '@/lib/ai';
import { useAuth } from '@/lib/auth';
import {
  getCadence,
  getGroupForSlugs,
  isVisualSymptom,
  nextMilestoneISO,
  sessionEncouragementKey,
  sessionScientificKey,
} from '@/lib/photo-cadence';
import { daysBetween } from '@/lib/dates';
import { copyPhotoToDocuments, uploadPhotoToCloud, useResolvedUris } from '@/lib/photos';
import { localDateKey, useStore, type PhotoEntry, type PhotoSession } from '@/lib/store';

// ─── Wipe/slider compare ────────────────────────────────────────────────────

function WipeCompare({
  baselineUri,
  selectedUri,
  badge,
}: {
  baselineUri: string;
  selectedUri: string;
  badge?: ReactNode;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [w, setW] = useState(0);
  // All PanResponder mutable state in one object so only one ref is captured.
  const gs = useRef({ w: 0, currentFrac: 0.5, startFrac: 0.5 });

  const [frac] = useState(() => new Animated.Value(0.5));
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        gs.current.startFrac = gs.current.currentFrac;
      },
      onPanResponderMove: (_, { dx }) => {
        if (!gs.current.w) return;
        const next = Math.max(0.05, Math.min(0.95, gs.current.startFrac + dx / gs.current.w));
        gs.current.currentFrac = next;
        frac.setValue(next);
      },
    }),
  );

  const handleLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    setW(width);
    gs.current.w = width;
  };

  const clipW = w > 0 ? frac.interpolate({ inputRange: [0, 1], outputRange: [0, w] }) : undefined;

  return (
    <View
      style={[wipeStyles.wrap, { borderColor: theme.border, backgroundColor: theme.surfaceSunken }]}
      onLayout={handleLayout}
      {...pan.panHandlers}>
      <Image source={{ uri: baselineUri }} style={StyleSheet.absoluteFill} contentFit="cover" />

      {clipW !== undefined && (
        <>
          <Animated.View style={[StyleSheet.absoluteFill, { width: clipW, overflow: 'hidden' }]}>
            <Image source={{ uri: selectedUri }} style={{ width: w, flex: 1 }} contentFit="cover" />
          </Animated.View>
          <Animated.View
            style={[wipeStyles.divider, { left: clipW, backgroundColor: 'rgba(240,239,236,0.85)' }]}
          />
          <Animated.View
            style={[wipeStyles.handle, { left: clipW, backgroundColor: 'rgba(240,239,236,0.92)' }]}>
            <ThemedText style={wipeStyles.handleIcon}>{'◀▶'}</ThemedText>
          </Animated.View>
        </>
      )}

      <View style={wipeStyles.capLeft} pointerEvents="none">
        <ThemedText type="monoSm" style={wipeStyles.capText}>
          {t('photos.latest')}
        </ThemedText>
      </View>
      <View style={wipeStyles.capRight} pointerEvents="none">
        <ThemedText type="monoSm" style={wipeStyles.capText}>
          {t('photos.baseline')}
        </ThemedText>
      </View>
      <View style={wipeStyles.hint} pointerEvents="none">
        <ThemedText type="monoSm" style={wipeStyles.hintText}>
          {t('photos.wipeHint')}
        </ThemedText>
      </View>

      {badge ? <View style={wipeStyles.badge}>{badge}</View> : null}
    </View>
  );
}

const wipeStyles = StyleSheet.create({
  wrap: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: Radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  divider: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth },
  handle: {
    position: 'absolute',
    top: '50%',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateX: -14 }, { translateY: -14 }],
  },
  handleIcon: { fontSize: 9, color: '#131210', letterSpacing: 0 },
  capLeft: { position: 'absolute', top: Spacing.two, left: Spacing.two },
  capRight: { position: 'absolute', top: Spacing.two, right: Spacing.two },
  capText: { color: 'rgba(240,239,236,0.80)' },
  hint: { position: 'absolute', bottom: Spacing.three, left: 0, right: 0, alignItems: 'center' },
  hintText: { color: 'rgba(240,239,236,0.50)' },
  badge: { position: 'absolute', bottom: Spacing.two + 20, left: Spacing.two, right: Spacing.two },
});

// ─── Comparability dot ──────────────────────────────────────────────────────

function ComparabilityDot({ photo }: { photo: PhotoEntry }) {
  const theme = useTheme();
  const color =
    photo.comparable === true
      ? theme.signalGood
      : photo.comparable === false
        ? theme.signalBad
        : theme.textMuted;
  return <View style={[dotStyles.dot, { backgroundColor: color }]} />;
}

const dotStyles = StyleSheet.create({
  dot: { position: 'absolute', bottom: 3, right: 3, width: 7, height: 7, borderRadius: 4 },
});

// ─── Single photo frame ──────────────────────────────────────────────────────

function PhotoFrame({ uri, caption }: { uri: string; caption: string }) {
  const theme = useTheme();
  return (
    <View style={[frameStyles.frame, { borderColor: theme.border, backgroundColor: theme.surfaceSunken }]}>
      <Image source={{ uri }} style={frameStyles.img} contentFit="cover" />
      <View style={frameStyles.cap}>
        <ThemedText type="monoSm" style={frameStyles.capText}>
          {caption}
        </ThemedText>
      </View>
    </View>
  );
}

const frameStyles = StyleSheet.create({
  frame: {
    width: '60%',
    aspectRatio: 2 / 3,
    borderRadius: Radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  img: { flex: 1 },
  cap: { position: 'absolute', top: Spacing.two, left: Spacing.two },
  capText: { color: 'rgba(240,239,236,0.80)' },
});

// ─── Thumbnail size (4 visible) ──────────────────────────────────────────────

/** Compute per-thumb width so exactly 4 fit in the content area with gaps. */
function useThumbWidth() {
  const availableW = Math.min(Dimensions.get('window').width - Spacing.four * 2, 480);
  const gap = Spacing.two;
  return Math.floor((availableW - gap * 3) / 4);
}

// ─── Main component ──────────────────────────────────────────────────────────

export function ProgressPhotos({
  session,
  onSessionChange,
  captureRef,
}: {
  session: PhotoSession;
  onSessionChange: (s: PhotoSession) => void;
  /** Parent sets this ref so its floating "Take a photo" button can trigger capture. */
  captureRef?: MutableRefObject<(() => void) | null>;
}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const { user } = useAuth();
  const { photos, entries, symptomEvents, protocolItems, profile, addPhoto, updatePhoto, setProfile } = useStore();
  const [capturing, setCapturing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastNote, setLastNote] = useState<{ id: string; analysis: PhotoAnalysis } | null>(null);
  const [encouragementNote, setEncouragementNote] = useState<string | null>(null);
  const [aiError, setAiError] = useState<'network' | 'server' | null>(null);
  const [lastAiAction, setLastAiAction] = useState<'scientific' | 'encouragement' | null>(null);

  const thumbW = useThumbWidth();
  const thumbH = Math.floor(thumbW * (4 / 3));

  // Expose the capture trigger to the parent floating button.
  useEffect(() => {
    if (captureRef) captureRef.current = () => setCapturing(true);
    return () => {
      if (captureRef) captureRef.current = null;
    };
  }, [captureRef]);

  // Newest-first; [0] = latest, last = baseline.
  const sessionPhotos = photos.filter((p) => p.session === session);
  const latest = sessionPhotos[0];
  const resolvedUris = useResolvedUris(sessionPhotos);
  const baseline = sessionPhotos[sessionPhotos.length - 1];
  const selected = sessionPhotos.find((p) => p.id === selectedId) ?? latest;
  const canCompare = sessionPhotos.length >= 2;

  // ── Compound group + cadence ─────────────────────────────────────────────
  const group = useMemo(() => getGroupForSlugs(profile.compoundSlugs), [profile.compoundSlugs]);
  const cadence = getCadence(group);

  // ── Milestone dates from profile ─────────────────────────────────────────
  const nextEncouragementISO = profile[sessionEncouragementKey(session)];
  const nextScientificISO = profile[sessionScientificKey(session)];

  const nextEncouragementLabel = useMemo(
    () => (nextEncouragementISO ? new Date(nextEncouragementISO).toLocaleDateString() : null),
    [nextEncouragementISO],
  );
  const nextScientificLabel = useMemo(
    () => (nextScientificISO ? new Date(nextScientificISO).toLocaleDateString() : null),
    [nextScientificISO],
  );

  // ── Schedule milestones when the first photo for a session is saved ───────
  useEffect(() => {
    if (sessionPhotos.length === 0) return;
    const encKey = sessionEncouragementKey(session);
    if (profile[encKey]) return;
    if (cadence.encouragementDays === 0) return;

    const sciKey = sessionScientificKey(session);
    const iso = new Date().toISOString();
    setProfile({
      [encKey]: nextMilestoneISO(iso, cadence.encouragementDays),
      [sciKey]: nextMilestoneISO(iso, cadence.scientificDays),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionPhotos.length, session]);

  // ── Upload new photos to cloud when signed in ────────────────────────────
  const uploadedIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!user) return;
    for (const photo of photos) {
      if (photo.cloudPath || uploadedIds.current.has(photo.id)) continue;
      uploadedIds.current.add(photo.id);
      uploadPhotoToCloud(photo.uri, user.id, photo.id)
        .then((cloudPath) => updatePhoto(photo.id, { cloudPath }))
        .catch(() => {
          uploadedIds.current.delete(photo.id);
        });
    }
  }, [photos, user, updatePhoto]);

  // ── Scientific analysis ──────────────────────────────────────────────────
  const runScientificAnalysis = useCallback(async () => {
    if (!latest || !baseline || analyzing) return;
    setAnalyzing(true);
    setEncouragementNote(null);
    setAiError(null);
    setLastAiAction('scientific');
    try {
      let cycleCtx: 'luteal' | undefined;
      if (profile.lastPeriodDate && profile.cycleLength) {
        const daysSince = Math.floor(
          (Date.now() - new Date(profile.lastPeriodDate).getTime()) / 86400000,
        );
        const dayInCycle = daysSince % profile.cycleLength;
        if (dayInCycle >= profile.cycleLength - 14) cycleCtx = 'luteal';
      }

      let measurementDelta: Parameters<typeof analyzePhoto>[0]['measurementDelta'];
      const withMeasurements = Object.values(entries)
        .filter((e) => e.waist !== undefined || e.hips !== undefined)
        .sort((a, b) => b.date.localeCompare(a.date));
      if (withMeasurements.length >= 2) {
        const [curr, prev] = withMeasurements;
        const d: NonNullable<typeof measurementDelta> = {};
        if (curr.waist !== undefined && prev.waist !== undefined) d.waist = curr.waist - prev.waist;
        if (curr.hips !== undefined && prev.hips !== undefined) d.hips = curr.hips - prev.hips;
        if (
          curr.extraMeasurementKey &&
          curr.extraMeasurementValue !== undefined &&
          curr.extraMeasurementKey === prev.extraMeasurementKey &&
          prev.extraMeasurementValue !== undefined
        ) {
          d.extra = { key: curr.extraMeasurementKey, delta: curr.extraMeasurementValue - prev.extraMeasurementValue };
        }
        if (Object.keys(d).length > 0) measurementDelta = d;
      }

      const symptomCtx = symptomEvents
        .filter((s) => isVisualSymptom(s.type))
        .slice(0, 3)
        .map((s) => s.type)
        .join(', ') || undefined;

      const startDates = protocolItems
        .map((p) => p.startedAt)
        .filter((s): s is string => !!s)
        .sort();
      let cycleWeek: number | undefined;
      if (startDates[0]) {
        const weeks = Math.floor((Date.now() - new Date(startDates[0]).getTime()) / (7 * 86400000));
        if (weeks >= 0) cycleWeek = weeks + 1;
      }

      const res = await analyzePhoto({
        uri: resolvedUris[latest.id] ?? latest.uri,
        baselineUri: resolvedUris[baseline.id] ?? baseline.uri,
        session,
        locale: i18n.language,
        bodyTypeCalibration: profile.bodyType,
        cycleContext: cycleCtx,
        measurementDelta,
        symptomContext: symptomCtx,
        cycleWeek,
      });
      updatePhoto(latest.id, {
        driftScore: res.driftScore,
        comparable: res.comparable,
        lighting: res.lighting,
      });
      setLastNote({ id: latest.id, analysis: res });
      const sciKey = sessionScientificKey(session);
      setProfile({ [sciKey]: nextMilestoneISO(new Date().toISOString(), cadence.scientificDays) });
    } catch (err) {
      const kind = aiErrorKind(err);
      if (kind !== 'notConfigured') setAiError(kind);
    } finally {
      setAnalyzing(false);
    }
  }, [latest, baseline, analyzing, session, i18n.language, profile, entries, symptomEvents, protocolItems, updatePhoto, setProfile, cadence, resolvedUris]);

  // ── Encouragement check-in ───────────────────────────────────────────────
  const runEncouragementCheckin = useCallback(async () => {
    if (analyzing) return;
    setAnalyzing(true);
    setLastNote(null);
    setAiError(null);
    setLastAiAction('encouragement');
    try {
      const recentLogs = Object.values(entries)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 7)
        .map((e) => ({ date: e.date, weight: e.weight, wellness: e.wellness, energy: e.energy }));

      let cycleCtx: 'luteal' | 'follicular' | undefined;
      if (profile.lastPeriodDate && profile.cycleLength) {
        const daysSince = Math.floor(
          (Date.now() - new Date(profile.lastPeriodDate).getTime()) / 86400000,
        );
        const dayInCycle = daysSince % profile.cycleLength;
        cycleCtx = dayInCycle >= profile.cycleLength - 14 ? 'luteal' : 'follicular';
      }

      const res = await runEncouragementAnalysis({
        compoundGroup: group,
        lastScientificResult: lastNote?.analysis
          ? {
              driftScore: lastNote.analysis.driftScore,
              comparable: lastNote.analysis.comparable,
              change: lastNote.analysis.change,
            }
          : undefined,
        recentLogs,
        cycleContext: cycleCtx,
        locale: i18n.language,
      });
      setEncouragementNote(res.message);
      const encKey = sessionEncouragementKey(session);
      setProfile({ [encKey]: nextMilestoneISO(new Date().toISOString(), cadence.encouragementDays) });
    } catch (err) {
      const kind = aiErrorKind(err);
      if (kind !== 'notConfigured') setAiError(kind);
    } finally {
      setAnalyzing(false);
    }
  }, [analyzing, entries, profile, group, lastNote, i18n.language, session, cadence, setProfile]);

  // ── Retroactive import ───────────────────────────────────────────────────
  const importFromLibrary = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      exif: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const exifDate = asset.exif?.DateTimeOriginal as string | undefined;
    const parsed = exifDate ? new Date(exifDate.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')) : null;
    const takenAt = parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
    const persistentUri = await copyPhotoToDocuments(asset.uri);
    addPhoto({ session, uri: persistentUri, takenAt });
  }, [session, addPhoto]);

  // ── Derived display ───────────────────────────────────────────────────────
  const note = lastNote && selected && lastNote.id === selected.id ? lastNote.analysis : null;
  const showWipe = !!selected && !!baseline && selected.id !== baseline.id;
  const lightingBad = showWipe && selected.lighting !== undefined && selected.lighting !== 'ok';
  const selectedBadge =
    showWipe && (selected.comparable !== undefined || lightingBad) ? (
      <View style={styles.badgeRow}>
        {selected.comparable !== undefined && (
          <StatusPill
            label={selected.comparable ? t('photos.comparable') : t('photos.notComparable')}
            tone={selected.comparable ? 'good' : 'bad'}
          />
        )}
        {lightingBad && <StatusPill label={t('photos.lightingWarn')} tone="bad" />}
      </View>
    ) : null;

  return (
    <View style={styles.wrap}>
      {/* Face / Body selector */}
      <SingleSelectChips
        options={[
          { value: 'face', label: t('photos.sessionFace') },
          { value: 'body', label: t('photos.sessionBody') },
        ]}
        value={session}
        onChange={onSessionChange}
      />

      {/* Photo display */}
      {sessionPhotos.length === 0 ? (
        <View style={styles.emptyBlock}>
          <ThemedText type="mono" themeColor="textMuted">
            {t('photos.empty')}
          </ThemedText>
          <ThemedText type="monoSm" themeColor="textMuted" style={styles.clothingGuidance}>
            {t('photos.clothingGuidance')}
          </ThemedText>
        </View>
      ) : showWipe ? (
        <WipeCompare
          baselineUri={resolvedUris[baseline.id] ?? baseline.uri}
          selectedUri={resolvedUris[selected.id] ?? selected.uri}
          badge={selectedBadge}
        />
      ) : (
        <PhotoFrame uri={resolvedUris[baseline.id] ?? baseline.uri} caption={t('photos.baseline')} />
      )}

      {/* Timeline placeholder */}
      {sessionPhotos.length <= 1 && (
        <View>
          <EngravedLabel>{t('photos.timelineLabel')}</EngravedLabel>
          <Placeholder label={t('photos.timelinePlaceholder')} height={thumbH + Spacing.three}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
              {Array.from({ length: 4 }, (_, i) => (
                <View key={i} style={[styles.thumb, { width: thumbW, height: thumbH, borderColor: theme.border, borderStyle: 'dashed' }]} />
              ))}
            </ScrollView>
          </Placeholder>
        </View>
      )}

      {/* Timeline strip — 4-wide thumbnails, scrollable for older shots */}
      {sessionPhotos.length > 1 && (
        <View>
          <View style={styles.timelineHeader}>
            <EngravedLabel>{t('photos.timelineLabel')}</EngravedLabel>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/photo-history')}
              hitSlop={8}>
              <ThemedText type="monoSm" themeColor="accent">{t('photos.history')}</ThemedText>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
            {[...sessionPhotos].reverse().map((p, i, arr) => {
              const isActive = p.id === (selected?.id ?? latest?.id);
              const baselineDay = arr[0]?.takenAt;
              const dayNum = baselineDay
                ? daysBetween(localDateKey(new Date(baselineDay)), localDateKey(new Date(p.takenAt))) + 1
                : i + 1;
              return (
                <View key={p.id} style={styles.thumbCol}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setSelectedId(p.id)}
                    style={({ pressed }) => [
                      styles.thumb,
                      { width: thumbW, height: thumbH, borderColor: isActive ? '#9A9590' : 'transparent' },
                      pressed && styles.thumbPressed,
                    ]}>
                    <Image source={{ uri: resolvedUris[p.id] ?? p.uri }} style={styles.thumbImg} contentFit="cover" />
                    <ComparabilityDot photo={p} />
                  </Pressable>
                  <ThemedText type="monoSm" themeColor={isActive ? 'text' : 'textMuted'}>
                    {t('photos.dayShort', { count: dayNum })}
                  </ThemedText>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Milestone section */}
      {canCompare && (
        <View style={styles.milestoneSection}>
          <TextButton
            label={t('photos.runDeepComparison', { days: cadence.scientificDays })}
            onPress={runScientificAnalysis}
            disabled={analyzing}
          />
          <View style={styles.milestoneRow}>
            <TextButton
              label={t('photos.runCheckin')}
              onPress={runEncouragementCheckin}
              disabled={analyzing}
            />
            {nextScientificLabel && (
              <ThemedText type="monoSm" themeColor="textMuted">
                {t('photos.nextDeepComparison', { date: nextScientificLabel })}
              </ThemedText>
            )}
          </View>
        </View>
      )}

      {analyzing && <Skeleton lines={3} />}
      {aiError && (
        <View style={styles.aiErrorRow}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.aiErrorText}>
            {t(aiError === 'network' ? 'common.errorNetwork' : 'common.errorServer')}
          </ThemedText>
          <TextButton
            label={t('common.retry')}
            onPress={() =>
              lastAiAction === 'scientific' ? runScientificAnalysis() : runEncouragementCheckin()
            }
          />
        </View>
      )}

      {sessionPhotos.length === 1 && nextEncouragementLabel && (
        <ThemedText type="monoSm" themeColor="textMuted">
          {t('photos.baselineSet', { date: nextEncouragementLabel })}
        </ThemedText>
      )}

      {(note || encouragementNote) && (
        <Card>
          {note?.change ? (
            <>
              <EngravedLabel>{t('photos.analysisLabel')}</EngravedLabel>
              <ThemedText type="mono" themeColor="textSecondary">
                {note.change}
              </ThemedText>
              {note.retake && (
                <>
                  <Divider />
                  <ThemedText type="monoSm" themeColor="signalBad">
                    {t('photos.retakeHint')}
                  </ThemedText>
                </>
              )}
            </>
          ) : null}
          {note && encouragementNote && <Divider />}
          {encouragementNote ? (
            <>
              <EngravedLabel>{t('photos.checkinLabel')}</EngravedLabel>
              <ThemedText type="monoSm" themeColor="textSecondary" style={styles.encouragementNote}>
                {encouragementNote}
              </ThemedText>
            </>
          ) : null}
        </Card>
      )}

      {!note && !encouragementNote && !analyzing && (
        <Card>
          <EngravedLabel>{t('photos.analysisLabel')}</EngravedLabel>
          <Placeholder label={t('photos.analysisPlaceholder')} height={64} />
        </Card>
      )}

      <Pressable accessibilityRole="button" onPress={importFromLibrary} style={styles.importBtn}>
        <ThemedText type="monoSm" themeColor="textSecondary" style={styles.importText}>
          {t('photos.importLibrary')}
        </ThemedText>
      </Pressable>

      {session === 'face' ? (
        <VisionCameraCapture
          session={session}
          ghostUri={latest?.uri}
          baseline={baseline}
          visible={capturing}
          onClose={() => setCapturing(false)}
        />
      ) : (
        <PhotoCapture
          session={session}
          ghostUri={latest?.uri}
          visible={capturing}
          onClose={() => setCapturing(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  emptyBlock: { gap: Spacing.two },
  clothingGuidance: { lineHeight: 18 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  timelineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.one },
  strip: { gap: Spacing.two, paddingVertical: Spacing.one },
  thumbCol: { alignItems: 'center', gap: Spacing.half },
  thumb: {
    borderRadius: Radii.chamfer,
    borderWidth: 1,
    overflow: 'hidden',
  },
  thumbPressed: { opacity: 0.7 },
  thumbImg: { flex: 1 },
  milestoneSection: { gap: Spacing.two },
  milestoneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  aiErrorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  aiErrorText: { flex: 1 },
  encouragementNote: { lineHeight: 18 },
  importBtn: { alignSelf: 'center' },
  importText: { textDecorationLine: 'underline' },
});
