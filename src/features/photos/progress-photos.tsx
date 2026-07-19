import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { type MutableRefObject, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Animated, Dimensions, type LayoutChangeEvent, Modal, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ConfidenceBadge } from '@/components/confidence-badge';
import { LabeledInput, PrimaryButton, TextButton, SingleSelectChips } from '@/components/form';
import { Card, Divider, EngravedLabel, Skeleton, StatusPill } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { PhotoCapture } from '@/features/photos/photo-capture';
import { VisionCameraCapture } from '@/features/photos/vision-camera-capture';
import { useTheme } from '@/hooks/use-theme';
import {
  aiErrorKind,
  analyzePhoto,
  checkFit,
  classifyPose,
  runEncouragementAnalysis,
  type PhotoAnalysis,
} from '@/lib/ai';
import { bodyFatNavy, inferBodyComposition, usesFemaleFormula } from '@/lib/body-composition';
import type { ConfidenceLevel } from '@/lib/confidence';
import { hapticSuccess } from '@/lib/haptics';
import { quickReadout, type Comparability, type QuickReadout } from '@/lib/photo-readout';
import { isNewHighscore, pickReference } from '@/lib/photo-reference';
import { RETRY_THRESHOLD } from '@/lib/photo-quality';
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
import {
  CANONICAL_POSES,
  REQUIRED_POSES,
  groupPhotosByPose,
  needsPoseConfirm,
  poseFromCapture,
  sessionForPose,
  viewForPose,
  type CanonicalPose,
  type PoseKey,
} from '@/lib/photo-pose';
import { copyPhotoToDocuments, syncPhotoRow, uploadPhotoToCloud, useResolvedUris } from '@/lib/photos';
import { localDateKey, useStore, type PhotoEntry, type PhotoSession } from '@/lib/store';

/**
 * A photo read's confidence in the shared register (W4-18). How much to trust
 * the change note: full trust when the shot is comparable and cleanly lit, less
 * when lighting or framing drifted, least when it is not comparable at all.
 */
