import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import type { Goal } from '@/lib/field-surfacing';

type Region = 'head' | 'chest' | 'arms' | 'core' | 'legs' | 'glow';

/** Goal → illuminated body regions (O-07). */
const GOAL_REGIONS: Record<Goal, Region[]> = {
  weight_loss: ['core'],
  body_comp: ['chest', 'arms', 'legs'],
  skin: ['head'],
  sleep: ['head', 'glow'],
  recovery: ['arms', 'legs'],
  wellness: ['glow'],
};

/** Front-view silhouette whose regions light up as goals are selected (O-07). */
export function BodySilhouette({ goals }: { goals: Goal[] }) {
  const theme = useTheme();
  const active = new Set<Region>();
  for (const g of goals) for (const r of GOAL_REGIONS[g] ?? []) active.add(r);

  const on = theme.accent;
  const off = theme.surfaceSunken;
  const fill = (r: Region) => (active.has(r) ? on : off);
  const stroke = theme.border;

  return (
    <View style={styles.wrap}>
      <Svg width={140} height={260} viewBox="0 0 140 260">
        {/* full-body glow */}
        {active.has('glow') && (
          <Rect x={20} y={10} width={100} height={240} rx={40} fill={on} opacity={0.12} />
        )}
        {/* head */}
        <Circle cx={70} cy={32} r={20} fill={fill('head')} stroke={stroke} strokeWidth={1} />
        {/* chest */}
        <Path
          d="M48 58 H92 a8 8 0 0 1 8 8 V104 H40 V66 a8 8 0 0 1 8 -8 Z"
          fill={fill('chest')}
          stroke={stroke}
          strokeWidth={1}
        />
        {/* core */}
        <Rect x={44} y={104} width={52} height={52} rx={6} fill={fill('core')} stroke={stroke} strokeWidth={1} />
        {/* arms */}
        <Rect x={20} y={60} width={16} height={92} rx={8} fill={fill('arms')} stroke={stroke} strokeWidth={1} />
        <Rect x={104} y={60} width={16} height={92} rx={8} fill={fill('arms')} stroke={stroke} strokeWidth={1} />
        {/* legs */}
        <Rect x={46} y={158} width={20} height={92} rx={8} fill={fill('legs')} stroke={stroke} strokeWidth={1} />
        <Rect x={74} y={158} width={20} height={92} rx={8} fill={fill('legs')} stroke={stroke} strokeWidth={1} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 8 },
});
