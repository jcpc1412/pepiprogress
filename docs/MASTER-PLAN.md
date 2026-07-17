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

## Wave 4: compound intelligence + predictions (the differentiation wave)

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
15. **Expectation timelines [M].** Reported onset/peak/plateau curves vs the user's own.
    (positioning §3.2)
16. **Lab upload + AI parse [M].** Photo or PDF upload on the Logging surface (ISSUES
    H-06); AI vision extracts marker values into bloodwork fields; feeds the
    bloodwork-to-compound monitoring mapping (positioning §3 item 4). Vial scan stays
    deferred; the two are separate builds.
17. **"What should I measure next?" suggestions [S/M].** The verdict names its own
    biggest evidence gap: "a photo this week would strengthen this," "hematocrit was
    last checked 10 weeks ago." Sources: monitoring tags + photo cadence + bloodwork
    recency; surfaces on the verdict reasoning screen and as an offer-level nudge.
    (external review 2026-07-16)
18. **Uniform confidence register [S/M].** One shared confidence component
    (high/medium/low plus rationale on tap) applied everywhere Pepi concludes: verdict,
    photo analysis, correlations, forecasts, compound insights. TRAJ-1's uncertainty
    band adopts the same register. (external review 2026-07-16)
19. **TRAJ-1 trajectory line [M].** Recency-weighted slope, plateau detection, widening
    uncertainty band; weightForecast unified onto the same math. (round-3 §7)
20. **TRAJ-2 energy-balance calibration [M].** Personal TDEE from intake vs weight delta;
    per-user device-bias factor; blended forecast; disagreement-as-insight; proactive
    hooks (cheat-meal water weight, step drops). (round-3 §7)

## Wave 5: training log + goal symmetry + narrative

21. **Training log [M].** StrengthSession (tonnage, e1RM) + Benchmark (name/value/date)
    via chat parse + detailed-log widget; coach-adjusted effort at nudge/coach level.
    Sport-agnostic per the locked user rings. (round-3 §8; positioning §6)
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
