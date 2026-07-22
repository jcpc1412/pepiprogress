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

## Wave 5: training log + goal symmetry + narrative ✅ SHIPPED 2026-07-17

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
22. **Gain-goal measurement emphasis + FFMI band ✅ SHIPPED 2026-07-17.** Dedicated
    `chest`/`arms`/`thighs` check-in fields; the detailed-log measurement card surfaces
    all three (plus waist/hips) for gain intent (body_comp goal or a muscle-tagged
    compound), not just the single legacy extra slot. `ffmiBand` in body-composition.ts
    (pure, +3 tests): normalized FFMI derived from height + weight + the Navy body-fat
    *band*, returned as a hedged range (inverts the bf band); rendered under the
    measurements for gainers with a "not a medical measurement" hedge. `measurements.ffmi*`
    i18n ×6. Browser-verified: 82 kg/180 cm/waist 84/neck 39 → FFMI 20.6–22.7. (beta-notes §1.8)
23. **Transition tracking v1 ✅ SHIPPED 2026-07-17.** DB: `goal` enum gained
    `gender_transition` (migration `20260717221006`), applied + types regenerated;
    `user_profile.goals` column comment documents the k-anonymity exclusion so the
    V2 aggregation job (not built yet — `community_aggregate` has no populate job
    today) can't silently violate it later. **Conditional chip:** visible only when
    sex is mtf/ftm (or already selected), never preselected — in both onboarding and
    the post-onboarding Me settings editor. **Surfaced fields:** skin_notes, wellness
    (mood), libido, measurements. **Direction-aware verdict:** `resolveIntent` gained
    a goal+sex-derived `transitionDir`; hips reads up_good for mtf / down_good for
    ftm, overriding the generic cut/bulk rule for that metric specifically (9 new
    verdict-engine tests) — flows through `resolveMetricDirections`, the single
    source every surface including AI prompts reads from. **Direction-aware vision
    prompt:** extracted `supabase/functions/_shared/transition-context.ts` (mirrors
    the posture.ts reuse pattern) with a `transitionPromptLines(dir)` block applied
    to BOTH face and body sessions in `analyze_photo`; unit-tested on the literal
    prompt text (5 tests, zero API cost) rather than a live vision eval, which would
    need real photos this feature doesn't have — deployed as ai-service v22, posture
    evals re-run 4/4 clean. **Privacy:** a conditional note in Privacy settings states
    plainly that transition data is never in community aggregates regardless of the
    community-sharing toggle. Browser-verified: chip appears for mtf, hidden for a
    cis user with no prior selection. i18n ×6 (goalCat/goals/privacy keys).
    **SM-1 self-marketability, scoped down:** the goal-first onboarding + non-PED-
    first-class substance is already satisfied by prior shipped work (6 non-PED
    goals incl. sleep/recovery/wellness/skin, goals-first onboarding flow); the
    "store copy" portion (App Store listing copy) is an external marketing artifact,
    not app code — flagged here rather than silently dropped, left for the owner to
    commission separately. (beta-notes §1.9; round-3 §2)
24. **Narrative timeline ✅ SHIPPED 2026-07-17.** `src/lib/narrative.ts` (pure,
    8 tests): `buildNarrative` assembles a cross-metric chronological STORY from the
    store's own logged events — protocol starts, first symptom onsets, first lab
    readings per marker, strength PRs (strict e1RM improvements only), benchmarks,
    and analyzed photo notes — deduped to milestones (not a diary) and ordered
    oldest → newest. Emits STRUCTURED moments, never prose, so the engine stays
    pure/locale-agnostic and the UI owns all copy + unit formatting. Chronology
    only, never causation. `NarrativeTimeline` on the Analysis tab: a single dotted
    spine, moment kinds color-coded, self-gates below 2 moments. `narrative.*` i18n
    ×6. Browser-verified: "Started Testosterone → Hematocrit 45 → first acne → 5k
    benchmark → photo leaner → Estradiol 30 → Squat PR 140 kg." Wave 5 complete.
    (positioning §5.3)

## Wave 6: photo reel + sharing

25. **Reel phase 1 [M].** ✅ SHIPPED 2026-07-18. Multi-shot camera-roll dump import
    (`allowsMultipleSelection`) + manual pose chips at save + reel view grouped by
    pose label. `PhotoEntry` gained `pose`/`poseConfidence`/`isRequiredSet`; pure
    `photo-pose.ts` (`poseFromCapture` + `groupPhotosByPose`, +6 tests). In-app
    captures derive their pose (locked comparability set); imports land casual +
    untagged for one-tap classification. Required check-ins stay locked to the four
    relaxed poses; casual photos freeform. (beta-notes §1.3)
26. **Reel phase 2 [M].** ✅ SHIPPED 2026-07-18. Haiku auto-classification
    (`classify_pose`, ai-service v23, dump imports auto-classify sequentially,
    fails open) + confirm-chip flow (low-confidence reads surface an accent
    confirm affordance; any tap becomes ground truth) + **session tabs removed
    (26c, commit 77a8f48)**: owner chose the fully reel-centric shape, so the
    reel is the spine and a required-pose group drills into that track's
    compare/milestones ("close" returns). Capture split behind one chooser:
    GUIDED = pick one of the four canonical poses, which routes the camera
    (face → vision-camera, body → expo-camera + measurements), keeps the ghost,
    locks `isRequiredSet: true`; QUICK = casual back-cam shot, no measurements,
    pose left to background `classify_pose` so it lands in the reel for triage.
    Pure `sessionForPose`/`viewForPose` (+5 tests) derive track + angle from a
    pose. Custom parts stay reachable inside the focused body track. Device-
    verified on Android (chooser + reel). (beta-notes §1.1, §1.3)
