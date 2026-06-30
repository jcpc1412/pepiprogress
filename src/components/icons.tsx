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

/** Proper cog (Lucide "settings" gear) — the old version drew radial spokes and
 *  read as a sun. */
export function GearIcon({ size = 22, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12} r={3} stroke={stroke} strokeWidth={1.5} />
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

export function HomeIcon({ size = 22, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Pulse / line-chart glyph — the Insights tab. */
export function InsightsIcon({ size = 22, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline
        points="3,15 8,15 10,9 13,17 15,12 21,12"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** List-with-arrow glyph — the Protocol tab. */
export function ProtocolIcon({ size = 22, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1={4} y1={7} x2={20} y2={7} stroke={stroke} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1={4} y1={12} x2={16} y2={12} stroke={stroke} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1={4} y1={17} x2={12} y2={17} stroke={stroke} strokeWidth={1.5} strokeLinecap="round" />
      <Polyline points="16,14 20,17 16,20" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
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

export function PencilIcon({ size = 18, color }: IconProps) {
  const stroke = useStroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
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
