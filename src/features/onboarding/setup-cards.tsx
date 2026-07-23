import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer';
import { PrimaryButton, TextButton } from '@/components/form';
import { Card, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Chamfer, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Goal } from '@/lib/field-surfacing';
import { availableProviders } from '@/lib/integrations/registry';
import { useStore } from '@/lib/store';
import { Constants } from '@/types/database';

const GOALS = Constants.public.Enums.goal;

/**
 * Post-onboarding setup cards (onboarding review 2026-07-23).
 *
 * Goals and the health connector used to be onboarding steps. Both were moved
 * here for the same reason: they ask the user to commit before the app has shown
 * them anything. Goals are also a genuinely poor onboarding question — the user
 * cannot yet judge what a goal changes, and the answer is freely editable.
 *
 * The trade-off this surface exists to manage: `surfaceFields` derives the whole
 * check-in from goals ∪ compound effect-tags, so a goal-less user falls back to
 * MINIMAL_DEFAULT and gets a thin Home. The goals card therefore does not say
 * "optional" — it names the concrete thing the user gets, because converting it
 * is what makes the app worth using.
 *
 * A dismissed card stays dismissed; both settings remain reachable from Settings.
 */

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

// ─── Goals ───────────────────────────────────────────────────────────────────

/** Goal chip. One plain label, no description: the second line restated the first
 *  without adding information and turned the grid into a wall of text.
 *
 *  Uses `goals.*` (the plain name: "Weight loss") rather than `goalCat.*` (the
 *  abstract category: "Metabolic"). The category words read as house jargon —
 *  someone picking a goal for the first time has no way to know that "Tissue"
 *  means skin. */
function GoalChip({ goal, selected, onPress }: { goal: Goal; selected: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={styles.chipWrap}>
      <ChamferBox
        chamfer={Chamfer.chip}
        fill={selected ? theme.accent : theme.surfaceSunken}
        borderColor={selected ? undefined : theme.border}>
        <View style={styles.chip}>
          <ThemedText type="smallBold" themeColor={selected ? 'onAccent' : 'text'}>
            {t(`goals.${goal}` as 'goals.weight_loss')}
          </ThemedText>
        </View>
      </ChamferBox>
    </Pressable>
  );
}

/** The goal picker itself, reusable by the card and by Settings. */
export function GoalPicker() {
  const { profile, setProfile } = useStore();
  // Transition tracking (beta-notes §1.9): the chip appears only when sex is
  // mtf/ftm, and is never preselected — some trans users are here for peptides,
  // not transition tracking, so we don't assume intent.
  const visible = GOALS.filter(
    (g) =>
      g !== 'gender_transition' ||
      profile.sex === 'mtf' ||
      profile.sex === 'ftm' ||
      profile.goals.includes('gender_transition'),
  );
  return (
    <View style={styles.grid}>
      {visible.map((g) => (
        <GoalChip
          key={g}
          goal={g}
          selected={profile.goals.includes(g)}
          onPress={() => setProfile({ goals: toggle<Goal>(profile.goals, g) })}
        />
      ))}
    </View>
  );
}

// ─── The cards ───────────────────────────────────────────────────────────────

function GoalsCard({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useTranslation();
  const { profile } = useStore();
  const chosen = profile.goals.length;
  return (
    <Card style={styles.card}>
      <EngravedLabel>{t('setup.label')}</EngravedLabel>
      <ThemedText type="smallBold">{t('setup.goals.title')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('setup.goals.body')}
      </ThemedText>
      <GoalPicker />
      {chosen > 0 ? (
        <PrimaryButton label={t('setup.goals.save', { count: chosen })} onPress={onDismiss} />
      ) : (
        <TextButton label={t('setup.later')} onPress={onDismiss} />
      )}
    </Card>
  );
}

function HealthCard({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useTranslation();
  const { integrations, setIntegration, addMetricReadings } = useStore();
  const [busy, setBusy] = useState(false);

  const provider = availableProviders().filter((p) => p.id !== 'terra')[0];
  if (!provider || !provider.nativeReady) return null;

  const connect = async () => {
    setBusy(true);
    try {
      const { ok, patch } = await provider.authenticate();
      if (!ok) return;
      setIntegration(provider.id, { connectedAt: new Date().toISOString(), ...patch });
      // Pull a year on connect: enough history for a trend, without the
      // all-time import's wait on a first run.
      const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
      const readings = await provider.pull({ since, connection: integrations[provider.id] });
      addMetricReadings(readings);
      setIntegration(provider.id, { lastSyncAt: new Date().toISOString() });
      onDismiss();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.card}>
      <EngravedLabel>{t('setup.label')}</EngravedLabel>
      <ThemedText type="smallBold">{t('setup.health.title')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('setup.health.body')}
      </ThemedText>
      {busy ? (
        <ActivityIndicator size="small" />
      ) : (
        <>
          <PrimaryButton label={t('integrations.connect')} onPress={connect} />
          <TextButton label={t('setup.later')} onPress={onDismiss} />
        </>
      )}
    </Card>
  );
}

/**
 * Renders whichever setup cards are still outstanding, one at a time so Home
 * never becomes a to-do list. Goals lead: they change what the app shows.
 */
export function SetupCards() {
  const { profile, setProfile, integrations } = useStore();
  const dismissed = profile.setupDismissed ?? [];

  const dismiss = (key: string) => setProfile({ setupDismissed: [...dismissed, key] });

  if (profile.goals.length === 0 && !dismissed.includes('goals')) {
    return <GoalsCard onDismiss={() => dismiss('goals')} />;
  }

  const provider = availableProviders().filter((p) => p.id !== 'terra')[0];
  const healthConnected = !!provider && !!integrations[provider.id]?.connectedAt;
  if (!healthConnected && !dismissed.includes('health')) {
    return <HealthCard onDismiss={() => dismiss('health')} />;
  }

  return null;
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chipWrap: { flexGrow: 1, minWidth: '30%' },
  chip: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, alignItems: 'center' },
});
