/**
 * VisionCameraCapture — spike for M4 Layer-1 adaptive capture (spec 04).
 *
 * Uses react-native-vision-camera v5 + react-native-vision-camera-face-detector
 * to add:
 *  - Real-time face bounding-box detection (face session only)
 *  - Distance hint: compares current face box ratio vs baseline boxRatio
 *  - Auto-capture: fires when face is detected, roughly level, and in range
 *
 * This component is a drop-in replacement for PhotoCapture. Swap it in once
 * the spike is verified on a physical device (needs prebuild --clean).
 *
 * Body session falls back to the manual-shutter path (no body-pose detection
 * yet — pose estimation is a separate dep spike).
 *
 * ⚠️ DEVICE TEST REQUIRED before swapping into production:
 *   npx expo prebuild --clean && npx expo run:ios --device
 */
import { Image } from 'expo-image';
import { Accelerometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';
import { useFaceDetectorOutput } from 'react-native-vision-camera-face-detector';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/form';
import { FlipCameraIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { copyPhotoToDocuments } from '@/lib/photos';
import { useStore, type PhotoEntry, type PhotoSession } from '@/lib/store';

const GHOST_OPACITY = 0.35;

// Distance hint thresholds: if current boxRatio differs from baseline by more
// than these fractions, show a hint. Tuned conservatively — tighten after real data.
const CLOSER_THRESHOLD = 0.20; // 20% smaller than baseline → step closer
const FARTHER_THRESHOLD = 0.20; // 20% larger → step back

type DistanceHint = 'ok' | 'closer' | 'farther' | null;

function faceBoxRatio(
  faceWidth: number,
  faceHeight: number,
  viewWidth: number,
  viewHeight: number,
): number {
  if (!viewWidth || !viewHeight) return 0;
  return (faceWidth * faceHeight) / (viewWidth * viewHeight);
}

function distanceHint(currentRatio: number, baselineRatio: number | undefined): DistanceHint {
  if (!baselineRatio) return null; // no baseline yet — can't compare
  const diff = (currentRatio - baselineRatio) / baselineRatio;
  if (diff < -CLOSER_THRESHOLD) return 'closer';
  if (diff > FARTHER_THRESHOLD) return 'farther';
  return 'ok';
}

export function VisionCameraCapture({
  session,
  ghostUri,
  baseline,
  visible,
  onClose,
}: {
  session: PhotoSession;
  ghostUri?: string;
  baseline?: PhotoEntry; // for distance comparison
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { addPhoto } = useStore();

  // ── Camera setup ──────────────────────────────────────────────────────────
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const device = useCameraDevice(facing);
  const { hasPermission, requestPermission } = useCameraPermission();
  const photoOutput = usePhotoOutput({ quality: 0.8 });

  const [viewDims, setViewDims] = useState({ width: 0, height: 0 });
  const [shot, setShot] = useState<string | null>(null);
  const [shotTilt, setShotTilt] = useState<number | undefined>(undefined);
  const [shotBoxRatio, setShotBoxRatio] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  // ── Tilt / level (same logic as PhotoCapture) ─────────────────────────────
  const [roll, setRoll] = useState(0);
  const [pitch, setPitch] = useState(0);
  const tiltRef = useRef(0);
  const live = visible && hasPermission && !shot;

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

  // ── Face detection (face session only) ────────────────────────────────────
  const currentRatioRef = useRef<number>(0);
  const [hint, setHint] = useState<DistanceHint>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const autoFired = useRef(false);

  const faceOutput = useFaceDetectorOutput({
    onError: () => { /* face detection errors are non-fatal — fall through to manual */ },
    onFacesDetected: (faces) => {
      if (session !== 'face' || shot) return;
      if (faces.length === 0) {
        setFaceDetected(false);
        return;
      }
      const face = faces[0];
      const ratio = faceBoxRatio(
        face.bounds.width,
        face.bounds.height,
        viewDims.width,
        viewDims.height,
      );
      currentRatioRef.current = ratio;
      setFaceDetected(true);
      setHint(distanceHint(ratio, baseline?.boxRatio));

      // Auto-capture: level + face in range + not already fired this session
      if (!autoFired.current && level && distanceHint(ratio, baseline?.boxRatio) === 'ok') {
        autoFired.current = true;
        capture(ratio);
      }
    },
  });

  // ── Capture ───────────────────────────────────────────────────────────────
  const capture = async (boxRatioOverride?: number) => {
    if (busy) return;
    setBusy(true);
    try {
      const photo = await photoOutput.capturePhoto({}, {});
      const path = await photo.saveToTemporaryFileAsync();
      photo.dispose();
      setShotTilt(Math.round(tiltRef.current));
      setShotBoxRatio(boxRatioOverride ?? (currentRatioRef.current || undefined));
      setShot(`file://${path}`);
    } catch {
      autoFired.current = false; // allow retry
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!shot || busy) return;
    setBusy(true);
    try {
      const persistentUri = await copyPhotoToDocuments(shot);
      addPhoto({
        session,
        uri: persistentUri,
        takenAt: new Date().toISOString(),
        tilt: shotTilt,
        boxRatio: shotBoxRatio,
      });
      close();
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setShot(null);
    setShotTilt(undefined);
    setShotBoxRatio(undefined);
    autoFired.current = false;
    onClose();
  };

  const sessionLabel = session === 'face' ? t('photos.sessionFace') : t('photos.sessionBody');
  const outputs = session === 'face' ? [photoOutput, faceOutput] : [photoOutput];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={styles.fill}>
        {!hasPermission ? (
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
          // ── Review ──
          <View style={styles.fill}>
            <Image source={{ uri: shot }} style={styles.fill} contentFit="cover" />
            <SafeAreaView style={styles.bottomBar} edges={['bottom']}>
              <Pressable accessibilityRole="button" onPress={() => { setShot(null); autoFired.current = false; }}>
                <ThemedText type="label" style={styles.overlayText}>
                  {t('photos.retake')}
                </ThemedText>
              </Pressable>
              <View style={styles.saveBtn}>
                <PrimaryButton label={t('photos.save')} onPress={save} />
              </View>
            </SafeAreaView>
          </View>
        ) : device ? (
          // ── Live camera ──
          <View
            style={styles.fill}
            onLayout={(e) =>
              setViewDims({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
            }>
            <Camera
              device={device}
              isActive={live}
              outputs={outputs}
              style={StyleSheet.absoluteFill}
              mirrorMode="on"
            />

            {/* Ghost overlay */}
            {ghostUri ? (
              <Image
                source={{ uri: ghostUri }}
                style={[StyleSheet.absoluteFill, { opacity: GHOST_OPACITY }]}
                contentFit="cover"
              />
            ) : null}

            {/* Level indicator */}
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

            {/* Distance hint (face session only) */}
            {session === 'face' && hint && hint !== 'ok' && (
              <View style={styles.distanceHint} pointerEvents="none">
                <ThemedText type="monoSm" style={styles.overlayText}>
                  {hint === 'closer' ? t('photos.stepCloser') : t('photos.stepBack')}
                </ThemedText>
              </View>
            )}
            {/* "No face detected" nudge */}
            {session === 'face' && !faceDetected && viewDims.width > 0 && (
              <View style={styles.distanceHint} pointerEvents="none">
                <ThemedText type="monoSm" style={styles.overlayDim}>
                  {t('photos.noFace')}
                </ThemedText>
              </View>
            )}

            <SafeAreaView style={styles.topBar} edges={['top']} pointerEvents="none">
              <ThemedText type="label" style={styles.overlayText}>
                {sessionLabel}
              </ThemedText>
              {ghostUri ? (
                <ThemedText type="monoSm" style={styles.overlayDim}>
                  {t('photos.ghostHint')}
                </ThemedText>
              ) : null}
            </SafeAreaView>

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
                onPress={() => capture()}
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
        ) : (
          // ── No device (simulator / permission not yet granted) ──
          <SafeAreaView style={styles.center}>
            <ThemedText type="mono" themeColor="textMuted">
              {t('photos.noCamera')}
            </ThemedText>
            <Pressable accessibilityRole="button" onPress={close}>
              <ThemedText type="mono" themeColor="textSecondary">
                {t('common.cancel')}
              </ThemedText>
            </Pressable>
          </SafeAreaView>
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
  levelWrap: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  levelRef: {
    position: 'absolute', width: 170, height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(240,239,236,0.3)',
  },
  levelBar: { width: 120, height: 2, borderRadius: 1 },
  distanceHint: { position: 'absolute', top: '40%', left: 0, right: 0, alignItems: 'center' },
});