26.5. **Live pose hybrid (inserted 2026-07-18, owner-decided).** ✅ SHIPPED
    (device test pending). No vision-camera-v5-compatible body-pose lib exists
    (mediapipe libs pin v4; mlkit plugin's pose is unreleased), so: FACE = real
    on-device yaw from the existing face detector → front/side ghost auto-swap
    with hysteresis + pose tag at shutter; BODY = silent low-res sampling
    (`shutterSound:false`, `animateShutter:false`) every 2.5s through
    `classify_pose` (max 10/session, stops when 2 consecutive reads agree) →
    ghost swap + save tag; CUSTOM PARTS = same sampling runs `check_fit` vs the
    part reference for a live match hint. Pure schedule/stability layer
    `src/lib/pose-live.ts` (+9 tests); per-pose ghost references (`ghostByPose`)
    in progress-photos. Offline/AI-off: fails open to manual chips. True native
    skeleton overlay stays a flagged future device-spike (revisit when the
    ecosystem ships a v5 pose plugin).
27. **Share cards ✅ SHIPPED 2026-07-18** (commit 3ac0cba). Pure `share-card.ts`
    (+14 tests) builds a consistency card: streak (one-day grace), days tracked,
    photo count, signed weight delta; zero signals omitted, not shown as zeros.
    **Privacy invariant:** compounds, doses, markers and symptoms are not
    reachable from `ShareCardInput`, so a controlled-compound protocol cannot
    leak in one tap; widening it is a product decision. `ShareSheet` rasterizes
    the exact preview shown (react-native-view-shot 5.1.0, added so it rides the
    pending auth rebuild) and hands off to the OS share sheet. Watermark defaults
    split by surface: on for the card, off for photos, both in Privacy settings.
    Offered on highscore, after a milestone read, and per-photo from the reel.
    (beta-notes §1.4)
28. **Auto-crop via analysis bbox ✅ SHIPPED 2026-07-18** (commit 86625d3).
    `analyze_photo` returns a normalized subject box in the same call (no extra
    cost). **Never destructive:** display crop only, original never re-encoded.
    Pure `photo-crop.ts` (+14 tests) is conservative because LLM boxes are not
    pixel-perfect: 0.6 confidence floor, 8% padding, edge clamping, fall back to
    full frame on degenerate/no-op boxes. `CroppedPhoto` applies it to timeline +
    reel thumbs and the baseline frame; the wipe compare is deliberately left
    uncropped (independent crops would desync the two halves). Fails open end to
    end. **ai-service deployed as v24 (2026-07-18); `eval:posture` 4/4.**
    (beta-notes §1.2)
29. **Reel phase 3 ✅ SHIPPED 2026-07-18** (commit d82626a). Photo-history dump
    view converted from stale Face/Body session filters to **pose filters**
    (including the `unsorted` bucket), pose badges on thumbnails, and W6-28 crops
    applied. `photos.filterSession` renamed to `photos.filterPose` ×6. Per-pose
    ghost references, the third leg, already shipped with 26.5. (beta-notes §1.3)
30. **Progress overlay prototype [M].** Exaggerated-interpretation overlay (lines /
    triangles / shading) rendered on progress photos. Blocked on owner sketches (see
    Blocked on owner); slots here once they land.

## Wave 7: Android beta hardening (all 10 items decided with owner 2026-07-18)

Source: `docs/notes/android-beta-notes-2026-07-18.md` (disclosure satisfied: every
bullet discussed and decided). Ordering inside the wave: auth/sync first (blocks
widening the tester pool), then the screen-by-screen design-system sweep, then chat;
the perf runtime profile runs in parallel from the start.

**Sweep status (2026-07-21):** The design sweep found the app already largely on the
system, so several checklist items were satisfied or near-satisfied. Done + shipped:
**35** (foundations: motion tokens/presets, padding architecture, 4 Journal primitives,
ARCHITECTURE census, lottie), **41b** (the Journal tab), **38** (Today's record strip +
logging-toggle removal), **37** (dialog anchor-Cancels → buttons; the Roboto-leak class
was already clean — no raw `<Text>` anywhere but the `ThemedText` wrapper), **40**
(signal-detail chip border tokenized). Audited, no code change needed: **36** (sex
selector already required; onboarding has zero hardcoded colors), **39/41/42** (already
tokened; the camera/photo overlays keep fixed light-on-black *by design* — they sit over
a live feed/photos, not the instrument surface). **Still owed, device-blocked:** the
Google official branded button (native `@react-native-google-signin` component, item 36),
the on-device dark-mode verification pass (checklist step d), and **44** (runtime perf
profiling, needs the Moto G60s-class device). These need the native rebuild.

**Sweep tail closed (2026-07-22):** item 36's Google branded button shipped in code
(`GoogleSigninButton` from `@react-native-google-signin`, Wide/Light, replaces the
custom Google `SocialButton` when `googleAuthAvailable`; the custom outlined button
stays as the web/unconfigured browser-OAuth fallback) — renders on the next native
build. Web dark-mode audit pass done (auth, onboarding, Today, Journal, Settings, both
schemes): no token drift or hardcoded-colour leaks; both co-equal themes invert
correctly. Tab-order slip fixed (Pepi moved before Photos, owner-confirmed). **Still
device-only:** on-device OLED dark-mode confirmation + **44** (perf profiling) — both
need the native build.

### 7A. Auth/sync hardening (notes §3, §4, §5)

31. **Google sign-in return leg [S/M].** Fix the redirect dead-end (flow ends on
    `http://localhost:3000/#access_token=...`): make the native `GoogleSignin` path the
    one that actually runs on device (no redirect at all), fix the browser-fallback
    deep-link return, and purge `localhost:3000` from the Supabase redirect allow-list.
    While in there, **verify the Apple sign-in config end to end** (native bundle-id
    path + web Services ID/secret) since it shares the same plumbing. Custom-domain
    branding explicitly deferred to the Branding track (E) — owner accepts the
    `supabase.co` leak during closed beta.
32. **Cross-device photo restore [M].** Storage hardening pulled forward from backlog
    (owner: option A). On restore/sign-in, `cloudPath` → signed URL becomes the source
    of truth for any photo whose local URI does not resolve; download-on-demand with
    cached local copies. Fixes "7 photos, none render" on a second device.
33. **Sign-out semantics [S].** ✅ SHIPPED 2026-07-19. Owner: option B. Audited the
    existing session/store code first: `signOut()` already ended the Supabase session
    (+ best-effort native Google sign-out) without touching local state, and
    `AccountSection` already re-rendered to the signed-out card once `user` went null
    — the underlying semantics were already correct, nothing to rebuild. What was
    actually missing: the sign-out link had no confirmation (a mis-tap silently ended
    the session) and no stated "your data stays" behavior, and a failed `signOut()`
    call was swallowed with no feedback. Added an `Alert.alert` confirm (matching the
    existing `privacy.deleteAll` pattern) stating local data is kept, plus an error
    alert on failure. No in-app erase option: wiping means deleting the app.

### 7B. Dose drawer (notes §6)

34. **Dose logging drawer [M].** ✅ SHIPPED 2026-07-19. Owner: option A — the drawer
    **replaces** tap-to-confirm as the default dose-logging surface. Compound name,
    dose seeded from the protocol and fully editable, date + time via **native**
    pickers (`@react-native-community/datetimepicker`, already a dep). Pure
    `dose-draft.ts` (+20 tests): `parseDoseInput` (comma decimals, rejects `12mg`,
    zero, negatives and `1e5`), `combineDateTime` (local-calendar anchored),
    `clampToNow` (no future doses, mirrors the check-in rule), `protocolChangePrompt`.
    The "apply to all future doses?" question is asked **in the drawer, only when the
    typed amount actually differs**, defaults to **this dose only**, and a yes patches
    the protocol item forward — logged history is never rewritten (stated in the copy
    too). P-04 schedule anchoring now keys off the **drafted** dose day rather than
    today, since a dose can be logged for yesterday. Browser-verified end to end:
    prompt fires on 250→300, dose writes with the drafted timestamp, protocol updates
    only on explicit choice.

### 7C. Design-system enforcement, screen by screen (notes §1, §2, §7, §8)

Foundations first, then one step per screen. Each screen step applies the same
checklist: (a) convert stray anchors/`Text` actions to `PrimaryButton`/`SecondaryButton`
(primary = black on light / white on dark; secondary = near-background shade), text
links legit only for inline navigation; (b) every string through `ThemedText` (kills
the Roboto leak); (c) padding audit against the documented scale; (d) theme-token audit
(no drifted colors, both themes checked on-device dark mode).

35. **Foundations [M].** `PrimaryButton`/`SecondaryButton` components on the design
    tokens; **padding architecture documented in DESIGN.md** (padding token set tied to
    `Spacing`, per-component minimums, e.g. button text never touches a chamfer edge);
    fix the permission-button padding as the reference implementation (notes §8).
    **+ Motion foundations (F2, owner decision 2026-07-26):** motion is first-class
    across the whole app, applied during this sweep so each screen is visited once.
    Motion tokens (durations, easings, standard enter/exit/layout patterns) in
    `theme.ts`; `expo-haptics` feedback paired with confirmation moments;
    `react-native-reanimated` (already a dep) is the engine for transitions/undo/most
    micro-interactions; **`lottie-react-native` approved** for designer-made
    confirmation animations (Apache-2.0; native rebuild required, batch with the next
    device build).
    **+ Architecture inventory (owner request 2026-07-26):** create
    `docs/ARCHITECTURE.md` during this pass, a census of every reusable thing:
    components, stores, pure libs, hooks, motion/haptic patterns, one line each on
    what it is and who uses it. Purpose: cheap context loading for future sessions,
    prevent stray duplicates (reuse existing stores/components/buttons), and feed the
    optimization pass (item 44). Items 36-42 update it as they sweep each screen; then
    it becomes a **standing gate**: any new reusable thing adds its line in the same
    commit.
    **+ Journal primitives (F4 merge, owner decision 2026-07-21):** the Journal
    screen (item 41b) introduces four reusable components; build them here so the
    Journal is normalized by construction and other screens can adopt them:
    **source badge** (HEALTH / PEPI / QUICK / TYPICAL / TAP provenance chip),
    **completeness dot-meter** (filled/empty dots, "N of M areas" — no percentages,
    no streaks, spec-03 no-shame), **week strip** (7-day nav, green dot = logged /
    empty ring = no log), and **value-row-with-badge** (label · value · source).
    Item 35 → the Journal is a hard dependency (it both consumes foundations and
    contributes these primitives).
36. **Onboarding [M].** Owner: 1c + 2a. **Vendor social buttons** (Apple's official
    `AppleAuthenticationButton` everywhere it renders, Google's official branded button
    from `@react-native-google-signin`) replacing the custom `SocialButton`; fix the
    dark-mode contrast tokens; unify onboarding onto the main theme tokens (audit for
    drift); **remove the "optional" flag from the sex selector**. Then the standard
    per-screen checklist.
37. **Auth screen + shared dialogs [S].** The "log a photo" dialog (Roboto + anchor
    Cancel) is the flagship fix; sweep all shared modals/dialogs. Checklist.
38. **Home/Today (check-in + quick-log) [S/M].** Checklist. **+ F4 Today changes
    (merged in so Today is visited once):** add the one-line **"Today's record"
    strip** (distillation line + completeness dot-meter + chevron → Journal tab),
    placed **above** Today's Doses (owner 2026-07-21); drop the **Quick/Detailed
    toggle** on the Log screen (Log becomes quick-only; "detailed" is now inline
    editing on the Journal). The `building` verdict state is unchanged.
39. **Pepi chat [S].** Checklist (pairs with item 42).
40. **Analysis [S].** Checklist.
41. **Photos (reel, capture, review, history) [M].** Checklist.
41b. **Journal — new screen (F4 build, merged into the sweep) [M].** Build on the
    item-35 foundations, so it is normalized by construction and needs no second
    pass. Fifth tab, **order: Today · Pepi · Photos · Analysis · Journal** (owner
    2026-07-21). A read/edit view over the day's existing entities (checkin + doses
    + symptoms + photos; metric readings shown, snapshot-sourced), assembled — never
    a second write surface, so nothing is logged twice. Sections: **week strip**
    (history nav; green=logged / empty=no log), **"the day, distilled"** header (the
    AI prose summary; degrades gracefully when sparse, describes what IS there, never
    scolds what isn't), an **F5 photo-read** card (discovery lives here too, giving a
    reason to open that isn't data entry), **check-in / doses / symptoms / photos**
    rows with **source badges** + quiet `add` links, one understated "+ add to this
    day". **Inherits the day-stepper/backfill role and becomes the history browser**,
    letting the check-in's separate history list dissolve. Deep-link target for
    notifications + Pepi's "I noticed" + post-quick-log confirmations (F5/Q5). Anti-
    chore framing: everything reads as already done for you (source provenance,
    completeness dots, no streaks). Live mock: `.preview-mockup/journal.html`.
42. **Protocol + settings screens** (protocol, inventory, notification / privacy /
    cycle / integration / typical-day settings) **[M].** Checklist. Closes the sweep;
    a final pass verifies no screen was missed (incl. the new Journal).

### 7D. Pepi chat behavior (notes §10)

43. **Suggestion pills + keyboard [S/M].** ✅ SHIPPED 2026-07-19. Pure
    `chat-pills.ts` (+11 tests): `shouldShowPills` (cold screen → show; any draft
    text → hide; active exchange under `PILL_IDLE_MS` 10s → hide; quiet + empty →
    show) and `msUntilPillsReturn`, so the screen schedules **one** wake-up at the
    moment the pills fall due instead of polling. Chips that answer a question Pepi
    just asked (micro check-in, anomaly mute, typical yes/no) are the interaction
    itself and are exempt via `activeChipFlow`. The old `keyboardUp` gate is gone,
    since visibility now follows the exchange rather than the keyboard. Decided
    while building: a draft left sitting keeps the pills hidden however long the
    silence, because that is someone composing, not someone stuck.
    Browser-verified all four states incl. the real 10s timer.
    **Android keyboard:** root cause was config, not the component. The Expo
    keyboard guide states Android needs no `behavior` on `KeyboardAvoidingView`
    (already correct) but that bottom-tab apps must set
    `android.softwareKeyboardLayoutMode`, which was **unset** (defaulting to
    `resize`, which does not lift the composer under edge-to-edge). Set to `"pan"`.
    Also deduped the doubled CAMERA/RECORD_AUDIO permissions found in the same
    block. ⚠️ **Needs the pending native rebuild + device check** (config change,
    unverifiable on web); re-verify the previously-flagged iPhone behavior then too.

### 7E. Android performance, two independent tracks (notes §9, flag B)

44. **Runtime track [M] — profile first.** React profiler + render-count audit on
    device (Moto G60s class): store-context re-render storms, `useResolvedUris` over
    all photos, unmemoized lists, instrument SVG/chamfer cost, navigation transitions.
    Fix what the profile shows, nothing speculative. Starts in parallel with 7A.
45. **Build track [S to blocked].** Determine what AGP Expo SDK 56 actually pins;
    enable R8 full mode / shrinking / ProGuard rules if available without an AGP 9
    jump. If blocked by the pin, it waits for the next Expo SDK bump — no ejecting.
    Play Console currently: optimization Low, obfuscation 1%.
46. **Day-boundary staleness [S] ✅ SHIPPED 2026-07-19.** Pure `day-boundary.ts`
    (+7 tests: DST-safe via local date parts, month/year/leap-day rollover, always
    positive so the timer cannot loop, under the setTimeout ceiling) + a
    `TodayProvider`/`useToday()` in `src/lib/today.tsx` mounted in the root layout.
    One watcher covers both paths: a rescheduling midnight timer (app open across
    midnight) and an `AppState` foreground check (app suspended across midnight),
    and it only moves the value when the day genuinely changed. 13 render-time
    `localDateKey()` call sites migrated to `useToday()`, incl. memoized ones where
    a stale day was baked into a `useMemo`. **Two clock reads a `localDateKey`
    grep would have missed:** the Home eyebrow built its date from a raw
    `new Date()` inside a memo (the visible symptom), and TodayDoses derived its
    weekday-due check the same way, which would have shown yesterday's schedule.
    Browser-verified: header goes 19 JUL → 20 JUL on foreground with the clock
    advanced. Original note below.

    Not a performance
    bug — filed here at owner's request, kept distinct so it isn't conflated with
    44/45. The app never fully closes on Android/iOS, so a screen left open
    overnight keeps rendering yesterday's "today": `localDateKey()` itself is pure
    and always correct at call time (`src/lib/dates.ts`), but nothing forces
    already-mounted screens (Home, check-in, doses) to re-render when the local
    calendar day rolls over while backgrounded — the existing `AppState` listeners
    (`integration-sync.tsx`, `notification-manager.tsx`) only refire their own
    fetch/notification logic, not a general re-render. Fix: a shared day-boundary
    watcher — on every foreground transition, compare the current
    `localDateKey()` to the last-seen one and, if it changed, bump a shared
    "today" value in the store so date-derived screens re-render onto the new
    day. One hook, reused by the screens that call `localDateKey()` for "today"
    rather than a fix per screen.

## Wave 8: connectors (moved into beta 2026-07-21)

One remote MCP server serving both ChatGPT apps and Claude connectors (both converged
on MCP): one OAuth 2.1/PKCE flow via Supabase Auth, two thin platform skins, no fork.
Detail spec: `CONNECTORS-PLAN.md`. **Backend-only — depends on nothing in the 35-42
sweep** (it reads the verdict engine + store entities that already exist), so B0/B1
can run in parallel with the sweep; placed here for one-thing-at-a-time sequencing, but
free to interleave. B2's directory review is the long pole.

47. **B0. Server + auth + inbox [M/L].** Remote MCP server (first choice: a Supabase
    Edge Function on MCP streamable-HTTP, same Deno infra as `ai-service`; fall back to
    a small dedicated Deno host if the transport fights edge functions). Supabase Auth
    as the OAuth 2.1/PKCE provider so **owner-only RLS does all data scoping for free**;
    the server never hand-rolls access control. RLS-scoped read path. **`connector_event`
    inbox table + app-side foreground merge** (append-only, device is the merger, so
    writes are conflict-safe without touching the snapshot the next device mirror would
    clobber) — on the critical path because v1 is two-way, and the same primitive remote
    push will later need. No new gates: auth + cloud sync already exist (M1).
48. **B1. Tool surface, two-way [M].** Reads: `get_today`, `get_verdict`,
    `get_recent_logs`, `get_protocol`, `get_compound_info`. Writes via the inbox:
    `log_dose`, `log_checkin`, `log_symptom`, `log_weight` (same entities the quick-log
    parser writes; the platform model formulates the structured call, so this costs us
    no AI tokens). **Posture gate rides along:** outputs are `market_category`-gated
    exactly like `ai-service` — reuse/extend the shared `_shared/posture.ts` module
    (shipped item 12) so the edge function and the MCP server import one gate;
    controlled = track-only, OTC = hedged + contraindication pointer. **Photos excluded,
    full stop** (text-only; never leave the hardened bucket to third-party models).
    Tool descriptions state the last-app-open freshness limit so the assistant can't
    report stale data as live. Validate in ChatGPT developer mode + Claude custom
    connector as the **test harness**. Gate: the spec-05 eval suite gains a fifth
    boundary (connector tool outputs) before exposure.
49. **B2. Directory launch [M].** Both submissions at once — OpenAI identity/business
    verification + review, Anthropic connector-directory review. The peptide-app review
    scrutiny ("is this a steroid app?", same as App Store review) is on the critical
    path here; the `market_category` posture gates are the defense, review readiness is
    the gate. Custom connector stays as the rejection fallback, not the primary channel.
50. **B3. Widgets [M].** ChatGPT Apps SDK components — a Today card and a Verdict card,
    matching the instrument design language where their component system allows.

Pairs with track F (sync engine): the `connector_event` inbox is the pragmatic v1
writer; when F lands, connectors become just another writer and the inbox folds into
it. Re-verify the young SDK docs (developers.openai.com/apps-sdk, Claude custom-
connector guide) at build time.

## Post-beta platform tracks (parallel, larger)

- **A. Web workbench [L].** One codebase, capability-class responsive layouts (the
  "Xbox test"), calendar-primary navigation, detailed-sheet retro editing incl. photo
  upload, custom chart builder with pinned sync to phone. (round-3 §1, §9)
- **B. Connectors** — **moved into the beta sequence as Wave 8** (owner 2026-07-21).
  See that wave for the B0-B3 phasing.
- **C. Monetization implementation.** Paid-only: auto-converting trial (StoreKit iOS /
  Stripe web), $19/mo + annual anchor; reconcile spec 12 + CLAUDE.md; trial-lapse
  behavior decided when freemium comes off the backburner. (round-3 §9)
- **D. HealthKit cycle read + Pepi cycle setup [M].** Category read to cycle metric;
  conversational setup for non-trackers. (beta-notes §1.7 steps 2-3)
- **E. Branding round (owner-directed 2026-07-18).** One coordinated pass, before the
  tester pool widens or at public launch at the latest, folding together everything
  that carries the Pepi name outward: **custom domain in front of Supabase Auth** (paid
  add-on; kills the `pjdbxnycrvibmebfumel.supabase.co` leak in Google's OAuth consent +
  notification email), **auth email templates** (confirmation / magic-link / reset,
  owner writes the copy), and the **website** (pairs with track A's web workbench; the
  marketing site and the workbench share the domain). ⚠️ Carries android-notes flag A:
  the domain switch changes the callback URL in Google Cloud console, the Apple
  Services ID return URL (which likely forces regenerating the Apple client secret,
  see memory `apple-oauth-secret-renewal`), and the Supabase redirect allow-list — all
  must land in one window or sign-in breaks mid-beta.
- **F. Full per-entity sync engine (spec 10 "Option B") [L] — paired with track A.**
  Owner decision 2026-07-21: F6's one-way mirror ships first; this is the eventual
  bidirectional engine (field-level conflict resolution, tombstones, SQLite/MMKV)
  that replaces the snapshot as the merge mechanism. Why it pairs with track A:
  the snapshot's last-write-wins merge handles *sequential* multi-device fine
  (phone morning, desktop evening), but clobbers changes under *concurrent*
  editing — and the web workbench is exactly what makes phone + desktop open
  simultaneously a normal pattern. When A ships, F becomes a priority; F6's
  `client_id`/`updated_at` schema work is the prerequisite and carries over.

## Deferred / backlog

Vial scan (AI vision; split from lab parsing, which is now item 16), storage
hardening (the sync engine itself graduated: one-way mirror = F6, full engine =
post-beta track F), Terra (~500 users), storage quotas (pricing-model dependent),
community cohort insights (needs aggregates + N thresholds), reptides/peptidebase
outreach (held), per-region posture overrides (data mechanism reserved, unused).

Cut 2026-07-16: **Drive backup (OAuth).** Continuous Supabase cloud backup (user_state
mirror) plus the manual data-export file already cover the backup need; a second OAuth
backup target adds integration surface without adding safety. Revisit only if a
no-account-ever user segment materially asks for it.

## F items (captured 2026-07-19, scoped with owner 2026-07-26)

Discussion held 2026-07-26. F2 and F3 are **decided** (detail below and, for F2,
folded into item 35). F4 is decided at the architecture level but its **UX/nav is
explicitly open** and needs a dedicated mock-up session before any implementation.
F1 is pending an owner retry.

### F1. EAS Android auto-submit permission error ✅ RESOLVED, owner-verified 2026-07-26
Root cause: Google Cloud IAM Owner role is not sufficient; Play Console has its
own separate Users & permissions grant. Owner added the service account to
**both** consoles on 2026-07-19; a subsequent production build with
`--auto-submit` completed successfully. `eas build --platform android --profile
production --auto-submit` is confirmed working end-to-end for future releases.

### F2. Motion + animation ✅ DECIDED — folded into Wave 7 item 35
Owner decisions (2026-07-26): motion is **first-class, applied everywhere** with
haptics, done during the 35-42 sweep so every screen is visited once; add
**lottie-react-native** (Apache-2.0) for confirmation animations; everything else on
the already-installed `react-native-reanimated` + `expo-haptics`. Licensing survey
result: the whole candidate set (reanimated MIT, moti MIT, lottie Apache-2.0,
gesture-handler MIT) is safe for a paid closed-source app; moti skipped as
unnecessary sugar. Includes the **`docs/ARCHITECTURE.md` inventory** deliverable
(see item 35).

### F3. Deterministic quick-log pre-parse ✅ SHIPPED 2026-07-26
`src/lib/quick-log-deterministic.ts` (pure, 33 tests) + `quick-log-vocab.ts`
(i18n/protocol-driven vocabulary) + runner wiring + hidden path tally in the
store. Browser-verified both paths: a mixed weight/scale/dose message applied
three items with no network call; prose escalated to Haiku untouched. Built to
the decisions below.

Owner decisions (2026-07-26):
- Pure lib `quick-log-deterministic.ts` (fully tested) running **before**
  `parseQuickLog`. **Strict whole-message matching only**: the entire input must
  match a known pattern (field keyword + number + optional unit); any leftover words
  escalate to AI untouched. Kills false-positive risk ("weight felt heavy today"
  never matches).
- **Locale-aware**: keyword tables for all 6 locales, driven from the i18n catalog
  so parity is enforced; comma decimals supported (pattern already solved in
  `dose-draft.ts`).
- **Scope v1**: weight, measurements (waist/hips), simple 1-5 scale logs
  ("sleep 4"), **and doses** via exact whole-message match against the user's own
  protocol item names + bundled catalog names + a small alias table ("sema",
  "tirz", "bpc"...). Dose/unit must match the protocol or be explicitly stated.
  Anything ambiguous (unknown word, two candidate items, odd unit) escalates to AI.
  Rationale for strictness: a wrong dose match has a big blast radius (dose event +
  wrong-vial inventory decrement + P-04 schedule anchoring).
- **UX parity**: matched logs get the identical undo toast; the user never knows
  which path ran. Bonus: matched patterns log instantly and work offline.
- **Hidden telemetry counter** (deterministic vs AI path) in the local store, not
  user-visible, to measure real coverage instead of guessing.

### F4. "Journal" (day in review) — design session DONE, merged into the 35-42 sweep
Architecture (owner-confirmed 2026-07-26): the detailed log stops being a second
write surface and becomes a **read/edit view over the day's existing entities**
(checkin + doses + symptoms + metric readings + photos). Quick-log (post-F3), Pepi
chat, and integrations already write those entities, so the page shows the day
assembled and nothing is ever logged twice, by construction. Distillation stays what
it is (the AI prose summary) and becomes the page's header. Inherits the
day-stepper/backfill role and becomes the history browser (the check-in's separate
history list dissolves).

**Design session ✅ DONE 2026-07-21** (live mock `.preview-mockup/journal.html`).
Resolved decisions:
- **It's a fifth tab named "Journal"** (not a tap-through from a Home card — owner
  flagged that as frail, confirmed by code: the distillation currently hides inside
  the "see the reasoning" screen). No floating chat widget: a persistent tab bar
  already is an always-one-tap surface, a bubble only occludes the photo reel and
  fights the instrument design language. Pepi stays a full page.
