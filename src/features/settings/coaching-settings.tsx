import { useTranslation } from 'react-i18next';

import { SegmentedControl } from '@/components/form';
import { Card, Divider, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { useStore } from '@/lib/store';
import { useCoachingLevel } from '@/lib/use-coaching-level';
import type { CoachingLevel } from '@/lib/coaching';

const OPTIONS: CoachingLevel[] = ['observe', 'nudge', 'coach'];

/**
 * "How much should Pepi weigh in?" (W3-8, beta-notes §3.6). Behavior labels
 * only, never user grading: just log / nudge me / coach me. Unset = the
 * adaptive default (invisible inference); the control shows the effective
 * level either way, and choosing one pins it.
 */
export function CoachingSettings() {
  const { t } = useTranslation();
  const { setProfile } = useStore();
  const effective = useCoachingLevel();

  return (
    <Card>
      <EngravedLabel>{t('coaching.section')}</EngravedLabel>
      <Divider />
      <ThemedText type="monoSm" themeColor="textSecondary">
        {t('coaching.question')}
      </ThemedText>
      <SegmentedControl
        options={OPTIONS.map((o) => ({ value: o, label: t(`coaching.${o}` as const) }))}
        value={effective}
        onChange={(v) => setProfile({ coachingLevel: v as CoachingLevel })}
      />
      <ThemedText type="monoSm" themeColor="textMuted">
        {t(`coaching.hint.${effective}` as const)}
      </ThemedText>
    </Card>
  );
}
