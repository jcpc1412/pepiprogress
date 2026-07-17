import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { type MutableRefObject, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Animated, Dimensions, type LayoutChangeEvent, Modal, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ConfidenceBadge } from '@/components/confidence-badge';
import { LabeledInput, PrimaryButton, TextButton, SingleSelectChips } from '@/components/form';
import { Card, Divider, EngravedLabel, Placeholder, Skeleton, StatusPill } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { PhotoCapture } from '@/features/photos/photo-capture';
import { VisionCameraCapture } from '@/features/photos/vision-camera-capture';
import { useTheme } from '@/hooks/use-theme';
import {
  aiErrorKind,
  analyzePhoto,
  checkFit,
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
  // Instant, deterministic quick readout shown while the deep analysis loads (§4A).
  const [quickNote, setQuickNote] = useState<{ id: string; readout: QuickReadout } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastNote, setLastNote] = useState<{ id: string; analysis: PhotoAnalysis } | null>(null);
  const [encouragementNote, setEncouragementNote] = useState<string | null>(null);
  const [aiError, setAiError] = useState<'network' | 'server' | null>(null);
  const [lastAiAction, setLastAiAction] = useState<'scientific' | 'encouragement' | null>(null);
  // ── PH-2 instant post-capture feedback ───────────────────────────────────
  // A saved photo id waiting for its instant read (set by the capture onSaved).
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
  // Custom "problem area" sub-track within the body session (§4A). Undefined =
  // the whole face/body track. Face has no sub-parts.
  const [part, setPart] = useState<string | undefined>(undefined);
  const [addingPart, setAddingPart] = useState(false);
  const [partDraft, setPartDraft] = useState('');
  // Capture settings moved out of the camera (beta feedback): the angle + self-
  // timer are chosen here and handed to PhotoCapture, keeping the camera clean.
  const [view, setView] = useState<'front' | 'side'>('front');
  const [timer, setTimer] = useState<0 | 3 | 10>(0);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setPart(undefined), [session]);

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

  // Expose the capture trigger to the parent floating button.
  useEffect(() => {
    if (captureRef) captureRef.current = () => setCapturing(true);
    return () => {
      if (captureRef) captureRef.current = null;
    };
  }, [captureRef]);

  // Newest-first; [0] = latest, last = baseline. Scoped to the active track
  // (session + optional custom part), so each part has its own baseline/ghost.
  const sessionPhotos = photos.filter((p) => p.session === session && (p.part ?? undefined) === part);
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
  const resolvedUris = useResolvedUris(sessionPhotos);
  const baseline = sessionPhotos[sessionPhotos.length - 1];
  const selected = sessionPhotos.find((p) => p.id === selectedId) ?? latest;
  const canCompare = sessionPhotos.length >= 2;
  // The promotable working reference (PH-1): best-quality, skin-priority. The
  // ghost overlay anchors to it so the user matches their strongest shot, while
  // `baseline` (the oldest) stays the immutable day-one compare anchor.
  const reference = useMemo(() => pickReference(sessionPhotos), [sessionPhotos]);
  const ghostUri = reference ? resolvedUris[reference.id] ?? reference.uri : undefined;

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
    if (part) return; // custom parts share the base body cadence; no own schedule
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
        session,
        locale: i18n.language,
        bodyTypeCalibration: bodyCalibration,
        cycleContext: cycleCtx,
        measurementDelta,
        symptomContext: symptomCtx,
        cycleWeek,
        units: profile.units,
      });
      updatePhoto(latest.id, {
        driftScore: res.driftScore,
        comparable: res.comparable,
        lighting: res.lighting,
        changeNote: res.change || undefined,
        coverage: res.coverage,
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
      const encKey = sessionEncouragementKey(session);
      setProfile({ [encKey]: nextMilestoneISO(new Date().toISOString(), cadence.encouragementDays) });
    } catch (err) {
      const kind = aiErrorKind(err);
      if (kind !== 'notConfigured') setAiError(kind);
    } finally {
      setAnalyzing(false);
    }
  }, [analyzing, entries, profile, group, lastNote, i18n.language, session, cadence, setProfile]);

  // ── PH-2: instant post-capture read ──────────────────────────────────────
  // Fired by the capture components after a shot lands in the store. Records the
  // id; the effect below runs the read once the store reflects the new photo.
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
    // The read is async (first state update lands after a microtask); firing it
    // here is the intended "react to a saved photo" synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void runInstantRead(saved);
  }, [pendingSaveId, photos, runInstantRead]);

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
    addPhoto({ session, part, uri: persistentUri, takenAt });
  }, [session, part, addPhoto]);

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

      {/* Body sub-parts (custom "problem areas") — only within the body session. */}
      {session === 'body' && (
        <View style={styles.partRow}>
          <PartChip label={t('photos.partWhole')} active={part === undefined} onPress={() => setPart(undefined)} />
          {bodyParts.map((p) => (
            <PartChip key={p} label={p} active={part === p} onPress={() => setPart(p)} />
          ))}
          <PartChip label={t('photos.addPart')} active={false} onPress={() => setAddingPart(true)} dashed />
        </View>
      )}

      {/* Capture settings (angle + self-timer) — chosen here, applied in-camera.
          Hidden until the track has a first photo (UX audit: four control rows
          before a baseline exists was pre-capture overload). */}
      {session === 'body' && sessionPhotos.length > 0 && (
        <View style={styles.captureSettings}>
          <View style={styles.settingCol}>
            <EngravedLabel>{t('photos.angleLabel')}</EngravedLabel>
            <SingleSelectChips
              options={[
                { value: 'front', label: t('photos.viewFront') },
                { value: 'side', label: t('photos.viewSide') },
              ]}
              value={view}
              onChange={setView}
            />
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
        </View>
      )}

      {/* Photo display */}
      {sessionPhotos.length === 0 ? (
        <View style={styles.emptyBlock}>
          <ThemedText type="mono" themeColor="textMuted">
            {t('photos.empty')}
          </ThemedText>
          <ThemedText type="monoSm" themeColor="textMuted" style={styles.clothingGuidance}>
            {t('photos.clothingGuidance')}
          </ThemedText>
          {/* The empty state carries its own action (UX audit). */}
          <TextButton label={t('photos.open')} onPress={() => setCapturing(true)} />
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
          ghostUri={ghostUri}
          baseline={reference ?? baseline}
          visible={capturing}
          onClose={() => setCapturing(false)}
          onSaved={onPhotoSaved}
        />
      ) : (
        <PhotoCapture
          session={session}
          part={part}
          view={view}
          timer={timer}
          ghostUri={ghostUri}
          visible={capturing}
          onClose={() => setCapturing(false)}
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
                    setPart(name);
                    setPartDraft('');
                    setAddingPart(false);
                  }}
                />
              </View>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
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
  wrap: { gap: Spacing.two },
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
  captureSettings: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.four },
  settingCol: { gap: Spacing.one },
  partChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  partModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  partModalSheet: {
    width: 280,
    borderRadius: Radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  partModalActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  partModalSave: { minWidth: 120 },
  milestoneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  aiErrorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  aiErrorText: { flex: 1 },
  encouragementNote: { lineHeight: 18 },
  importBtn: { alignSelf: 'center' },
  importText: { textDecorationLine: 'underline' },
});