- **Tab order: Today · Pepi · Photos · Analysis · Journal** (journal last).
  Confirmed by owner 2026-07-22 during the 35-42 sweep tail: the code had shipped
  Photos before Pepi (a slip when the Journal tab was appended); reordered to put
  Pepi in slot 2 to match this decision.
- **History nav: week strip** (green dot = logged day, empty ring = no log), not the
  stepper arrows.
- **On Today:** one-line "Today's record" strip **above** Today's Doses. Today is
  otherwise unchanged now; a fuller Today rework is deferred (owner, later).
- **Anti-chore signaling:** source badges (HEALTH/PEPI/QUICK/TYPICAL/TAP),
  completeness dots ("N of M areas", no percentages/streaks), F5 discoveries surface
  here. The `building` **verdict stays a Today concept**; the Journal never says
  "baseline", it describes the day and degrades gracefully when sparse.
- **Home-becomes-review rejected** (would double-purpose Today and bury the verdict);
  configurable/modular Home rejected for beta (curation over configuration).

**No longer a separate phase — merged into the design sweep to avoid double work**
(owner 2026-07-21): item 35 builds the four new primitives (source badge,
completeness dot-meter, week strip, value-row-with-badge); the Today record strip +
Log-screen toggle removal ride **item 38** (Home visited once); the Journal is built
as **item 41b** on the foundations (normalized by construction, no second pass).
Every screen incl. the new Journal is touched exactly once.

