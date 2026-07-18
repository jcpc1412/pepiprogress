import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { formatDateKey } from '@/lib/dates';
import { buildNarrative, type NarrativeMoment } from '@/lib/narrative';
import { useStore } from '@/lib/store';
import { useTheme } from '@/hooks/use-theme';

/**
 * Narrative timeline (W5-24). The signal ledger as a cross-metric chronological
 * story: protocol starts, first symptom onsets, first lab readings, strength
 * PRs, benchmarks, and analyzed photo notes, threaded oldest → newest on a
 * single spine. Self-gates until there are a couple of moments to string
 * together. Copy + unit formatting live here; the engine stays pure.
 */

/** A quiet accent dot per moment kind (monochrome instrument register). */
const KIND_TONE: Record<NarrativeMoment['kind'], ThemeColor> = {
  protocol_start: 'accent',
  lab: 'signalWatch',
  strength_pr: 'signalGood',
  benchmark: 'signalGood',
  symptom: 'textMuted',
  photo: 'textSecondary',
};

const MIN_MOMENTS = 2;

export function NarrativeTimeline() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { protocolItems, symptomEvents, entries, photos, benchmarks, strengthSessions, profile } = useStore();

  const moments = useMemo(
    () => buildNarrative({ protocolItems, symptomEvents, entries, photos, benchmarks, strengthSessions }),
    [protocolItems, symptomEvents, entries, photos, benchmarks, strengthSessions],
  );
  if (moments.length < MIN_MOMENTS) return null;

  const unit = profile.units === 'imperial' ? t('units.lb') : t('units.kg');

  const lineFor = (m: NarrativeMoment): string => {
    switch (m.kind) {
      case 'protocol_start':
        return t('narrative.protocolStart', { compound: m.compound });
      case 'symptom':
        return t('narrative.symptomFirst', { symptom: m.symptomType });
      case 'lab':
        return t('narrative.lab', {
          marker: t(`markers.${m.marker}` as 'markers.hematocrit', { defaultValue: m.marker }),
          value: m.value,
        });
      case 'photo':
        return m.note; // already a localized, hedged AI note
      case 'benchmark':
        return t('narrative.benchmark', { name: m.name, value: `${m.value}${m.unit ? ` ${m.unit}` : ''}` });
      case 'strength_pr':
        return t('narrative.strengthPr', { exercise: m.exercise, value: m.e1rm, unit });
    }
  };

  return (
    <View style={styles.wrap}>
      <EngravedLabel>{t('narrative.title')}</EngravedLabel>
      <Card style={styles.card}>
        {moments.map((m, i) => {
          const first = i === 0;
          const last = i === moments.length - 1;
          return (
            <View key={`${m.date}-${m.kind}-${i}`} style={styles.row}>
              <View style={styles.rail}>
                <View style={[styles.railLine, { backgroundColor: theme.border, opacity: first ? 0 : 1 }]} />
                <View style={[styles.dot, { backgroundColor: theme[KIND_TONE[m.kind]] }]} />
                <View style={[styles.railLine, styles.railLineBottom, { backgroundColor: theme.border, opacity: last ? 0 : 1 }]} />
              </View>
              <View style={styles.body}>
                <ThemedText type="monoSm" themeColor="textMuted">
                  {formatDateKey(m.date, i18n.language)}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {lineFor(m)}
                </ThemedText>
              </View>
            </View>
          );
        })}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  card: { gap: 0 },
  row: { flexDirection: 'row', gap: Spacing.two },
  rail: { width: 12, alignItems: 'center' },
  railLine: { width: 1, flex: 1, minHeight: 6 },
  railLineBottom: {},
  dot: { width: 8, height: 8, borderRadius: 4, marginVertical: 2 },
  body: { flex: 1, gap: 1, paddingBottom: Spacing.two },
});
