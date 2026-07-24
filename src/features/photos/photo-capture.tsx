import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { Accelerometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { LabeledInput, PrimaryButton, SecondaryButton, SingleSelectChips } from '@/components/form';
import { FlipCameraIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { checkFit, classifyPose, type FitCheck } from '@/lib/ai';
import { bodyFatNavy, usesFemaleFormula } from '@/lib/body-composition';
import { copyPhotoToDocuments } from '@/lib/photos';
import {
  poseFromCapture,
  REQUIRED_POSES,
  sessionForPose,
  viewForPose,
  type CanonicalPose,
} from '@/lib/photo-pose';
import { MeasurementGuides, type Guide } from '@/features/photos/measurement-guides';
import { MEASURE_POS, type MeasureKey } from '@/lib/photo-arrows';
import { computeQuality, type PhotoQuality } from '@/lib/photo-quality';
import { quickReadout, type Comparability } from '@/lib/photo-readout';
import { initialSampleState, recordSample, shouldSample } from '@/lib/pose-live';
import { localDateKey, useStore, type PhotoSession } from '@/lib/store';
import { isSupabaseConfigured } from '@/lib/supabase';

/** Tap-cycle levels for the ghost overlay opacity (R3-H). */
const GHOST_LEVELS = [0.2, 0.4, 0.6] as const;

/** The optional 4th measurement. Only one is carried per check-in. */
const EXTRA_KEYS = ['chest', 'arms', 'thighs'] as const;
type ExtraKey = (typeof EXTRA_KEYS)[number];

/** The measurement picker below the photo. The three standing measurements come
 *  first because they are the ones the guide lines draw and the Navy body-fat
 *  estimate needs; the extras follow. Tapping a chip is the same action as
 *  tapping that line on the photo, which is fiddly on a thin line over your own
 *  torso. */
const MEASURE_CHIPS: MeasureKey[] = ['neck', 'waist', 'hips', ...EXTRA_KEYS];

/**
 * Capture-time guidance (spec 04, Layer 1). Front camera with the prior photo of
 * the same session ghosted on top so the user matches their position. Capture →
 * review → save. Sensor/auto-capture/AI drift come in later M4 increments.
 *
 * Photos persist as the local file uri for now; a persistent copy + hardened
 * encrypted cloud bucket land with the cloud-sync step (spec 04/10/11).
 */
export function PhotoCapture({
  session,
  part,
  ghostUri,
  ghostByPose,
  visible,
  onClose,
  onSaved,
  view = 'front',
  timer = 0,
  casual = false,
  smart = false,
}: {
  session: PhotoSession;
  part?: string;
  ghostUri?: string;
  /** Per-pose references (W6-26.5): the sampled live classification swaps the
   *  ghost to the reference matching the pose the user is actually holding. */
  ghostByPose?: Partial<Record<CanonicalPose, string>>;
  visible: boolean;
  onClose: () => void;
  /** Fired after a shot is saved to the store (PH-2): the parent runs the instant
   *  post-capture read + celebration. */
  onSaved?: (photoId: string) => void;
  /** Capture angle + self-timer default here; in smart mode the self-timer is
   *  controlled in-camera (the pre-camera picker is gone, 2a.1). */
  view?: 'front' | 'side';
  timer?: 0 | 3 | 10;
  /** One smart camera (2a.1): auto-detect session (face/body) + pose for ALL four
   *  canonical poses (not just body), swap the ghost, and derive the save tag from
   *  the detection. An in-camera chip row is the manual override / offline
   *  fallback. Off = the legacy explicit session+pose path (custom parts). */
  smart?: boolean;
  /** Quick-shot mode (W6-26c): shoot freely (back cam by default), no ghost lock,
   *  no measurements. The shot lands casual (`isRequiredSet: false`) and its pose
   *  is left to background classification, so it joins the reel for triage rather
   *  than the comparability track. */
  casual?: boolean;
}) {
  const { t } = useTranslation();
  const { addPhoto, upsertCheckin, setProfile, profile, entries } = useStore();
  const [permission, requestPermission] = useCameraPermissions();
  const camRef = useRef<CameraView>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [shotTilt, setShotTilt] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [ghostLevelIdx, setGhostLevelIdx] = useState(0);
  const [fitResult, setFitResult] = useState<FitCheck | null>(null);
  const [fitChecking, setFitChecking] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>(casual ? 'back' : 'front');
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Pinch to zoom ─────────────────────────────────────────────────────────
  // expo-camera's CameraView takes a `zoom` prop (0..1) but implements no
  // gesture itself — `isPinchToZoomEnabled` belongs to the barcode view and is
  // iOS-only. The overlay used to promise "pinch to zoom" with nothing behind
  // it. Built on PanResponder rather than react-native-gesture-handler because
  // the latter needs a GestureHandlerRootView this app has never mounted, and a
  // Modal is the worst place to introduce one untested.
  const [zoom, setZoom] = useState(0);
  // Mirrors `zoom` so the touch handlers never read a stale render's value.
  const zoomRef = useRef(0);
  const pinchStart = useRef(0);
  const zoomStart = useRef(0);
  const applyZoom = (v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    zoomRef.current = clamped;
    setZoom(clamped);
  };
  const pinchDistance = (touches: { pageX: number; pageY: number }[]) =>
    Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
  /** Two-finger pinch on the transparent surface over the preview. Raw touch
   *  props rather than PanResponder or gesture-handler: no responder to claim
   *  (so taps still reach the ghost toggle and the controls below), and no
   *  GestureHandlerRootView, which this app has never mounted. */
  const onTouchMoveZoom = (e: { nativeEvent: { touches: { pageX: number; pageY: number }[] } }) => {
    const touches = e.nativeEvent.touches;
    if (touches.length !== 2) {
      pinchStart.current = 0;
      return;
    }
    const d = pinchDistance(touches);
    if (pinchStart.current <= 0) {
      pinchStart.current = d;
      zoomStart.current = zoomRef.current;
      return;
    }
    // Sub-linear: the native zoom scale is aggressive at the top end, so a small
    // pinch should not cross the whole range.
    applyZoom(zoomStart.current + (d / pinchStart.current - 1) * 0.5);
  };
  const endPinch = () => {
    pinchStart.current = 0;
  };

  // ── Smart-camera in-camera controls (2a.1) ────────────────────────────────
  // Manual override wins over live detection (wrong-guess / offline / AI off);
  // `casualOverride` demotes a shot to a freeform reel entry; the self-timer is
  // set here now that the pre-camera picker is gone.
  const [manualPose, setManualPose] = useState<CanonicalPose | null>(null);
  const [detectedPose, setDetectedPose] = useState<CanonicalPose | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [casualOverride, setCasualOverride] = useState(false);
  const [timerSec, setTimerSec] = useState<0 | 3 | 10>(timer);

  // The pose this shot will save with, and the session it implies. Manual
  // override → live detection → the caller's default. In smart mode the session
  // is re-derived from the pose (a detected face shot saves as `face` and skips
  // measurements even though the smart camera opened body-first); custom parts
  // keep their explicit session.
  const effPose: CanonicalPose = part ? 'other' : manualPose ?? detectedPose ?? poseFromCapture(session, view);
  const effSession: PhotoSession = part ? 'body' : smart ? sessionForPose(effPose) : session;
  const isCasual = casual || casualOverride;

  // Quality score + low-score retry modal (redesign §4A, owner 2026-07-06).
  const [quality, setQuality] = useState<PhotoQuality | null>(null);
  const [qualityAck, setQualityAck] = useState(false);

  // Two-step review (beta-notes §1.5 / W2-5): step 1 = the shot + big score with
  // a FIXED footer (the old single scroll put Retake/Save below the fold on body
  // sessions); step 2 = measurements (body only). The photo is saved when step 1
  // is confirmed, so the parent's instant read warms up while the user measures.
  // Step 3 (2a.2) = the comparison payoff: the review now ENDS on the new photo
  // vs its reference, not on the measurements or the bare quality score.
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [showBefore, setShowBefore] = useState(false); // step-3 hero: before ⇄ now
  const savedIdRef = useRef<string | null>(null);

  // Measurement inputs (body session only, all optional)
  const [waist, setWaist] = useState('');
  const [neck, setNeck] = useState('');
  const [hips, setHips] = useState('');
  const [extraKey, setExtraKey] = useState<ExtraKey | undefined>();
  const [extraVal, setExtraVal] = useState('');
  // Guide-line spots (2a.7): seeded from the default anatomy map, overridden by
  // the user's own saved spots. Kept local while dragging and persisted once on
  // finish, so a drag doesn't hammer the store.
  const [guideY, setGuideY] = useState<Record<string, number>>(() => {
    const seed: Record<string, number> = {};
    for (const k of Object.keys(MEASURE_POS) as MeasureKey[]) seed[k] = MEASURE_POS[k].y;
    return { ...seed, ...(profile?.measureGuides ?? {}) };
  });
  const [editingKey, setEditingKey] = useState<MeasureKey | undefined>();
  const isBody = effSession === 'body';
  // Casual quick-shots skip the measurement step entirely (save + close), even in
  // the body track — measurements belong to the guided comparability flow.
  const collectMeasurements = isBody && !isCasual;
  const units = profile?.units ?? 'metric';
  const unitLabel = units === 'imperial' ? t('measurements.unitIn') : t('measurements.unitCm');

  // Live hedged body-fat estimate from the review measurements (spec 04 §4A).
  const heightCm = profile?.height
    ? units === 'imperial'
      ? profile.height * 2.54
      : profile.height
    : undefined;
  const bodyFat = isBody
    ? bodyFatNavy({
        units,
        heightCm,
        waist: parseFloat(waist) || undefined,
        neck: parseFloat(neck) || undefined,
        hip: parseFloat(hips) || undefined,
        female: usesFemaleFormula(profile?.sex),
      })
    : null;

  // Most recent prior measurements, for step 2's one-tap "same as last time"
  // (beta-notes §1.5: prefill mitigates the second step depressing completion).
  // Plain computation: the React Compiler memoizes it (manual useMemo clashed).
  const lastMeasurements = (() => {
    if (!isBody) return null;
    const dates = Object.keys(entries).sort((a, b) => (a < b ? 1 : -1));
    for (const d of dates) {
      const e = entries[d];
      if (e.waist !== undefined || e.hips !== undefined || e.neck !== undefined) {
        return {
          waist: e.waist,
          hips: e.hips,
          neck: e.neck,
          extraKey: e.extraMeasurementKey,
          extraVal: e.extraMeasurementValue,
        };
      }
    }
    return null;
  })();

  // ── Guide-line value plumbing (2a.7) ──────────────────────────────────────
  const valueFor = (k: MeasureKey): string =>
    k === 'waist' ? waist : k === 'hips' ? hips : k === 'neck' ? neck : extraKey === k ? extraVal : '';
  const setValueFor = (k: MeasureKey, v: string) => {
    if (k === 'waist') setWaist(v);
    else if (k === 'hips') setHips(v);
    else if (k === 'neck') setNeck(v);
    else if (extraKey === k) setExtraVal(v);
  };
  /** The spots shown on the photo: the three standing measurements plus the one
   *  optional extra the user picked. */
  const guides: Guide[] = ([
    'neck',
    'waist',
    'hips',
    ...(extraKey ? [extraKey] : []),
  ] as MeasureKey[]).map((k) => ({
    key: k,
    label: t(`measurements.${k}` as 'measurements.waist'),
    y: guideY[k] ?? MEASURE_POS[k].y,
    value: valueFor(k) || undefined,
  }));
  /** Persist the user's spots so the next session measures at the same place. */
  const persistGuides = () => setProfile({ measureGuides: guideY });

  const applyLastMeasurements = () => {
    if (!lastMeasurements) return;
    if (lastMeasurements.waist !== undefined) setWaist(String(lastMeasurements.waist));
    if (lastMeasurements.hips !== undefined) setHips(String(lastMeasurements.hips));
    if (lastMeasurements.neck !== undefined) setNeck(String(lastMeasurements.neck));
    if (lastMeasurements.extraKey && lastMeasurements.extraVal !== undefined) {
      setExtraKey(lastMeasurements.extraKey);
      setExtraVal(String(lastMeasurements.extraVal));
    }
  };

  // Live level indicator (spec 04, Layer 1 — tilt aid). Raw accelerometer →
  // roll/pitch; "level" when both are within a few degrees of upright. The tilt
  // magnitude at capture is stored as photo metadata for drift comparison.
  const [roll, setRoll] = useState(0);
  const [pitch, setPitch] = useState(0);
  const tiltRef = useRef(0);
  // The axes are kept separately as well as combined: the quality score judges
  // them at different tolerances (a crooked horizon ruins a shot, a leaning
  // phone does not), while `tilt` stays the single stored metadata number.
  const axesRef = useRef({ roll: 0, pitch: 0 });
  const live = visible && !!permission?.granted && !shot;

  useEffect(() => {
    if (!live) return;
    Accelerometer.setUpdateInterval(100);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const r = (Math.atan2(x, Math.hypot(y, z)) * 180) / Math.PI;
      const p = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
      setRoll(r);
      setPitch(p);
      tiltRef.current = Math.hypot(r, p);
      axesRef.current = { roll: r, pitch: p };
    });
    return () => sub.remove();
  }, [live]);

  const level = Math.abs(roll) < 5 && Math.abs(pitch) < 5;
  /** The app is portrait-locked, so a sideways phone still captures a portrait
   *  frame with the body lying across it — never comparable with the baseline.
   *  Roll passes 90° there, which the quality score already punishes; this just
   *  says WHY, instead of leaving the user with an unexplained low number. */
  const sideways = Math.abs(roll) > 60;

  // ── Live pose sampling (W6-26.5) ─────────────────────────────────────────
  // No on-device body-pose model exists for vision-camera v5 yet, so the body
  // session silently samples a low-res frame every few seconds through the
  // cheap classify_pose call (schedule + stability live in pose-live.ts):
  //  - main track: a stable read swaps the ghost to that pose's reference and
  //    tags the eventual save, so the user never has to pre-declare the angle.
  //  - custom parts: no canonical pose to detect, so the sample runs check_fit
  //    against the part's reference instead — a live "does this match my
  //    reference shot" hint (the custom-pose version of pose detection).
  // Offline / AI-unconfigured: fails open, manual chips + last ghost remain.
  const [liveFit, setLiveFit] = useState<FitCheck | null>(null);
  const samplingRef = useRef(false); // serializes sampling captures
  const actionRef = useRef(false); // true while a real capture is in flight
  const isBodyMain = session === 'body' && !part;
  // Smart mode samples for BOTH sessions (the classifier distinguishes face vs
  // body poses), so the one camera never has to pre-declare the session. The
  // legacy body-main path is unchanged; custom parts run the check_fit branch.
  const detectPose = (smart || isBodyMain) && !part;
  const detectFit = !!(part && ghostUri);

  useEffect(() => {
    if (!live || !isSupabaseConfigured) return;
    if (!detectPose && !detectFit) return; // (non-smart face → VisionCameraCapture)
    let cancelled = false;
    let state = initialSampleState();
    const id = setInterval(async () => {
      if (cancelled || samplingRef.current || actionRef.current) return;
      if (!shouldSample(state, Date.now())) return;
      samplingRef.current = true;
      try {
        const pic = await camRef.current?.takePictureAsync({
          quality: 0.25,
          shutterSound: false,
          skipProcessing: true,
        });
        if (!pic?.uri || cancelled) return;
        if (detectFit) {
          // Custom track: live fit vs the part reference. Reuse the schedule's
          // sample cap as the cost ceiling; never "stabilizes".
          state = { ...state, samples: state.samples + 1, lastAt: Date.now() };
          const fit = await checkFit(pic.uri, ghostUri as string);
          if (!cancelled) setLiveFit(fit);
        } else {
          const res = await classifyPose(pic.uri);
          if (!res || cancelled) return;
          state = recordSample(state, res.pose, res.confidence, Date.now());
          // Accept any of the four comparability poses (face + body), so the
          // smart camera can resolve either session from the live frame.
          if (state.stable && REQUIRED_POSES.includes(state.stable)) {
            setDetectedPose(state.stable);
          }
        }
      } catch {
        // fail open — sampling is a pure enhancement
      } finally {
        samplingRef.current = false;
      }
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [live, detectPose, detectFit, part, ghostUri]);

  /** Stop any running self-timer countdown. */
  const clearCountdown = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = null;
    setCountdown(null);
  };
  // Clean up the interval if the component unmounts mid-countdown.
  useEffect(() => clearCountdown, []);

  /** Reset the captured shot back to the live camera (retake). */
  const resetShot = () => {
    setShot(null);
    setFitResult(null);
    setFitChecking(false);
    setQuality(null);
    setQualityAck(false);
    setStep(1);
    setShowBefore(false);
    savedIdRef.current = null;
  };

  const close = () => {
    clearCountdown();
    resetShot();
    setShotTilt(undefined);
    setWaist('');
    setNeck('');
    setHips('');
    setExtraKey(undefined);
    setExtraVal('');
    setEditingKey(undefined);
    setDetectedPose(null);
    setLiveFit(null);
    setManualPose(null);
    setShowManual(false);
    setCasualOverride(false);
    onClose();
  };

  const capture = async () => {
    if (!camRef.current || busy) return;
    setBusy(true);
    actionRef.current = true; // pause pose sampling while the real shot runs
    try {
      const pic = await camRef.current.takePictureAsync({ quality: 0.8 });
      if (pic?.uri) {
        const tiltNow = Math.round(tiltRef.current);
        const axesNow = axesRef.current;
        setShotTilt(tiltNow);
        setShot(pic.uri);
        setQualityAck(false);
        if (liveGhostUri) {
          // Score once the fit check resolves (framing feeds the quality score).
          // Compared against the pose-matched reference, not just the chain's.
          setFitChecking(true);
          setFitResult(null);
          setQuality(null);
          checkFit(pic.uri, liveGhostUri).then((r) => {
            setFitResult(r);
            setFitChecking(false);
            // Only let framing move the score when the check actually ran
            // (confidence 0 = couldn't compare, e.g. an unreadable ghost). An
            // unchecked frame is unknown, not perfect, so the score reflects
            // tilt alone rather than a fake top framing mark.
            setQuality(
              computeQuality({
                rollDeg: axesNow.roll,
                pitchDeg: axesNow.pitch,
                fit: r.confidence > 0 ? r.fit : undefined,
              }),
            );
          });
        } else {
          // First baseline shot (no ghost): score on level alone.
          setQuality(computeQuality({ rollDeg: axesNow.roll, pitchDeg: axesNow.pitch }));
        }
      }
    } finally {
      setBusy(false);
      actionRef.current = false;
    }
  };

  /** Shutter press: fire now, or run the self-timer countdown then fire. */
  const startCapture = () => {
    if (busy || countdown !== null) return;
    if (timerSec === 0) {
      void capture();
      return;
    }
    setCountdown(timerSec);
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c === null) return null;
        if (c <= 1) {
          clearCountdown();
          void capture();
          return null;
        }
        return c - 1;
      });
    }, 1000);
  };

  /** Persist + store the shot (step-1 confirm). Fires onSaved immediately so the
   *  parent's instant read runs in the background while step 2 collects
   *  measurements (beta-notes §1.5: the result is warm when the user finishes). */
  const saveShot = async (): Promise<boolean> => {
    if (!shot || busy || savedIdRef.current) return savedIdRef.current !== null;
    setBusy(true);
    try {
      const persistentUri = await copyPhotoToDocuments(shot);
      // Manual override → live detection → the caller's default (see effPose).
      // The save tag, its view, and the session all derive from that one pose so
      // a smart-detected face shot lands in the face track (custom parts stay
      // `other` in the body track).
      const savedView = part ? view : viewForPose(effPose);
      const newId = addPhoto({
        session: effSession,
        part,
        view: savedView,
        uri: persistentUri,
        takenAt: new Date().toISOString(),
        tilt: shotTilt,
        qualityScore: quality?.score,
        // Casual: leave the pose to background classification (undefined unless a
        // live sample / manual chip already resolved one) so the shot lands in the
        // reel for triage. Guided: derive + lock to the comparability set.
        pose: isCasual ? manualPose ?? detectedPose ?? undefined : part ? 'other' : effPose,
        isRequiredSet: isCasual ? false : !part,
      });
      savedIdRef.current = newId;
      onSaved?.(newId);
      return true;
    } finally {
      setBusy(false);
    }
  };

  /** Step-1 primary action: save, then measure (body) or go straight to the
   *  comparison payoff (2a.2). */
  const onContinue = async () => {
    const ok = await saveShot();
    if (!ok) return;
    if (collectMeasurements) setStep(2);
    else finishToPayoff();
  };

  /** Step-2 done: write any measurements to today's check-in, then payoff. */
  const finishMeasurements = () => {
    const w = parseFloat(waist);
    const nk = parseFloat(neck);
    const h = parseFloat(hips);
    const ev = parseFloat(extraVal);
    const patch: Record<string, unknown> = {};
    if (Number.isFinite(w)) patch.waist = w;
    if (Number.isFinite(nk)) patch.neck = nk;
    if (Number.isFinite(h)) patch.hips = h;
    if (extraKey && Number.isFinite(ev)) {
      patch.extraMeasurementKey = extraKey;
      patch.extraMeasurementValue = ev;
    }
    if (Object.keys(patch).length > 0) {
      upsertCheckin(localDateKey(), patch as Parameters<typeof upsertCheckin>[1]);
    }
    persistGuides();
    finishToPayoff();
  };

  /** Skip the numbers but keep any spot the user just repositioned. */
  const skipMeasurements = () => {
    persistGuides();
    finishToPayoff();
  };

  const sessionLabel = isCasual
    ? t('photos.quickShot')
    : effSession === 'face'
      ? t('photos.sessionFace')
      : t('photos.sessionBody');

  // Ghost for the live view: prefer the reference of the pose being held
  // (manual override → detected live); fall back to the chain ghost.
  const liveGhostUri = ghostByPose?.[effPose] ?? ghostUri;

  // Manual override chips (2a.1): the demoted picker, now in-camera for the
  // wrong-guess / offline / AI-unconfigured cases.
  const cycleTimer = () => setTimerSec((s) => (s === 0 ? 3 : s === 3 ? 10 : 0));

  // ── Step-3 comparison payoff (2a.2) ───────────────────────────────────────
  // A clean, offline readout of the just-captured shot vs its pose-matched
  // reference, built from data the camera already holds (the fit check + the
  // entered measurements vs last). The deep, baseline-anchored analysis (with
  // arrows, 2a.3/2a.4) still runs later in the tab; this is the immediate payoff.
  const payoffComparability: Comparability = fitResult
    ? fitResult.fit === 'good'
      ? 'comparable'
      : fitResult.fit === 'poor'
        ? 'low'
        : 'partial'
    : 'partial';
  const payoffMeasureDelta = (() => {
    if (!isBody || !lastMeasurements) return undefined;
    const d: { waist?: number; hips?: number; extra?: { key: string; delta: number } } = {};
    const w = parseFloat(waist);
    const h = parseFloat(hips);
    const ev = parseFloat(extraVal);
    if (Number.isFinite(w) && lastMeasurements.waist !== undefined) d.waist = w - lastMeasurements.waist;
    if (Number.isFinite(h) && lastMeasurements.hips !== undefined) d.hips = h - lastMeasurements.hips;
    if (
      extraKey &&
      Number.isFinite(ev) &&
      lastMeasurements.extraKey === extraKey &&
      lastMeasurements.extraVal !== undefined
    ) {
      d.extra = { key: extraKey, delta: ev - lastMeasurements.extraVal };
    }
    return Object.keys(d).length ? d : undefined;
  })();
  const payoffReadout = quickReadout({ measurementDelta: payoffMeasureDelta });
  const payoffComparabilityFinal: Comparability =
    payoffMeasureDelta || fitResult ? payoffComparability : payoffReadout.comparability;
  // The "before" image for the payoff = the pose-matched reference (the ghost).
  // Absent on the first-ever shot → the payoff shows the baseline-set message.
  const payoffBeforeUri = liveGhostUri;

  /** End the review on the payoff (2a.2): a guided shot lands on the comparison
   *  card; a casual triage shot just closes. */
  const finishToPayoff = () => {
    if (isCasual) close();
    else {
      setShowBefore(false);
      setStep(3);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      {/* A Modal renders in its own native view tree, so react-native-safe-area-
          context needs a fresh provider inside it or every SafeAreaView reports
          zero insets (content slides under the status bar / Dynamic Island). */}
      <SafeAreaProvider>
        <View style={styles.fill}>
        {!permission ? null : !permission.granted ? (
          <SafeAreaView style={styles.center}>
            <ThemedText type="body" style={styles.permText}>
              {t('photos.permission')}
            </ThemedText>
            <PrimaryButton label={t('photos.enableCamera')} onPress={requestPermission} />
            <SecondaryButton label={t('common.cancel')} onPress={close} />
          </SafeAreaView>
        ) : shot && step === 1 ? (
          // ── Step 1: the shot + big quality score, fixed footer (§1.5) ──
          <View style={styles.fill}>
          <ScrollView style={styles.fill} contentContainerStyle={styles.reviewContent} bounces={false} showsVerticalScrollIndicator={false}>
            <Image source={{ uri: shot }} style={styles.reviewPhoto} contentFit="cover" />
            <View style={styles.scoreBlock}>
              {quality ? (
                <>
                  <ThemedText type="monoSm" style={styles.scoreLabel}>
                    {t('photos.qualityLabel').toUpperCase()}
                  </ThemedText>
                  <ThemedText
                    type="hero"
                    style={[
                      styles.scoreValue,
                      quality.displayScore >= 80
                        ? styles.scoreGood
                        : quality.displayScore >= 60
                        ? styles.scoreWatch
                        : styles.scoreBad,
                    ]}>
                    {String(quality.displayScore)}
                  </ThemedText>
                </>
              ) : fitChecking ? (
                <ActivityIndicator size="small" color="#F0EFEC" />
              ) : null}
              {shotTilt !== undefined ? (
                <ThemedText type="monoSm" style={styles.scoreMeta}>
                  {t('photos.tiltMeta', { deg: shotTilt })}
                </ThemedText>
              ) : null}
              <ThemedText type="monoSm" style={styles.scoreMeta}>
                {t('photos.analysisAfterHint')}
              </ThemedText>
            </View>
            {ghostUri && (fitChecking || (fitResult && fitResult.fit !== 'good')) ? (
              <View style={[styles.fitBanner, fitResult?.fit === 'poor' ? styles.fitBannerPoor : styles.fitBannerWeak]}>
                {fitChecking ? (
                  <ActivityIndicator size="small" color="#F0EFEC" />
                ) : null}
                <ThemedText type="monoSm" style={styles.fitBannerText}>
                  {fitChecking
                    ? t('photos.fitChecking')
                    : fitResult?.fit === 'poor'
                    ? fitResult.hint ?? t('photos.fitPoor')
                    : fitResult?.hint ?? t('photos.fitWeak')}
                </ThemedText>
              </View>
            ) : null}
          </ScrollView>
          {/* Fixed footer: never scrolls away (the old bar sat below the
              measurement panel, below the fold on body sessions). */}
          <SafeAreaView style={styles.reviewBar} edges={['bottom']}>
            <Pressable accessibilityRole="button" onPress={resetShot}>
              <ThemedText type="label" style={styles.darkText}>
                {t('photos.retake')}
              </ThemedText>
            </Pressable>
            <View style={styles.saveBtn}>
              <PrimaryButton
                label={collectMeasurements ? t('common.continue') : t('photos.save')}
                onPress={() => void onContinue()}
              />
            </View>
          </SafeAreaView>
          {/* Low-score retry modal (owner decision): only below the recommended
              bar, with the clothing nudge + the "never trained on" reassurance. */}
          {quality?.belowThreshold && !qualityAck ? (
            <View style={styles.retryOverlay}>
              <View style={styles.retryCard}>
                <ThemedText type="smallBold" style={styles.retryTitle}>
                  {t('photos.qualityLowTitle')}
                </ThemedText>
                <ThemedText type="small" style={styles.retryBody}>
                  {t('photos.qualityLowBody')}
                </ThemedText>
                <View style={styles.retryActions}>
                  <View style={styles.retryBtn}>
                    <PrimaryButton label={t('photos.retakePhoto')} onPress={resetShot} />
                  </View>
                  <Pressable accessibilityRole="button" onPress={() => setQualityAck(true)} hitSlop={8}>
                    <ThemedText type="label" style={styles.darkText}>
                      {t('photos.ignoreProceed')}
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}
          </View>
        ) : shot && step === 2 ? (
          // ── Step 2: measurements (body only), prefillable, skippable (§1.5) ──
          <View style={styles.measureStep}>
            <ScrollView
              style={styles.fill}
              contentContainerStyle={styles.measureStepContent}
              bounces={false}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled">
              <ThemedText type="smallBold" style={styles.measureTitle}>
                {t('photos.measureTitle')}
              </ThemedText>
              <ThemedText type="monoSm" style={styles.bfLabel}>
                {t('measurements.optionalHint')}
              </ThemedText>
              {lastMeasurements ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={applyLastMeasurements}
                  style={styles.sameAsLastBtn}>
                  <ThemedText type="monoSm" style={styles.sameAsLastText}>
                    {t('measurements.sameAsLast').toUpperCase()}
                  </ThemedText>
                </Pressable>
              ) : null}
              {/* Guide lines on the shot (2a.7): tap a chip to enter its number,
                  drag the grip to move the spot. Consistency, not measurement. */}
              <MeasurementGuides
                uri={shot ?? undefined}
                guides={guides}
                unitLabel={unitLabel}
                editingKey={editingKey}
                onMove={(k, y) => setGuideY((prev) => ({ ...prev, [k]: y }))}
                onEditSpot={(k) => setEditingKey((cur) => (cur === k ? undefined : k))}
              />
              {editingKey ? (
                <LabeledInput
                  label={`${t(`measurements.${editingKey}` as 'measurements.waist')} (${unitLabel})`}
                  placeholder={
                    editingKey === 'waist' && lastMeasurements?.waist !== undefined
                      ? String(lastMeasurements.waist)
                      : editingKey === 'hips' && lastMeasurements?.hips !== undefined
                        ? String(lastMeasurements.hips)
                        : editingKey === 'neck' && lastMeasurements?.neck !== undefined
                          ? String(lastMeasurements.neck)
                          : '—'
                  }
                  keyboardType="decimal-pad"
                  value={valueFor(editingKey)}
                  onChangeText={(v) => setValueFor(editingKey, v)}
                  autoFocus
                />
              ) : (
                <ThemedText type="monoSm" style={styles.bfLabel}>
                  {t('photos.guideHint')}
                </ThemedText>
              )}
              {/* The chip row is the measurement PICKER, not just the optional
                  extra. Tapping a spot on the photo works, but hitting a thin
                  line on your own torso is fiddly, so the same three standing
                  measurements are reachable as ordinary buttons and the input
                  below follows whichever is selected. Selecting one of the
                  optional extras also adds its spot to the photo. */}
              <SingleSelectChips
                options={MEASURE_CHIPS.map((k) => ({
                  value: k,
                  label: t(`measurements.${k}` as 'measurements.waist'),
                }))}
                value={editingKey}
                onChange={(k) => {
                  setEditingKey(k);
                  if (EXTRA_KEYS.includes(k as (typeof EXTRA_KEYS)[number])) setExtraKey(k as ExtraKey);
                }}
              />
              {editingKey && EXTRA_KEYS.includes(editingKey as (typeof EXTRA_KEYS)[number]) ? (
                <Pressable accessibilityRole="button" onPress={() => { setExtraKey(undefined); setEditingKey(undefined); }}>
                  <ThemedText type="monoSm" style={styles.bfLabel}>
                    {t('photos.clearExtra')}
                  </ThemedText>
                </Pressable>
              ) : null}
              {/* Hedged Navy body-fat estimate (observational, not medical). */}
              {bodyFat ? (
                <View style={styles.bfBox}>
                  <ThemedText type="monoSm" style={styles.bfLabel}>
                    {t('photos.bodyFat')}
                  </ThemedText>
                  <ThemedText type="metricSm" style={styles.bfValue}>
                    {`${bodyFat.pct}%`}
                  </ThemedText>
                  <ThemedText type="monoSm" style={styles.bfLabel}>
                    {t('photos.bodyFatHedge', { low: bodyFat.low, high: bodyFat.high })}
                  </ThemedText>
                </View>
              ) : (
                <ThemedText type="monoSm" style={styles.bfHint}>
                  {t('photos.bodyFatNeed')}
                </ThemedText>
              )}
            </ScrollView>
            {/* Fixed footer: the photo is already saved; measurements only.
                Skip still lands on the comparison payoff (2a.2). */}
            <SafeAreaView style={styles.reviewBar} edges={['bottom']}>
              <Pressable accessibilityRole="button" onPress={skipMeasurements}>
                <ThemedText type="label" style={styles.darkText}>
                  {t('photos.skipMeasurements')}
                </ThemedText>
              </Pressable>
              <View style={styles.saveBtn}>
                <PrimaryButton label={t('common.continue')} onPress={finishMeasurements} />
              </View>
            </SafeAreaView>
          </View>
        ) : shot && step === 3 ? (
          // ── Step 3: the comparison payoff (2a.2) ──
          <View style={styles.fill}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(payoffBeforeUri && showBefore ? 'photos.compareBefore' : 'photos.compareNow')}
              accessibilityHint={payoffBeforeUri ? t('photos.compareTapHint') : undefined}
              disabled={!payoffBeforeUri}
              style={styles.fill}
              onPress={() => payoffBeforeUri && setShowBefore((s) => !s)}>
              <Image
                source={{ uri: showBefore && payoffBeforeUri ? payoffBeforeUri : (shot as string) }}
                style={styles.reviewPhoto}
                contentFit="cover"
              />
              <View style={styles.payoffCap} pointerEvents="none">
                <ThemedText type="monoSm" style={styles.payoffCapText}>
                  {t(showBefore && payoffBeforeUri ? 'photos.compareBefore' : 'photos.compareNow')}
                </ThemedText>
              </View>
            </Pressable>
            <ScrollView
              style={styles.payoffReadout}
              contentContainerStyle={styles.payoffReadoutContent}
              bounces={false}
              showsVerticalScrollIndicator={false}>
              {payoffBeforeUri ? (
                <>
                  <View style={styles.payoffPillRow}>
                    <View
                      style={[
                        styles.payoffPill,
                        payoffComparabilityFinal === 'comparable'
                          ? styles.payoffPillGood
                          : payoffComparabilityFinal === 'partial'
                            ? styles.payoffPillWatch
                            : styles.payoffPillBad,
                      ]}>
                      <ThemedText type="monoSm" style={styles.payoffPillText}>
                        {t(`photos.comparability_${payoffComparabilityFinal}` as 'photos.comparability_comparable')}
                      </ThemedText>
                    </View>
                    <ThemedText type="monoSm" style={styles.payoffTapHint}>
                      {t('photos.compareTapHint')}
                    </ThemedText>
                  </View>
                  {payoffReadout.changes.map((c) => (
                    <ThemedText key={c.metricKey} type="mono" style={styles.payoffDelta}>
                      {`${t(c.metricKey as 'measurements.waist')} ${c.delta > 0 ? '+' : ''}${Math.round(c.delta * 10) / 10}${unitLabel}`}
                    </ThemedText>
                  ))}
                  {quality ? (
                    <ThemedText type="monoSm" style={styles.payoffMeta}>
                      {`${t('photos.qualityLabel')} ${quality.displayScore}`}
                    </ThemedText>
                  ) : null}
                  <ThemedText type="monoSm" style={styles.payoffMeta}>
                    {t('photos.analysisTimelineHint')}
                  </ThemedText>
                </>
              ) : (
                <ThemedText type="small" style={styles.payoffBaseline}>
                  {t('photos.savedBaselineBody')}
                </ThemedText>
              )}
            </ScrollView>
            <SafeAreaView style={styles.reviewBar} edges={['bottom']}>
              <View style={styles.payoffDoneBtn}>
                <PrimaryButton label={t('common.done')} onPress={close} />
              </View>
            </SafeAreaView>
          </View>
        ) : (
          // ── Live camera + ghost overlay ──
          <View style={styles.fill}>
            {/* animateShutter off: the silent pose-sampling captures (W6-26.5)
                must not flash the screen every few seconds. */}
            <CameraView
              ref={camRef}
              style={styles.fill}
              facing={facing}
              zoom={zoom}
              mirror={facing === 'front'}
              animateShutter={false}
            />
            {/* Transparent pinch surface over the preview. It only claims
                two-finger gestures, so taps fall through to the ghost toggle
                and the controls keep working. */}
            <View
              style={StyleSheet.absoluteFill}
              pointerEvents="box-none"
              onTouchMove={onTouchMoveZoom}
              onTouchEnd={endPinch}
              onTouchCancel={endPinch}
            />
            {liveGhostUri ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('photos.ghostLevel', { pct: Math.round(GHOST_LEVELS[ghostLevelIdx] * 100) })}
                style={StyleSheet.absoluteFill}
                onPress={() => setGhostLevelIdx((i) => (i + 1) % GHOST_LEVELS.length)}>
                <Image
                  source={{ uri: liveGhostUri }}
                  style={[StyleSheet.absoluteFill, { opacity: GHOST_LEVELS[ghostLevelIdx] }]}
                  contentFit="cover"
                />
              </Pressable>
            ) : null}
            <SafeAreaView style={styles.topBar} edges={['top']} pointerEvents="none">
              <ThemedText type="label" style={styles.overlayText}>
                {sessionLabel}
              </ThemedText>
              {/* Live-detected (or manually set) pose: the tag the shot saves
                  with. In smart mode, show a scanning hint until it resolves. */}
              {manualPose ? (
                <ThemedText type="monoSm" style={styles.overlayDim}>
                  {t('photos.poseSet', { pose: t(`photos.pose_${manualPose}` as 'photos.pose_front_relaxed') })}
                </ThemedText>
              ) : detectedPose ? (
                <ThemedText type="monoSm" style={styles.overlayDim}>
                  {t('photos.poseDetected', { pose: t(`photos.pose_${detectedPose}` as 'photos.pose_front_relaxed') })}
                </ThemedText>
              ) : smart && !part ? (
                <ThemedText type="monoSm" style={styles.overlayDim}>
                  {t('photos.smartScanning')}
                </ThemedText>
              ) : null}
              {/* Custom-part live fit vs the reference (the custom-pose flavor). */}
              {part && liveFit && liveFit.fit !== 'good' ? (
                <ThemedText type="monoSm" style={styles.overlayDim}>
                  {liveFit.hint ?? t(liveFit.fit === 'poor' ? 'photos.fitPoor' : 'photos.fitWeak')}
                </ThemedText>
              ) : null}
              {ghostUri ? (
                <>
                  <ThemedText type="monoSm" style={styles.overlayDim}>
                    {t('photos.ghostHint')}
                  </ThemedText>
                  <ThemedText type="monoSm" style={styles.overlayDim}>
                    {t('photos.ghostLevel', { pct: Math.round(GHOST_LEVELS[ghostLevelIdx] * 100) })}
                  </ThemedText>
                </>
              ) : (
                <ThemedText type="monoSm" style={styles.overlayDim}>
                  {t('photos.clothingHint')}
                </ThemedText>
              )}
              <ThemedText type="monoSm" style={styles.overlayDim}>
                {zoom > 0.01 ? t('photos.zoomLevel', { pct: Math.round(zoom * 100) }) : t('photos.pinchZoomHint')}
              </ThemedText>
              {sideways ? (
                <ThemedText type="monoSm" style={styles.overlayText}>
                  {t('photos.sidewaysHint')}
                </ThemedText>
              ) : null}
            </SafeAreaView>
            {/* Self-timer countdown. */}
            {countdown !== null ? (
              <View style={styles.countdownWrap} pointerEvents="none">
                <ThemedText type="hero" style={styles.countdownText}>
                  {String(countdown)}
                </ThemedText>
              </View>
            ) : null}
            <View style={styles.levelWrap} pointerEvents="none">
              <View style={styles.levelRef} />
              <View
                style={[
                  styles.levelBar,
                  {
                    transform: [{ rotate: `${roll}deg` }],
                    backgroundColor: level ? '#3A8A58' : 'rgba(240,239,236,0.85)',
                  },
                ]}
              />
            </View>
            {/* Manual override (2a.1): the demoted picker, in-camera for the
                wrong-guess / offline / AI-unconfigured cases + the self-timer. */}
            {smart && !part ? (
              <View style={styles.manualWrap}>
                {showManual ? (
                  <View style={styles.manualPanel}>
                    <View style={styles.manualChips}>
                      <OverlayChip
                        label={t('photos.poseAuto')}
                        active={manualPose === null}
                        onPress={() => setManualPose(null)}
                      />
                      {REQUIRED_POSES.map((p) => (
                        <OverlayChip
                          key={p}
                          label={t(`photos.pose_${p}` as 'photos.pose_front_relaxed')}
                          active={manualPose === p}
                          onPress={() => setManualPose(p)}
                        />
                      ))}
                    </View>
                    <View style={styles.manualChips}>
                      <OverlayChip
                        label={t('photos.quickShot')}
                        active={casualOverride}
                        onPress={() => setCasualOverride((c) => !c)}
                      />
                      <OverlayChip
                        label={t(timerSec === 0 ? 'photos.timerOff' : timerSec === 3 ? 'photos.timer3' : 'photos.timer10')}
                        active={timerSec !== 0}
                        onPress={cycleTimer}
                      />
                    </View>
                  </View>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showManual }}
                  onPress={() => setShowManual((s) => !s)}
                  hitSlop={8}
                  style={styles.manualToggle}>
                  <ThemedText type="monoSm" style={styles.overlayDim}>
                    {t('photos.setPose')}
                  </ThemedText>
                </Pressable>
              </View>
            ) : null}
            <SafeAreaView style={styles.bottomBar} edges={['bottom']}>
              <Pressable accessibilityRole="button" onPress={close}>
                <ThemedText type="label" style={styles.overlayText}>
                  {t('common.cancel')}
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('photos.capture')}
                disabled={busy || countdown !== null}
                onPress={startCapture}
                style={({ pressed }) => [styles.shutter, pressed && styles.shutterPressed]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('photos.flipCamera')}
                onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
                style={styles.flipBtn}>
                <FlipCameraIcon size={28} color="onAccent" />
              </Pressable>
            </SafeAreaView>
          </View>
        )}
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}

