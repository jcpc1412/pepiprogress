import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import { OptionChip } from '@/components/form';
import { Card, Divider, EngravedLabel, Metric, SignalText, Sunken } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { executeQuery } from '@/lib/ask/execute';
import { matchQuery, SUGGESTED_QUERIES } from '@/lib/ask/intent';
import type { Aggregation, PepiAnswer, PepiQuery, QueryMetric, Timeframe, UnitTag } from '@/lib/ask/types';
import { formatDateKey } from '@/lib/dates';
import { localDateKey, useStore } from '@/lib/store';

const TF_KEY: Record<Timeframe, string> = {
  today: 'ask.tfToday',
  last_7: 'ask.tfLast7',
  prior_7: 'ask.tfPrior7',
  last_30: 'ask.tfLast30',
  this_month: 'ask.tfThisMonth',
  all: 'ask.tfAll',
};
const AGG_KEY: Record<Aggregation, string> = {
  latest: 'ask.aggLatest',
  average: 'ask.aggAverage',
  sum: 'ask.aggSum',
  count: 'ask.aggCount',
  max: 'ask.aggMax',
  min: 'ask.aggMin',
};

/**
 * Ask Pepi (MVP, product review 2026-06-30). A deterministic query bar over the
 * local log: free text runs the English matcher; suggestion chips dispatch
 * pre-built queries (locale-safe). The pure executor produces a structured
 * readout, no AI call. V2 swaps the matcher for AI intent + the readout for AI
 * phrasing, reusing `executeQuery` verbatim. Not a chatbot — a lab query bar.
 */
export function AskPepi() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { entries, doseEvents, profile } = useStore();
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState<PepiAnswer | null>(null);

  const run = (query: PepiQuery) => {
    setAnswer(executeQuery(query, { entries, doseEvents }, localDateKey()));
  };

  const submit = () => {
    const q = matchQuery(text);
    setAnswer(q ? executeQuery(q, { entries, doseEvents }, localDateKey()) : { kind: 'insufficient', reason: 'not_understood' });
  };

  const metricLabel = (m: QueryMetric): string =>
    m.kind === 'dose' ? t('ask.doses') : t(`fields.${m.field}` as 'fields.weight');

  const unitLabel = (u: UnitTag): string => {
    switch (u) {
      case 'weight':
        return t(profile.units === 'imperial' ? 'units.lb' : 'units.kg');
      case 'rating':
        return t('ask.ratingSuffix');
      case 'g':
        return t('units.g');
      case 'kcal':
        return t('units.kcal');
      case 'count':
        return t('ask.dosesUnit');
    }
  };

  const fmtDelta = (v: number, u: UnitTag): string => {
    const rounded = u === 'rating' || u === 'weight' ? Math.round(v * 10) / 10 : Math.round(v);
    return `${rounded > 0 ? '+' : ''}${rounded}`;
  };

  return (
    <Card style={styles.card}>
      <EngravedLabel>{t('ask.title')}</EngravedLabel>
      <Sunken style={styles.inputWell}>
        <TextInput
          style={[styles.input, { color: theme.text }]}
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          placeholder={t('ask.placeholder')}
          placeholderTextColor={theme.textMuted}
          returnKeyType="search"
          autoCapitalize="none"
        />
      </Sunken>

      <View style={styles.suggestions}>
        {SUGGESTED_QUERIES.map((s) => (
          <OptionChip key={s.labelKey} label={t(s.labelKey as 'ask.sugDoses')} selected={false} onPress={() => run(s.query)} />
        ))}
      </View>

      {answer && (
        <>
          <Divider />
          {answer.kind === 'insufficient' ? (
            <ThemedText type="monoSm" themeColor="textMuted">
              {answer.reason === 'not_understood'
                ? t('ask.notUnderstood')
                : t('ask.noData', { metric: answer.metric ? metricLabel(answer.metric) : '' })}
            </ThemedText>
          ) : answer.kind === 'value' ? (
            <View style={styles.readout}>
              <EngravedLabel>{`${metricLabel(answer.metric)} · ${t(TF_KEY[answer.timeframe] as 'ask.tfToday')}`}</EngravedLabel>
              <Metric value={String(answer.value)} unit={unitLabel(answer.unit)} />
              <ThemedText type="monoSm" themeColor="textMuted">
                {`${t(AGG_KEY[answer.agg] as 'ask.aggAverage')} · ${t('ask.sampleCount', { count: answer.sampleCount })}`}
              </ThemedText>
            </View>
          ) : answer.kind === 'compare' ? (
            <View style={styles.readout}>
              <EngravedLabel>{`${metricLabel(answer.metric)} · ${t(TF_KEY[answer.timeframe] as 'ask.tfToday')}`}</EngravedLabel>
              <Metric value={String(answer.value)} unit={unitLabel(answer.unit)} />
              <SignalText tone="neutral" size="metricSm">
                {`${fmtDelta(answer.value - answer.prior, answer.unit)} ${t('ask.vsPrior')}`}
              </SignalText>
            </View>
          ) : (
            <View style={styles.readout}>
              <EngravedLabel>{`${metricLabel(answer.metric)} · ${t((answer.dir === 'max' ? AGG_KEY.max : AGG_KEY.min) as 'ask.aggMax')}`}</EngravedLabel>
              <Metric value={String(answer.value)} unit={unitLabel(answer.unit)} />
              <ThemedText type="monoSm" themeColor="textMuted">
                {t('ask.on', { date: formatDateKey(answer.dateKey, i18n.language) })}
              </ThemedText>
            </View>
          )}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two },
  inputWell: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  input: { fontSize: 15, paddingVertical: Spacing.one },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  readout: { gap: Spacing.one },
});
