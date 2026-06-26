import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import { Radii } from '@/constants/theme';

/**
 * Chamfered (octagonal) surface — the core "CyberLife instrument" treatment.
 * RN has no clip-path, so we draw the octagon as an SVG polygon behind the
 * content (fill + 1px hairline border). The corner cut `chamfer` matches the
 * prototype scale (pills 4, chips/buttons 6, cards 8, hero 10).
 *
 * Children render on top, padded by the caller. Until first layout we fall back
 * to a tight radius so there's no ugly first frame.
 */
export function ChamferBox({
  chamfer = Radii.panel,
  fill,
  borderColor,
  borderWidth = StyleSheet.hairlineWidth,
  elevation,
  style,
  children,
}: {
  chamfer?: number;
  fill: string;
  borderColor?: string;
  borderWidth?: number;
  /** iOS shadow + Android elevation for raised cards. */
  elevation?: { color: string; opacity: number; radius: number; offsetY?: number };
  style?: ViewStyle;
  children?: ReactNode;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || size.w !== width || size.h !== height) setSize({ w: width, h: height });
  };

  const c = chamfer;
  const points = size
    ? `${c},0 ${size.w - c},0 ${size.w},${c} ${size.w},${size.h - c} ${size.w - c},${size.h} ${c},${size.h} 0,${size.h - c} 0,${c}`
    : '';

  const shadow: ViewStyle = elevation
    ? {
        shadowColor: elevation.color,
        shadowOpacity: elevation.opacity,
        shadowRadius: elevation.radius,
        shadowOffset: { width: 0, height: elevation.offsetY ?? 2 },
        elevation: Math.round(elevation.radius / 2),
      }
    : {};

  return (
    <View onLayout={onLayout} style={[{ borderRadius: 2 }, shadow, style]}>
      {size && (
        <Svg style={StyleSheet.absoluteFill} width={size.w} height={size.h}>
          <Polygon
            points={points}
            fill={fill}
            stroke={borderColor ?? 'transparent'}
            strokeWidth={borderColor ? borderWidth : 0}
          />
        </Svg>
      )}
      {children}
    </View>
  );
}
