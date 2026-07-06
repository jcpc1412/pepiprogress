import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { localDateKey, useStore } from '@/lib/store';
import { computeVerdict, type HeroUnit, type Verdict } from '@/lib/verdict-engine';

/** The strongly-typed translate fn, shared by the verdict presentation helpers. */
export type TFn = ReturnType<typeof useTranslation>['t'];

/** Compute today's verdict from the live store (memoized on its inputs). Shared
 *  by the Today screen and the decompose/reasoning screen so they never drift. */
export function useVerdict(): Verdict {
  const { entries, metricReadings, protocolItems, photos, profile } = useStore();
  return useMemo(
    () =>
      computeVerdict({
        entries,
        metricReadings,
        protocolItems,
        photos,
        profile,
        today: localDateKey(),
      }),
    [entries, metricReadings, protocolItems, photos, profile],
  );
}

/** Resolve a verdict Localizable to a string, translating a `metric` param (which
 *  the pure engine emits as an i18n key, e.g. "fields.weight") before interpolating. */
export function resolveMsg(
  t: TFn,
  msg: { key: string; params?: Record<string, string | number> },
): string {
  const params = msg.params ? { ...msg.params } : undefined;
  if (params && typeof params.metric === 'string') {
    params.metric = t(params.metric as 'fields.weight');
  }
  return t(msg.key as 'verdict.explanation.on_track', params);
}

/** Format a hero figure's numeric value + unit into display strings, honoring the
 *  user's unit system. Kept out of the pure engine so it stays locale-agnostic. */
export function formatHeroValue(
  value: number,
  unit: HeroUnit,
  units: 'metric' | 'imperial',
  t: TFn,
): { value: string; unit: string } {
  if (unit === 'weight') {
    const v = Number.isInteger(value) ? String(value) : value.toFixed(1);
    return { value: v, unit: units === 'imperial' ? t('units.lb') : t('units.kg') };
  }
  if (unit === 'pct') return { value: String(Math.round(value)), unit: '%' };
  // scale5 (1–5 subjective / derived)
  return { value: value.toFixed(1), unit: t('verdict.unitScale') };
}