function photoReadLevel(a: PhotoAnalysis): ConfidenceLevel {
  if (!a.comparable) return 'low';
  return a.lighting === 'ok' && a.framing === 'ok' ? 'high' : 'medium';
}
function photoReadWhyKey(a: PhotoAnalysis): 'photos.confWhyHigh' {
  const level = photoReadLevel(a);
  return (
    level === 'high' ? 'photos.confWhyHigh' : level === 'medium' ? 'photos.confWhyMedium' : 'photos.confWhyLow'
  ) as 'photos.confWhyHigh';
}

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
  captureRef,
}: {
  /** Parent sets this ref so its floating "Take a photo" button can open the
   *  capture chooser (guided check-in vs quick shot). */
  captureRef?: MutableRefObject<(() => void) | null>;
}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const { user } = useAuth();
  const { photos, entries, symptomEvents, protocolItems, profile, addPhoto, updatePhoto, setProfile } = useStore();

  // ── Reel-centric navigation (W6-26c, beta-notes §1.1/§1.3) ────────────────
  // The reel (photos grouped by pose) is the spine. There is no upfront Face vs
  // Body choice: the guided pose picker routes capture, and classification sorts
  // casual shots. Tapping a required-pose reel group focuses that session track
  // and reveals its compare / timeline / milestones / analysis below.
  const [focused, setFocused] = useState<{ session: PhotoSession; part?: string } | null>(null);

  // Capture flow: the floating button opens a chooser (guided check-in vs quick
  // shot). Guided → a pose picker → the right camera; quick → the casual camera.
  // `captureCfg` being non-null opens a camera; its shape decides which + how.
  const [chooserOpen, setChooserOpen] = useState(false);
  const [posePickerOpen, setPosePickerOpen] = useState(false);
  const [captureCfg, setCaptureCfg] = useState<{
    session: PhotoSession;
    part?: string;
    view: 'front' | 'side';
    casual: boolean;
  } | null>(null);
  const [timer, setTimer] = useState<0 | 3 | 10>(0);

  const [analyzing, setAnalyzing] = useState(false);
  // Instant, deterministic quick readout shown while the deep analysis loads (§4A).
  const [quickNote, setQuickNote] = useState<{ id: string; readout: QuickReadout } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastNote, setLastNote] = useState<{ id: string; analysis: PhotoAnalysis } | null>(null);
  const [encouragementNote, setEncouragementNote] = useState<string | null>(null);
  const [aiError, setAiError] = useState<'network' | 'server' | null>(null);
  const [lastAiAction, setLastAiAction] = useState<'scientific' | 'encouragement' | null>(null);
  // ── PH-2 instant post-capture feedback ───────────────────────────────────
  const [pendingSaveId, setPendingSaveId] = useState<string | null>(null);
  const processedSaves = useRef<Set<string>>(new Set());
  const [instantRead, setInstantRead] = useState<{
    id: string;
    comparability: Comparability;
    hint?: string;
    retake: boolean;
    highscore: boolean;
    baseline: boolean; // true = the first shot of the track (nothing to compare yet)
  } | null>(null);
  // Celebration pulse on save (reduce-motion aware, mirrors instrument-background).
  const [reduceMotion, setReduceMotion] = useState(false);
  const [celebrate] = useState(() => new Animated.Value(0));
  const [addingPart, setAddingPart] = useState(false);
  const [partDraft, setPartDraft] = useState('');
  // Reel (W6-25): id of the photo whose pose is being assigned via the chip sheet.
  const [taggingId, setTaggingId] = useState<string | null>(null);

  // The track the hooks below operate on: the live capture target while a camera
  // is open (so the ghost matches what is being shot), else the focused track.
  const trackSession: PhotoSession = captureCfg?.session ?? focused?.session ?? 'body';
  const trackPart = captureCfg?.part ?? focused?.part;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => mounted && setReduceMotion(v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const thumbW = useThumbWidth();
  const thumbH = Math.floor(thumbW * (4 / 3));

  // Expose the capture trigger to the parent floating button: open the chooser.
  useEffect(() => {
    if (captureRef) captureRef.current = () => setChooserOpen(true);
    return () => {
      if (captureRef) captureRef.current = null;
    };
  }, [captureRef]);

  // Newest-first; [0] = latest, last = baseline. Scoped to the active track
  // (session + optional custom part), so each part has its own baseline/ghost.
  const sessionPhotos = photos.filter((p) => p.session === trackSession && (p.part ?? undefined) === trackPart);
  // Body sub-parts the user has created (from profile + any already-tagged photos).
  const bodyParts = useMemo(
    () =>
      Array.from(
        new Set([
          ...(profile.customPhotoParts ?? []),
          ...photos.filter((p) => p.session === 'body' && p.part).map((p) => p.part as string),
        ]),
      ),
    [profile.customPhotoParts, photos],
  );
  const latest = sessionPhotos[0];
  // Resolve every photo's uri once (covers the compare views AND the reel, which
  // spans all sessions/parts). `sessionPhotos` is a subset, so this is enough.
  const resolvedUris = useResolvedUris(photos);
  const baseline = sessionPhotos[sessionPhotos.length - 1];
  const selected = sessionPhotos.find((p) => p.id === selectedId) ?? latest;
  const canCompare = sessionPhotos.length >= 2;
  // The promotable working reference (PH-1): best-quality, skin-priority. The
  // ghost overlay anchors to it so the user matches their strongest shot, while
  // `baseline` (the oldest) stays the immutable day-one compare anchor.
  const reference = useMemo(() => pickReference(sessionPhotos), [sessionPhotos]);
  const ghostUri = reference ? resolvedUris[reference.id] ?? reference.uri : undefined;
  // Per-pose ghost references (W6-26.5): the live pose detection in the capture
  // screens swaps the ghost to the best reference OF THE POSE the user is
  // actually holding. Poses without a tagged reference fall back to `ghostUri`.
  const ghostByPose = useMemo(() => {
    const map: Partial<Record<CanonicalPose, string>> = {};
    for (const p of CANONICAL_POSES) {
      const chain = sessionPhotos.filter((ph) => ph.pose === p);
      const ref = pickReference(chain);
      if (ref) map[p] = resolvedUris[ref.id] ?? ref.uri;
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, trackSession, trackPart, resolvedUris]);

  // ── Compound group + cadence ─────────────────────────────────────────────
  const group = useMemo(() => getGroupForSlugs(profile.compoundSlugs), [profile.compoundSlugs]);
  const cadence = getCadence(group);

  // ── Milestone dates from profile ─────────────────────────────────────────
  const nextEncouragementISO = profile[sessionEncouragementKey(trackSession)];
  const nextScientificISO = profile[sessionScientificKey(trackSession)];

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
    if (trackPart) return; // custom parts share the base body cadence; no own schedule
    const encKey = sessionEncouragementKey(trackSession);
    if (profile[encKey]) return;
    if (cadence.encouragementDays === 0) return;

    const sciKey = sessionScientificKey(trackSession);
    const iso = new Date().toISOString();
    setProfile({
      [encKey]: nextMilestoneISO(iso, cadence.encouragementDays),
      [sciKey]: nextMilestoneISO(iso, cadence.scientificDays),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionPhotos.length, trackSession]);

  // ── Upload new photos to cloud when signed in ────────────────────────────
  const uploadedIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!user) return;
    for (const photo of photos) {
      if (photo.cloudPath || uploadedIds.current.has(photo.id)) continue;
      uploadedIds.current.add(photo.id);
      uploadPhotoToCloud(photo.uri, user.id, photo.id)
        .then(async (cloudPath) => {
          // Link the Storage object to a normalized `photo` row (best-effort).
          await syncPhotoRow(photo, user.id, cloudPath, {
            storage: profile.consentPhotoStorage ?? false,
            ai: profile.consentPhotoAI ?? false,
          }).catch(() => {});
          updatePhoto(photo.id, { cloudPath });
        })
        .catch(() => {
          uploadedIds.current.delete(photo.id);
        });
    }
    // Consents are read at upload time; re-running on their change is unnecessary
    // (uploads are guarded per photo by cloudPath/uploadedIds).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, user, updatePhoto]);

  // ── Scientific analysis ──────────────────────────────────────────────────
  const runScientificAnalysis = useCallback(async () => {
    if (!latest || !baseline || analyzing) return;
    setAnalyzing(true);
    setEncouragementNote(null);
    setAiError(null);
    setQuickNote(null);
    setInstantRead(null);
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

      // Direction-aware transition framing (beta-notes §1.9): the goal is the
      // intent signal, sex alone never implies it (some trans users are here
      // for peptides only). Applies to both face and body sessions.
      const transitionCtx: 'mtf' | 'ftm' | undefined = profile.goals.includes('gender_transition')
        ? profile.sex === 'mtf'
          ? 'mtf'
          : profile.sex === 'ftm'
            ? 'ftm'
            : undefined
        : undefined;

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

      // Two-stage analysis: render an instant, local readout while the deep
      // vision call runs (§4A). Comparability from the tilt delta between shots.
      const tiltDelta =
        latest.tilt != null && baseline.tilt != null ? Math.abs(latest.tilt - baseline.tilt) : undefined;
      setQuickNote({ id: latest.id, readout: quickReadout({ tiltDelta, measurementDelta }) });

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

      // App-inferred body composition (owner §4A): a measurement-derived band
      // is preferred over the manual chip, which stays the cold-start fallback.
      let bodyCalibration = profile.bodyType;
      const latestMeas = withMeasurements[0];
      if (latestMeas && profile.height) {
        const heightCm = profile.units === 'imperial' ? profile.height * 2.54 : profile.height;
        const female = usesFemaleFormula(profile.sex);
        const bf = bodyFatNavy({
          units: profile.units,
          heightCm,
          waist: latestMeas.waist,
          neck: latestMeas.neck,
          hip: latestMeas.hips,
          female,
        });
        if (bf) bodyCalibration = inferBodyComposition(bf.pct, female);
      }

      const res = await analyzePhoto({
        uri: resolvedUris[latest.id] ?? latest.uri,
        baselineUri: resolvedUris[baseline.id] ?? baseline.uri,
        session: trackSession,
        locale: i18n.language,
        bodyTypeCalibration: bodyCalibration,
        cycleContext: cycleCtx,
        measurementDelta,
        symptomContext: symptomCtx,
        cycleWeek,
        units: profile.units,
        transitionContext: transitionCtx,
      });
      updatePhoto(latest.id, {
        driftScore: res.driftScore,
        comparable: res.comparable,
        lighting: res.lighting,
        changeNote: res.change || undefined,
        coverage: res.coverage,
      });
      setLastNote({ id: latest.id, analysis: res });
      const sciKey = sessionScientificKey(trackSession);
      setProfile({ [sciKey]: nextMilestoneISO(new Date().toISOString(), cadence.scientificDays) });
    } catch (err) {
      const kind = aiErrorKind(err);
      if (kind !== 'notConfigured') setAiError(kind);
    } finally {
      setAnalyzing(false);
    }
  }, [latest, baseline, analyzing, trackSession, i18n.language, profile, entries, symptomEvents, protocolItems, updatePhoto, setProfile, cadence, resolvedUris]);

  // ── Encouragement check-in ───────────────────────────────────────────────
  const runEncouragementCheckin = useCallback(async () => {
    if (analyzing) return;
    setAnalyzing(true);
    setLastNote(null);
    setAiError(null);
    setInstantRead(null);
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
        units: profile.units,
      });
      setEncouragementNote(res.message);
      const encKey = sessionEncouragementKey(trackSession);
      setProfile({ [encKey]: nextMilestoneISO(new Date().toISOString(), cadence.encouragementDays) });
    } catch (err) {
      const kind = aiErrorKind(err);
      if (kind !== 'notConfigured') setAiError(kind);
    } finally {
      setAnalyzing(false);
    }
  }, [analyzing, entries, profile, group, lastNote, i18n.language, trackSession, cadence, setProfile]);

  // ── PH-2: instant post-capture read ──────────────────────────────────────
  const onPhotoSaved = useCallback((photoId: string) => {
    setPendingSaveId(photoId);
  }, []);

  // Unconditional celebration pulse on save (the Haiku read is the "it's working"
  // proof; this is the affective confirmation). Reduce-motion → no animation.
  const triggerCelebration = useCallback(() => {
    hapticSuccess();
    if (reduceMotion) {
      celebrate.setValue(1);
      return;
    }
    celebrate.setValue(0);
    Animated.sequence([
      Animated.spring(celebrate, { toValue: 1, useNativeDriver: true, friction: 6, tension: 90 }),
    ]).start();
  }, [celebrate, reduceMotion]);

  const runInstantRead = useCallback(
    async (saved: PhotoEntry) => {
      triggerCelebration();

      // The track chain this shot belongs to (its own session + part).
      const chain = photos.filter(
        (p) => p.session === saved.session && (p.part ?? undefined) === (saved.part ?? undefined),
      );
      const others = chain.filter((p) => p.id !== saved.id);
      // Compare against the prior working reference (best of the earlier shots).
      const ref = pickReference(others);
      const highscore = others.length > 0 && isNewHighscore(chain, saved.id);

      if (!ref) {
        // First shot of the track: celebrate + confirm the baseline is set.
        setInstantRead({ id: saved.id, comparability: 'partial', retake: false, highscore: false, baseline: true });
        return;
      }

      // Deterministic comparability from the tilt delta (offline, instant).
      const tiltDelta =
        saved.tilt != null && ref.tilt != null ? Math.abs(saved.tilt - ref.tilt) : undefined;
      const readout = quickReadout({ tiltDelta });
      const qualityOff = saved.qualityScore != null && saved.qualityScore < RETRY_THRESHOLD;
      setInstantRead({
        id: saved.id,
        comparability: readout.comparability,
        retake: qualityOff,
        highscore,
        baseline: false,
      });

      // Cheap Haiku fit sentence + retake nudge (fails open — never blocks the card).
      const fit = await checkFit(resolvedUris[saved.id] ?? saved.uri, resolvedUris[ref.id] ?? ref.uri).catch(
        () => null,
      );
      if (fit) {
        setInstantRead((prev) =>
          prev && prev.id === saved.id
            ? { ...prev, hint: fit.hint, retake: prev.retake || fit.fit === 'poor' }
            : prev,
        );
      }

      // Full Sonnet read auto-runs ONLY on a scheduled milestone day (else it stays
      // behind the "deep comparison" button). Balances depth against cost.
      const sciISO = profile[sessionScientificKey(saved.session)];
      if (sciISO && Date.now() >= new Date(sciISO).getTime() && chain.length >= 2) {
        void runScientificAnalysis();
      }
    },
    [photos, profile, resolvedUris, triggerCelebration, runScientificAnalysis],
  );

  // Run the instant read once the saved photo is reflected in the store.
  useEffect(() => {
    if (!pendingSaveId || processedSaves.current.has(pendingSaveId)) return;
    const saved = photos.find((p) => p.id === pendingSaveId);
    if (!saved) return; // wait for the store to reflect the new photo
    processedSaves.current.add(pendingSaveId);
    // Guided (locked) captures already carry a derived pose; only backfill one if
    // missing. Casual shots land pose-less and get background classification so
    // they sort into the reel without forcing a comparability tag.
    if (saved.pose === undefined) {
      if (saved.isRequiredSet) {
        updatePhoto(saved.id, { pose: poseFromCapture(saved.session, saved.view), isRequiredSet: true });
      } else {
        void classifyPose(resolvedUris[saved.id] ?? saved.uri).then((res) => {
          if (res) updatePhoto(saved.id, { pose: res.pose, poseConfidence: res.confidence, session: sessionForPose(res.pose) });
        });
      }
    }
    // The read is async (first state update lands after a microtask); firing it
    // here is the intended "react to a saved photo" synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void runInstantRead(saved);
  }, [pendingSaveId, photos, runInstantRead, updatePhoto, resolvedUris]);

  // ── Camera-roll dump import (W6-25) ──────────────────────────────────────
  // Multi-select: shoot or dump a pile of photos and let the reel catalogue
  // them. Imported shots land casual (not the locked comparability set) and
  // untagged, so they surface in the reel's "unsorted" group for a one-tap pose
  // assignment (phase 1) / auto-classification (phase 2).
  const importFromLibrary = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      exif: true,
      quality: 0.8,
      allowsMultipleSelection: true,
    });
    if (result.canceled || result.assets.length === 0) return;
    const imported: { id: string; uri: string }[] = [];
    for (const asset of result.assets) {
      const exifDate = asset.exif?.DateTimeOriginal as string | undefined;
      const parsed = exifDate ? new Date(exifDate.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')) : null;
      const takenAt = parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
      const persistentUri = await copyPhotoToDocuments(asset.uri);
      const id = addPhoto({ session: 'body', uri: persistentUri, takenAt, isRequiredSet: false });
      imported.push({ id, uri: persistentUri });
    }
    // Auto-classify in the background, sequentially so a big dump doesn't burst the
    // API. Fails open (classifyPose returns null) → the photo stays untagged for
    // manual sorting. High-confidence poses apply silently; low-confidence ones
    // carry their confidence so the reel can ask for a one-tap confirm (§1.3).
    void (async () => {
      for (const it of imported) {
        const res = await classifyPose(it.uri);
        if (res) updatePhoto(it.id, { pose: res.pose, poseConfidence: res.confidence, session: sessionForPose(res.pose) });
      }
    })();
  }, [addPhoto, updatePhoto]);

  // ── Reel (W6-25): every photo, grouped by pose ───────────────────────────
  const reelGroups = useMemo(() => groupPhotosByPose(photos), [photos]);
  const poseLabel = useCallback(
    (pose: PoseKey): string =>
      pose === 'unsorted'
        ? t('photos.pose_unsorted')
        : t(`photos.pose_${pose}` as 'photos.pose_front_relaxed'),
    [t],
  );
  const taggingPhoto = taggingId ? photos.find((p) => p.id === taggingId) ?? null : null;

  // Focus a required-pose reel group's session track (unsorted/other are triage
  // only, so they never focus).
  const focusPose = useCallback((pose: PoseKey) => {
    if (pose === 'unsorted' || pose === 'other') return;
    setSelectedId(null);
    setLastNote(null);
    setEncouragementNote(null);
    setInstantRead(null);
    setFocused({ session: sessionForPose(pose as CanonicalPose), part: undefined });
  }, []);

  // ── Capture entry actions ────────────────────────────────────────────────
  const startGuided = useCallback((pose: CanonicalPose) => {
    const session = sessionForPose(pose);
    setFocused({ session, part: undefined });
    setPosePickerOpen(false);
    setCaptureCfg({ session, part: undefined, view: viewForPose(pose), casual: false });
  }, []);

  const startQuick = useCallback(() => {
    setChooserOpen(false);
    setCaptureCfg({ session: 'body', part: undefined, view: 'front', casual: true });
  }, []);

  const startPartCapture = useCallback(() => {
    if (!focused?.part) return;
    setCaptureCfg({ session: 'body', part: focused.part, view: 'front', casual: false });
  }, [focused]);

  // ── Derived display ───────────────────────────────────────────────────────
  const note = lastNote && selected && lastNote.id === selected.id ? lastNote.analysis : null;
  const munit = profile.units === 'imperial' ? t('measurements.unitIn') : t('measurements.unitCm');
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

  const useVisionCamera = captureCfg?.session === 'face' && !captureCfg.casual;
  const trackLabel =
    trackSession === 'face' ? t('photos.sessionFace') : trackPart ?? t('photos.sessionBody');

  return (
    <View style={styles.wrap}>
      {/* ── Empty state: no photos yet ── */}
      {photos.length === 0 ? (
        <View style={styles.emptyBlock}>
          <ThemedText type="mono" themeColor="textMuted">
            {t('photos.empty')}
          </ThemedText>
          <ThemedText type="monoSm" themeColor="textMuted" style={styles.clothingGuidance}>
            {t('photos.clothingGuidance')}
          </ThemedText>
          <TextButton label={t('photos.open')} onPress={() => setChooserOpen(true)} />
        </View>
      ) : (
        <>
          {/* ── Reel: the spine. Every photo, grouped by pose; tapping a
              required-pose group drills into its progress track. Unsorted/other
              groups are triage (tap a photo to classify). ── */}
          {!focused && (
          <View style={styles.reel}>
            <View style={styles.timelineHeader}>
              <EngravedLabel>{t('photos.reelLabel')}</EngravedLabel>
              <ThemedText type="monoSm" themeColor="textMuted">{t('photos.reelHint')}</ThemedText>
            </View>
            {reelGroups.map((g) => {
              const focusable = g.pose !== 'unsorted' && g.pose !== 'other';
              return (
                <View key={g.pose} style={styles.reelGroup}>
                  <Pressable
                    accessibilityRole={focusable ? 'button' : 'text'}
                    accessibilityLabel={focusable ? t('photos.viewTrack', { pose: poseLabel(g.pose) }) : undefined}
                    disabled={!focusable}
                    onPress={() => focusPose(g.pose)}
                    style={styles.reelGroupHead}>
                    <ThemedText type="monoSm" themeColor={g.pose === 'unsorted' ? 'accent' : 'textMuted'}>
                      {`${poseLabel(g.pose)} (${g.photos.length})`}
                    </ThemedText>
                    {focusable && (
                      <ThemedText type="monoSm" themeColor="accent">
                        {t('photos.viewLink')}
                      </ThemedText>
                    )}
                  </Pressable>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
                    {g.photos.map((p) => {
                      const confirm = needsPoseConfirm(p);
                      return (
                        <Pressable
                          key={p.id}
                          accessibilityRole="button"
                          accessibilityLabel={confirm ? t('photos.confirmPose') : t('photos.assignPose')}
                          onPress={() => setTaggingId(p.id)}
                          style={({ pressed }) => [
                            styles.thumb,
                            { width: thumbW, height: thumbH, borderColor: confirm ? theme.accent : 'transparent' },
                            pressed && styles.thumbPressed,
                          ]}>
                          <Image source={{ uri: resolvedUris[p.id] ?? p.uri }} style={styles.thumbImg} contentFit="cover" />
                          {confirm && <View style={[dotStyles.dot, { backgroundColor: theme.accent }]} />}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              );
            })}
          </View>
          )}

          {/* ── Focused track: compare + timeline + milestones + analysis.
              Drills in over the reel; "close" returns to the reel. ── */}
          {focused && (
            <View style={styles.trackDetail}>
              <View style={styles.trackHead}>
                <EngravedLabel>{t('photos.trackLabel', { track: trackLabel })}</EngravedLabel>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('photos.closeTrack')}
                  onPress={() => setFocused(null)}
                  hitSlop={8}>
                  <ThemedText type="monoSm" themeColor="textMuted">{t('common.close')}</ThemedText>
                </Pressable>
              </View>

              {/* Body sub-parts (custom "problem areas") within the body track. */}
              {trackSession === 'body' && (
                <View style={styles.partRow}>
                  <PartChip
                    label={t('photos.partWhole')}
                    active={trackPart === undefined}
                    onPress={() => setFocused({ session: 'body', part: undefined })}
                  />
                  {bodyParts.map((p) => (
                    <PartChip
                      key={p}
                      label={p}
                      active={trackPart === p}
                      onPress={() => setFocused({ session: 'body', part: p })}
                    />
                  ))}
                  <PartChip label={t('photos.addPart')} active={false} onPress={() => setAddingPart(true)} dashed />
                </View>
              )}

              {/* Capture into the selected custom part (the guided picker only
                  covers the four whole-body/face poses). */}
              {trackPart && (
                <TextButton label={t('photos.capturePart', { part: trackPart })} onPress={startPartCapture} />
              )}

              {sessionPhotos.length === 0 ? (
                <View style={styles.emptyBlock}>
                  <ThemedText type="mono" themeColor="textMuted">
                    {t('photos.empty')}
                  </ThemedText>
                  <TextButton label={t('photos.open')} onPress={() => setChooserOpen(true)} />
                </View>
              ) : (
                <>
              {/* Photo display */}
              {showWipe ? (
                <WipeCompare
                  baselineUri={resolvedUris[baseline.id] ?? baseline.uri}
                  selectedUri={resolvedUris[selected.id] ?? selected.uri}
                  badge={selectedBadge}
                />
              ) : (
                <PhotoFrame uri={resolvedUris[baseline.id] ?? baseline.uri} caption={t('photos.baseline')} />
              )}

              {/* PH-2: instant post-capture read — appears right after a save. */}
              {instantRead && sessionPhotos.some((p) => p.id === instantRead.id) && (
                <Animated.View
                  style={{
                    opacity: celebrate,
                    transform: [{ scale: celebrate.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }],
                  }}>
                  <Card style={styles.instantCard}>
                    <View style={styles.instantHeader}>
                      <EngravedLabel>{t('photos.savedTitle')}</EngravedLabel>
                      {instantRead.highscore && <StatusPill label={t('photos.qualityHighscore')} tone="good" />}
                    </View>
                    {instantRead.baseline ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        {t('photos.savedBaselineBody')}
                      </ThemedText>
                    ) : (
                      <>
                        <View style={styles.instantBadgeRow}>
                          <StatusPill
                            label={t(
                              `photos.comparability_${instantRead.comparability}` as 'photos.comparability_comparable',
                            )}
                            tone={
                              instantRead.comparability === 'comparable'
                                ? 'good'
                                : instantRead.comparability === 'partial'
                                  ? 'watch'
                                  : 'bad'
                            }
                          />
                        </View>
                        {instantRead.hint ? (
                          <ThemedText type="mono" themeColor="textSecondary">
                            {instantRead.hint}
                          </ThemedText>
                        ) : null}
                        {instantRead.retake ? (
                          <ThemedText type="monoSm" themeColor="signalBad">
                            {t('photos.retakeHint')}
                          </ThemedText>
                        ) : null}
                      </>
                    )}
                  </Card>
                </Animated.View>
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

              {analyzing &&
                (lastAiAction === 'scientific' && quickNote ? (
                  <Card style={styles.quickCard}>
                    <EngravedLabel>{t('photos.quickReadTitle')}</EngravedLabel>
                    <ThemedText type="small" themeColor="text">
                      {t(`photos.comparability_${quickNote.readout.comparability}` as 'photos.comparability_comparable')}
                    </ThemedText>
                    {quickNote.readout.changes.map((c) => (
                      <ThemedText key={c.metricKey} type="mono" themeColor="textSecondary">
                        {`${t(c.metricKey as 'measurements.waist')} ${c.delta > 0 ? '+' : ''}${Math.round(c.delta * 10) / 10}${munit}`}
                      </ThemedText>
                    ))}
                    <ThemedText type="monoSm" themeColor="textMuted">
                      {t('photos.deepLoading')}
                    </ThemedText>
                    <Skeleton lines={2} />
                  </Card>
                ) : (
                  <Skeleton lines={3} />
                ))}
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
                      <View style={styles.analysisHead}>
                        <EngravedLabel>{t('photos.analysisLabel')}</EngravedLabel>
                        <ConfidenceBadge level={photoReadLevel(note)} rationale={t(photoReadWhyKey(note))} />
                      </View>
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
                </>
              )}
            </View>
          )}
        </>
      )}

      <Pressable accessibilityRole="button" onPress={importFromLibrary} style={styles.importBtn}>
        <ThemedText type="monoSm" themeColor="textSecondary" style={styles.importText}>
          {t('photos.importLibrary')}
        </ThemedText>
      </Pressable>

      {/* ── Capture chooser: guided check-in vs quick shot ── */}
      <Modal visible={chooserOpen} transparent animationType="fade" onRequestClose={() => setChooserOpen(false)}>
        <Pressable style={styles.partModalBackdrop} onPress={() => setChooserOpen(false)}>
          <View
            style={[styles.partModalSheet, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}
            onStartShouldSetResponder={() => true}>
            <EngravedLabel>{t('photos.chooseCaptureTitle')}</EngravedLabel>
            <CaptureOption
              title={t('photos.captureGuided')}
              desc={t('photos.captureGuidedDesc')}
              onPress={() => {
                setChooserOpen(false);
                setPosePickerOpen(true);
              }}
            />
            <CaptureOption title={t('photos.captureQuick')} desc={t('photos.captureQuickDesc')} onPress={startQuick} />
            <TextButton label={t('common.cancel')} onPress={() => setChooserOpen(false)} />
          </View>
        </Pressable>
      </Modal>

      {/* ── Guided pose picker: choose which canonical pose to capture ── */}
      <Modal visible={posePickerOpen} transparent animationType="fade" onRequestClose={() => setPosePickerOpen(false)}>
        <Pressable style={styles.partModalBackdrop} onPress={() => setPosePickerOpen(false)}>
          <View
            style={[styles.partModalSheet, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}
            onStartShouldSetResponder={() => true}>
            <EngravedLabel>{t('photos.choosePoseTitle')}</EngravedLabel>
            <View style={styles.partRow}>
              {REQUIRED_POSES.map((p) => (
                <PartChip
                  key={p}
                  label={t(`photos.pose_${p}` as 'photos.pose_front_relaxed')}
                  active={false}
                  onPress={() => startGuided(p)}
                />
              ))}
            </View>
            <View style={styles.settingCol}>
              <EngravedLabel>{t('photos.timerLabel')}</EngravedLabel>
              <SingleSelectChips
                options={[
                  { value: '0', label: t('photos.timerOff') },
                  { value: '3', label: t('photos.timer3') },
                  { value: '10', label: t('photos.timer10') },
                ]}
                value={String(timer)}
                onChange={(v) => setTimer(Number(v) as 0 | 3 | 10)}
              />
            </View>
            <TextButton label={t('common.cancel')} onPress={() => setPosePickerOpen(false)} />
          </View>
        </Pressable>
      </Modal>

      {/* ── Camera: vision-camera for guided face, expo-camera otherwise ── */}
      {useVisionCamera ? (
        <VisionCameraCapture
          session="face"
          ghostUri={ghostUri}
          ghostByPose={ghostByPose}
          baseline={reference ?? baseline}
          visible={captureCfg !== null}
          onClose={() => setCaptureCfg(null)}
          onSaved={onPhotoSaved}
        />
      ) : (
        <PhotoCapture
          session={captureCfg?.session ?? 'body'}
          part={captureCfg?.part}
          view={captureCfg?.view ?? 'front'}
          timer={timer}
          casual={captureCfg?.casual ?? false}
          ghostUri={ghostUri}
          ghostByPose={ghostByPose}
          visible={captureCfg !== null}
          onClose={() => setCaptureCfg(null)}
          onSaved={onPhotoSaved}
        />
      )}

      {/* Add a custom body part. */}
      <Modal visible={addingPart} transparent animationType="fade" onRequestClose={() => setAddingPart(false)}>
        <Pressable style={styles.partModalBackdrop} onPress={() => setAddingPart(false)}>
          <View
            style={[styles.partModalSheet, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}
            onStartShouldSetResponder={() => true}>
            <EngravedLabel>{t('photos.newPartTitle')}</EngravedLabel>
            <LabeledInput
              label={t('photos.partName')}
              placeholder={t('photos.partNamePlaceholder')}
              value={partDraft}
              onChangeText={setPartDraft}
              autoFocus
            />
            <View style={styles.partModalActions}>
              <TextButton label={t('common.cancel')} onPress={() => { setAddingPart(false); setPartDraft(''); }} />
              <View style={styles.partModalSave}>
                <PrimaryButton
                  label={t('common.save')}
                  disabled={!partDraft.trim()}
                  onPress={() => {
                    const name = partDraft.trim();
                    if (!name) return;
                    const existing = profile.customPhotoParts ?? [];
                    if (!existing.includes(name)) setProfile({ customPhotoParts: [...existing, name] });
                    setFocused({ session: 'body', part: name });
                    setPartDraft('');
                    setAddingPart(false);
                  }}
                />
              </View>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Assign / correct a pose for a reel photo (W6-25 manual classification). */}
      <Modal visible={!!taggingPhoto} transparent animationType="fade" onRequestClose={() => setTaggingId(null)}>
        <Pressable style={styles.partModalBackdrop} onPress={() => setTaggingId(null)}>
          <View
            style={[styles.partModalSheet, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}
            onStartShouldSetResponder={() => true}>
            <EngravedLabel>{taggingPhoto && needsPoseConfirm(taggingPhoto) ? t('photos.confirmPose') : t('photos.assignPose')}</EngravedLabel>
            {taggingPhoto && (
              <Image
                source={{ uri: resolvedUris[taggingPhoto.id] ?? taggingPhoto.uri }}
                style={[styles.tagPreview, { backgroundColor: theme.surfaceSunken }]}
                contentFit="cover"
              />
            )}
            {taggingPhoto && needsPoseConfirm(taggingPhoto) && (
              <ThemedText type="monoSm" themeColor="textMuted">
                {t('photos.poseSuggested', {
                  pose: t(`photos.pose_${taggingPhoto.pose}` as 'photos.pose_front_relaxed'),
                })}
              </ThemedText>
            )}
            <SingleSelectChips
              options={CANONICAL_POSES.map((p) => ({
                value: p,
                label: t(`photos.pose_${p}` as 'photos.pose_front_relaxed'),
              }))}
              value={taggingPhoto?.pose}
              onChange={(v: CanonicalPose) => {
                // Any tap confirms: the pose is now ground truth, so drop the
                // auto-classifier confidence that drove the "confirm?" prompt.
                // Keep the session tag consistent with the confirmed pose.
                if (taggingId) updatePhoto(taggingId, { pose: v, poseConfidence: undefined, session: sessionForPose(v) });
                setTaggingId(null);
              }}
            />
            <TextButton label={t('common.cancel')} onPress={() => setTaggingId(null)} />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

/** A capture-chooser option: a titled, described tappable row. */
function CaptureOption({ title, desc, onPress }: { title: string; desc: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={desc}
      onPress={onPress}
      style={({ pressed }) => [
        styles.captureOption,
        { borderColor: theme.border, backgroundColor: theme.surfaceSunken },
        pressed && styles.thumbPressed,
      ]}>
      <ThemedText type="label" themeColor="text">
        {title}
      </ThemedText>
      <ThemedText type="monoSm" themeColor="textMuted" style={styles.captureOptionDesc}>
        {desc}
      </ThemedText>
    </Pressable>
  );
}

/** A small selectable chip for a body sub-part (or the "+ Add part" affordance). */
function PartChip({
  label,
  active,
  onPress,
  dashed,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  dashed?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        styles.partChip,
        {
          backgroundColor: active ? theme.accent : 'transparent',
          borderColor: active ? theme.accent : theme.border,
          borderStyle: dashed ? 'dashed' : 'solid',
        },
      ]}>
      <ThemedText type="monoSm" themeColor={active ? 'onAccent' : 'textSecondary'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.four },
  emptyBlock: { gap: Spacing.two },
  clothingGuidance: { lineHeight: 18 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  analysisHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.one },
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
  quickCard: { gap: Spacing.two },
  instantCard: { gap: Spacing.two },
  instantHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  instantBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  partRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  settingCol: { gap: Spacing.one },
  partChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  partModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  partModalSheet: {
    width: 300,
    borderRadius: Radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  partModalActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  partModalSave: { minWidth: 120 },
  captureOption: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radii.panel,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  captureOptionDesc: { lineHeight: 16 },
  milestoneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  aiErrorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  aiErrorText: { flex: 1 },
  encouragementNote: { lineHeight: 18 },
  importBtn: { alignSelf: 'center' },
  importText: { textDecorationLine: 'underline' },
  reel: { gap: Spacing.two },
  reelGroup: { gap: Spacing.half },
  reelGroupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  trackDetail: { gap: Spacing.two },
  trackHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  tagPreview: { width: '100%', aspectRatio: 3 / 4, borderRadius: Radii.chamfer },
});
