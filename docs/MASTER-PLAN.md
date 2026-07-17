# MASTER PLAN (consolidated 2026-07-16)

The single merged build sequence for everything decided but not yet built. This document
is the **ordering authority**; the source docs stay as the detail specs:

- `docs/notes/beta-notes-2026-07-12.md` (photos rework, companion pivot, micro-logging)
- `docs/notes/notes-2026-07-16-web-breadth.md` (web workbench, TRAJ, strength log, SM-1)
- `docs/notes/competitive-positioning-2026-07-14.md` (compound intelligence, user rings)
- `docs/CONNECTORS-PLAN.md` (ChatGPT app + Claude connector)
- `docs/ISSUES.md` Beta Round 2 (P-04, P-05)
- `docs/spec/05-ai-layer.md` (postures, sourcing ladder, eval suite)

Effort: [S] under a day, [M] days, [L] a week+.

---

## Blocked on owner (not code)

- **EAS closed-beta build + TestFlight** (`eas build --platform ios --profile production --auto-submit`).
  Native rebuild is required before device testing: expo-camera/sensors/image-manipulator,
  expo-notifications, expo-haptics, HealthKit module, vision-camera flags.
- **M4 on-device test checklist** (`docs/ROADMAP.md`) + HealthKit read/write verification
  (existing task: Phase 2 native Health read).
- **Progress overlay sketches.** The exaggerated-interpretation overlay prototype (item 30)
  waits on your sketches; build starts once they exist.

---

## Wave 1: data correctness + scheduling trust ✅ SHIPPED 2026-07-16

Fix the things that silently lie before building anything on top of them.
All four landed on main (commits 3eb96a4, cfb93f7, 3580259, 0ca9b45); the
nutrition-sync and schedule fixes need on-device verification with live Health
data at the next device build.

1. **Nutrition sync fix [S/M], P0.** Daily aggregates re-sync correctly: upsert semantics
   for summed-per-day readings (same provider/metric/ts replaces on value change),
   full-day query windows, display prefers the live resolver over frozen autofill copies.
   (beta-notes §5; reinforced by the Cronometer screenshot 2026-07-16)
2. **Photo upload compression [S].** Resize on upload (~2048px long edge, q0.8), original
   stays local; bucket max-file-size guard. ~4x cloud cost cut. (round-3 §3)
3. **P-04 dose-schedule anchoring [M].** Interval schedules anchor to startedAt +
   N*interval; a logged dose completes the nearest slot; off-slot doses prompt
   keep-schedule / shift-schedule / extra-dose. Never silently re-anchor. (ISSUES P-04)
4. **P-05 skip-doses nudge, simple version [S/M].** N missed scheduled doses fires an
   in-app notification deep-linking into Pepi chat asking why. Context-memory
   integration upgrades it in Wave 3. (ISSUES P-05)

## Wave 2: photo capture UX ✅ SHIPPED 2026-07-16

5. **Review-step rework ✅** (commit a6a9b0f). Two steps, fixed footers, big score,
   save-on-continue warms the instant read, last-time measurement prefill.
6. **Cycle prompt copy pass ✅** (commit ed98b87). Attribution register + regression
   suppression in analyze_photo and simple_analysis. Deployed as ai-service v18
   (2026-07-16); progress-photos bucket also got its 10MB file_size_limit.
7. **Fonts ✅** (found already shipped in a prior session: `@expo-google-fonts` +
   useFonts gate + weight-to-family map + web CSS vars). Chamfers also already exist
   (`src/components/chamfer.tsx`); the stale "deferred" notes were corrected.

## Wave 3: companion pivot ✅ SHIPPED 2026-07-16

All four landed on main (commits cd13e0f, 6d7e5f8, 78f4671, a1a337a); ai-service v19
deployed with the coaching-level prompt + context-memory payload. Deferred within the
wave: recurrence/habit inference over context notes (listed "later" in beta-notes 3.4)
and the moment-anchored ease-off / go-deeper offers (need nudge-ignore telemetry;
the settings override + quieter-only silent adjustment shipped).

8. **Adaptive coaching level + indirect-guidance prompts [M].** observe/nudge/coach,
   silently inferred, offer-only upward, settings override; prompt blocks per the
   direct-lifestyle / observational-compound policy. (beta-notes §3.2, §3.6)
