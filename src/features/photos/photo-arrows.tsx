import { Image } from 'expo-image';
import { Fragment, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { layoutArrowMarkers, type ArrowFavour } from '@/lib/photo-arrows';
import type { PhotoObservation } from '@/lib/photo-observations';

/**
 * The on-photo arrow overlay (2a.4): "materialize the AI's vision." Draws the
 * region markers from an analysis (2a.3) as ▲/▼/— glyphs at the end of straight
 * leader lines, each tappable for a tooltip (region, note, magnitude, confidence).
 * The photo itself stays clean — just lines + markers.
 *
 * Direction × colour are two independent axes: the glyph is grew/shrank, the
 * colour is whether that is good (green/red/grey/yellow) — the same vocabulary as
 * the verdict's TrendMarker. Comparability gating happens in the caller: a
 * non-comparable shot must draw NO arrows.
 */
export function PhotoWithArrows({
  uri,
  observations,
}: {
  uri?: string;
  observations: PhotoObservation[];
}) {
  const theme = useTheme();
  // Match the frame to the photo's own aspect so normalized coords map 1:1 (a
  // mismatched frame + cover-crop would shift every marker off its region).
  const [aspect, setAspect] = useState(3 / 4);
  return (
    <View style={[styles.frame, { aspectRatio: aspect, borderColor: theme.border, backgroundColor: theme.surfaceSunken }]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          onLoad={(e) => {
            const w = e.source?.width;
            const h = e.source?.height;
            if (w && h) setAspect(w / h);
          }}
        />
      ) : null}
      <ArrowLayer observations={observations} />
    </View>
  );
}

function ArrowLayer({ observations }: { observations: PhotoObservation[] }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [active, setActive] = useState<string | null>(null);

  const markers = useMemo(() => layoutArrowMarkers(observations, size.w, size.h), [observations, size]);

  const favourColor: Record<ArrowFavour, string> = {
    good: theme.signalGood,
    bad: theme.signalBad,
    watch: theme.signalWatch,
    none: theme.textMuted,
  };

  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  const directionWord = (d: PhotoObservation['direction']) =>
    t(`photos.dir_${d}` as 'photos.dir_gain');

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="box-none">
      {/* Tap-away closes an open tooltip. */}
      {active !== null ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel={t('common.close')}
          onPress={() => setActive(null)}
        />
      ) : null}

      {markers.map((m) => {
        const isOpen = active === m.key;
        // Tooltip opens below the marker in the top half, above in the bottom half.
        const below = m.my < size.h / 2;
        const tipLeft = Math.min(Math.max(m.mx - 96, Spacing.one), Math.max(size.w - 192 - Spacing.one, Spacing.one));
        return (
          <Fragment key={m.key}>
            {/* Leader line: a dark halo under a light line so it reads on any
                background (the pragmatic "contrast-adaptive" line). */}
            <View
              pointerEvents="none"
              style={[
                styles.line,
                styles.lineDark,
                { left: m.ax, top: m.ay - 1.5, width: m.length, transform: [{ rotate: `${m.angleDeg}deg` }] },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.line,
                styles.lineLight,
                { left: m.ax, top: m.ay - 0.75, width: m.length, transform: [{ rotate: `${m.angleDeg}deg` }] },
              ]}
            />

            {/* Marker glyph. A11y announces region + direction + note, never the
                raw glyph name. */}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              accessibilityLabel={t('photos.arrowA11y', {
                region: m.obs.region,
                direction: directionWord(m.obs.direction),
                note: m.obs.note,
              })}
              hitSlop={10}
              onPress={() => setActive((a) => (a === m.key ? null : m.key))}
              style={[styles.marker, { left: m.mx - 15, top: m.my - 15 }]}>
              <ThemedText style={[styles.glyph, { color: favourColor[m.favour] }]}>{m.glyph}</ThemedText>
            </Pressable>

            {isOpen ? (
              <View
                style={[
                  styles.tooltip,
                  { left: tipLeft, backgroundColor: theme.surfaceRaised, borderColor: theme.border },
                  below ? { top: m.my + 18 } : { bottom: size.h - m.my + 18 },
                ]}>
                <View style={styles.tooltipHead}>
                  <ThemedText type="monoSm" themeColor="text" style={styles.tooltipRegion}>
                    {m.obs.region}
                  </ThemedText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('common.close')}
                    hitSlop={10}
                    onPress={() => setActive(null)}>
                    <ThemedText type="monoSm" themeColor="textMuted">
                      {'✕'}
                    </ThemedText>
                  </Pressable>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {m.obs.note}
                </ThemedText>
                <View style={styles.tooltipMetaRow}>
                  {m.obs.pct !== undefined ? (
                    <ThemedText type="monoSm" style={{ color: favourColor[m.favour] }}>
                      {t('photos.arrowMagnitude', { pct: Math.round(m.obs.pct) })}
                    </ThemedText>
                  ) : null}
                  <ThemedText type="monoSm" themeColor="textMuted">
                    {t('photos.arrowConfidence', { pct: Math.round(m.obs.confidence * 100) })}
                  </ThemedText>
                </View>
              </View>
            ) : null}
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    borderRadius: Radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  line: { position: 'absolute', height: 1.5, transformOrigin: '0% 50%' },
  lineDark: { height: 3, backgroundColor: 'rgba(0,0,0,0.45)' },
  lineLight: { backgroundColor: 'rgba(240,239,236,0.92)' },
  marker: {
    position: 'absolute',
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    fontSize: 17,
    lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
  tooltip: {
    position: 'absolute',
    width: 192,
    borderRadius: Radii.chamfer,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  tooltipHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  tooltipRegion: { flex: 1 },
  tooltipMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
});
