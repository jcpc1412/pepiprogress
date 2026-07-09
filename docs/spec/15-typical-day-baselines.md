# 15: Typical-Day Baselines (low-friction nutrition + repetitive metrics)

One-liner: when a metric barely gets logged but is roughly the same every day, ask once ("do you typically eat about the same every day?"), capture a baseline, and let the daily log collapse to three chips: usual / less than usual / more than usual. Estimated, lower-priority data beats no data.

> Owner-initiated (beta feedback, 2026-07-08). Reuses existing infra end to end: `MetricReading` + confidence (06/08), the estimated dashed chart overlay (Analysis), the verdict engine's estimated-data confidence cap, the signal ledger (redesign R2-D), Pepi chat (R2-F), and one-shot local notifications (M5). No new sync surface: baselines ride the profile, readings ride `metricReadings`.

## Why

Nutrition drives several signals (`caloric_balance`, `protein_adequacy`, weight/fat context) but is the field users skip most: typing calories and protein daily is the exact friction this app exists to remove, and the nutrition-API landscape is closed (see 06), so synced coverage is rare. Most people on a stable routine eat approximately the same thing on most days. A one-time baseline plus a deviation chip converts "no data" into "hedged, usable data" at near-zero daily cost.

## Locked decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Weekend handling | No distinction. One baseline applies every day; weekend deviations are what the more/less chips are for. |
| 2 | Silent fill | Assume "usual" on any day with a completed check-in interaction, at low confidence. Days with zero app activity record nothing. |
| 3 | Scope | Generic framework from day one, shipped with two metric groups: nutrition (calories + protein) and sleep duration. |
| 4 | Chip surface | Both the detailed log (nutrition inputs swap to chips, with an "enter exact" escape hatch) and Pepi chat (parse "ate more than usual" etc.). |
| 5 | Deviation step | Fixed 25 percent. `usual = x1.0`, `less = x0.75`, `more = x1.25`. Not user-tunable in v1. |
| 6 | Group scaling | One chip tap scales every metric in the group by the same multiplier (eating more generally means more of everything, including protein). "Enter exact" overrides per metric. |
| 7 | Confidence | Explicit chip tap = 0.6. Silent fill = 0.3. (Synced Health readings are 1.0 by convention; manual numbers are exact.) |
| 8 | Precedence | Manual number > synced reading > explicit chip > silent fill. A typical reading is never written when a higher-precedence value exists for that date + metric, and a later manual entry deletes the typical reading for that date. |
| 9 | Prompt persistence | The setup question is asked at most once by notification and once as a Pepi opener. "Not really" is permanent; re-enable any time from the Settings card. |
| 10 | Community aggregates | Typical-derived readings are excluded from community contribution (07). Estimates never leave the device as outcome data. |
| 11 | Tier | Polish (post-beta-feedback batch). Pure JS + store fields; no native rebuild. |

## UX

### 1. Trigger + notification
Eligibility (all must hold, evaluated locally):
- The metric group is relevant: nutrition group when `calories` or `protein` is in the surfaced field set, or the user has goal `weight_loss` or `body_comp`; sleep group when `sleep_quality` is surfaced and no sleep source is connected.
- Sparse: fewer than 3 data points for the group's metrics in the last 14 days (manual + synced combined).
- Established user: 7+ days since the first check-in entry (never during onboarding week).
- No connected integration currently supplying the group's canonical metrics.
- Not previously answered (yes or no) and not already prompted twice (once per channel).

When eligible: schedule one local one-shot notification (reuses the M5 scheduler; identifier `pepi.typical.<group>`), copy is a question, never advice: "Do you eat about the same most days? One tap could fill in your nutrition." Tapping deep-links to the Pepi tab with the setup question pre-posted as a Pepi message. Independently, the Pepi tab shows the same question once as an opener chip when eligible.

### 2. Setup (in Pepi, conversational)
- Pepi: "Do you typically eat about the same every day?" Chips: "Yes, roughly" / "Not really".
- "Not really": Pepi acknowledges, records the permanent opt-out, points at the Settings card for later. Done.
- "Yes, roughly": Pepi asks for the typical day in one message ("About how many calories and how much protein on a normal day? Rough is fine."). Parse via the existing quick-log parser (labeled numbers); a structured fallback card with two numeric inputs appears if parsing misses. Validation: calories 800 to 10000, protein 20 to 500 g.
- Confirmation reflects the baseline back in instrument voice, states the estimate treatment plainly ("I will treat days you check in as roughly this, marked as estimated, unless you tell me otherwise"), and shows the three chips once as a teach.
- Sleep group setup is the same shape ("Do you usually sleep about the same? How many hours on a normal night?", validation 3 to 14 h).