9. **Micro check-ins + chat controls [M].** Morning/evening chat snippets, chips-first;
   "ask me in an hour" snooze; "tone down notifications" and per-check-in
   adjust/disable intents, always confirmed, never silent. (beta-notes §4)
10. **Anomaly engine + context memory [M].** Deterministic deviation detectors, templated
    openers, structured context notes, recurrence inference, and anomaly-tagged days
    excluded/down-weighted from baselines. Upgrades P-05. (beta-notes §3.4)
11. **Dynamic hero metric [M].** Pepi picks today's most important signal and leads the
    Home hero with it: weight plateau puts weight first, a visible physique change puts
    the photo comparison first, a recovery dip puts recovery first. Driven by the verdict
    engine's existing signal ranking; falls back to the current fixed order when nothing
    stands out. (external review 2026-07-16)

## Wave 4: compound intelligence + predictions (the differentiation wave) ✅ SHIPPED 2026-07-17

12. **market_category migration + shared posture module + eval suite ✅ SHIPPED 2026-07-16**
    (commit 0dd845f). Migration 20260717032638 applied; `_shared/posture.ts` reused by
    ai-service v20 (deployed) and the MCP connector later; `compound_info` action with
    code-enforced track-only for controlled; `npm run eval:posture` = 4/4 PASS against
    the deployed prompt + model pair. Re-run the evals on any model or prompt change.
13. **Observational compound cards ✅ SHIPPED 2026-07-16.** `getCompoundInfo` client fn
    (14-day on-device cache per slug+locale, spec 05 cost rule; client-side track-only
    short-circuit for controlled) + `CompoundInfoCard` on the compound-detail screen:
    answer, kind-grouped facts with confidence pills, otc consult pointer, the
    labeled-unverified source line, disclaimer. Curated compound_fact rows + community
    weighting later per the sourcing ladder.
14. **Per-compound attribution insights ✅ SHIPPED 2026-07-16.** `src/lib/attribution.ts`
    (pure, 7 tests): per active protocol item, pre-start vs post-start window means for
    the effect-tag-relevant outcome metrics, with competing-explanation ranking where the
    compound's strength is the RESIDUAL after concurrent nutrition (intake) + training
    (effort) shifts, so the deficit outranks the protocol when both moved (§5.1 ladder).
    `AttributionCard` on the compound-detail screen: hedged per-metric lines, confidence
    pill, lead-factor clause, association-not-proof disclaimer. i18n ×6.
15. **Expectation timelines ✅ SHIPPED 2026-07-16.** `src/lib/expectation-timeline.ts`
    (pure, 11 tests): curated commonly-reported phase tables per effect class
    (fat_loss/healing/skin/gh_recovery/sleep/cognition), resolved by effect tags;
    controlled compounds get NO pushed timeline (track-only). `ExpectationTimelineCard`
    on compound-detail highlights the user's current week against the phase strip.
    Labeled-unverified per the sourcing ladder; curated + community percentiles later.
    i18n ×6.
16. **Lab upload + AI parse ✅ SHIPPED 2026-07-16.** Photo lab parse already existed;
    this added real **PDF parse** (ai-service v21 `parse_lab` accepts a base64 PDF as a
    document block; client `parseLabPdf` reads via expo-file-system, 4MB guard; the doc
    is never stored) and the **bloodwork-to-compound monitoring mapping**
    (`src/lib/lab-monitoring.ts`, 7 tests + `MonitoringMarkersCard` on compound-detail):
    per active compound, its bloodwork monitoring_tags with the latest imported value +
    recency, flagging never-checked and >90-day-stale markers. Posture evals re-run 4/4.
    i18n ×6. Vial scan stays deferred.
17. **"What should I measure next?" suggestions ✅ SHIPPED 2026-07-17.**
    `src/lib/measure-next.ts` (pure, 9 tests): `computeEvidenceGaps` ranks a stack's
    biggest evidence gaps — never-checked/overdue bloodwork markers (via
    lab-monitoring) above photo gaps (baseline missing or last shot past the
    compound's scientific cadence, via photo-cadence's new `groupForSlug`).
    `MeasureNextNudge` surfaces the top gap under the Today verdict and the top two
    as a "Strengthen the read" section on the Analysis reasoning screen; taps route
    to Photos or the lab importer. `measureNext.*` i18n ×6 (count plurals).
    (external review 2026-07-16)
