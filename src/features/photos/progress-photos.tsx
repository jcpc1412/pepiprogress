import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type MutableRefObject, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Animated, Dimensions, type LayoutChangeEvent, Modal, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ConfidenceBadge } from '@/components/confidence-badge';
import { CroppedPhoto } from '@/components/cropped-photo';
import { LabeledInput, PrimaryButton, TextButton, SingleSelectChips } from '@/components/form';
import { Card, Divider, EngravedLabel, Skeleton, StatusPill } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { PhotoCapture } from '@/features/photos/photo-capture';
import { VisionCameraCapture } from '@/features/photos/vision-camera-capture';
import { ShareSheet } from '@/features/share/share-sheet';
import type { ShareCardInput } from '@/lib/share-card';
import { useTheme } from '@/hooks/use-theme';
import {
  aiErrorKind,
  analyzePhoto,
  checkFit,
  classifyPose,
  runEncouragementAnalysis,
  type PhotoAnalysis,
} from '@/lib/ai';
import { compoundBySlug } from '@/data/compound-catalog';
import { buildAnalysisContext, type ContextEntry } from '@/lib/analysis-context';
import { resolveBodyIntent } from '@/lib/strength-context';
import { resolveIntent } from '@/lib/verdict-engine';
import { resolveMetricSeries } from '@/lib/data-facade';
import { bodyFatNavy, inferBodyComposition, usesFemaleFormula } from '@/lib/body-composition';
import type { ConfidenceLevel } from '@/lib/confidence';
import {
  observationsForPhoto,
  recentDiscoveries,
  recentForTrack,
  sanitizeObservations,
  toPriorPayload,
} from '@/lib/photo-observations';
import { PhotoWithArrows } from '@/features/photos/photo-arrows';
import { measurementDeltas, type MeasureKey } from '@/lib/photo-arrows';
import type { PhotoObservation } from '@/lib/photo-observations';
import { hapticSuccess } from '@/lib/haptics';
import { quickReadout, type Comparability, type QuickReadout } from '@/lib/photo-readout';
import { isNewHighscore, pickReference } from '@/lib/photo-reference';
import type { CropBox } from '@/lib/photo-crop';
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
  groupPhotosByPose,
  needsPoseConfirm,
  poseFromCapture,
  sessionForPose,
  type CanonicalPose,
  type PoseKey,
} from '@/lib/photo-pose';
import { copyPhotoToDocuments, useResolvedUris } from '@/lib/photos';
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

/**
 * Deliberately NOT auto-cropped (W6-28). The wipe works by the two frames being
 * in the same image space; cropping each to its own subject box would shift them
 * independently and break the illusion the moment only one photo has a box. The
 * crop is applied where it helps and cannot misalign: thumbnails and the single
 * baseline frame.
 */
