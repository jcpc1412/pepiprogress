import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { Accelerometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LabeledInput, PrimaryButton, SingleSelectChips } from '@/components/form';
import { FlipCameraIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { copyPhotoToDocuments } from '@/lib/photos';
import { useStore, type PhotoSession } from '@/lib/store';

/** Faintness of the alignment guide (spec 04 — ghost overlay). */
const GHOST_OPACITY = 0.35;

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
  const [facing, setFacing] = useState<'front' | 'back'>('front');

  // Measurement inputs (body session only, all optional)
  const [waist, setWaist] = useState('');
  const [hips, setHips] = useState('');
  const [extraKey, setExtraKey] = useState<'chest' | 'arms' | 'thighs' | undefined>();
  const [extraVal, setExtraVal] = useState('');
  const isBody = session === 'body';
  const unitLabel = profile?.units === 'imperial' ? t('measurements.unitIn') : t('measurements.unitCm');

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

  const close = () => {
    setShot(null);
    setShotTilt(undefined);
    setWaist('');
    setHips('');
    setExtraKey(undefined);
    setExtraVal('');
    onClose();
  };

  const capture = async () => {
    if (!camRef.current || busy) return;
    setBusy(true);
    try {
      const pic = await camRef.current.takePictureAsync({ quality: 0.8 });
      if (pic?.uri) {
        setShotTilt(Math.round(tiltRef.current));
        setShot(pic.uri);
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
      addPhoto({ session, uri: persistentUri, takenAt: now.toISOString(), tilt: shotTilt });
      if (isBody) {
        const w = parseFloat(waist);
        const h = parseFloat(hips);
        const ev = parseFloat(extraVal);
        const patch: Record<string, unknown> = {};
        if (Number.isFinite(w)) patch.waist = w;
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
          <ScrollView style={styles.fill} contentContainerStyle={styles.reviewContent} bounces={false}>
            <Image source={{ uri: shot }} style={styles.reviewPhoto} contentFit="cover" />
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
              <Pressable accessibilityRole="button" onPress={() => setShot(null)}>
                <ThemedText type="label" style={styles.darkText}>
                  {t('photos.retake')}
                </ThemedText>
              </Pressable>
              <View style={styles.saveBtn}>
                <PrimaryButton label={t('photos.save')} onPress={save} />
              </View>
            </SafeAreaView>
          </ScrollView>
        ) : (
          // ── Live camera + ghost overlay ──
          <View style={styles.fill}>
            <CameraView ref={camRef} style={styles.fill} facing={facing} mirror={facing === 'front'} />
            {ghostUri ? (
              <Image
                source={{ uri: ghostUri }}
                style={[StyleSheet.absoluteFill, { opacity: GHOST_OPACITY }]}
                contentFit="cover"
              />
            ) : null}
            <SafeAreaView style={styles.topBar} edges={['top']} pointerEvents="none">
              <ThemedText type="label" style={styles.overlayText}>
                {sessionLabel}
              </ThemedText>
              {ghostUri ? (
                <ThemedText type="monoSm" style={styles.overlayDim}>
                  {t('photos.ghostHint')}
                </ThemedText>
              ) : (
                <ThemedText type="monoSm" style={styles.overlayDim}>
                  {t('photos.clothingHint')}
                </ThemedText>
              )}
            </SafeAreaView>
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
});