18. **Uniform confidence register ✅ SHIPPED 2026-07-17.** `src/lib/confidence.ts`
    (pure, 2 tests): `ConfidenceLevel`, `levelFromScore` (canonical 0.4/0.75 cuts),
    `meterFilled`. Shared `ConfidenceBadge` (`src/components/confidence-badge.tsx`):
    monochrome three-dot instrument gauge, deliberately NOT the good/watch/bad signal
    palette (confidence is orthogonal to favourability); rationale-on-tap when supplied.
    Adopted on: verdict (engine now emits `confidenceRationale` in the same register —
    dashboard + reasoning recap), compound-info facts, per-compound attribution, and
    the photo analysis read (`photoReadLevel` from comparable + lighting + framing).
    `confidence.*` + `verdict.confidenceWhy.*` + `photos.confWhy*` i18n ×6. Forecasts +
    correlations fold into item 19 (they share the trajectory/uncertainty work; TRAJ-1's
    band adopts this same badge). (external review 2026-07-16)
19. **TRAJ-1 trajectory line ✅ SHIPPED 2026-07-17.** `src/lib/trajectory.ts`
    (pure, 9 tests): `projectSeries` = exponentially recency-weighted least-squares
    slope (recent days dominate), plateau flattening when the recent move sits inside
    the fit's own noise, and an uncertainty band that widens with distance from today
    (scaled by residual variance). `daysToTarget` reads the ETA off the same slope.
    LineChart gained `projected` (dotted continuation from the last real point),
    `band` (shaded wedge), and `goalValue` (target line); the weight chart on Analysis
    draws all three (21-day horizon). `weightForecast` in the verdict engine now runs
    on `projectSeries` + `daysToTarget`, so the hero figure and the chart never
    disagree. `insights.projected`/`projectedFlat` i18n ×6. Browser-verified: dotted
    descent + band render on the weight chart, no projection on other metrics. (round-3 §7)
