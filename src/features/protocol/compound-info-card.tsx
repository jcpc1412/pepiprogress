import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { TextButton } from '@/components/form';
import { ConfidenceBadge } from '@/components/confidence-badge';
import { Card, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  aiErrorKind,
  getCompoundInfo,
  type CompoundFact,
  type CompoundInfo,
} from '@/lib/ai';
import { isSupabaseConfigured } from '@/lib/supabase';

const FACT_ORDER: CompoundFact['kind'][] = ['range', 'timing', 'side_effects', 'mechanism', 'other'];

/**
 * Observational compound card (spec 05, W4-13). Everything shown here went
 * through the market_category posture gate at the AI service; controlled
 * compounds render the static track-only state without any network call.
 * Source is always the labeled-unverified stopgap until curated
 * compound_fact rows / community data supersede it (sourcing ladder).
 */
export function CompoundInfoCard({ slug }: { slug: string }) {
  const { t, i18n } = useTranslation();
  // Loading is DERIVED (result key does not match the current request key), so a
  // slug/locale change or retry re-enters loading without a setState in the effect.
  const [result, setResult] = useState<{
    key: string;
    info?: CompoundInfo;
    error?: 'notConfigured' | 'network' | 'server';
  } | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const requestKey = `${slug}|${i18n.language}|${retryToken}`;

  useEffect(() => {
    let cancelled = false;
    getCompoundInfo(slug, i18n.language)
      .then((res) => {
        if (!cancelled) setResult({ key: requestKey, info: res });
      })
      .catch((err) => {
        if (!cancelled) setResult({ key: requestKey, error: aiErrorKind(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [slug, i18n.language, retryToken, requestKey]);

  const current = result?.key === requestKey ? result : null;
  const info = current?.info ?? null;
  const state: 'loading' | 'ready' | 'error' = !current
    ? 'loading'
    : current.error && current.error !== 'notConfigured'
      ? 'error'
      : 'ready';

  // Nothing to render local-first with no AI backend (controlled still renders:
  // its track-only state never needs the network).
  if (state === 'ready' && !info) return null;
  if (!isSupabaseConfigured && !info) return null;

  return (
    <Card style={styles.card}>
      <EngravedLabel>{t('compoundInfo.section')}</EngravedLabel>

      {state === 'loading' ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('compoundInfo.loading')}
        </ThemedText>
      ) : state === 'error' ? (
        <View style={styles.block}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('compoundInfo.error')}
          </ThemedText>
          <TextButton label={t('common.retry')} tone="accent" onPress={() => setRetryToken((n) => n + 1)} />
        </View>
      ) : info?.trackOnly ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('compoundInfo.trackOnly')}
        </ThemedText>
      ) : info ? (
        <View style={styles.block}>
          {info.answer ? <ThemedText type="body">{info.answer}</ThemedText> : null}

          {FACT_ORDER.flatMap((kind) => info.facts.filter((f) => f.kind === kind)).map((fact, idx) => (
            <View key={`${fact.kind}-${idx}`} style={styles.fact}>
              <View style={styles.factHeader}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {t(`compoundInfo.kind.${fact.kind}` as const)}
                </ThemedText>
                <ConfidenceBadge level={fact.confidence} />
              </View>
              <ThemedText type="small">{fact.text}</ThemedText>
            </View>
          ))}

          {info.consultPointer ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('compoundInfo.consultPointer')}
            </ThemedText>
          ) : null}

          <ThemedText type="small" themeColor="textSecondary">
            {t('compoundInfo.sourceLabel')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('compoundInfo.disclaimer')}
          </ThemedText>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  block: { gap: Spacing.three },
  fact: { gap: Spacing.one },
  factHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
});
