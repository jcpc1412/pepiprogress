import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { LabeledInput, TextButton } from '@/components/form';
import { Card, Divider, EngravedLabel, Skeleton } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { buildInsightHistory } from '@/lib/data-facade';
import { aiErrorKind, runInsights, type InsightMode } from '@/lib/ai';
import { useStore } from '@/lib/store';
import { useToday } from '@/lib/today';

/** Minimum logged check-ins before insights are worth offering. */
const MIN_CHECKINS = 4;

/**
 * Deeper AI insights (spec 05/13): data-grounded trend analysis, own-data Q&A, and
 * "what changed when I added X" correlations — all over the user's own history.
 * Assembles a compact history on-device and sends it to the insights edge action.
 */
export function Insights() {
  const { t, i18n } = useTranslation();
  const { entries, doseEvents, symptomEvents, metricReadings, protocolItems, profile, photos } = useStore();
  const today = useToday();

  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState<'idle' | 'notConfigured' | 'network' | 'server' | 'insufficient'>(
    'idle',
  );
  // Remember the last request so the error state can offer a retry.
  const [lastAsk, setLastAsk] = useState<{ mode: InsightMode; question?: string } | null>(null);

  const checkinList = useMemo(
    () => Object.values(entries).sort((a, b) => b.date.localeCompare(a.date)),
    [entries],
  );

  // A-4 facade: the AI now reasons over the SAME derived + integration + body-comp
  // trend series the charts render, each annotated with its goal direction (so it
  // stops being blind to integration data and never frames a goal-adverse move as
  // a good sign). Assembled by buildInsightHistory, not hand-rolled here.
  const history = useMemo(
    () =>
      buildInsightHistory(
        { entries, doseEvents, symptomEvents, metricReadings, protocolItems, profile, photos },
        today,
      ),
    [entries, doseEvents, symptomEvents, metricReadings, protocolItems, profile, photos, today],
  );

  const ask = useCallback(
    async (mode: InsightMode, q?: string) => {
      if (busy) return;
      setBusy(true);
      setStatus('idle');
      setAnswer('');
      setLastAsk({ mode, question: q });
      try {
        const res = await runInsights({ mode, question: q, history, locale: i18n.language });
        if (res.insufficientData && !res.answer) setStatus('insufficient');
        else setAnswer(res.answer);
      } catch (err) {
        setStatus(aiErrorKind(err));
      } finally {
        setBusy(false);
      }
    },
    [busy, history, i18n.language],
  );

  // Not enough data yet — keep the surface quiet rather than show empty analysis.
  if (checkinList.length < MIN_CHECKINS) return null;

  const isError = status === 'network' || status === 'server';

  return (
    <Card style={styles.card}>
      <EngravedLabel>{t('insights.title')}</EngravedLabel>
      <ThemedText type="small" themeColor="textSecondary">
        {t('insights.description')}
      </ThemedText>

      <View style={styles.actions}>
        <TextButton label={t('insights.trends')} onPress={() => ask('trend')} disabled={busy} />
        <TextButton label={t('insights.correlations')} onPress={() => ask('correlation')} disabled={busy} />
      </View>

      <Divider />

      <LabeledInput
        label={t('insights.askLabel')}
        placeholder={t('insights.askPlaceholder')}
        value={question}
        onChangeText={setQuestion}
        multiline
        onSubmitEditing={() => question.trim() && ask('qa', question.trim())}
      />
      <TextButton
        label={t('insights.ask')}
        tone="accent"
        onPress={() => question.trim() && ask('qa', question.trim())}
        disabled={busy || !question.trim()}
      />

      {busy && <Skeleton lines={4} />}

      {status === 'notConfigured' && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('insights.notConfigured')}
        </ThemedText>
      )}
      {isError && (
        <View style={styles.errorRow}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.errorText}>
            {t(status === 'network' ? 'common.errorNetwork' : 'common.errorServer')}
          </ThemedText>
          <TextButton
            label={t('common.retry')}
            onPress={() => lastAsk && ask(lastAsk.mode, lastAsk.question)}
          />
        </View>
      )}
      {status === 'insufficient' && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('insights.insufficient')}
        </ThemedText>
      )}

      {answer ? (
        <>
          <Divider />
          <ThemedText type="mono" themeColor="textSecondary" style={styles.answer}>
            {answer}
          </ThemedText>
          <ThemedText type="monoSm" themeColor="textMuted">
            {t('insights.disclaimer')}
          </ThemedText>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.four },
  errorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  errorText: { flex: 1 },
  answer: { lineHeight: 20 },
});