function WipeCompare({
  baselineUri,
  selectedUri,
  badge,
}: {
  /** Either may be undefined when a photo has no displayable source (W7-32).
   *  The wipe needs both frames, so it degrades to a placeholder. */
  baselineUri?: string;
  selectedUri?: string;
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
  const bothPresent = !!baselineUri && !!selectedUri;

  return (
    <View
      style={[wipeStyles.wrap, { borderColor: theme.border, backgroundColor: theme.surfaceSunken }]}
      onLayout={handleLayout}
      {...pan.panHandlers}>
      {baselineUri ? (
        <Image source={{ uri: baselineUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : null}

      {bothPresent && clipW !== undefined && (
        <>
          <Animated.View style={[StyleSheet.absoluteFill, { width: clipW, overflow: 'hidden' }]}>
            <Image source={{ uri: selectedUri as string }} style={{ width: w, flex: 1 }} contentFit="cover" />
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

function PhotoFrame({ uri, caption, cropBox }: { uri: string; caption: string; cropBox?: CropBox }) {
  const theme = useTheme();
  return (
    <View style={[frameStyles.frame, { borderColor: theme.border, backgroundColor: theme.surfaceSunken }]}>
      <CroppedPhoto uri={uri} cropBox={cropBox} style={frameStyles.img} />
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
  // ?analyze=<photoId> — the Journal's "run deep analysis on this shot" (2a.6).
  const { analyze: analyzeParam } = useLocalSearchParams<{ analyze?: string }>();
  const {
    photos,
    entries,
    metricReadings,
    symptomEvents,
    protocolItems,
    doseEvents,
    strengthSessions,
    analysisLedger,
    addAnalysisRecord,
    profile,
    addPhoto,
    updatePhoto,
    setProfile,
  } = useStore();

  // ── Reel-centric navigation (W6-26c, beta-notes §1.1/§1.3) ────────────────
  // The reel (photos grouped by pose) is the spine. There is no upfront Face vs
  // Body choice: the guided pose picker routes capture, and classification sorts
  // casual shots. Tapping a required-pose reel group focuses that session track
  // and reveals its compare / timeline / milestones / analysis below.
  const [focused, setFocused] = useState<{ session: PhotoSession; part?: string } | null>(null);

  // Capture flow (2a.1 "one smart camera"): the floating button opens ONE camera
  // directly — no guided/quick chooser, no pre-camera pose picker. Live pose
  // sampling inside the camera detects the session (face/body) + pose, swaps the
  // ghost, and tags on capture; the picker survives only as an in-camera manual
  // override. `captureCfg` being non-null opens a camera; `smart` runs the auto
  // path (custom-part capture stays an explicit, non-smart open).
  const [captureCfg, setCaptureCfg] = useState<{
    session: PhotoSession;
    part?: string;
    view: 'front' | 'side';
    casual: boolean;
    smart?: boolean;
  } | null>(null);

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
  // Share (W6-27): offered contextually after a highscore or a milestone read.
  const [shareCardOpen, setShareCardOpen] = useState(false);
  const [sharePhotoUri, setSharePhotoUri] = useState<string | null>(null);

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

  // 2a.1: one smart camera. Opens body/front as a neutral default; the live pose
  // sample re-derives the real session + pose (and the ghost) once the user
  // frames a shot, so the body/front default is only what shows for the first
  // instant before detection resolves.
  const startSmart = useCallback(() => {
    setCaptureCfg({ session: 'body', part: undefined, view: 'front', casual: false, smart: true });
  }, []);

  // Expose the capture trigger to the parent floating button: open the smart
  // camera directly (2a.1) — no chooser, no pose picker.
  useEffect(() => {
    if (captureRef) captureRef.current = () => startSmart();
    return () => {
      if (captureRef) captureRef.current = null;
    };
  }, [captureRef, startSmart]);

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
  // A probe that finds a photo at its deterministic cloud path records it, so
  // later renders skip the probe entirely (W7-32).
  const healCloudPath = useCallback(
    (photoId: string, cloudPath: string) => updatePhoto(photoId, { cloudPath }),
    [updatePhoto],
  );
  const resolvedUris = useResolvedUris(photos, user?.id ?? null, healCloudPath);
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
  // Computed across ALL photos (poses are session-unique), so the 2a.1 smart
  // camera — which opens before the session is known — can swap to either a face
  // or a body ghost as the live sample resolves.
  const ghostByPose = useMemo(() => {
    const map: Partial<Record<CanonicalPose, string>> = {};
    for (const p of CANONICAL_POSES) {
      const chain = photos.filter((ph) => ph.pose === p);
      const ref = pickReference(chain);
      if (ref) map[p] = resolvedUris[ref.id] ?? ref.uri;
    }
    return map;
  }, [photos, resolvedUris]);

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

  // Uploads used to live here, which meant a signed-in user who never opened
  // this tab uploaded nothing and had no photos on a second device. They now
  // run globally in <PhotoSync>, mounted in the root layout (W7-32).

  // ── Scientific analysis ──────────────────────────────────────────────────
  // `targetId` (2a.6) lets the deep read run on ANY photo of the track, not just
  // the newest — the on-demand escape hatch from the Journal. Defaults to latest.
  const runScientificAnalysis = useCallback(async (targetId?: string) => {
    const target = (targetId ? sessionPhotos.find((p) => p.id === targetId) : undefined) ?? latest;
    if (!target || !baseline || analyzing || target.id === baseline.id) return;
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
        target.tilt != null && baseline.tilt != null ? Math.abs(target.tilt - baseline.tilt) : undefined;
      setQuickNote({ id: target.id, readout: quickReadout({ tiltDelta, measurementDelta }) });

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

      // F5 context fusion: the numeric story of the window, pre-digested.
      // Weight is resolved through the canonical merge (manual ∪ integration) so a
      // wearable-only weigh-in still anchors the window; before, a Health scale
      // reading with no manual check-in was invisible here (Track B).
      const weightByDay = new Map(
        resolveMetricSeries({ entries, metricReadings, profile }, 'weight', localDateKey(new Date())).map(
          (p) => [p.dateKey, p.value] as const,
        ),
      );
      const ctxByDay = new Map<string, ContextEntry>();
      for (const e of Object.values(entries)) ctxByDay.set(e.date, { ...e });
      for (const [day, w] of weightByDay) {
        const existing = ctxByDay.get(day);
        if (existing) existing.weight = w;
        else ctxByDay.set(day, { date: day, weight: w });
      }
      const dataContext = buildAnalysisContext({
        entries: Array.from(ctxByDay.values()),
        doses: doseEvents.map((d) => ({
          label: d.compoundSlug ? (compoundBySlug(d.compoundSlug)?.canonicalName ?? d.compoundSlug) : '',
          takenAt: d.takenAt,
        })).filter((d) => d.label),
        photoAt: target.takenAt,
        baselineAt: baseline.takenAt,
        // 2b.2: what the user is training toward + whether strength held. The
        // second one is the hinge — an across-the-board measurement drop reads
        // as muscle loss only when strength did NOT hold.
        intent: (() => {
          const i = resolveIntent(profile.goals, protocolItems, profile.sex);
          return resolveBodyIntent(i.cutting, i.bulking);
        })(),
        strengthSessions,
      });

      const res = await analyzePhoto({
        uri: resolvedUris[target.id] ?? target.uri,
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
        // F5: the model's own memory of this track + the data story.
        priorAnalyses: toPriorPayload(recentForTrack(analysisLedger, trackSession, trackPart)),
        dataContext,
        poseLabel: trackPart,
      });
      updatePhoto(target.id, {
        driftScore: res.driftScore,
        comparable: res.comparable,
        lighting: res.lighting,
        changeNote: res.change || undefined,
        coverage: res.coverage,
        // Display-only framing box (W6-28); the original file is untouched.
        cropBox: res.cropBox,
      });
      // F5: persist the findings so the next analysis of this track remembers.
      addAnalysisRecord({
        session: trackSession,
        part: trackPart,
        photoId: target.id,
        at: new Date().toISOString(),
        observations: sanitizeObservations(res.observations),
        hypothesis: res.hypothesis || undefined,
        watchNext: res.watchNext || undefined,
        coaching: res.coaching || undefined,
        change: res.change || undefined,
      });
      setLastNote({ id: target.id, analysis: res });
      setSelectedId(target.id); // focus the shot that was just read
      const sciKey = sessionScientificKey(trackSession);
      setProfile({ [sciKey]: nextMilestoneISO(new Date().toISOString(), cadence.scientificDays) });
    } catch (err) {
      const kind = aiErrorKind(err);
      if (kind !== 'notConfigured') setAiError(kind);
    } finally {
      setAnalyzing(false);
    }
  }, [sessionPhotos, latest, baseline, analyzing, trackSession, trackPart, i18n.language, profile, entries, metricReadings, doseEvents, analysisLedger, addAnalysisRecord, symptomEvents, protocolItems, strengthSessions, updatePhoto, setProfile, cadence, resolvedUris]);

  // ── On-demand deep analysis from the Journal (2a.6) ───────────────────────
  // Tapping a photo in the Journal deep-links here with ?analyze=<id>: focus that
  // photo's track, select it, then run the deep read once the track has switched
  // (the analysis needs `sessionPhotos`/`baseline` to reflect the new track).
  const [pendingAnalyzeId, setPendingAnalyzeId] = useState<string | null>(null);

  useEffect(() => {
    if (!analyzeParam) return;
    const photo = photos.find((p) => p.id === analyzeParam);
    if (!photo) return;
    // Reacting to a navigation param is exactly "sync state to a prop".
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFocused({ session: photo.session, part: photo.part ?? undefined });
    setSelectedId(photo.id);
    setPendingAnalyzeId(photo.id);
    // Consume the param: the tab stays mounted, so without this a second tap on
    // the SAME photo would be a no-op (the param never changes).
    router.setParams({ analyze: '' });
  }, [analyzeParam, photos, router]);

  useEffect(() => {
    if (!pendingAnalyzeId) return;
    if (!sessionPhotos.some((p) => p.id === pendingAnalyzeId)) return; // track not switched yet
    const id = pendingAnalyzeId;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingAnalyzeId(null);
    void runScientificAnalysis(id);
  }, [pendingAnalyzeId, sessionPhotos, runScientificAnalysis]);

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
        // F5: the encouragement tier inherits the ledger so its note can
        // reference a real discovery instead of generic warmth.
        recentDiscoveries: recentDiscoveries(analysisLedger),
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
  }, [analyzing, entries, profile, group, lastNote, analysisLedger, i18n.language, trackSession, cadence, setProfile]);

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
  const startPartCapture = useCallback(() => {
    if (!focused?.part) return;
    setCaptureCfg({ session: 'body', part: focused.part, view: 'front', casual: false });
  }, [focused]);

  // Share card input (W6-27). Consistency signals only: the builder's input type
  // deliberately cannot carry compounds, doses, or markers (see share-card.ts).
  const shareCardInput: ShareCardInput = useMemo(() => {
    const weighed = Object.values(entries)
      .filter((e) => e.weight !== undefined)
      .sort((a, b) => a.date.localeCompare(b.date));
    const first = weighed[0]?.weight;
    const last = weighed[weighed.length - 1]?.weight;
    return {
      loggedDateKeys: Object.keys(entries),
      photoCount: photos.length,
      weightDelta:
        weighed.length >= 2 && first !== undefined && last !== undefined ? last - first : undefined,
      units: profile.units,
      todayKey: localDateKey(),
      watermark: profile.watermarkStatCard ?? true,
    };
  }, [entries, photos.length, profile.units, profile.watermarkStatCard]);

  // ── Derived display ───────────────────────────────────────────────────────
  const note = lastNote && selected && lastNote.id === selected.id ? lastNote.analysis : null;
  const munit = profile.units === 'imperial' ? t('measurements.unitIn') : t('measurements.unitCm');
  const showWipe = !!selected && !!baseline && selected.id !== baseline.id;
  // On-photo arrows (2a.4): the markers from the selected photo's own analysis,
  // drawn on it. Comparability-gated — a non-comparable shot draws NO arrows
  // (shaky comparability is the bright line; shaky confidence is fine). Only
  // shows once at least one marker carries coordinates (a post-2a.3 read).
  const selectedObservations = useMemo(
    () => observationsForPhoto(analysisLedger, selected?.id),
    [analysisLedger, selected?.id],
  );

  // Measurement-delta arrows (2a.5): the objective layer. Deltas are taken
  // against the measurement before the selected photo's day, so scrubbing the
  // timeline shows the numbers that belonged to THAT shot. These are the one
  // place a confident magnitude is allowed (measured, not judged), so they stay
  // favour-neutral — the vision arrows own the good/bad story.
  const measurementMarkers = useMemo<PhotoObservation[]>(() => {
    if (!selected || trackSession !== 'body' || trackPart) return [];
    const toMeasures = (e: (typeof entries)[string]): Partial<Record<MeasureKey, number>> => {
      const m: Partial<Record<MeasureKey, number>> = {};
      if (e.waist !== undefined) m.waist = e.waist;
      if (e.hips !== undefined) m.hips = e.hips;
      if (e.neck !== undefined) m.neck = e.neck;
      if (e.extraMeasurementKey && e.extraMeasurementValue !== undefined) {
        m[e.extraMeasurementKey] = e.extraMeasurementValue;
      }
      return m;
    };
    const withM = Object.values(entries)
      .filter((e) => Object.keys(toMeasures(e)).length > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    const photoDay = localDateKey(new Date(selected.takenAt));
    let ci = -1;
    for (let i = 0; i < withM.length; i++) if (withM[i].date <= photoDay) ci = i;
    if (ci < 1) return []; // need a prior measurement to compare against
    return measurementDeltas(toMeasures(withM[ci]), toMeasures(withM[ci - 1])).map((d) => ({
      region: t(`measurements.${d.key}` as 'measurements.waist'),
      note: t('photos.measuredDelta', {
        value: `${d.delta > 0 ? '+' : ''}${Math.round(d.delta * 10) / 10}`,
        unit: munit,
      }),
      direction: d.delta < 0 ? 'loss' : 'gain',
      favour: 'none',
      confidence: 1,
      x: d.x,
      y: d.y,
    }));
  }, [selected, trackSession, trackPart, entries, t, munit]);

  // Vision markers + measured markers share one overlay and one tap paradigm.
  const arrowMarkers = useMemo(
    () => [...selectedObservations, ...measurementMarkers],
    [selectedObservations, measurementMarkers],
  );
  const showArrows =
    !!selected &&
    selected.comparable === true &&
    arrowMarkers.some((o) => o.x !== undefined && o.y !== undefined);
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

  // The vision-camera face detector stays reachable only for an explicit,
  // non-smart face capture. The smart camera (2a.1) always uses expo-camera so a
  // single live view can detect BOTH sessions (and it sidesteps the vision-camera
  // native-build caveat). Face precision returns as an opt-in in a later step.
  const useVisionCamera = captureCfg?.session === 'face' && !captureCfg.casual && !captureCfg.smart;
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
          <TextButton label={t('photos.open')} onPress={() => startSmart()} />
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
                          <CroppedPhoto
                            uri={resolvedUris[p.id]}
                            cropBox={p.cropBox}
                            style={styles.thumbImg}
                          />
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
                  <TextButton label={t('photos.open')} onPress={() => startSmart()} />
                </View>
              ) : (
                <>
              {/* On-photo arrows (2a.4): the selected shot with its analysis
                  markers drawn on it — the "materialized" AI vision. Shown above
                  the raw before/after wipe. */}
              {showArrows ? (
                <Card style={styles.arrowsCard}>
                  <View style={styles.timelineHeader}>
                    <EngravedLabel>{t('photos.arrowsTitle')}</EngravedLabel>
                    <ThemedText type="monoSm" themeColor="textMuted">
                      {t('photos.arrowsHint')}
                    </ThemedText>
                  </View>
                  <PhotoWithArrows uri={resolvedUris[selected.id]} observations={arrowMarkers} />
                </Card>
              ) : null}

              {/* Photo display */}
              {showWipe ? (
                <WipeCompare
                  baselineUri={resolvedUris[baseline.id]}
                  selectedUri={resolvedUris[selected.id]}
                  badge={selectedBadge}
                />
              ) : (
                <PhotoFrame
                  uri={resolvedUris[baseline.id]}
                  caption={t('photos.baseline')}
                  cropBox={baseline.cropBox}
                />
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
                    {/* Contextual share offer: a highscore is the moment worth
                        celebrating, so that is where the card is surfaced. */}
                    {instantRead.highscore && (
                      <TextButton label={t('share.action')} onPress={() => setShareCardOpen(true)} />
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
                            <CroppedPhoto
                              uri={resolvedUris[p.id]}
                              cropBox={p.cropBox}
                              style={styles.thumbImg}
                            />
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
                    onPress={() => runScientificAnalysis(selected?.id)}
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
                      {/* F5 discovery layer: region readout + hypothesis + watch-next. */}
                      {(() => {
                        const obs = sanitizeObservations(note.observations);
                        if (obs.length === 0) return null;
                        return (
                          <>
                            <Divider />
                            <EngravedLabel>{t('photos.regionsLabel')}</EngravedLabel>
                            {obs.map((o) => (
                              <View key={o.region} style={styles.obsRow}>
                                <ThemedText type="monoSm" themeColor="textMuted" style={styles.obsGlyph}>
                                  {o.direction === 'gain' ? '▲' : o.direction === 'loss' ? '▼' : o.direction === 'stable' ? '◇' : '?'}
                                </ThemedText>
                                <View style={styles.obsBody}>
                                  <ThemedText type="monoSm" themeColor="text">
                                    {o.region}
                                  </ThemedText>
                                  <ThemedText type="small" themeColor="textSecondary">
                                    {o.note}
                                  </ThemedText>
                                </View>
                              </View>
                            ))}
                          </>
                        );
                      })()}
                      {note.hypothesis ? (
                        <>
                          <Divider />
                          <EngravedLabel>{t('photos.hypothesisLabel')}</EngravedLabel>
                          <ThemedText type="small" themeColor="text">
                            {note.hypothesis}
                          </ThemedText>
                        </>
                      ) : null}
                      {note.coaching ? (
                        <>
                          <Divider />
                          <EngravedLabel>{t('photos.coachingLabel')}</EngravedLabel>
                          <ThemedText type="small" themeColor="text">
                            {note.coaching}
                          </ThemedText>
                        </>
                      ) : null}
                      {note.watchNext ? (
                        <ThemedText type="monoSm" themeColor="textMuted">
                          {t('photos.watchNext', { hint: note.watchNext })}
                        </ThemedText>
                      ) : null}
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
                  {/* Milestone read landed: the second contextual share moment. */}
                  <Divider />
                  <TextButton label={t('share.action')} onPress={() => setShareCardOpen(true)} />
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

      {/* ── One smart camera (2a.1): vision-camera survives only for an explicit
          non-smart face capture (none today); every entry point opens the
          expo-camera in smart mode, which auto-detects session + pose. ── */}
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
          casual={captureCfg?.casual ?? false}
          smart={captureCfg?.smart ?? false}
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
            {/* Photo export (W6-27): watermark off by default, a photo is personal. */}
            {taggingPhoto && (
              <TextButton
                label={t('share.sharePhoto')}
                onPress={() => {
                  setSharePhotoUri(resolvedUris[taggingPhoto.id] ?? taggingPhoto.uri);
                  setTaggingId(null);
                }}
              />
            )}
            <TextButton label={t('common.cancel')} onPress={() => setTaggingId(null)} />
          </View>
        </Pressable>
      </Modal>

      {/* Share surfaces (W6-27). Nothing leaves the device until the user taps
          share inside the sheet; the OS owns the destination. */}
      <ShareSheet
        visible={shareCardOpen}
        onClose={() => setShareCardOpen(false)}
        cardInput={shareCardInput}
      />
      <ShareSheet
        visible={sharePhotoUri !== null}
        onClose={() => setSharePhotoUri(null)}
        photoUri={sharePhotoUri ?? undefined}
        photoWatermark={profile.watermarkPhoto ?? false}
      />
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
  wrap: { gap: Spacing.four },
  emptyBlock: { gap: Spacing.two },
  clothingGuidance: { lineHeight: 18 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  analysisHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.one },
  obsRow: { flexDirection: 'row', gap: Spacing.one, alignItems: 'flex-start' },
  obsGlyph: { width: 16, textAlign: 'center', marginTop: 1 },
  obsBody: { flex: 1, gap: 1 },
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
  arrowsCard: { gap: Spacing.two },
  instantCard: { gap: Spacing.two },
  instantHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  instantBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  partRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
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
