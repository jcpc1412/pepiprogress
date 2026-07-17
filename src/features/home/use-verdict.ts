import { useMemo } from 'react';

import { selectVerdict } from '@/lib/data-facade';
import { localDateKey, useStore } from '@/lib/store';
import { type HeroUnit, type Verdict } from '@/lib/verdict-engine';

/** Loose translate-fn signature for the verdict presentation helpers. Kept
 *  structural (not the full typed-key union) so the large i18n key set doesn't
 *  blow TS's instantiation-depth limit; callers pass the real `t`. */
export type TFn = (key: string, options?: Record<string, string | number>) => string;

/** Compute today's verdict from the live store (memoized on its inputs). Shared
 *  by the Today screen and the decompose/reasoning screen so they never drift. */
export function useVerdict(): Verdict {
  const { entries, metricReadings, protocolItems, photos, profile } = useStore();
  return useMemo(
    () => selectVerdict({ entries, metricReadings, protocolItems, photos, profile }, localDateKey()),
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
  // These params carry metric i18n keys (e.g. "fields.soreness"); translate them
  // before interpolation so the sentence reads in the user's language.
  if (params) {
    for (const k of ['metric', 'drag', 'drag2', 'marker'] as const) {
      if (typeof params[k] === 'string') params[k] = t(params[k] as 'fields.weight');
    }
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
  opts?: { signed?: boolean },
): { value: string; unit: string } {
  // Signed mode (the hero shows a movement/delta): explicit + / − prefix, using a
  // real unicode minus (U+2212) so it reads as a sign, not a hyphen.
  const sign = (n: number) => (opts?.signed ? (n > 0 ? '+' : n < 0 ? '−' : '') : n < 0 ? '−' : '');
  const mag = Math.abs(value);
  if (unit === 'weight') {
    const v = Number.isInteger(mag) ? String(mag) : mag.toFixed(1);
    return { value: `${sign(value)}${v}`, unit: units === 'imperial' ? t('units.lb') : t('units.kg') };
  }
  if (unit === 'length') {
    const v = Number.isInteger(mag) ? String(mag) : mag.toFixed(1);
    return {
      value: `${sign(value)}${v}`,
      unit: units === 'imperial' ? t('measurements.unitIn') : t('measurements.unitCm'),
    };
  }
  if (unit === 'pct') return { value: `${sign(value)}${Math.round(mag)}`, unit: '%' };
  // scale5 (1–5 subjective / derived)
  return { value: `${sign(value)}${mag.toFixed(1)}`, unit: t('verdict.unitScale') };
}
