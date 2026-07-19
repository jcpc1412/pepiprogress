import { Image } from 'expo-image';
import { shareAsync } from 'expo-sharing';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';

import { PrimaryButton, TextButton } from '@/components/form';
import { EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { buildShareCard, type ShareCardInput } from '@/lib/share-card';

/**
 * Share sheet (W6-27, beta-notes §1.4). Two surfaces, one flow:
 *  - `card`: a branded consistency card built from {@link buildShareCard}. Carries
 *    no compound, dose, or marker data by construction (see share-card.ts).
 *  - `photo`: an exported progress photo, optionally watermarked.
 *
 * The node is rendered on-screen (inside the modal, as the preview the user
 * confirms) and rasterized with react-native-view-shot, so what ships is exactly
 * what was shown. Nothing leaves the device until the user taps share, and the
 * OS share sheet owns the destination.
 */
export function ShareSheet({
  visible,
  onClose,
  cardInput,
  photoUri,
  photoWatermark,
}: {
  visible: boolean;
  onClose: () => void;
  /** Provide to share a stat card. */
  cardInput?: ShareCardInput;
  /** Provide to share a progress photo instead. */
  photoUri?: string;
  photoWatermark?: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const shotRef = useRef<ViewShotRef>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const card = cardInput ? buildShareCard(cardInput) : null;
  const isPhoto = !!photoUri;

  const doShare = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const uri = await shotRef.current?.capture?.();
      if (!uri) throw new Error('capture failed');
      await shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png' });
      onClose();
    } catch {
      // Capture or share can fail (permissions, cancelled sheet). Never crash the
      // tab over a share; surface a retry instead.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View
          style={[styles.sheet, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}
          onStartShouldSetResponder={() => true}>
          <EngravedLabel>{t(isPhoto ? 'share.titlePhoto' : 'share.titleCard')}</EngravedLabel>

          {/* The captured node: this exact preview is what gets rasterized. */}
          <ViewShot ref={shotRef} style={styles.shot}>
            {isPhoto ? (
              <View style={styles.photoWrap}>
                <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" />
                {photoWatermark ? (
                  <View style={styles.photoMark} pointerEvents="none">
                    <ThemedText type="monoSm" style={styles.markText}>
                      {t('share.wordmark')}
                    </ThemedText>
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={[styles.card, { backgroundColor: theme.surfaceSunken, borderColor: theme.border }]}>
                <ThemedText type="monoSm" themeColor="textMuted" style={styles.cardKicker}>
                  {t('share.cardKicker')}
                </ThemedText>
                <View style={styles.statGrid}>
                  {card?.stats.map((s) => (
                    <View key={s.labelKey} style={styles.statCell}>
                      <ThemedText type="metricSm" themeColor="text">
                        {s.value}
                      </ThemedText>
                      <ThemedText type="monoSm" themeColor="textMuted">
                        {t(s.labelKey)}
                      </ThemedText>
                    </View>
                  ))}
                </View>
                {card?.watermark ? (
                  <ThemedText type="monoSm" themeColor="textMuted" style={styles.cardMark}>
                    {t('share.wordmark')}
                  </ThemedText>
                ) : null}
              </View>
            )}
          </ViewShot>

          {/* Nothing worth sharing yet: an empty card would be a bad first post. */}
          {!isPhoto && card?.stats.length === 0 ? (
            <ThemedText type="monoSm" themeColor="textMuted">
              {t('share.nothingYet')}
            </ThemedText>
          ) : null}

          {failed ? (
            <ThemedText type="monoSm" themeColor="signalBad">
              {t('share.failed')}
            </ThemedText>
          ) : null}

          <PrimaryButton
            label={t('share.action')}
            onPress={() => void doShare()}
            disabled={busy || (!isPhoto && card?.stats.length === 0)}
          />
          <TextButton label={t('common.cancel')} onPress={onClose} />
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  sheet: {
    width: 320,
    borderRadius: Radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  shot: { alignSelf: 'stretch' },
  card: {
    borderRadius: Radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  cardKicker: { letterSpacing: 2 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.four },
  statCell: { minWidth: 96, gap: Spacing.half },
  cardMark: { alignSelf: 'flex-end', letterSpacing: 2 },
  photoWrap: { width: '100%', aspectRatio: 3 / 4, borderRadius: Radii.panel, overflow: 'hidden' },
  photo: { flex: 1 },
  photoMark: { position: 'absolute', bottom: Spacing.two, right: Spacing.two },
  markText: { color: 'rgba(240,239,236,0.85)', letterSpacing: 2 },
});