### F5. Crown-jewel photo analysis ✅ SHIPPED 2026-07-26 (ai-service v25)
Owner direction (via an external product-architect review the owner endorsed): the
photo analysis should make people "addicted to discovering something new," not to
praise. Encouragement gets old; discovery doesn't. Current reality confirmed in
code: `analyze_photo` is stateless (two 768px images + a few scalars, one hedged
sentence out, no memory), the cheap Haiku tier ironically receives more history
than the expensive Sonnet tier, and custom/casual poses are locked out of analysis
entirely (`photo-pose.ts`).

**North star (owner-locked 2026-07-26):** every analysis surfaces a true, specific
thing about the user's body they couldn't have seen alone, connected to what they
did. If an output can't clear that bar, it says so honestly instead of padding
with praise. The register is always hypothesis, never conclusion ("consistent
with", "may suggest") — this is the same posture as the standing
bias-toward-uncertainty rule, so the crown-jewel direction and the safety gate
point the same way. Honest capability line: region-level relative observations and
cross-signal reasoning are real; pixel-precise claims (vascularity detail) and
water-vs-fat-vs-glycogen certainty are not, and stay hypothesis-framed forever.

Owner decisions (2026-07-26):
1. **Goal statement locked** (above) — confidence-in-actions and
   seeing-the-unseen are the same thing at this altitude.
2. **Pepi may proactively open a chat** with a discovery ("I noticed…"), reusing
   the local-notification + deep-link pattern (as typical-day does). Where
   discoveries also surface in the day-in-review is settled in the F4 design
   session, not twice.
3. **Observation ledger privacy:** local-first store + `user_state` snapshot sync
   like everything else; never in community aggregates. No photo-bucket-grade
   hardening needed (observations are derived text, not images).
4. **Quality over cost:** the scientific tier gets bigger images, more context,
   richer output, and the capable model; corners get cut elsewhere, never here.
   Cadence caps already bound total spend.

Architecture (four pieces, dependency order):
- **A. Structured observations:** output schema grows from `change: string` to
  per-region observations (region, apparent change, direction, confidence) + one
  cross-signal hypothesis + one "what to watch next time." Observations become
  data, renderable as discovery and storable.
- **B. Observation ledger:** persist each analysis's observations per pose track;
  every new call receives the last N for its track, so the model can confirm,
  extend, or drop earlier hypotheses. The single highest-leverage piece — it's
  what makes Pepi appear to know *this* user's body, with zero training. "This is
  the pose where X changes first" later becomes a query over this ledger.
- **C. Context fusion:** the same call gets weight trend over the window,
  protein/calorie adherence, dose timing vs photo, sleep, cycle phase — the
  "abs sharper despite stable weight" connections are impossible without this and
  nearly automatic with it.
- **D. Custom poses join analysis:** a user can promote a custom pose to a
  *tracked* pose (ghost + consistency machinery like canonical poses); tracked
  custom poses get their own ledger thread. The "best angle" dopamine lands here.

Implementation defaults (flag before changing): scientific-tier image resolution
raised (~1536px) per decision 4; vision model stays behind `AI_VISION_MODEL` with
a bake-off once the eval set exists; the Haiku encouragement tier survives as the
short-cadence touchpoint but inherits the ledger so its notes reference real past
discoveries instead of generic warmth; **a fixed photo-pair eval set is built
before hard prompt iteration** (bias-toward-uncertainty gate: changes must be
provably better, not just different).

### F6. Normalized cloud mirror ✅ (built 2026-07-22)
Shipped as scoped. Migration `20260722160000_normalized_mirror_f6.sql` (applied
+ types regenerated): `client_id` + `updated_at` + unique `(user_id, client_id)`
on dose/symptom/inventory/protocol/protocol_item, plus the gap-fill columns
(log_entry nutrition + structured measurements; dose_event slot_key/extra;
protocol_item dose_days/started_at/schedule_anchor/concentration; inventory
amount_initial). Pure diff core `src/lib/normalized-mirror.ts` (hash-based dirty
detection + delete-by-key, 14 tests); impure writer `mirrorEntities` in
`src/lib/sync.ts` (idempotent upserts + hard-delete, one code path shared with
`migrateToCloud`, which now delegates to it); driver `NormalizedMirror`
(`normalized-mirror-runner.tsx`) mounted beside CloudSync, debounced + AppState
flush. Photos keep their own path (`PhotoSync`); the migrate photo INSERT was
removed so it can't duplicate. Consent gate stays at aggregation (rows are
owner-only RLS; the mirror always runs). Pure JS + one migration; no native
rebuild.

