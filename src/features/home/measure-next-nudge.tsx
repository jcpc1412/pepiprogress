import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { resolveMsg, type TFn } from '@/features/home/use-verdict';
import { useTheme } from '@/hooks/use-theme';
import { useOverlay } from '@/lib/nav-overlay';
import { useStore } from '@/lib/store';
import { computeEvidenceGaps, type EvidenceGap } from '@/lib/measure-next';

/**
 * "What should I measure next?" (W4-17). The verdict naming its own biggest
 * evidence gap and offering the one action that would strengthen it. `variant`
 * controls density: the Today nudge shows the single top gap under the verdict;
 * the reasoning screen lists the gaps as its own section.
 */
export function MeasureNextNudge({ variant = 'nudge' }: { variant?: 'nudge' | 'section' }) {
  const { t } = useTranslation();
  const { protocolItems, entries, photos } = useStore();
  const tx = t as unknown as TFn;

  const gaps = useMemo(
    () => computeEvidenceGaps({ protocolItems, entries, photos }),
    [protocolItems, entries, photos],
  );
  if (gaps.length === 0) return null;

  const shown = variant === 'nudge' ? gaps.slice(0, 1) : gaps.slice(0, 2);

  return (
    <View style={styles.wrap}>
      <EngravedLabel>{t('measureNext.title')}</EngravedLabel>
      {shown.map((gap, i) => (
        <GapRow key={`${gap.kind}-${i}`} gap={gap} t={tx} />
      ))}
    </View>
  );
}

function GapRow({ gap, t }: { gap: EvidenceGap; t: TFn }) {
  const router = useRouter();
  const theme = useTheme();
  const { openLogging } = useOverlay();
  const label = resolveMsg(t, gap.message);

  const go = () => {
    if (gap.target === 'photos') router.push('/photos');
    else openLogging('detailed'); // the detailed log hosts lab import
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t(gap.target === 'photos' ? 'photos.heading' : 'lab.section')}
      onPress={go}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={[styles.marker, { backgroundColor: theme.textMuted }]} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, paddingVertical: Spacing.one },
  pressed: { opacity: 0.6 },
  marker: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  text: { flex: 1 },
});
