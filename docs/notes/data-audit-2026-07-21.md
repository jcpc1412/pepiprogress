# Data-architecture audit (2026-07-21)

Triggered by beta-round-3 device testing. Owner's thesis: **there is no single source
of truth for derived data, so metrics get recomputed ad hoc, some are wired nowhere, and
attribution ("what moved it") is naive.** Confirmed. This documents the real state, the
chart→source map the owner asked for, and root causes for each Analysis bug.

## 1. Is there a source of truth? Partly — and that's the problem.

There IS a merge point: `src/lib/chart-series.ts` `CHART_METRICS` + `selectChartSeries`
was built to be "the single source of truth for the trend charts," merging three inputs:
1. **manual** check-in fields (`entries[date][checkinKey]`),
2. **integration** readings (`metricReadings`, canonical keys like `body.weight`),
3. **wearable-derived** estimates (`deriveMetrics`, the 1-5 dashed overlays).

But it only governs the *charts*. The verdict engine, the signal ledger ("what moved
it"), the AI context, and the photo-measurement path each read the store their own way,
so the same concept (e.g. body fat) is computed in one place and invisible in another.
The three merged sources also aren't reconciled *within* a metric — see body_fat below.

## 2. Chart catalog — every chartable metric + its data source (owner's ask)

`CHART_METRICS` (`chart-series.ts`) is the list. Solid line = manual/integration;
dashed = wearable-derived estimate.

| id | manual source | integration source | derived source | status |
|---|---|---|---|---|
| `weight` | check-in `weight` | `body.weight` | forecast (trajectory) | ✅ works |
| `body_fat_pct` | — | **ignored** (`body.fat_pct` not read) | Navy formula only | ❌ **empty** (see 4a) |
| `waist` | check-in `waist` | — | — | ✅ if logged |
| `hips` | check-in `hips` | — | — | ✅ if logged |
| `energy` | check-in `energy` | — | HRV/RHR/sleep/TRIMP/cal → 1-5 | ✅ |
| `sleep_quality` | check-in `sleep_quality` | — | sleepDur/HRV/RHR → 1-5 | ✅ |
| `soreness` | check-in `soreness` | — | **recovery** (HRV/RHR/ACWR/TRIMP) | ❌ **mislabeled** (4b) |
| `sleep_deep_pct` | — | `sleep.deep`÷`sleep.duration` | z-score→1-5 | ⚠️ coloring (4c) |
| `sleep_rem_pct` | — | `sleep.rem`÷`sleep.duration` | z-score→1-5 | ⚠️ coloring (4c) |
| `protein_adequacy` | — | `nutrition.protein` vs weight | insight-only | ✅ |
| `caloric_balance` | — | `nutrition.energy` vs `activity.energy` | insight-only | ✅ |
| `body_comp_velocity` | — | — | weight slope | ✅ |
| `cv_strain` | — | `activity.workout_min/hr` (TRIMP) | insight-only | ✅ |
| `inflammation` | — | `vitals.body_temp` + symptoms | insight-only | ✅ |

## 3. Apple Health — what we ingest vs. what we use

Canonical keys we CAN ingest (`integrations/types.ts`): `body.weight`, **`body.fat_pct`**,
`body.lean_mass`, `activity.steps`, **`activity.energy`** (calories burnt),
`activity.workout` / `activity.workout_min` / `activity.workout_hr` (exercise + training
time/HR), `activity.effort`, `sleep.*`, `nutrition.*`, `vitals.hrv`, `vitals.hr_rest`,
`vitals.body_temp`, `vitals.glucose`, `cycle.phase`.

**Used:** `activity.energy` + workout TRIMP + HRV/RHR feed `energy`, `soreness`(recovery),
`caloric_balance`, `cv_strain` in `deriveMetrics`. So yes — calories burnt / training load
DO flow into the derived 1-5 estimates.

**NOT used:** (a) `body.fat_pct` — ingested but never charted (body_fat_pct is Navy-only).
(b) `activity.steps` / cardio / `activity.energy` are **absent from the signal ledger** —
"what moved it" only looks at check-in `workout_effort`/`sleep_quality` + doses, so a real
Health cardio session never appears as a mover (owner's exact complaint).

## 4. Analysis bugs — root causes

**4a. Body-fat chart empty (the source-of-truth poster child).**
`body_fat_pct` is `computed: 'body_fat_pct'` only — the Navy formula
(`bodyFatNavy`, needs **neck** + waist + height + weight, +hips for female). The photo
measurement panel collects waist/hips but **not neck**, so the formula returns null →
empty. Meanwhile `body.fat_pct` from Health AND `profile.bodyFatPct` from onboarding both
exist and are ignored. Fix: make body_fat_pct read a **priority chain** — measured
(Health `body.fat_pct`) → Navy (if neck present) → profile baseline — the same
source-of-truth pattern every metric should follow.

**4b. Recovery reads 5/5 but colors red.**
`deriveMetrics` returns the recovery computation under the key `soreness`
(`derived-metrics.ts:432 soreness: recovery`), where 5 = well-recovered = good. But the
verdict engine has `soreness: 'down_good'` (`verdict-engine.ts:146`), so value 5 resolves
to favour `6−5=1` (worst) → red. Recovery is up-good wearing a down-good label. Fix:
give recovery its own metric id (`recovery`, up_good) instead of overloading `soreness`,
or invert at the mapping. Touches derived-metrics, chart-series, verdict-engine directions,
i18n labels.

**4c. Deep sleep 2% red / REM 3% green (inconsistent + suspicious values).**
Two issues. (i) **Coloring is relative to the user's OWN baseline z-score, not clinical
norms** — a low REM that's still above the user's personal REM average reads "good"
(green) while a low deep below personal average reads "bad" (red), even though both are
clinically low. Sleep-stage % has absolute meaning (deep ~13-23%, REM ~20-25%), so it
should be scored against a norm band (→ yellow/"watch" for borderline). (ii) The raw
2%/3% values themselves look like **bad/partial source data** (Android, no HealthKit
sleep-stage stream, or a deep-minutes-vs-duration unit mismatch); confirm on a device
with real sleep data before trusting the number.

**4d. "About this" is generic.**
`metricExplainerKey` returns a static `signal.explain.<metric>` string (only 7 metrics
have one; the rest get `signal.explain.default`). Owner wants "about this" to be the
**deterministic in-context** explanation (what this metric is + why it matters *for this
user's goal/stack*), and the AI "in context" pass to actually say something. Currently the
static explainers are goal-blind and the AI ledger copy is thin.

**4e. "What moved it" dumps the whole injection schedule + irrelevant lifestyle.**
`extractLedger` (`signal-ledger.ts`) adds **every dose event in the window** as a context
row regardless of the metric, plus poor-sleep/workout rows for any metric. So the body-fat
ledger lists hCG, melanotan, primo (none fat-loss-relevant) and "poor sleep" (irrelevant
to fat). And it uses **zero integration data** (no steps/cardio/deficit). Fixes:
- **Relevance-filter doses by the metric's effect-tags** — body_fat shows only fat-loss /
  recomp compounds (via catalog `effectTags`), not the entire stack. hCG/melanotan never
  appear on a fat chart; a mild compound like primo is de-emphasized vs a potent one.
- **Only surface lifestyle rows a metric actually responds to** (poor_sleep → energy/sleep,
  not body fat).
- **Add integration-derived movers**: a real `activity.workout`/cardio day, a caloric
  deficit day (`activity.energy` − `nutrition.energy`), a step spike — these are the
  honest movers for body composition, and we already ingest them.

## 5. Proposed fix order (for owner sign-off)

**Track A — correctness bugs (small, high-trust, do first):**
- A1. Recovery mislabel (4b) — new `recovery` metric id, up_good. ~1 screen + engine + i18n.
- A2. Body-fat source chain (4a) — Health `body.fat_pct` → Navy → profile baseline.
- A3. Sleep-stage norm-band coloring (4c) — score deep/rem % against clinical bands, add
      a "watch" (yellow) state; guard the suspicious raw values.

**Track B — the source-of-truth layer (the real fix for the whole thesis):**
- B1. A single `resolveMetric(metricId, day)` that every surface (charts, verdict, ledger,
      AI context, Journal) reads, with an explicit **priority chain per metric** (measured
      > derived > computed > baseline) and a `provenance` tag. Kills the "computed here,
      invisible there" class of bug for good. Pairs with the source-badge work (F4).

**Track C — attribution rework (4e, the "what moved it" fix):**
- C1. Metric-relevance filter on the ledger (effect-tag match for doses; responsive-metric
      match for lifestyle).
- C2. Integration movers (cardio/steps/deficit) as first-class ledger rows.
- C3. "About this" → deterministic, goal-aware explainer (4d); AI in-context pass improved.

**Separate tracks (already decided):** B3-06 sign-out → auth splash; camera zoom +
volume-button shutter (then scope the vision-camera consolidation).

Nothing here is built yet — this is the map.