20. **TRAJ-2 energy-balance calibration ✅ SHIPPED 2026-07-17.** `src/lib/energy-balance.ts`
    (pure, 6 tests): `computeEnergyBalance` solves personal maintenance (TDEE) from
    average logged intake minus the weight-change energy (~7700 kcal/kg), reusing
    TRAJ-1's `projectSeries` for the observed slope so nothing disagrees. When Health
    activity data flows it adds a device-bias multiplier (solved maintenance vs
    Mifflin BMR + reported active burn) and a disagreement-as-insight verdict
    (scale slower/faster than the logged intake implies → underlogging or adaptation).
    A recent-intake-shift hook (last 4 days vs the window) flags a change the scale
    hasn't caught up to. `EnergyBalanceCard` on Analysis surfaces maintenance + bias +
    the insight; self-gates to null below 5 logged intake days (graceful degradation
    to TRAJ-1 alone). `energyBalance.*` i18n ×6. Browser-verified: maintenance 2627 kcal
    + "eaten less lately, the scale lags" on a seeded declining series. The blended
    forecast line + proactive water-weight/step-drop anomaly hooks activate once the
    Health read (task #7, device build) lands the activity stream. (round-3 §7)

## Wave 5: training log + goal symmetry + narrative

21. **Training log ✅ SHIPPED 2026-07-17 (manual path).** `src/lib/strength.ts`
    (pure, 9 tests): tonnage, Epley `epley1RM`, `bestE1RM`, `totalReps`. Store:
    `StrengthSession` (movement + sets → derived tonnage/e1RM) + `Benchmark`
    (sport-agnostic name + freeform value) entities, add/delete actions, snapshot +
    merge-by-id wiring. `TrainingLog` widget in the detailed log (mode chip
    strength/benchmark, set builder with live tonnage + e1RM preview, recent list,
    long-press to remove); attaches to the logged day. `training.*` i18n ×6.
    Browser-verified: session renders "e1RM 117 kg · 2 sets" from 100×5, benchmark
    "5k run 25:30". **Deferred:** chat-parse for training (needs a `parse_log` kind +
    edge deploy + eval pass, kept off the current quick-log parse) and the
    coach-adjusted effort line (rides W3-8 coaching level). (round-3 §8; positioning §6)
22. **Gain-goal measurement emphasis + FFMI band [M].** Multiple extra measurements for
    gain goals; hedged FFMI range. (beta-notes §1.8)
23. **Transition tracking v1 + SM-1 [M].** Conditional goal chip (mtf/ftm), surfaced
    fields, direction-aware analysis block; plus the self-marketability pass (goal-first
    onboarding + store copy, non-PED paths first-class). (beta-notes §1.9; round-3 §2)
24. **Narrative timeline [M].** The signal ledger as a cross-metric chronological story
    ("Started TRT, sleep improved, strength up, hematocrit elevated, donation logged");
    the natural surface for attribution (14) and personal-history moments. Sequenced
    here because it renders what Wave 4 computes. (positioning §5.3)

## Wave 6: photo reel + sharing

25. **Reel phase 1 [M].** Multi-shot capture + camera-roll dump import + manual pose
    chips + reel view grouped by label. Required check-ins stay locked to the four
    relaxed poses; casual photos freeform. (beta-notes §1.3)
26. **Reel phase 2 [M].** Haiku auto-classification + confirm chips; session tabs
    removed. (beta-notes §1.1, §1.3)
27. **Share cards [S/M].** Branded stat card first, then photo export with watermark
    toggle in settings (off for photos, on for stat card); offered contextually after
    milestones/highscores. (beta-notes §1.4)
28. **Auto-crop via analysis bbox [S/M].** Torso crop box returned by analyze_photo,
    display-only, originals untouched. (beta-notes §1.2)
29. **Reel phase 3 [M/L].** Full timeline dump view, pose filters, per-pose ghost
    references. (beta-notes §1.3)
30. **Progress overlay prototype [M].** Exaggerated-interpretation overlay (lines /
    triangles / shading) rendered on progress photos. Blocked on owner sketches (see
    Blocked on owner); slots here once they land.

## Post-beta platform tracks (parallel, larger)

- **A. Web workbench [L].** One codebase, capability-class responsive layouts (the
  "Xbox test"), calendar-primary navigation, detailed-sheet retro editing incl. photo
  upload, custom chart builder with pinned sync to phone. (round-3 §1, §9)
- **B. Connectors [L].** One MCP server, OAuth 2.1/PKCE via Supabase Auth, two-way v1
  (reads + connector_event inbox writes), straight at both directories, photos excluded.
  (CONNECTORS-PLAN.md)
- **C. Monetization implementation.** Paid-only: auto-converting trial (StoreKit iOS /
  Stripe web), $19/mo + annual anchor; reconcile spec 12 + CLAUDE.md; trial-lapse
  behavior decided when freemium comes off the backburner. (round-3 §9)
- **D. HealthKit cycle read + Pepi cycle setup [M].** Category read to cycle metric;
  conversational setup for non-trackers. (beta-notes §1.7 steps 2-3)

## Deferred / backlog

Vial scan (AI vision; split from lab parsing, which is now item 16), normalized
per-entity sync engine + storage hardening, Terra (~500 users), storage quotas
(pricing-model dependent),
community cohort insights (needs aggregates + N thresholds), reptides/peptidebase
outreach (held), per-region posture overrides (data mechanism reserved, unused).

Cut 2026-07-16: **Drive backup (OAuth).** Continuous Supabase cloud backup (user_state
mirror) plus the manual data-export file already cover the backup need; a second OAuth
backup target adds integration surface without adding safety. Revisit only if a
no-account-ever user segment materially asks for it.

## Standing gates (every wave)

Green gate (typecheck / lint / i18n parity 6 locales / tests / web export); no
hardcoded strings; no em-dashes; trunk-based commit + push per completed chunk; surface
the EAS command after each push; posture eval suite before compound-info exposure;
flag native-rebuild requirements explicitly.

**Bias toward uncertainty (verdict rule, external review 2026-07-16).** One wrong
confident verdict damages trust more than ten correct ones build it. When evidence
conflicts or is thin, the verdict downgrades its confidence rather than picking a side;
evals for verdict-adjacent AI output test for overconfidence, not just correctness.
