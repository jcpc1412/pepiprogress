import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, PanResponder, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import type { MeasureKey } from '@/lib/photo-arrows';

/**
 * Measurement guide-line overlay (2a.7, owner mockup 2026-07-22).
 *
 * A horizontal guide line at each measurement spot on the just-captured photo,
 * with a tappable value chip on the line to enter or edit the number — replacing
 * the plain text fields. The point is CONSISTENCY, not measurement: a 2D photo
 * cannot measure circumference, so the line is a positional guide only. It lets
 * the user wrap the tape at the same anatomical spot every session, so the trend
 * is signal rather than measurement noise.
 *
 * Positions are stored per user (seeded from the default anatomical map) and
 * dragged via the grip on the right. Landmark-anchored re-projection, so the line
 * lands on the same anatomical spot regardless of framing, rides the 2c tier-2
 * keypoint work.
 */
export type Guide = {
  key: MeasureKey;
  label: string;
  /** Normalized 0..1 down the photo. */
  y: number;
  /** Current value as entered, if any. */
  value?: string;
};

const MIN_Y = 0.04;
const MAX_Y = 0.96;

export function MeasurementGuides({
  uri,
  guides,
  unitLabel,
  editingKey,
  onMove,
  onEditSpot,
}: {
  uri?: string;
  guides: Guide[];
  unitLabel: string;
  editingKey?: MeasureKey;
  onMove: (key: MeasureKey, y: number) => void;
  onEditSpot: (key: MeasureKey) => void;
}) {
  const [aspect, setAspect] = useState(3 / 4);
  const [h, setH] = useState(0);

  return (
    <View style={[styles.frame, { aspectRatio: aspect }]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          onLoad={(e) => {
            const w = e.source?.width;
            const ih = e.source?.height;
            if (w && ih) setAspect(w / ih);
          }}
        />
      ) : null}
      <View
        style={StyleSheet.absoluteFill}
        onLayout={(e: LayoutChangeEvent) => setH(e.nativeEvent.layout.height)}
        pointerEvents="box-none">
        {guides.map((g) => (
          <GuideLine
            key={g.key}
            guide={g}
            frameH={h}
            unitLabel={unitLabel}
            active={editingKey === g.key}
            onMove={onMove}
            onEditSpot={onEditSpot}
          />
        ))}
      </View>
    </View>
  );
}

function GuideLine({
  guide,
  frameH,
  unitLabel,
  active,
  onMove,
  onEditSpot,
}: {
  guide: Guide;
  frameH: number;
  unitLabel: string;
  active: boolean;
  onMove: (key: MeasureKey, y: number) => void;
  onEditSpot: (key: MeasureKey) => void;
}) {
  // All mutable drag state in one ref so the PanResponder (created once) always
  // reads current values. Written in an effect, never during render.
  const gs = useRef({ h: frameH, y: guide.y, startY: guide.y, onMove });
  useEffect(() => {
    gs.current.h = frameH;
    gs.current.y = guide.y;
    gs.current.onMove = onMove;
  });

  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        gs.current.startY = gs.current.y;
      },
      onPanResponderMove: (_, { dy }) => {
        if (!gs.current.h) return;
        const next = Math.max(MIN_Y, Math.min(MAX_Y, gs.current.startY + dy / gs.current.h));
        gs.current.onMove(guide.key, next);
      },
    }),
  );

  const top = guide.y * frameH;

  return (
    <View style={[styles.row, { top }]} pointerEvents="box-none">
      {/* The guide line: a dark halo under a light line so it reads on any
          background (the same contrast treatment as the arrow leader lines). */}
      <View style={[styles.line, styles.lineDark]} pointerEvents="none" />
      <View style={[styles.line, styles.lineLight]} pointerEvents="none" />

      {/* Value chip — tap to enter or edit the number. */}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`${guide.label}${guide.value ? ` ${guide.value} ${unitLabel}` : ''}`}
        onPress={() => onEditSpot(guide.key)}
        hitSlop={6}
        style={[styles.chip, active && styles.chipActive]}>
        <ThemedText type="monoSm" style={active ? styles.chipLabelActive : styles.chipLabel}>
          {guide.label}
        </ThemedText>
        <ThemedText type="monoSm" style={active ? styles.chipValueActive : styles.chipValue}>
          {guide.value ? `${guide.value} ${unitLabel}` : '—'}
        </ThemedText>
      </Pressable>

      {/* Drag grip — repositions the spot; the position persists per user. */}
      <View style={styles.grip} {...pan.panHandlers}>
        <View style={styles.gripBar} />
        <View style={styles.gripBar} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', borderRadius: Radii.panel, overflow: 'hidden', backgroundColor: '#111110' },
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 34,
    marginTop: -17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.two,
  },
  line: { position: 'absolute', left: 0, right: 0, top: 16 },
  lineDark: { height: 3, backgroundColor: 'rgba(0,0,0,0.45)' },
  lineLight: { height: 1.5, top: 16.75, backgroundColor: 'rgba(240,239,236,0.92)' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(240,239,236,0.45)',
    backgroundColor: 'rgba(17,17,16,0.72)',
  },
  chipActive: { backgroundColor: 'rgba(240,239,236,0.94)', borderColor: '#F0EFEC' },
  chipLabel: { color: 'rgba(240,239,236,0.75)' },
  chipValue: { color: '#F0EFEC' },
  chipLabelActive: { color: '#4A4741' },
  chipValueActive: { color: '#131210' },
  grip: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  gripBar: {
    width: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(240,239,236,0.85)',
  },
});
