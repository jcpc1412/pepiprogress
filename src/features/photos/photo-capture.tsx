import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { Accelerometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { LabeledInput, PrimaryButton, SingleSelectChips } from '@/components/form';
import { FlipCameraIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { checkFit, classifyPose, type FitCheck } from '@/lib/ai';
import { bodyFatNavy, usesFemaleFormula } from '@/lib/body-composition';
import { copyPhotoToDocuments } from '@/lib/photos';
import { poseFromCapture, type CanonicalPose } from '@/lib/photo-pose';
import { computeQuality, type PhotoQuality } from '@/lib/photo-quality';
import { initialSampleState, recordSample, shouldSample } from '@/lib/pose-live';
import { localDateKey, useStore, type PhotoSession } from '@/lib/store';
import { isSupabaseConfigured } from '@/lib/supabase';

/** Tap-cycle levels for the ghost overlay opacity (R3-H). */
const GHOST_LEVELS = [0.2, 0.4, 0.6] as const;

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
  /** Capture angle + self-timer are chosen in the Photos tab now, not in-camera. */
  view?: 'front' | 'side';
  timer?: 0 | 3 | 10;
  /** Quick-shot mode (W6-26c): shoot freely (back cam by default), no ghost lock,
   *  no measurements. The shot lands casual (`isRequiredSet: false`) and its pose
   *  is left to background classification, so it joins the reel for triage rather
   *  than the comparability track. */
  casual?: boolean;
}) {
  const { t } = useTranslation();
  const { addPhoto, upsertCheckin, profile, entries } = useStore();
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

  // Quality score + low-score retry modal (redesign §4A, owner 2026-07-06).
  const [quality, setQuality] = useState<PhotoQuality | null>(null);
  const [qualityAck, setQualityAck] = useState(false);

  // Two-step review (beta-notes §1.5 / W2-5): step 1 = the shot + big score with
  // a FIXED footer (the old single scroll put Retake/Save below the fold on body
  // sessions); step 2 = measurements (body only). The photo is saved when step 1
  // is confirmed, so the parent's instant read warms up while the user measures.
  const [step, setStep] = useState<1 | 2>(1);
  const savedIdRef = useRef<string | null>(null);

  // Measurement inputs (body session only, all optional)
  const [waist, setWaist] = useState('');
  const [neck, setNeck] = useState('');
  const [hips, setHips] = useState('');
  const [extraKey, setExtraKey] = useState<'chest' | 'arms' | 'thighs' | undefined>();
  const [extraVal, setExtraVal] = useState('');
  const isBody = session === 'body';
  // Casual quick-shots skip the measurement step entirely (save + close), even in
  // the body track — measurements belong to the guided comparability flow.
  const collectMeasurements = isBody && !casual;
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
    });
    return () => sub.remove();
  }, [live]);

  const level = Math.abs(roll) < 5 && Math.abs(pitch) < 5;

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
  const [detectedPose, setDetectedPose] = useState<CanonicalPose | null>(null);
  const [liveFit, setLiveFit] = useState<FitCheck | null>(null);
  const samplingRef = useRef(false); // serializes sampling captures
  const actionRef = useRef(false); // true while a real capture is in flight
  const isBodyMain = session === 'body' && !part;

  useEffect(() => {
    if (!live || !isSupabaseConfigured) return;
    if (!isBodyMain && !(part && ghostUri)) return; // face → VisionCameraCapture
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
        if (part && ghostUri) {
          // Custom track: live fit vs the part reference. Reuse the schedule's
          // sample cap as the cost ceiling; never "stabilizes".
          state = { ...state, samples: state.samples + 1, lastAt: Date.now() };
          const fit = await checkFit(pic.uri, ghostUri);
          if (!cancelled) setLiveFit(fit);
        } else {
          const res = await classifyPose(pic.uri);
          if (!res || cancelled) return;
          state = recordSample(state, res.pose, res.confidence, Date.now());
          if (state.stable === 'front_relaxed' || state.stable === 'side_relaxed') {
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
  }, [live, isBodyMain, part, ghostUri]);

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
    setDetectedPose(null);
    setLiveFit(null);
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
            setQuality(computeQuality({ tiltDeg: tiltNow, fit: r.fit }));
          });
        } else {
          // First baseline shot (no ghost): score on level alone.
          setQuality(computeQuality({ tiltDeg: tiltNow }));
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
    if (timer === 0) {
      void capture();
      return;
    }
    setCountdown(timer);
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
      // Detected pose (live sampling) wins over the manual angle chip; custom
      // parts are their own sub-track, not one of the four locked poses.
      const savedView = detectedPose === 'side_relaxed' ? 'side' : detectedPose === 'front_relaxed' ? 'front' : view;
      const newId = addPhoto({
        session,
        part,
        view: savedView,
        uri: persistentUri,
        takenAt: new Date().toISOString(),
        tilt: shotTilt,
        qualityScore: quality?.score,
        // Casual: leave the pose to background classification (undefined unless a
        // live sample already resolved one) so the shot lands in the reel for
        // triage. Guided: derive + lock to the comparability set.
        pose: casual ? detectedPose ?? undefined : part ? 'other' : detectedPose ?? poseFromCapture(session, view),
        isRequiredSet: casual ? false : !part,
      });
      savedIdRef.current = newId;
      onSaved?.(newId);
      return true;
    } finally {
      setBusy(false);
    }
  };

  /** Step-1 primary action: face saves and closes; body saves then measures. */
  const onContinue = async () => {
    const ok = await saveShot();
    if (!ok) return;
    if (collectMeasurements) setStep(2);
    else close();
  };

  /** Step-2 done: write any measurements to today's check-in, then close. */
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
    close();
  };

  const sessionLabel = casual
    ? t('photos.quickShot')
    : session === 'face'
      ? t('photos.sessionFace')
      : t('photos.sessionBody');

  // Ghost for the live view: prefer the reference of the pose being held
  // (detected live, else the manual angle chip); fall back to the chain ghost.
  const activePose: CanonicalPose = part ? 'other' : detectedPose ?? poseFromCapture(session, view);
  const liveGhostUri = ghostByPose?.[activePose] ?? ghostUri;

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
            <Pressable accessibilityRole="button" onPress={close}>
              <ThemedText type="mono" themeColor="textSecondary">
                {t('common.cancel')}
              </ThemedText>
            </Pressable>
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
        ) : shot ? (
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
              <View style={styles.measureRow}>
                <View style={styles.measureField}>
                  <LabeledInput
                    label={`${t('measurements.waist')} (${unitLabel})`}
                    placeholder={lastMeasurements?.waist !== undefined ? String(lastMeasurements.waist) : '—'}
                    keyboardType="decimal-pad"
                    value={waist}
                    onChangeText={setWaist}
                  />
                </View>
                <View style={styles.measureField}>
                  <LabeledInput
                    label={`${t('measurements.hips')} (${unitLabel})`}
                    placeholder={lastMeasurements?.hips !== undefined ? String(lastMeasurements.hips) : '—'}
                    keyboardType="decimal-pad"
                    value={hips}
                    onChangeText={setHips}
                  />
                </View>
              </View>
              <View style={styles.measureRow}>
                <View style={styles.measureField}>
                  <LabeledInput
                    label={`${t('measurements.neck')} (${unitLabel})`}
                    placeholder={lastMeasurements?.neck !== undefined ? String(lastMeasurements.neck) : '—'}
                    keyboardType="decimal-pad"
                    value={neck}
                    onChangeText={setNeck}
                  />
                </View>
                <View style={styles.measureField}>
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
                </View>
              </View>
              <SingleSelectChips
                options={(['chest', 'arms', 'thighs'] as const).map((k) => ({
                  value: k,
                  label: t(`measurements.${k}`),
                }))}
                value={extraKey}
                onChange={setExtraKey}
              />
              {extraKey && (
                <LabeledInput
                  label={`${t(`measurements.${extraKey}`)} (${unitLabel})`}
                  placeholder="—"
                  keyboardType="decimal-pad"
                  value={extraVal}
                  onChangeText={setExtraVal}
                />
              )}
            </ScrollView>
            {/* Fixed footer: the photo is already saved; measurements only. */}
            <SafeAreaView style={styles.reviewBar} edges={['bottom']}>
              <Pressable accessibilityRole="button" onPress={close}>
                <ThemedText type="label" style={styles.darkText}>
                  {t('photos.skipMeasurements')}
                </ThemedText>
              </Pressable>
              <View style={styles.saveBtn}>
                <PrimaryButton label={t('common.done')} onPress={finishMeasurements} />
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
              mirror={facing === 'front'}
              animateShutter={false}
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
              {/* Live-detected pose (sampled): the tag the shot will save with. */}
              {detectedPose ? (
                <ThemedText type="monoSm" style={styles.overlayDim}>
                  {t('photos.poseDetected', { pose: t(`photos.pose_${detectedPose}` as 'photos.pose_front_relaxed') })}
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
                {t('photos.pinchZoomHint')}
              </ThemedText>
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
