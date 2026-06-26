/**
 * Minimal line-icon set drawn on react-native-svg, themed via the active palette.
 * Kept monochrome + 1.5px stroke to match the instrument aesthetic.
 */

import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

import type { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IconProps = { size?: number; color?: ThemeColor };

function useStroke(color: ThemeColor = 'text') {
  return useTheme()[color];
}

export function GearIcon({ size = 22, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3} stroke={stroke} strokeWidth={1.5} />
      <Path
        d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function BackIcon({ size = 24, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline
        points="15 18 9 12 15 6"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CameraIcon({ size = 22, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2l1.2-1.8a1 1 0 0 1 .83-.45h6.94a1 1 0 0 1 .83.45L17.5 7h2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12.5} r={3.2} stroke={stroke} strokeWidth={1.5} />
    </Svg>
  );
}

export function SearchIcon({ size = 20, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke={stroke} strokeWidth={1.5} />
      <Line x1={16.5} y1={16.5} x2={22} y2={22} stroke={stroke} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 18, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline
        points="9 18 15 12 9 6"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function TargetIcon({ size = 60, color }: IconProps) {
  const stroke = useStroke(color ?? 'textSecondary');
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={stroke} strokeWidth={1.4} />
      <Circle cx={12} cy={12} r={5} stroke={stroke} strokeWidth={1.4} />
      <Circle cx={12} cy={12} r={1.5} stroke={stroke} strokeWidth={1.4} />
      <Line x1={12} y1={3} x2={12} y2={1} stroke={stroke} strokeWidth={1.4} strokeLinecap="round" />
      <Line x1={12} y1={23} x2={12} y2={21} stroke={stroke} strokeWidth={1.4} strokeLinecap="round" />
      <Line x1={21} y1={12} x2={23} y2={12} stroke={stroke} strokeWidth={1.4} strokeLinecap="round" />
      <Line x1={1} y1={12} x2={3} y2={12} stroke={stroke} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

export function CheckIcon({ size = 16, color }: IconProps) {
  const stroke = useStroke(color ?? 'signalGood');
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline
        points="20 6 9 17 4 12"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function SignalDotIcon({ size = 8, color }: IconProps) {
  const fill = useTheme()[color ?? 'signalGood'];
  return (
    <Svg width={size} height={size} viewBox="0 0 8 8" fill="none">
      <Circle cx={4} cy={4} r={3} fill={fill} />
    </Svg>
  );
}

export function SwitchKnobIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={10} r={9} fill="white" />
    </Svg>
  );
}

export function ProgressBarIcon({ size = 20, color }: IconProps) {
  const fill = useTheme()[color ?? 'accent'];
  return (
    <Svg width={size} height={size} viewBox="0 0 20 4" fill="none">
      <Rect x={0} y={0} width={size} height={4} rx={2} fill={fill} />
    </Svg>
  );
}

export function FlipCameraIcon({ size = 24, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 7L17 4L14 7" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M17 4v7a4 4 0 0 1-4 4H7" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" />
      <Path d="M4 17l3 3 3-3" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M7 20v-7a4 4 0 0 1 4-4h6" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}