/** A compact chip for the in-camera manual-override strip (dark overlay). */
function OverlayChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.overlayChip, active && styles.overlayChipActive]}>
      <ThemedText type="monoSm" style={active ? styles.overlayChipTextActive : styles.overlayChipText}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.five },
  permText: { textAlign: 'center' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, padding: Spacing.four, gap: Spacing.one },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  overlayText: { color: '#F0EFEC', letterSpacing: 1.3 },
  overlayDim: { color: 'rgba(240,239,236,0.7)' },
  // In-camera manual override strip (2a.1), sits just above the shutter bar.
  manualWrap: { position: 'absolute', bottom: 96, left: 0, right: 0, alignItems: 'center', gap: Spacing.two },
  manualPanel: { alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.four },
  manualChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.two },
  manualToggle: { paddingVertical: Spacing.one, paddingHorizontal: Spacing.three },
  overlayChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(240,239,236,0.4)',
    backgroundColor: 'rgba(17,17,16,0.55)',
  },
  overlayChipActive: { backgroundColor: 'rgba(240,239,236,0.92)', borderColor: '#F0EFEC' },
  overlayChipText: { color: 'rgba(240,239,236,0.85)' },
  overlayChipTextActive: { color: '#131210' },
  // Review step 1: shot + big score. Near-black frame (tinted, not #000-pure UI).
  reviewContent: { flexGrow: 1 },
  reviewPhoto: { width: '100%', aspectRatio: 3 / 4 },
  scoreBlock: { padding: Spacing.four, gap: Spacing.one, alignItems: 'center', backgroundColor: '#111110' },
  scoreLabel: { color: 'rgba(240,239,236,0.6)', letterSpacing: 2 },
  scoreValue: { fontSize: 72, lineHeight: 78, fontVariant: ['tabular-nums'] },
  scoreGood: { color: '#5FA97A' },
  scoreWatch: { color: '#C9A356' },
  scoreBad: { color: '#C96A5F' },
  scoreMeta: { color: 'rgba(240,239,236,0.55)' },
  // Review step 3: the comparison payoff (2a.2). Photo hero + a readout block
  // where the big score used to be, on the near-black review frame.
  payoffCap: { position: 'absolute', top: Spacing.two, left: Spacing.two },
  payoffCapText: { color: 'rgba(240,239,236,0.85)', letterSpacing: 1.3 },
  payoffReadout: { flexGrow: 0, backgroundColor: '#111110' },
  payoffReadoutContent: { padding: Spacing.four, gap: Spacing.two },
  payoffPillRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  payoffPill: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one, borderRadius: 2 },
  payoffPillGood: { backgroundColor: 'rgba(95,169,122,0.22)' },
  payoffPillWatch: { backgroundColor: 'rgba(201,163,86,0.22)' },
  payoffPillBad: { backgroundColor: 'rgba(201,106,95,0.22)' },
  payoffPillText: { color: '#F0EFEC' },
  payoffTapHint: { color: 'rgba(240,239,236,0.5)' },
  payoffDelta: { color: 'rgba(240,239,236,0.85)' },
  payoffMeta: { color: 'rgba(240,239,236,0.55)' },
  payoffBaseline: { color: 'rgba(240,239,236,0.85)' },
  payoffDoneBtn: { flex: 1 },
  // Review step 2: measurements on the light panel, fixed footer.
  measureStep: { flex: 1, backgroundColor: '#F0EFEC' },
  measureStepContent: { padding: Spacing.four, gap: Spacing.three },
  measureTitle: { color: '#1A1A18' },
  sameAsLastBtn: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#8A8781',
    borderRadius: 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
  sameAsLastText: { color: '#1A1A18', letterSpacing: 1.3 },
  measureRow: { flexDirection: 'row', gap: Spacing.three },
  measureField: { flex: 1 },
  reviewBar: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0EFEC',
  },
  darkText: { color: '#1A1A18', letterSpacing: 1.3 },
  saveBtn: { minWidth: 140 },
  shutter: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 4,
    borderColor: '#F0EFEC',
    backgroundColor: 'rgba(240,239,236,0.25)',
  },
  shutterPressed: { transform: [{ scale: 0.94 }], backgroundColor: 'rgba(240,239,236,0.5)' },
  flipBtn: { width: 60, alignItems: 'center', justifyContent: 'center' },
  levelWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  levelRef: { position: 'absolute', width: 170, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(240,239,236,0.3)' },
  levelBar: { width: 120, height: 2, borderRadius: 1 },
  fitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  fitBannerWeak: { backgroundColor: 'rgba(180,120,0,0.85)' },
  fitBannerPoor: { backgroundColor: 'rgba(160,40,40,0.9)' },
  fitBannerText: { color: '#F0EFEC', flex: 1 },
  // Hedged body-fat estimate box (on the light measurement panel).
  bfBox: { gap: 2 },
  bfLabel: { color: '#5A5752' },
  bfValue: { color: '#1A1A18' },
  bfHint: { color: '#5A5752' },
  countdownWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  countdownText: { color: '#F0EFEC', fontSize: 96, lineHeight: 104 },
  // Low-score retry modal.
  retryOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  retryCard: { backgroundColor: '#F0EFEC', borderRadius: 4, padding: Spacing.four, gap: Spacing.three, maxWidth: 360 },
  retryTitle: { color: '#1A1A18' },
  retryBody: { color: '#3A3834' },
  retryActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  retryBtn: { flex: 1 },
});
