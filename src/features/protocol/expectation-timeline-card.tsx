import type { ParseKeys } from 'i18next';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radii, Spacing } from '@/constants/theme';
import { daysBetween } from '@/lib/dates';
import { localDateKey } from '@/lib/dates';
import { resolveTimeline } from '@/lib/expectation-timeline';
import { useStore } from '@/lib/store';

/**
 * Expectation timeline (spec §3.2, W4-15). Shows the commonly-reported phases for
 * this compound's effect class, with the user's current week highlighted, so the
 * verdict reads "this is on schedule" rather than just "something changed".
 *
 * Labeled-unverified per the spec-05 sourcing ladder. Controlled compounds get no
 * pushed timeline (resolveTimeline returns null) and this card stays hidden.
 * Needs a protocol start date.
 */
export function ExpectationTimelineCard({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { protocolItems } = useStore();

  const item = useMemo(
    () => protocolItems.find((p) => p.compoundSlug === slug && p.startedAt),
    [protocolItems, slug],
  );

  const weeksIn = item?.startedAt
    ? Math.max(1, Math.floor(daysBetween(item.startedAt.slice(0, 10), localDateKey()) / 7) + 1)
    : null;

  const timeline = weeksIn !== null ? resolveTimeline(slug, weeksIn) : null;
  if (!timeline || weeksIn === null) return null;

  const { group, phases, currentPhaseIndex } = timeline;

  return (
    <Card style={styles.card}>
      <EngravedLabel>{t('expectation.section')}</EngravedLabel>

      <View style={styles.phases}>
        {phases.map((phase, idx) => {
          const active = idx === currentPhaseIndex;
          const range =
            phase.endWeek !== undefined
              ? t('expectation.weekRange', { from: phase.startWeek, to: phase.endWeek })
              : t('expectation.weekOnward', { from: phase.startWeek });
          return (
            <View
              key={phase.key}
              style={[
                styles.phase,
                { borderColor: active ? theme.accent : theme.border },
                active && { backgroundColor: theme.surfaceSunken },
              ]}
            >
              <View style={styles.phaseHeader}>
                <ThemedText type={active ? 'smallBold' : 'small'} themeColor={active ? 'text' : 'textSecondary'}>
                  {t(`expectation.phase.${group}.${phase.key}.label` as ParseKeys)}
                </ThemedText>
                <ThemedText type="monoSm" themeColor="textSecondary">
                  {range}
                </ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {t(`expectation.phase.${group}.${phase.key}.desc` as ParseKeys)}
              </ThemedText>
            </View>
          );
        })}
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        {t('expectation.currentWeek', { week: weeksIn })}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('expectation.disclaimer')}
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  phases: { gap: Spacing.two },
  phase: {
    gap: Spacing.one,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radii.panel,
    padding: Spacing.three,
  },
  phaseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
});
