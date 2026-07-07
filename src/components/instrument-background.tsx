/**
 * Breathing molecular-lattice background (redesign §2.3). A faint, desaturated
 * hex-node mesh tiled behind all screen content, pulsing slowly so the app feels
 * alive without ever drawing attention. Mounted once at the root so it is
 * continuous across tabs.
 *
 * Fidelity / a11y:
 *  - Drawn with react-native-svg <Pattern> so it tiles cheaply at any size.
 *  - Breathing = a slow opacity + scale pulse via reanimated. When the OS
 *    reduce-motion flag is on, it renders static (no pulse) at the mid opacity.
 *  - `pointerEvents="none"` + absolute fill: it never intercepts touches.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, Pattern, Rect } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

const TILE = 64; // px per lattice cell
const NODE_R = 1.4;
const PULSE_MS = 11000; // one full breath
const OPACITY_LOW = 0.05;
const OPACITY_HIGH = 0.11;

/** Flat-top hexagon points centred in a TILE box, as an SVG polyline string. */
function hexPoints(): { x: number; y: number }[] {
  const cx = TILE / 2;
  const cy = TILE / 2;
  const r = TILE / 2.4;
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}

export function InstrumentBackground() {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(false);
  const breath = useSharedValue(0);
  const started = useRef(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => mounted && setReduceMotion(v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduceMotion(v));
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      breath.value = 0.5; // hold at mid — static texture
      return;
    }
    if (started.current) return;
    started.current = true;
    breath.value = withRepeat(
      withTiming(1, { duration: PULSE_MS, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [reduceMotion, breath]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: OPACITY_LOW + (OPACITY_HIGH - OPACITY_LOW) * breath.value,
    transform: [{ scale: 1 + 0.03 * breath.value }],
  }));

  const hex = useMemo(() => hexPoints(), []);
  const edges = useMemo(
    () => hex.map((p, i) => ({ from: p, to: hex[(i + 1) % hex.length] })),
    [hex],
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
        <Svg width={width} height={height}>
          <Defs>
            <Pattern id="lattice" patternUnits="userSpaceOnUse" width={TILE} height={TILE}>
              {edges.map((e, i) => (
                <Line
                  key={i}
                  x1={e.from.x}
                  y1={e.from.y}
                  x2={e.to.x}
                  y2={e.to.y}
                  stroke={theme.lattice}
                  strokeWidth={0.75}
                />
              ))}
              {hex.map((p, i) => (
                <Circle key={i} cx={p.x} cy={p.y} r={NODE_R} fill={theme.lattice} />
              ))}
            </Pattern>
          </Defs>
          <Rect x={0} y={0} width={width} height={height} fill="url(#lattice)" />
        </Svg>
      </Animated.View>
    </View>
  );
}
