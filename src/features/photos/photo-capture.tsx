import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { Accelerometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LabeledInput, PrimaryButton, SingleSelectChips } from '@/components/form';
import { FlipCameraIcon } from '@/components/icons';
import { StatusPill } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { checkFit, type FitCheck } from '@/lib/ai';
import { bodyFatNavy } from '@/lib/body-composition';
import { copyPhotoToDocuments } from '@/lib/photos';
import { computeQuality, type PhotoQuality } from '@/lib/photo-quality';
import { useStore, type PhotoSession } from '@/lib/store';

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
  ghostUri,
  visible,
  onClose,
}: {
  session: PhotoSession;
  ghostUri?: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { addPhoto, upsertCheckin, profile } = useStore();
  const [permission, requestPermission] = useCameraPermissions();
  const camRef = useRef<CameraView>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [shotTilt, setShotTilt] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [ghostLevelIdx, setGhostLevelIdx] = useState(0);
  const [fitResult, setFitResult] = useState<FitCheck | null>(null);
  const [fitChecking, setFitChecking] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [view, setView] = useState<'front' | 'side'>('front');

  // Quality score + low-score retry modal (redesign §4A, owner 2026-07-06).
  const [quality, setQuality] = useState<PhotoQuality | null>(null);
  const [qualityAck, setQualityAck] = useState(false);

  // Measurement inputs (body session only, all optional)
  const [waist, setWaist] = useState('');
  const [neck, setNeck] = useState('');
  const [hips, setHips] = useState('');
  const [extraKey, setExtraKey] = useState<'chest' | 'arms' | 'thighs' | undefined>();
  const [extraVal, setExtraVal] = useState('');
  const isBody = session === 'body';
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
      })
    : null;

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

  /** Reset the captured shot back to the live camera (retake). */
  const resetShot = () => {
    setShot(null);
    setFitResult(null);
    setFitChecking(false);
    setQuality(null);
    setQualityAck(false);
  };

  const close = () => {
    resetShot();
    setShotTilt(undefined);
    setWaist('');
    setNeck('');
    setHips('');
    setExtraKey(undefined);
    setExtraVal('');
    setView('front');
    onClose();
  };

  const capture = async () => {
    if (!camRef.current || busy) return;
    setBusy(true);
    try {
      const pic = await camRef.current.takePictureAsync({ quality: 0.8 });
      if (pic?.uri) {
        const tiltNow = Math.round(tiltRef.current);
        setShotTilt(tiltNow);
        setShot(pic.uri);
        setQualityAck(false);
        if (ghostUri) {
          // Score once the fit check resolves (framing feeds the quality score).
          setFitChecking(true);
          setFitResult(null);
          setQuality(null);
          checkFit(pic.uri, ghostUri).then((r) => {
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
    }
  };

  const save = async () => {
    if (!shot || busy) return;
    setBusy(true);
    try {
      const now = new Date();
      const persistentUri = await copyPhotoToDocuments(shot);
      addPhoto({ session, view, uri: persistentUri, takenAt: now.toISOString(), tilt: shotTilt });
      if (isBody) {
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
          upsertCheckin(now.toISOString().slice(0, 10), patch as Parameters<typeof upsertCheckin>[1]);
        }
      }
      close();
    } finally {
      setBusy(false);
    }
  };

  const sessionLabel = session === 'face' ? t('photos.sessionFace') : t('photos.sessionBody');

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
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
        ) : shot ? (
          // ── Review the captured shot ──
          <View style={styles.fill}>
          <ScrollView style={styles.fill} contentContainerStyle={styles.reviewContent} bounces={false} showsVerticalScrollIndicator={false}>
            <Image source={{ uri: shot }} style={styles.reviewPhoto} contentFit="cover" />
            {quality ? (
              <View style={styles.qualityRow}>
                <StatusPill
                  label={`${t('photos.qualityLabel')} ${quality.score}`}
                  tone={quality.score >= 80 ? 'good' : quality.score >= 60 ? 'watch' : 'bad'}
                />
              </View>
            ) : null}
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
            {isBody && (
              <View style={styles.measurePanel}>
                <ThemedText type="monoSm" themeColor="textSecondary">
                  {t('measurements.optionalHint')}
                </ThemedText>
                <View style={styles.measureRow}>
                  <View style={styles.measureField}>
                    <LabeledInput
                      label={`${t('measurements.waist')} (${unitLabel})`}
                      placeholder="—"
                      keyboardType="decimal-pad"
                      value={waist}
                      onChangeText={setWaist}
                    />
                  </View>
                  <View style={styles.measureField}>
                    <LabeledInput
                      label={`${t('measurements.hips')} (${unitLabel})`}
                      placeholder="—"
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
                      placeholder="—"
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
              </View>
            )}
            <SafeAreaView style={styles.reviewBar} edges={['bottom']}>
              <Pressable accessibilityRole="button" onPress={resetShot}>
                <ThemedText type="label" style={styles.darkText}>
                  {t('photos.retake')}
                </ThemedText>
              </Pressable>
              <View style={styles.saveBtn}>
                <PrimaryButton label={t('photos.save')} onPress={save} />
              </View>
            </SafeAreaView>
          </ScrollView>
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
        ) : (
          // ── Live camera + ghost overlay ──
          <View style={styles.fill}>
            <CameraView ref={camRef} style={styles.fill} facing={facing} mirror={facing === 'front'} />
            {ghostUri ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('photos.ghostLevel', { pct: Math.round(GHOST_LEVELS[ghostLevelIdx] * 100) })}
                style={StyleSheet.absoluteFill}
                onPress={() => setGhostLevelIdx((i) => (i + 1) % GHOST_LEVELS.length)}>
                <Image
                  source={{ uri: ghostUri }}
                  style={[StyleSheet.absoluteFill, { opacity: GHOST_LEVELS[ghostLevelIdx] }]}
                  contentFit="cover"
                />
              </Pressable>
            ) : null}
            <SafeAreaView style={styles.topBar} edges={['top']} pointerEvents="none">
              <ThemedText type="label" style={styles.overlayText}>
                {sessionLabel}
              </ThemedText>
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
            </SafeAreaView>
            {/* Front / side capture angle (spec 04 §4A). */}
            <View style={styles.viewToggle} pointerEvents="box-none">
              {(['front', 'side'] as const).map((v) => (
                <Pressable
                  key={v}
                  accessibilityRole="button"
                  accessibilityState={{ selected: view === v }}
                  onPress={() => setView(v)}
                  style={[styles.viewChip, view === v && styles.viewChipActive]}>
                  <ThemedText type="monoSm" style={view === v ? styles.viewChipTextActive : styles.overlayDim}>
                    {t(v === 'front' ? 'photos.viewFront' : 'photos.viewSide')}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
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
                disabled={busy}
                onPress={capture}
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
  // Review screen
  reviewContent: { flexGrow: 1 },
  reviewPhoto: { width: '100%', aspectRatio: 3 / 4 },
  measurePanel: { padding: Spacing.four, gap: Spacing.three, backgroundColor: '#F0EFEC' },
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
  // Quality readout on the review shot.
  qualityRow: { flexDirection: 'row', paddingHorizontal: Spacing.four, paddingTop: Spacing.three },
  // Hedged body-fat estimate box (on the light measurement panel).
  bfBox: { gap: 2 },
  bfLabel: { color: '#5A5752' },
  bfValue: { color: '#1A1A18' },
  bfHint: { color: '#5A5752' },
  // Front / side capture-angle toggle.
  viewToggle: { position: 'absolute', top: 72, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: Spacing.two },
  viewChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(240,239,236,0.4)',
  },
  viewChipActive: { backgroundColor: 'rgba(240,239,236,0.9)', borderColor: 'transparent' },
  viewChipTextActive: { color: '#1A1A18' },
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
