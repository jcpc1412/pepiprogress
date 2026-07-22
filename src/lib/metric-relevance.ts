/**
 * Metric relevance (Track C, data-audit-2026-07-21 §4e). Which charted metrics a
 * thing plausibly moves, so the "what moved it" ledger stops dumping the whole
 * protocol + irrelevant lifestyle on every metric. A fat-loss chart should list
 * fat-loss compounds and honest body-comp drivers (a cardio day, a step spike),
 * never hCG or "poor sleep".
 *
 * Pure data + helpers, no imports. The catalog resolves a slug to its effect tags;
 * this maps those tags to the outcome metrics they touch.
 */

/** Body-composition metrics: driven by real, but unquantifiable-per-event, movers
 *  (a single cardio session's fat effect can't be honestly numbered), so their
 *  integration movers render as context rows without an impact estimate. */
export const BODY_COMP_METRICS = new Set(['weight', 'body_fat_pct', 'waist', 'hips']);

/**
 * Effect tag → the charted metrics it plausibly moves. Superset of attribution's
 * map (this one includes `body_fat_pct`, which attribution can't compute but the
 * ledger can show). Tags with no charted outcome (libido/skin/gut) map to nothing,
 * so those compounds never appear as movers on any chart.
 */
export const EFFECT_TAG_METRICS: Record<string, string[]> = {
  fat_loss: ['weight', 'body_fat_pct', 'waist', 'hips'],
  appetite: ['weight', 'body_fat_pct', 'waist'],
  muscle: ['weight', 'body_fat_pct'],
  recovery: ['soreness', 'energy', 'sleep_quality'],
  sleep: ['sleep_quality', 'energy'],
  healing: ['soreness'],
  mood: ['energy'],
  cognition: ['energy'],
  hormonal: ['energy'],
};

/** The set of metrics a compound (via its effect tags) plausibly moves. */
export function metricsForEffectTags(tags: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const tag of tags) for (const m of EFFECT_TAG_METRICS[tag] ?? []) out.add(m);
  return out;
}

/**
 * Is a dose of a compound with these effect tags relevant to this metric? Unknown
 * compounds (no tags resolved) stay visible — better to show an unattributed dose
 * than to hide a real event. A tagged compound only shows on metrics it touches.
 */
export function doseRelevantToMetric(effectTags: readonly string[] | undefined, metricId: string): boolean {
  if (!effectTags || effectTags.length === 0) return true;
  return metricsForEffectTags(effectTags).has(metricId);
}