### 3. Daily logging
- Detailed log: when a baseline exists for the nutrition group, the nutrition section renders the three chips (usual / ate less / ate more) instead of numeric inputs, plus an "enter exact" link that expands the classic inputs (exact entry wins per precedence rule 8 and deletes that day's typical reading). Chip state is per-date and editable retroactively via the day stepper.
- Pepi: free text like "ate way more than usual today" or "light eating day" parses to the deviation chip (new parse kind `typical_deviation`, group + multiplier), applies with the standard undo affordance.
- Silent fill runs at check-in save time: if the day has any check-in interaction, no chip tap, no manual value, and no synced reading for the group, write "usual" readings at confidence 0.3. Deterministic and local; no background job.

### 4. Settings
A "Typical day" card (Settings, next to "What I log"): per group shows the baseline values, edit inputs, an on/off toggle, and a "start setup" entry for users who never got or dismissed the prompt. Turning a group off stops all future writes; existing readings are kept (they were true estimates when written) but a "clear estimated history" action deletes all readings with `sourceProvider: 'typical'` for that group.

## Data model (generic primitive)

```ts
// profile (LocalProfile), rides the user_state snapshot like everything else
typicalBaselines?: TypicalBaseline[];
typicalPromptState?: Record<TypicalGroup, 'notified' | 'asked' | 'declined' | 'active'>;

type TypicalGroup = 'nutrition' | 'sleep';

type TypicalBaseline = {
  group: TypicalGroup;
  // canonical metric id -> typical daily value, e.g.
  // nutrition: { 'nutrition.energy': 2600, 'nutrition.protein': 150 }
  // sleep:     { 'sleep.duration': 7.5 }
  values: Record<string, number>;
  setAt: string; // ISO
  enabled: boolean;
};
```

Daily records are ordinary `MetricReading`s: `{ metric, value: baseline * multiplier, ts: <date>T12:00 local, sourceProvider: 'typical', confidence: 0.6 | 0.3 }`. One reading per metric per day, replaced (not duplicated) when the chip changes. No schema change beyond the two profile fields; cloud backup and export inherit them for free.

## Signal integration (the "lower priority but still considered" contract)

- Charts (Analysis): typical readings arrive through the existing `metricReadings` path, so they render on the estimated dashed overlay automatically; `estimatedMetricsMode` (off / fill / always) governs display exactly as for Health data.
- Verdict engine: `caloric_balance` and `protein_adequacy` consume the readings through the existing derived-series path. The engine's existing rule (estimated-only series cap confidence at `watch`) is the priority downgrade; no new weighting mechanism. Direction semantics unchanged (`caloric_balance` resolves by cutting/bulking intent).
- Signal ledger (R2-D drill-down): chip days become ledger events, `ate_more` / `ate_less` / `slept_less` etc. (kind `typical_deviation`), with coarse heuristic impacts added to the existing IMPACT table, for example: energy { ate_less: -0.5, ate_more: +0.5 }, soreness/recovery { ate_more: -0.5 toward soreness }, weight { ate_more: +0.2 }. All hedged with the existing "estimated" convention. "Usual" days are not ledger events (no signal in conformity). The AI ledger pass may phrase streaks ("several days above typical may track with the weight uptick") but stays grounded in the listed events per the R2-D gate.
- Multi-day effects (the owner's recovery example) need no special machinery: consecutive `ate_more` days raise the `caloric_balance` series, which the verdict reads against goals, and the drill-down ledger shows the run of days.

## Legal + voice gate (non-negotiable)

- Recording only, never prescriptive: no copy anywhere suggests eating more or less, changing intake, or targets. The chips describe what happened; the setup asks what is normal. Same rung-1 posture as dosing (05/11).
- Every derived number renders with the existing estimated treatment (dashed series, the "approximately estimated" caption in the ledger). Never presented as measured.
- The Pepi confirmation states plainly that estimates are being written and how to stop (Settings card). No silent enrollment: silent fill only starts after an explicit "Yes, roughly" + baseline entry.

## Privacy

- Typical-derived readings are excluded from community aggregates (07): the contributor pipeline filters `sourceProvider: 'typical'`.
- Included in data export (they are user data) and deleted with account deletion like all readings.
- Nothing leaves the device for this feature except the standard encrypted `user_state` backup.

## i18n

All new strings in all 6 locales, machine-translated per convention: notification title/body per group, Pepi setup question / yes / no / baseline ask / confirmation / opt-out ack, chip labels (usual, ate less, ate more, slept less, slept more), "enter exact", Settings card (title, per-group labels, toggle, clear-history action + confirm), ledger event labels, and the `typical_deviation` parse strings for the edge function prompt.

## Implementation plan

1. Core (pure, tested): `src/lib/typical-day.ts` with group definitions, eligibility predicate, multiplier math, precedence resolver, and reading writer/replacer. Store: the two profile fields + a `recordTypicalDeviation(group, date, level)` action. Vitest.
2. Surfaces: detailed-log chip section + exact escape hatch; Settings "Typical day" card; Pepi setup flow + opener chip; silent fill on check-in save.
3. Plumbing: notification one-shot + deep link; ledger event extraction + IMPACT rows; community-contribution filter; edge-function parse prompt gains `typical_deviation` (deploy).
4. Green gate throughout: typecheck / lint / i18n parity (6) / vitest / web export; web verification of setup -> chip -> chart overlay -> ledger.

## Out of scope (V2+)

- Per-weekday or weekend baselines (revisit only if beta users correct weekends constantly).
- User-tunable deviation step, more granularity levels, or per-metric chips.
- Auto-learning the baseline from a week of manual logs (nice upgrade: prefill the setup ask from observed data).
- Additional groups (hydration, steps, caffeine) once the two shipped groups prove the pattern.
