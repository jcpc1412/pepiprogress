/**
 * Minimal line-icon set drawn on react-native-svg, themed via the active palette.
 * Kept monochrome + 1.5px stroke to match the instrument aesthetic.
 */

import Svg, { Circle, Path, Polyline } from 'react-native-svg';

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