Original scope (for reference):
Found during the all-tables sanity check: every normalized table is empty except
`user_profile` + the seed catalog, because `migrateToCloud` runs exactly once at
sign-up (owner's account was empty then) and everything since flows only to the
`user_state` snapshot. Data is safe (snapshot restore works); but community
aggregates have nothing to read and the only cloud copy is one JSON blob. Owner's
"why now" (Q6): **verify the community pipeline works end-to-end before spending
money on marketing.**

Owner decisions (2026-07-21):
1. **Option A: one-way normalized mirror.** Snapshot stays the source of truth
   for restore/merge (unchanged). The client additionally mirrors changed
   entities up into the normalized tables: best-effort, debounced, idempotent
   upserts, never flowing back down (so no conflict resolution needed). Option B
   (full per-entity sync engine, spec 10) stays deferred — see the note under
   post-beta tracks; A's schema work is B's prerequisite, nothing is thrown away.
2. **Metric readings excluded from v1** — snapshot keeps carrying them; the
   typical-day community exclusion ("metricReadings never migrate to normalized
   tables") stays intact. Wearable data in community insights would be its own
   consent conversation.
3. **Entity scope v1:** check-ins (`log_entry`), doses, symptoms,
   protocol + items, inventory. Snapshot-only (unchanged): metric readings, Pepi
   chat, observation ledger, strength/benchmarks, context notes, quick-log queue.
   Photos already have their own per-entity path (`PhotoSync` → `photo` row).
4. **Consent gate stays at aggregation**, not storage: rows are owner-only RLS,
   the mirror always runs, `consentCommunity` gates what aggregation may read.
   Matches the "stored, not trained on" messaging.
5. **Sequencing:** next item after the device-fix verification (photo upload +
   quality score), before the 35-42 sweep continues.

Implementation shape (from the schema audit, 2026-07-21):
- **Migration:** `client_id` (local id, unique per user) on `dose_event`,
  `symptom_event`, `inventory_item`, `protocol_item` for idempotent upserts +
  delete-by-id; `updated_at` where missing. `log_entry` keeps its natural key
  (`user_id, date`).
- **Schema gap-fill:** `log_entry` += protein, calories, structured measurements
  (waist/hips/neck/chest/arms/thighs + extra); `dose_event` += `slot_key`,
  `extra`; `protocol_item` += `dose_days`, `started_at`, `schedule_anchor`,
  `concentration`. Without these, community aggregation over nutrition/schedules
  is impossible.
- **Mirror module:** pure diff core (hash-based dirty detection, `writtenHashes`
  pattern) + a `NormalizedMirror` component beside `CloudSync` reusing its
  debounce/AppState pattern. First pass mirrors the whole backlog, then
  incremental. Local deletes hard-delete by `client_id` (tombstones are
  Option-B machinery).
- Pure JS + one migration; no native rebuild.

**Agreed sequencing:** F1 ✅ → F3 ✅ → F5 ✅ → F4 design session ✅ →
**F6 (normalized mirror)** → the 35-42 sweep, which now carries F2 (motion) *and*
F4 (Today record strip in item 38, Journal as item 41b) so nothing is built then
re-normalized. F4 no longer has a separate implementation phase; it lives inside
the sweep. F5 landed before the Journal so it can surface discoveries from day one.

## Standing gates (every wave)

Green gate (typecheck / lint / i18n parity 6 locales / tests / web export); no
hardcoded strings; no em-dashes; trunk-based commit + push per completed chunk; surface
the EAS command after each push; posture eval suite before compound-info exposure;
flag native-rebuild requirements explicitly.

**Bias toward uncertainty (verdict rule, external review 2026-07-16).** One wrong
confident verdict damages trust more than ten correct ones build it. When evidence
conflicts or is thin, the verdict downgrades its confidence rather than picking a side;
evals for verdict-adjacent AI output test for overconfidence, not just correctness.
