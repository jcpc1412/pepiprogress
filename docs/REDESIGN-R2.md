# Redesign Round 2: beta feedback (implementation plan)

Owner walked the live build on device (2026-07-07) and filed the first beta feedback round.
This doc turns it into phases. All decisions below were confirmed with the owner the same day.
No open questions remain.

Companion docs: [REDESIGN.md](REDESIGN.md) (round 1, the verdict-first foundation),
`.preview-mockup/index.html` (Home + decompose frames), `.preview-mockup/pages.html`
(chat frame 5, photos frames 6 to 8).

---

## 0. Locked decisions (owner, 2026-07-07)

1. **Tabs: Today / Photos / Pepi / Analysis.** Analysis replaces Insights and hosts the
   reasoning decompose (promoted from the nested page) plus the lean editable trends that
   Insights holds today. Pepi becomes a single chat, per mockup frame 5.
2. **Detailed log: Option A (time-aware fields).** Morning fields first in the morning,
   evening fields first at night; off-time fields collapse behind an anchor. The three-option
   menu with a lab-doc entry is revisited when lab parsing actually ships. No dead doors in beta.
3. **Reasoning signal rows conform to mockup frame 2:** compact rows (favour dot, name,
   sparkline, contribution-weight dots, role + value), not stacked full-width charts. No
   gauges; the parked verdict gauge stays parked.
4. **Signal drill-down ledger is AI-generated from day one** (owner call), with a
   deterministic heuristic fallback when the AI service is unreachable or unconfigured, so the
   app stays local-first. The AI result replaces the heuristic when available.
5. **Ledger honesty line:** every ledger row anchors to a real logged event. Impact numbers
   may be approximate and always render as "≈ estimated". Events are never invented.
6. **Dose events appear in the ledger as context rows without impact numbers.** Attributing
   quantified effects to compounds edges into efficacy claims (spec 05 legal gate). Lifestyle
   events (workouts, rest days, sleep, symptoms) carry impact estimates.
7. **Distillation is no longer a separate card anywhere.** Its facts weave into the reasoning
   recap prose; the editable note stays inline under that prose.
8. **At-night canvas goes near-black** (mockup values); raised panels carry the dark grey.
9. Quick-log suggestion chips become **fill-in templates**, not literal text inserts.
10. **"Customize what I log" moves to Settings** ("What I log"), linked from the detailed log.
11. **Body-composition signals are sex-aware and a cascade** (body-fat % → sex-weighted
    waist/hips → weight), not blanket tape metrics. A sex-multiplier layer only touches body
    metrics; goal-driven metrics (sleep for recovery, etc.) are never sex-weighted. See R2-B B2.
12. **Fat-distribution pattern follows hormones:** mtf → female pattern, ftm → male pattern.

Mechanism findings that motivated the plan (verified in code, not guesses):

- The evidence slot always mirrors the engine-picked hero signal; the photo compare can only
  appear in cold start (no numeric signals at all). With daily weigh-ins the photo never wins.
  That contradicts the mockup default ("EVIDENCE · PHOTO · CHOSEN FOR TODAY").
- There is no plateau mechanism. When weight flatlines its anomaly boost decays, but waist and
  the other tape measurements are not signals at all (`CHART_METRICS` has none), so nothing can
  take over the read.
- Signal colours encode movement-vs-goal only and ignore absolute level, which is why a 4/5
  recovery ticking down renders red.
- The evidence chart and the Insights charts are the same component and series builder with
  different config (window, markers, metric selection). The redundancy is real; Analysis
  absorbs it.
- The dark theme background is `#121110` (warm dark grey) while the signed-off mockup is
  `#0A0B0C` (near-black). On OLED the gap reads as "grey, not black".

---

## R2-A: near-black canvas (tokens)

`src/constants/theme.ts`, dark theme only. Light theme untouched.

- `background` `#121110` → `#0A0B0C` (mockup `--bg`).
- `backgroundElement` / `surfaceRaised` `#232220` → `#15171A` (panel tier, between mockup
  `--panel #111315` and legibility needs; tune on screen).
- `backgroundSelected` / `surfaceSunken` `#0C0B0A` → `#070809` (mockup `--sunken`).
- Borders: keep the groove pair but re-check against the darker canvas
  (mockup lines: `rgba(255,255,255,0.07)` and `0.12`).
- Re-verify AA: `text`, `textSecondary`, `textMuted`, `label` on the new canvas (contrast only
  improves as the canvas darkens, but panels changed too). Verify lattice visibility.

**Gate:** green gate + both-theme screenshots.

---

## R2-B: Home evidence + plateau mechanics

### B1. Decouple evidence from the hero
Evidence picker (dashboard):
1. **Photo compare wins** when a photo exists in the last 14 days for the user's active track
   and a baseline exists to compare against. Show baseline vs latest + the latest hedged AI
   change note if present (mockup: "▲ ABDOMINAL DEFINITION INCREASED").
2. Otherwise fall back to the hero signal chart (current behavior).
3. Cold start keeps the placeholder + baseline CTA.

### B2. Sex-aware body-composition signal cascade (owner call 2026-07-07)
Fat distribution is sexually dimorphic, so tape metrics cannot be blanket signals. The read for
any fat-loss / recomp goal follows a cascade, best signal first:
1. **Body-fat %**: the real fat signal, sex-correct by construction (Navy method in
   `body-composition.ts` already uses the women's formula when a hip is supplied). Surfaces only
   when the inputs are logged (neck + waist, + hip for women); weight/waist cover the gaps.
2. **Waist** (both) and **hips**: sex-weighted proxies.
3. **Weight**: always-available fallback (unchanged).

`src/lib/chart-series.ts`:
- New derived metric `body_fat_pct`: per-day Navy estimate from that day's `neck`/`waist`
  (+`hips`) checkin values + `profile.height`. Sparse by nature (only days with measurements);
  the engine's `MIN_POINTS` gate already hides it until there is enough data.
- Add `waist` and `hips` to `CHART_METRICS` (checkin keys exist). New `HeroUnit` `'length'`
  (cm/in per unit system) and `'pct'` reused for body-fat.

`src/lib/verdict-engine.ts`:
- Direction: `body_fat_pct` and `waist` are context metrics like weight (cutting → down good;
  bulking/recomp → neutral). `hips` context likewise.
- Base relevance (goal/tag), before the sex layer:
  `weight_loss: { body_fat_pct: 1.0, waist: 0.8, hips: 0.5 }`,
  `body_comp: { body_fat_pct: 0.9, waist: 0.7, hips: 0.6 }`,
  effect tag `fat_loss: { body_fat_pct: 0.7, waist: 0.6 }`.
- **Sex multiplier layer**, applied *after* goal/tag relevance, `1.0` by default, only body
  metrics diverge. Non-body metrics (sleep, energy, soreness, …) are never touched, so a
  `recovery` goal weights sleep/soreness identically regardless of sex.

  | metric | male pattern | female pattern |
  |---|---|---|
  | waist | 1.0 | 0.8 |
  | hips | 0.25 | 1.0 |
  | body_fat_pct | 1.0 | 1.0 |

- **Fat pattern follows hormones** (owner call): resolve a `fatPatternSex` (`female` when
  `profile.sex ∈ {female, mtf}`, else `male`) because HRT drives fat redistribution
  (mtf on estrogen → gluteofemoral, ftm on testosterone → central). Undefined sex → no sex
  weighting (all multipliers `1.0`).
- Tests: sex-multiplier flips hips relevance male↔female; recovery-goal sleep relevance is
  identical across sexes; body-fat% direction on a cut; mtf→female / ftm→male mapping.

### B3. Explicit plateau state
In the engine, when the weight signal spans ≥10 days with ≥5 points and |delta| is inside the
flat band while other logging continues:
- Verdict explanation switches to a plateau template (`verdict.explanation.plateau`):
  descriptive, no shame, "weight is holding; tape and photos carry the read now".
- Hero prefers the highest-relevance body-composition signal that actually moved, body-fat %
  then waist (via the cascade), else keeps weight.
- Evidence picker prefers the photo compare (B1 covers it).
- Tests: plateau detection boundaries, body-comp hero swap, photo-evidence preference,
  plateau keys pass the legal-gate namespace test.

**Gate:** engine tests green; on-web verdict sanity across normal / plateau / cold states.

---

## R2-C: Reasoning conformance + the Analysis tab

### C1. Signal rows to mockup spec
Rebuild `SignalRow` as the compact frame-2 row:
`favour dot · metric name · sparkline · weight dots · role + value`.
- Sparkline: tiny inline series (height ~20, no axis, no labels).
- Weight dots: 1 to 4 dots from the signal's contribution weight quantile.
- Row is tappable → signal detail (R2-D).

### C2. Contextual tone matrix (fixes "red at 4/5")
Tone is computed from **level band + movement + explained status**, not movement alone.
Scale-5 metrics get level bands: high ≥ 3.8, low ≤ 2.4, mid between. Weight/length metrics
stay movement-only (no meaningful absolute band).

| Level band | Movement vs goal | Explained? | Tone |
|---|---|---|---|
| high | adverse, small | any | green |
| high | adverse, material | yes | amber |
| high | adverse, material | no | amber |
| mid | adverse, material | yes | amber |
| mid | adverse, material | no | red |
| low | adverse, any | no | red |
| any | favourable | n/a | green |
| any | flat | n/a | neutral |

"Material" = the existing normalized-deviation threshold. Pure function + unit tests.

### C3. Two-tier prose + distillation weave
- Home keeps the one-sentence template.
- The Analysis recap becomes a paragraph (template v1): verdict reading + reconciliation +
  a woven "today you logged ..." sentence built from the old distillation facts + confidence
  phrasing. The `TodayLog` card is deleted; the editable note renders inline under the
  paragraph with the pencil affordance.
- Phase 6 (cold-Claude prompt) later replaces both templates with AI prose; the template
  stays as the offline fallback. Phase 6 scope is unchanged by this plan.

### C4. IA: Analysis replaces Insights
- Tab bar: `Today / Photos / Pepi / Analysis` (`tabs.analysis` in 6 locales; `tabs.insights`
  removed). Reuse the pulse icon.
- Analysis tab = reasoning decompose (recap + signal stack) with a **Trends** section below it
  carrying the lean editable charts from the old Insights screen (pinned metrics, timeframe,
  dose markers). The old Insights route dies; `/reasoning` renders the tab content (Home chip
  now switches to the tab).

**Gate:** nav works end to end; tone matrix tests green; green gate.

---

## R2-D: Signal detail (the ledger)

New nested page: tap any signal row → `src/app/signal/[metricId].tsx`.

Layout top to bottom:
1. **Header:** metric name, current value + trend marker, role pill.
2. **Explainer:** what this metric is, what moves it up and down, phrased for the user's goal
   (AI text; template fallback per metric).
3. **Sources:** chips for what feeds it (Manual, Apple Health, etc. from the integrations
   registry state).
4. **Chart:** the windowed series (same component as evidence).
5. **Ledger:** the logged events inside the charted window that plausibly affected this
   metric, newest first, each row: timestamp · event label · impact.
   - Lifestyle events (workout effort, rest days, sleep, symptom events) get impact estimates:
     "Workout 90 min · ≈ −2 recovery".
   - Dose events render as context rows, no impact number (decision 6).
   - Every impact renders with ≈ and an "estimated" caption (decision 5).

Mechanics:
- **Event extraction is deterministic and client-side** (pure function + tests): map window
  entries/symptoms/doses to candidate events per metric via a relevance table.
- **AI pass (primary):** new `ai-service` action `signal_ledger`. Input: metric, goal context,
  extracted events, series summary, locale. Output (structured): explainer, ≤2 educational
  lifestyle tips, per-event impact + one-line rationale. Cheap model tier (`AI_PARSE_MODEL`).
  The rung-1 gate is baked into the prompt: educational and descriptive only, no dosing, no
  diagnosis, controlled compounds track-only.
- **Heuristic fallback (offline / secrets unset):** static rule table (e.g. effort ≥4 →
  recovery ≈ −2; rest day → recovery ≈ +2; sleep < 6h → energy ≈ −1), same UI, same ≈ labels.
  Beta works fully without the edge function; AI replaces it silently when reachable.
- **Caching:** persist the last result per metric + window hash in the store; recompute only
  when the window data changes (TTL 24h). No refetch per open.
- Extend the legal-gate test to the new keys and the `signal_ledger` action contract.

⚠️ Dependency flag: the AI path needs `ANTHROPIC_API_KEY` in Supabase edge-function secrets
(still unset, carried over from M3). Until set, beta runs on the fallback.

**Gate:** works offline via fallback; AI path verified once secrets exist; extraction +
fallback unit tests green; green gate.

---

## R2-E: Logging redesign

### E1. Quick-log chips become templates
Chip tap inserts a fill-in block instead of literal text, cursor ready at the first blank:
- "Progress check" → `Weight:\nWaist:\nNeck:`
- "Morning check" → `Slept: h\nSleep quality: /5\nWeight:`
- "Evening check" → `Workout effort: /5\nCalories:\nProtein:`
- "Dose" → keeps current dose phrasing.
The parser already understands labeled numbers. All template strings via i18n (6 locales).

### E2. Time-aware detailed log (Option A)
- Tag every checkin field `morning | evening | any` in `field-surfacing`.
- Before 15:00 local: morning + any fields first, evening fields behind a
  "Show evening fields" anchor. After 15:00: reversed.
- Fields already covered by an integration reading for the date keep the existing autofill
  link and group under a "From your devices" section (pattern exists for weight/nutrition;
  becomes generic). This is where passive capture lands when the Health device build ships.

### E3. Customize moves to Settings
- New Settings card "What I log": the existing `CUSTOMIZABLE_FIELDS` toggle UI
  (`applyFieldCustomization` unchanged; defaults still come from the locked rule
  goals ∪ effect-tags ∪ monitoring-tags).
- Remove the customize block from the check-in body; the detailed log header links to the
  Settings card.

**Gate:** green gate; manual pass of morning vs evening ordering and template chips.

---

## R2-F: Pepi becomes one chat (mockup frame 5)

- Merge `QuickLog` + `AskPepi` into a single thread UI: message list, one composer
  ("Log or ask anything…"), Pepi replies as messages (mono data line for log confirmations,
  analysis paragraph for questions, exactly like frame 5).
- Routing per message: quick-log parse first (existing confidence machinery; confident parses
  auto-apply and the confirmation message carries the undo affordance); otherwise the
  deterministic Ask pipeline answers; AI-unconfigured shows the existing hint as a message.
- Suggestion chips above the composer: Weekly summary / What changed? / Log a dose + the E1
  templates.
- No charts on Pepi: Analysis owns every chart. Thread state is session-scoped v1 (last N
  messages persisted lightly in the store so the tab doesn't feel amnesiac).
- The Home Log button and logging overlay are unchanged; this merge touches only the tab.

**Gate:** green gate; web flow check (log-shaped message applies + undoes; question answers).

---

## Sequencing

| Phase | Scope | Size | Risk |
|---|---|---|---|
| R2-A | Near-black tokens | S | low |
| R2-B | Evidence picker + tape signals + plateau | M | med (engine changes, tested) |
| R2-C | Signal rows + tone matrix + prose weave + Analysis tab | M | med |
| R2-D | Signal detail ledger (AI + fallback) | L | med-high (new AI surface) |
| R2-E | Log templates + time-aware fields + customize move | M | low-med |
| R2-F | Pepi single chat | M | med |

Order: A → B → C → D → E → F. D depends on C (the rows are its tap target). E and F are
independent of D and can interleave if a build cut is needed sooner. Each phase lands on
`main` behind the full green gate (typecheck / lint / i18n parity 6 / web export / vitest).

## i18n
Every new string in all 6 locales in the same commit, machine-translated, no em dashes
(guard enforces both). New key families: `verdict.explanation.plateau`, `verdict.tone.*`
(if surfaced), `tabs.analysis`, `signal.*` (explainer fallbacks, ledger labels, estimated
caption), `quicklog.template.*`, `checkin.section.*` (morning/evening/devices anchors).

## Legal guardrails (restated for the new surfaces)
- Ledger: real events only; ≈ estimated labels; doses are context rows without impact
  numbers; tips are general lifestyle education; never dosing, never diagnosis. The
  legal-gate test extends to every new key namespace and the `signal_ledger` contract.
- Plateau copy is descriptive, an observation about the read, never a prescription.

## Out of scope (unchanged owner decisions)
- Lab parsing stays deferred; the three-option Log menu (Option B) is revisited when it ships.
- Health/Health Connect native activation stays the existing device-build task.
- Phase 6 cold-Claude prose upgrade rides after R2-C/D and swaps the templates it defines.
- Web deep analytics unchanged.

## Definition of done
- Canvas reads black on device; panels carry the grey; AA holds in both themes.
- Evidence shows the photo compare whenever a comparable pair exists; plateau flips the read
  to tape/photo with honest copy.
- Analysis tab: recap paragraph with woven distillation + note, mockup-spec signal rows with
  contextual tones, trends below; Insights gone.
- Every signal opens a detail page with explainer, sources, chart, and an anchored-to-reality
  ledger that works offline and upgrades to AI when secrets land.
- Quick-log chips insert templates; detailed log is time-aware; customize lives in Settings.
- Pepi is one chat that logs and answers, per mockup frame 5.
