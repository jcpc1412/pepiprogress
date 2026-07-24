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
    biggest evidence gaps, never-checked/overdue bloodwork markers (via
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
    Adopted on: verdict (engine now emits `confidenceRationale` in the same register,
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
    V2 aggregation job (not built yet, `community_aggregate` has no populate job
    today) can't silently violate it later. **Conditional chip:** visible only when
    sex is mtf/ftm (or already selected), never preselected, in both onboarding and
    the post-onboarding Me settings editor. **Surfaced fields:** skin_notes, wellness
    (mood), libido, measurements. **Direction-aware verdict:** `resolveIntent` gained
    a goal+sex-derived `transitionDir`; hips reads up_good for mtf / down_good for
    ftm, overriding the generic cut/bulk rule for that metric specifically (9 new
    verdict-engine tests), flows through `resolveMetricDirections`, the single
    source every surface including AI prompts reads from. **Direction-aware vision
    prompt:** extracted `supabase/functions/_shared/transition-context.ts` (mirrors
    the posture.ts reuse pattern) with a `transitionPromptLines(dir)` block applied
    to BOTH face and body sessions in `analyze_photo`; unit-tested on the literal
    prompt text (5 tests, zero API cost) rather than a live vision eval, which would
    need real photos this feature doesn't have, deployed as ai-service v22, posture
    evals re-run 4/4 clean. **Privacy:** a conditional note in Privacy settings states
    plainly that transition data is never in community aggregates regardless of the
    community-sharing toggle. Browser-verified: chip appears for mtf, hidden for a
    cis user with no prior selection. i18n ×6 (goalCat/goals/privacy keys).
    **SM-1 self-marketability, scoped down:** the goal-first onboarding + non-PED-
    first-class substance is already satisfied by prior shipped work (6 non-PED
    goals incl. sleep/recovery/wellness/skin, goals-first onboarding flow); the
    "store copy" portion (App Store listing copy) is an external marketing artifact,
    not app code, flagged here rather than silently dropped, left for the owner to
    commission separately. (beta-notes §1.9; round-3 §2)
24. **Narrative timeline ✅ SHIPPED 2026-07-17.** `src/lib/narrative.ts` (pure,
    8 tests): `buildNarrative` assembles a cross-metric chronological STORY from the
    store's own logged events, protocol starts, first symptom onsets, first lab
    readings per marker, strength PRs (strict e1RM improvements only), benchmarks,
    and analyzed photo notes, deduped to milestones (not a diary) and ordered
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
was already clean, no raw `<Text>` anywhere but the `ThemedText` wrapper), **40**
(signal-detail chip border tokenized). Audited, no code change needed: **36** (sex
selector already required; onboarding has zero hardcoded colors), **39/41/42** (already
tokened; the camera/photo overlays keep fixed light-on-black *by design*, they sit over
a live feed/photos, not the instrument surface). **Still owed, device-blocked:** the
Google official branded button (native `@react-native-google-signin` component, item 36),
the on-device dark-mode verification pass (checklist step d), and **44** (runtime perf
profiling, needs the Moto G60s-class device). These need the native rebuild.

**Sweep tail closed (2026-07-22):** item 36's Google branded button shipped in code
(`GoogleSigninButton` from `@react-native-google-signin`, Wide/Light, replaces the
custom Google `SocialButton` when `googleAuthAvailable`; the custom outlined button
stays as the web/unconfigured browser-OAuth fallback), renders on the next native
build. Web dark-mode audit pass done (auth, onboarding, Today, Journal, Settings, both
schemes): no token drift or hardcoded-colour leaks; both co-equal themes invert
correctly. Tab-order slip fixed (Pepi moved before Photos, owner-confirmed). **Still
device-only:** on-device OLED dark-mode confirmation + **44** (perf profiling), both
need the native build.

### 7A. Auth/sync hardening (notes §3, §4, §5)

31. **Google sign-in return leg [S/M].** Fix the redirect dead-end (flow ends on
    `http://localhost:3000/#access_token=...`): make the native `GoogleSignin` path the
    one that actually runs on device (no redirect at all), fix the browser-fallback
    deep-link return, and purge `localhost:3000` from the Supabase redirect allow-list.
    While in there, **verify the Apple sign-in config end to end** (native bundle-id
    path + web Services ID/secret) since it shares the same plumbing. Custom-domain
    branding explicitly deferred to the Branding track (E), owner accepts the
    `supabase.co` leak during closed beta.
    **Partial 2026-07-23:** browser-fallback deep-link return fixed — Expo Router had no
    route matching `pepi://auth-callback` at all, so the redirect (whenever the browser
    path ran) hit "Unmatched Route" instead of completing; `src/app/auth-callback.tsx`
    now exists and self-exchanges the code. **Still open, console-side, not code:**
    purge `localhost:3000` from the Supabase redirect allow-list; register the Android
    build's SHA-1 signing fingerprint against the Google Cloud OAuth client (native
    `GoogleSignin.signIn()` needs this to show the picker at all — its absence is the
    likely reason the browser fallback engaged for the Flo tester instead of the native
    flow, since the button-selection code already prefers native whenever
    `EXPO_PUBLIC_GOOGLE_CLIENT_ID` is set); verify the Apple Services ID / web config.
32. **Cross-device photo restore [M].** Storage hardening pulled forward from backlog
    (owner: option A). On restore/sign-in, `cloudPath` → signed URL becomes the source
    of truth for any photo whose local URI does not resolve; download-on-demand with
    cached local copies. Fixes "7 photos, none render" on a second device.
33. **Sign-out semantics [S].** ✅ SHIPPED 2026-07-19. Owner: option B. Audited the
    existing session/store code first: `signOut()` already ended the Supabase session
    (+ best-effort native Google sign-out) without touching local state, and
    `AccountSection` already re-rendered to the signed-out card once `user` went null
   , the underlying semantics were already correct, nothing to rebuild. What was
    actually missing: the sign-out link had no confirmation (a mis-tap silently ended
    the session) and no stated "your data stays" behavior, and a failed `signOut()`
    call was swallowed with no feedback. Added an `Alert.alert` confirm (matching the
    existing `privacy.deleteAll` pattern) stating local data is kept, plus an error
    alert on failure. No in-app erase option: wiping means deleting the app.

### 7B. Dose drawer (notes §6)

34. **Dose logging drawer [M].** ✅ SHIPPED 2026-07-19. Owner: option A, the drawer
    **replaces** tap-to-confirm as the default dose-logging surface. Compound name,
    dose seeded from the protocol and fully editable, date + time via **native**
    pickers (`@react-native-community/datetimepicker`, already a dep). Pure
    `dose-draft.ts` (+20 tests): `parseDoseInput` (comma decimals, rejects `12mg`,
    zero, negatives and `1e5`), `combineDateTime` (local-calendar anchored),
    `clampToNow` (no future doses, mirrors the check-in rule), `protocolChangePrompt`.
    The "apply to all future doses?" question is asked **in the drawer, only when the
    typed amount actually differs**, defaults to **this dose only**, and a yes patches
    the protocol item forward, logged history is never rewritten (stated in the copy
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
    **completeness dot-meter** (filled/empty dots, "N of M areas", no percentages,
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
41b. **Journal, new screen (F4 build, merged into the sweep) [M].** Build on the
    item-35 foundations, so it is normalized by construction and needs no second
    pass. Fifth tab, **order: Today · Pepi · Photos · Analysis · Journal** (owner
    2026-07-21). A read/edit view over the day's existing entities (checkin + doses
    + symptoms + photos; metric readings shown, snapshot-sourced), assembled, never
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

44. **Runtime track [M], profile first.** React profiler + render-count audit on
    device (Moto G60s class): store-context re-render storms, `useResolvedUris` over
    all photos, unmemoized lists, instrument SVG/chamfer cost, navigation transitions.
    Fix what the profile shows, nothing speculative. Starts in parallel with 7A.
45. **Build track ✅ (2026-07-22).** Not blocked: RN 0.85.3's version catalog
    (`node_modules/react-native/gradle/libs.versions.toml`, consumed via
    `expoAutolinking.useExpoVersionCatalog()` in `android/settings.gradle`) pins
    **AGP 8.12.0** + Kotlin 2.1.20, nowhere near the AGP-9 concern that would have
    deferred this to the next Expo SDK bump. R8 full mode has been AGP's default
    behavior since 8.0, so no separate full-mode flag is needed, only minify itself.
    Enabled via `app.json`'s `expo-build-properties` plugin (the actual source of
    truth, `android/` is gitignored, regenerated by prebuild/EAS on every build, so
    hand-editing the generated Gradle files would have been silently discarded):
    `enableMinifyInReleaseBuilds` + `enableShrinkResourcesInReleaseBuilds`, both
    `true`. Also merged a stray duplicate no-op `expo-build-properties` plugin entry
    (found while in there) into the one with config. `npx expo prebuild` confirms the
    flags reach `android/gradle.properties` → the release `buildType`
    (`minifyEnabled true`, `shrinkResources true`) and the Reanimated/TurboModule
    baseline keep rules regenerate as expected; `npx expo config` resolves clean.
    Release-build-only (debug is unaffected). **Device-blocked verification still
    owed:** minification is a runtime risk invisible to typecheck/lint/tests, a
    reflection-dependent native module can build fine and crash on launch. The next
    EAS production build's device smoke test must explicitly cover launch, email +
    Google + Apple sign-in, camera capture, and the Health integrations before this
    ships; if anything breaks, the fix is a targeted `extraProguardRules` addition in
    the same plugin block, not reverting the toggle. Play Console prior to this:
    optimization Low, obfuscation 1%.
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
    bug, filed here at owner's request, kept distinct so it isn't conflated with
    44/45. The app never fully closes on Android/iOS, so a screen left open
    overnight keeps rendering yesterday's "today": `localDateKey()` itself is pure
    and always correct at call time (`src/lib/dates.ts`), but nothing forces
    already-mounted screens (Home, check-in, doses) to re-render when the local
    calendar day rolls over while backgrounded, the existing `AppState` listeners
    (`integration-sync.tsx`, `notification-manager.tsx`) only refire their own
    fetch/notification logic, not a general re-render. Fix: a shared day-boundary
    watcher, on every foreground transition, compare the current
    `localDateKey()` to the last-seen one and, if it changed, bump a shared
    "today" value in the store so date-derived screens re-render onto the new
    day. One hook, reused by the screens that call `localDateKey()` for "today"
    rather than a fix per screen.

## Wave 8: connectors (moved into beta 2026-07-21)

One remote MCP server serving both ChatGPT apps and Claude connectors (both converged
on MCP): one OAuth 2.1/PKCE flow via Supabase Auth, two thin platform skins, no fork.
Detail spec: `CONNECTORS-PLAN.md`. **Backend-only, depends on nothing in the 35-42
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
    clobber), on the critical path because v1 is two-way, and the same primitive remote
    push will later need. No new gates: auth + cloud sync already exist (M1).
48. **B1. Tool surface, two-way [M].** Reads: `get_today`, `get_verdict`,
    `get_recent_logs`, `get_protocol`, `get_compound_info`. Writes via the inbox:
    `log_dose`, `log_checkin`, `log_symptom`, `log_weight` (same entities the quick-log
    parser writes; the platform model formulates the structured call, so this costs us
    no AI tokens). **Posture gate rides along:** outputs are `market_category`-gated
    exactly like `ai-service`, reuse/extend the shared `_shared/posture.ts` module
    (shipped item 12) so the edge function and the MCP server import one gate;
    controlled = track-only, OTC = hedged + contraindication pointer. **Photos excluded,
    full stop** (text-only; never leave the hardened bucket to third-party models).
    Tool descriptions state the last-app-open freshness limit so the assistant can't
    report stale data as live. Validate in ChatGPT developer mode + Claude custom
    connector as the **test harness**. Gate: the spec-05 eval suite gains a fifth
    boundary (connector tool outputs) before exposure.
49. **B2. Directory launch [M].** Both submissions at once, OpenAI identity/business
    verification + review, Anthropic connector-directory review. Pepi is a
    progress-tracking app first (photos, check-ins, general wellness goals); the
    review scrutiny that matters is specifically on the compound-logging surface
    (same category App Store review gives any app tracking prescription-adjacent
    substances), on the critical path here. The `market_category` posture gates are
    the defense, review readiness is the gate. Custom connector stays as the
    rejection fallback, not the primary channel.
50. **B3. Widgets [M].** ChatGPT Apps SDK components, a Today card and a Verdict card,
    matching the instrument design language where their component system allows.

Pairs with track F (sync engine): the `connector_event` inbox is the pragmatic v1
writer; when F lands, connectors become just another writer and the inbox folds into
it. Re-verify the young SDK docs (developers.openai.com/apps-sdk, Claude custom-
connector guide) at build time.

## Post-beta platform tracks (parallel, larger)

- **A. Web workbench [L].** One codebase, capability-class responsive layouts (the
  "Xbox test"), calendar-primary navigation, detailed-sheet retro editing incl. photo
  upload, custom chart builder with pinned sync to phone. (round-3 §1, §9)
- **B. Connectors**, **moved into the beta sequence as Wave 8** (owner 2026-07-21).
  See that wave for the B0-B3 phasing.
- **C. Monetization implementation.** Paid-only: auto-converting trial (StoreKit iOS /
  Stripe web), $19/mo + annual anchor; reconcile spec 12 + CLAUDE.md; trial-lapse
  behavior decided when freemium comes off the backburner. (round-3 §9)
- **D. HealthKit cycle read + Pepi cycle setup [M].** ✅ **DONE** (commit db0cb7b).
  Built: pure `src/lib/cycle.ts` (29 tests) — one shared phase resolver replacing
  three that had silently disagreed (photo path, encouragement path, verdict
  engine each used a different luteal test); period starts derived from flow-day
  runs; observed cycle length as a median of real gaps; manual-start-wins-within-
  the-current-cycle precedence, sync takes over once a later cycle begins. HealthKit
  `HKCategoryTypeIdentifierMenstrualFlow` read + Health Connect `MenstruationFlow`
  read (was requesting the permission and never reading it) into the new
  `cycle.flow` canonical metric. Pepi conversational setup: confirms in one tap
  when Health already has data, asks with today/yesterday chips otherwise, records
  a decline so it never asks twice. Also fixed the onboarding bug that stamped
  *today* as the last period on opt-in (split `cycleTracking` intent from the
  date). Menstrual data stays local — never enters the F6 normalized mirror, never
  reaches community aggregation. Native rebuild required (new HealthKit read type
  + updated usage string); version 0.0.37.
- **E. Branding round (owner-directed 2026-07-18).** One coordinated pass, before the
  tester pool widens or at public launch at the latest, folding together everything
  that carries the Pepi name outward: **custom domain in front of Supabase Auth** (paid
  add-on; kills the `pjdbxnycrvibmebfumel.supabase.co` leak in Google's OAuth consent +
  notification email), **auth email templates** (confirmation / magic-link / reset,
  owner writes the copy), and the **website** (pairs with track A's web workbench; the
  marketing site and the workbench share the domain). ⚠️ Carries android-notes flag A:
  the domain switch changes the callback URL in Google Cloud console, the Apple
  Services ID return URL (which likely forces regenerating the Apple client secret,
  see memory `apple-oauth-secret-renewal`), and the Supabase redirect allow-list, all
  must land in one window or sign-in breaks mid-beta.
- **F. Full per-entity sync engine (spec 10 "Option B") [L], paired with track A.**
  Owner decision 2026-07-21: F6's one-way mirror ships first; this is the eventual
  bidirectional engine (field-level conflict resolution, tombstones, SQLite/MMKV)
  that replaces the snapshot as the merge mechanism. Why it pairs with track A:
  the snapshot's last-write-wins merge handles *sequential* multi-device fine
  (phone morning, desktop evening), but clobbers changes under *concurrent*
  editing, and the web workbench is exactly what makes phone + desktop open
  simultaneously a normal pattern. When A ships, F becomes a priority; F6's
  `client_id`/`updated_at` schema work is the prerequisite and carries over.
- **G. Remote push infrastructure [M], reusable platform capability.** Every
  reminder today is *local*: a fixed daily schedule or a check that runs only when
  the app foregrounds. There is no way for the server to initiate a ping while the
  app is closed. This track adds that: Expo push tokens (register on sign-in, store
  per device), a server-side send path (Supabase edge function → Expo push API or
  APNs/FCM direct), and a lightweight rules layer that decides *when* the server
  fires. **First consumer:** the "alarming anomaly" tier of the proactive-coaching
  work (see Owner braindump → point 1, step 5), declining body metrics against a
  running protocol, or a sharp adverse trend, where waiting for the next app open is
  too late. **Why it's its own track and not folded into notifications:** it's
  general infra, not a feature. Once it exists it also unlocks the step-goal
  proximity ping (needs live intraday data + a while-closed fire), connector-driven
  alerts, community/social pushes if sharing ever ships, and any future
  server-initiated moment. Build it once, reuse it everywhere. Carries the same
  consent + fatigue discipline as local notifications (opt-in per category, hard
  daily cap, `coach`-level gate for anything coaching-flavored). Deferred from beta:
  beta runs entirely on local notifications, which are enough to validate the
  cadence and copy before we pay for server-push complexity.

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

### F2. Motion + animation ✅ DECIDED, folded into Wave 7 item 35
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

### F4. "Journal" (day in review), design session DONE, merged into the 35-42 sweep
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
- **It's a fifth tab named "Journal"** (not a tap-through from a Home card, owner
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

**No longer a separate phase, merged into the design sweep to avoid double work**
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
with", "may suggest"), this is the same posture as the standing
bias-toward-uncertainty rule, so the crown-jewel direction and the safety gate
point the same way. Honest capability line: region-level relative observations and
cross-signal reasoning are real; pixel-precise claims (vascularity detail) and
water-vs-fat-vs-glycogen certainty are not, and stay hypothesis-framed forever.

Owner decisions (2026-07-26):
1. **Goal statement locked** (above), confidence-in-actions and
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
  extend, or drop earlier hypotheses. The single highest-leverage piece, it's
  what makes Pepi appear to know *this* user's body, with zero training. "This is
  the pose where X changes first" later becomes a query over this ledger.
- **C. Context fusion:** the same call gets weight trend over the window,
  protein/calorie adherence, dose timing vs photo, sleep, cycle phase, the
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
   (full per-entity sync engine, spec 10) stays deferred, see the note under
   post-beta tracks; A's schema work is B's prerequisite, nothing is thrown away.
2. **Metric readings excluded from v1**, snapshot keeps carrying them; the
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

## Owner braindump (2026-07-22)

Points 1, 2 (all sub-points), and 3 are now **RESOLVED + SCOPED** with the owner
(2026-07-22). Each entry carries the grounding, decisions, traps, and a stepped
plan; raw braindumps are kept inline for provenance. Sequencing into the waves is a
later pass ("rearrange later", owner).

**Mockups received (owner, 2026-07-22):**
- **Arrow overlay ✅** — rough before/after with green ▲ (muscle gain) + green ▼ (fat
  loss) on leader lines. Confirmed the direction×color decoupling folded into 2a.
  Still to solve in a polished mockup: line/marker collision when regions sit close
  (esp. the face).
- **Measurement overlay ✅** — horizontal guide lines at chest + waist with value-box
  placeholders. Folded into 2a step 7 (guide-line consistency overlay; value chips
  replace the white boxes).

**1. Proactive coaching notifications, RESOLVED + SCOPED (owner 2026-07-22)**

Grounding: the *detection* substrate mostly already exists. [anomaly.ts](../src/lib/anomaly.ts)
detects `sleep_short / sleep_poor / weight_jump / workout_drop` for free (pure,
zero-token) but only surfaces in-app as Pepi chat openers, never as a
notification. [coaching.ts](../src/lib/coaching.ts) already gates how much Pepi
weighs in (`observe / nudge / coach`, and `coach` is only ever user-chosen). The
reactive skip-dose nudge in [notifications.ts](../src/lib/notifications.ts)
(`maybeNotifySkippedDoses`) is the pattern any new reactive nudge copies.

Two governing constraints: (a) **no remote push today**, everything is local, so
anything that must fire while the app is closed is deferred to post-beta track G;
(b) **notification fatigue**, a user can already get ~6 pings/day, so new proactive
output should *replace/consolidate* rather than *add*, and default to an in-app
card or Pepi opener over a push.

Owner decisions: agreed on all four sub-points below. Plus: **scope remote push
for the "alarming" anomaly tier** (post-beta track G), noting the infra is reusable
for future server-initiated features.

Stepped plan:

1. **`weight_plateau` detection [S].** Fifth anomaly kind in `anomaly.ts`
   (deterministic, free): weight flat within a band over N weeks despite an active
   goal. Highest-value, lowest-risk win. Surfaces as a Pepi opener first.
2. **Wire the anomaly engine to ONE reactive local notification [S].** Fires on
   foreground like the skip-dose nudge, **gated to `coach` level**, **hard cap
   one-per-day**, consolidating whatever anomalies are live into a single
   observational ping that deep-links into Pepi. No new fatigue budget if it
   replaces rather than adds. Copy stays observational, never prescriptive.
3. **Declining-metrics-against-a-protocol = observation only [S].** Detection is
   safe and valuable ("sleep, energy, recovery have trended down since you started
   X"); the *recommendation* is the regulated part. **Reflect-and-refer only:**
   surface the correlation, hedge it, point to their prescriber/doctor. Never name
   a dose direction ("lower the dose" is prescribing the protocol, the CLAUDE.md
   rule-3 bright line, and squarely off-limits on controlled compounds).
4. **Food + plateau "suggest a change" = in-app Pepi copy, never push [S].**
   Reflect the pattern ("logged less than usual three days running") and offer a
   *mechanism*, not a menu ("protein and fiber tend to help fullness"), never
   "eat X" (allergy/medical liability). Plateau follow-up is an observation plus an
   open question, `coach`-gated, never "change your sport."
5. **Alarming-anomaly remote push [M], DEFERRED to post-beta track G.** The one
   case where waiting for the next app open is too late (sharp adverse body-metric
   trend against a running protocol). Needs the remote-push infra; beta ships
   without it. The **step-goal proximity ping** (near your 10k in the late
   afternoon) also lives here: it needs live intraday connector data *and* a
   while-closed fire, two dependencies we don't have in beta.

**Reusable pattern (scoped in 2b, applies here):** *Post-sync reconciliation* +
*invisible routine learning*. On foreground, run the integration sync, then
auto-fill every detailed-log field it now has data for and **defer-ask** (a
follow-up message, not an immediate opener) only the fields it still lacks, with a
fallback fire so it never hangs; an invisible modal-time-of-day model gates *when*
to ask (e.g. never ask about a workout before the user's usual training window).
Turns "ask the user" into the fallback rather than the default. Reuse for strength,
nutrition, sleep, steps. Full detail under point 2b.

Original raw braindump (kept for provenance):
> Since we added more coach like functionality, should we send proactive
> notifications for weight loss related activities? Maybe not weight loss but if
> the user sets 10k steps as the goal, do we ping them in the late afternoon if
> they are near their goal? What about food, if answers are "less than usual" do we
> offer food suggestions/hacks (allergy legal issue)? If weight doesn't move, do we
> encourage a routine/sport change? Side effects: if body metrics (sleep, energy,
> recovery) are going down, do we say maybe lower the dose?

**2. Photo analysis**

**2a. Capture flow + on-photo arrows, RESOLVED + SCOPED (owner 2026-07-22)**

Grounding (what already exists): the upfront Face/Body choice was already
removed (W6-26c). A two-step review already exists in
[photo-capture.tsx](../src/features/photos/photo-capture.tsx): step 1 = shot +
quality score, step 2 = measurements (body); the photo saves on step-1 confirm
so the analysis warms in the background. Pose is already auto-detected (live
`classify_pose` sampling swaps the ghost via `ghostByPose` and tags the save).
What remains pre-capture is a **chooser (guided vs quick) + a pose picker**,
that is the "ugly selector." The comparison analysis (`analyzePhoto` → drift +
comparable + hedged text `change`) runs *after* save and is shown in the reel,
not in the capture flow. There are **no arrows today**; `change` is text and
measurement deltas are signed numbers rendered as text.

The core tension (locked understanding): auto-detection is great for sorting a
shot *after* capture, but **the ghost overlay is a before-shot aid that needs a
reference chain up front**, so the picker can be *demoted to a fallback/override*
but never fully deleted (offline / low-confidence / wrong-guess paths need it).

**Arrow posture (the crux, owner-decided).** Arrows are a deliberate trust +
anti-dysmorphia mechanism: a dysmorphic user cannot see their own progress, so an
external instrument that *points to where change happened* is the therapeutic core
of the photo USP. Text is "talk is cheap"; a pointer drawn on their own photo is
not. The posture rule ("bias toward uncertainty") is honored by reframing what the
arrow claims: **bold pointer, humble label.** The arrow is confident about
*direction + region* (honest even at shaky confidence); magnitude and valence stay
humble. Hard rules:
- **Direction × color are TWO independent axes (owner mockup 2026-07-22, refines the
  earlier "up=progress/down=regression").** The marker is the existing `TrendMarker`
  glyph from [hero-figure.tsx](../src/components/hero-figure.tsx), which already
  separates `trend` (▲/▼) from `favour` (color), so the verdict trend language and
  photo arrows are ONE visual vocabulary AND the refinement needs no new component.
  - **Direction (▲/▼)** = did the tissue *grow or shrink* here. ▲ = grew (muscle
    gained, OR fat gained), ▼ = shrank (fat lost, OR muscle lost).
  - **Color (favour)** = is that *good*. green = good, red = bad, grey = none,
    yellow = low-confidence-leaning-bad. So the 2×2: **green ▲** muscle gain, **green
    ▼** fat loss, **red ▲** fat gain, **red ▼** muscle loss. The owner's happy-path
    mockup is all-green (recomp: shoulders/chest ▲, waist/oblique ▼).
  - **grey dash** = maintained / no movement ("Maintained", the app label that
    replaced "holding"). **yellow dash** = low confidence leaning bad — a static
    per-read cue (NOT the scrapped temporal "hardening"); exact % lives in the tooltip.
  - The tooltip carries the interpretation ("fat loss here", "muscle gain here") + the
    hedge + confidence, so the bold marker never overclaims ("tapping gives context,
    that's how we don't lose confidence" — owner).
- **"Materialize the AI's vision" (owner framing):** placement is **AI-driven and
  free** — lines + markers go wherever the AI actually detected change, not a fixed
  landmark grid. The `regions[]` payload therefore carries **separate `direction` and
  `favour` fields** (not one fused `progress/regression` enum) plus free normalized
  coords, region note, %, and confidence.
- **Visual (owner mockup 2026-07-22):** contrast-adaptive straight leader lines from
  the region to a `TrendMarker` glyph at the line end; tap → tooltip (X / tap-away
  close). See also the measurement-overlay note below (same leader-line primitive).
- **Visual overlay spec (owner 2026-07-22; mockup pending, see below):** on the
  captured photo, draw **contrast-adaptive straight (180°) leader lines** (white or
  black depending on skin/background contrast) from the region to a marker at the
  **line end** (placed off the region so it never obscures the body). The marker is
  the `TrendMarker`-style glyph above.
- **The photo stays clean:** just the lines + markers. Each marker is **tappable → a
  tooltip with progression %, a short note, and a confidence score** (actual numbers);
  the tooltip closes via an **X** or **auto-closes on tap-away**. This *replaces* any
  visual confidence-hardening/texture idea (scrapped). Tapping works on **any past
  photo**, so scrubbing the reel surfaces past progress + notes. A11y (per the
  `TrendMarker` note): the marker announces region + direction + tooltip content, never
  the raw glyph ("black up-pointing triangle"). Mockup must solve line/marker
  **collision** when several regions sit close together (esp. the face).
- **Always against baseline** for short-term comparison (universal rule).
- **Valence-neutral arrows;** the goal + compound context supplies praise (2b/2f).
- **Comparability-gated:** arrows only render on a *comparable* shot. A
  non-comparable shot draws **no** guessed arrows, it prompts a retake. Shaky
  *confidence* is fine; shaky *comparability* is not (the bright line).
- **AI claim wording:** "reveals what daily checking hides," never "sees beyond
  human eyesight" (honest, on-voice, lowers the fall when wrong).

Stepped plan:

1. **One smart camera [M]. ✅ DONE.** Collapse the guided/quick chooser + pose
   picker into a single camera: auto-detect **session (face/body) and pose** from
   the live classify sample, live ghost swap, tag on capture. Picker survives only
   as an **offline fallback + manual override** (wrong-guess / AI-unconfigured).
   Keeps the ghost's before-shot reference need satisfied without a pre-declaration
   step. **Built:** the floating button (+ both empty-state opens) now open ONE
   expo-camera directly in a new `smart` mode; the `chooserOpen`/`posePickerOpen`
   modals + `CaptureOption` are deleted. `photo-capture.tsx` live sampling now runs
   for BOTH sessions (was body-only) and accepts all four `REQUIRED_POSES`, so
   `classify_pose` resolves face vs body from the frame; the ghost, the save tag,
   the view, and the **session** all derive from one `effPose` (manual override →
   detection → default), so a detected face shot saves to the face track + skips
   measurements. `ghostByPose` now spans all photos (poses are session-unique) so
   the ghost can swap either way. The demoted picker is an **in-camera chip strip**
   (`OverlayChip`: Auto + 4 poses + quick toggle + self-timer, revealed by a "Set
   pose" toggle). New i18n: `photos.smartScanning/setPose/poseAuto/poseSet` (×6).
   **Decision (flagged):** the vision-camera face-box assist is off the default
   path in V1 — the one smart camera is expo-camera (it detects both sessions and
   sidesteps the vision-camera native-build caveat noted in CLAUDE.md M4).
   `VisionCameraCapture` stays in the tree behind `useVisionCamera` (now only an
   explicit non-smart face open, none today) for re-integration as an opt-in "face
   precision" mode in a later step. Green: tsc / lint / i18n(6) / 441 tests / web.
2. **Review ends on the payoff [M]. ✅ DONE.** Reorder the review so the last
   screen is the comparison, not measurements: capture → instant deterministic
   `quickReadout` → measurements (body only, via the **guide-line overlay in step
   7**, still feeding `measurementDelta`) → **comparison card = clean new photo with
   arrows** where the score used to be. **Built:** `photo-capture.tsx` gains a
   terminal **step 3** for guided shots (face: step1→3; body: step1→2→3; casual
   shots still close). It renders the new photo as the hero with a tap-to-swap
   "Now ⇄ Before" against its pose-matched reference, and a readout block **where
   the big score was** — a comparability pill (from the fit check), the entered
   measurement deltas (`quickReadout`), a demoted quality line, and a "full
   comparison lands in your timeline" hint. First-ever shot shows the baseline-set
   message instead. **V1 is arrow-free** (clean photo); the `regions[]` arrows
   (2a.3/2a.4) draw into this same card, and the authoritative baseline-anchored
   deep read still runs in the tab. Compare is vs the **reference** (labeled
   honestly "Before", not "Day 1") since the camera holds that, not the oldest
   baseline; strict baseline-anchoring rides the tab's `runScientificAnalysis`.
   New i18n `photos.compareNow/compareBefore/compareTapHint/analysisTimelineHint`
   (×6). Green: tsc / lint / i18n(6) / 441 tests / web.
3. **Region arrows in the vision response [M]. ✅ DONE (code; not yet deployed).**
   Extend the `analyze_photo` structured output to carry the on-photo arrow
   contract — **direction and favour are SEPARATE fields** (direction = grew/shrank,
   favour = good/bad), with free normalized coords so the AI places markers wherever
   it detected change. **Built on the existing `observations[]` field** (not a new
   parallel array — it already carried `region`/`direction`/`note`/`confidence` and
   is the persisted ledger): each entry now ALSO carries **`favour` (good|bad|none|
   watch)**, **`x`/`y`** (0..1 marker position on the new photo), and optional
   **`pct`** (magnitude only when honestly estimable). `direction` stays the
   grew/shrank axis (`gain|loss|stable|unclear` — the same values already persisted;
   maps to ▲/▼/dash at render, no ledger migration). Prompt teaches the two-axis
   decoupling + the default muscle-good/fat-bad valence, deferring to the transition
   context when present; favour needs **no new ctx** (region+direction suffices), so
   2a.3 stayed self-contained. Client: `PhotoObservation` gains the four optional
   fields; `sanitizeObservations` validates/clamps them (bad favour or out-of-range
   coord drops that field, never the observation) + 2 new tests. **Capable model,
   canonical poses only for V1.** ⚠️ **Deploy gate:** the edge fn is outside the app
   green gate — run `deno test` + a branch-deploy smoke check before deploying
   `ai-service`. Code green: tsc / lint / i18n(6) / 443 tests / web.
4. **Arrow overlay + tappable tooltips [M]. ✅ DONE.** Draw the `TrendMarker`-glyph
   markers (direction × color, per the arrow-posture block) at the end of
   contrast-adaptive leader lines on the comparison photo (image stays clean); tap →
   tooltip (%, note, confidence, closes via X / tap-away). Wired into the reel +
   Journal so any past comparable photo is tappable. Baseline-anchored,
   comparability-gated. **Built:** pure core `src/lib/photo-arrows.ts`
   (`layoutArrowMarkers` — glyph/favour mapping, marker pushed off the nearer edge
   so it never covers the body, straight leader line, **vertical de-overlap for
   clustered markers** = the collision case the mockup flagged; +8 tests). Component
   `src/features/photos/photo-arrows.tsx` (`PhotoWithArrows`): frame aspect matched
   to the photo's own aspect (via `expo-image` `onLoad`) so normalized coords map
   1:1; leader line = dark halo under a light line (pragmatic contrast-adaptive);
   glyph ▲/▼/— tinted by favour (green/red/grey/yellow, the verdict's signal
   colors); tap → tooltip (region, note, `≈pct%`, confidence, ✕ / tap-away); a11y
   announces region + direction word + note, never the raw glyph. Rendered in the
   focused track above the wipe (`observationsForPhoto` from the ledger), gated on
   `comparable === true` + at least one coord-bearing marker, so scrubbing the
   timeline surfaces any past comparable read. Green: tsc / lint / i18n(6) / 451
   tests / web. **Renders only once 2a.3 is deployed** (needs real coord-bearing
   analyses); until then the gate keeps it hidden. Collision de-overlap is V1
   (min-gap push); landmark-aware placement rides 2c tier 2.
5. **Measurement-delta arrows [S]. ✅ DONE.** Objective waist/hips/etc deltas render
   as their own arrows in the same tap paradigm, these **may carry magnitude**
   (measured, not judged), the one place a confident number on the arrow is allowed.
   **Built:** pure `measurementDeltas()` + a fixed anatomical position map
   (`MEASURE_POS`: neck/chest/arms/waist/hips/thighs on a front body shot) in
   [photo-arrows.ts](../src/lib/photo-arrows.ts), +4 tests. The parent synthesizes
   them as ordinary markers so they share ONE overlay and one tap paradigm with the
   vision arrows: direction is just the **sign of the delta**, the tooltip note
   carries the **confident measured value + unit** (`photos.measuredDelta`, ×6), and
   `favour` is deliberately **`none` (grey)** — measurements cannot tell muscle from
   fat, so the vision arrows keep sole ownership of the good/bad story. That split
   is the honest reading of "measured, not judged": grey ▲/▼ = moved by a known
   amount, coloured ▲/▼ = interpreted. Deltas are taken against the measurement
   **before the selected photo's day**, so scrubbing the timeline shows the numbers
   that belonged to that shot (not just the latest pair). Body track only, no custom
   parts, and it rides the same `comparable === true` gate (the fixed anatomical map
   assumes a standard pose). Green: tsc / lint / i18n(6) / 455 tests / web.
   ⚠️ Positions are a V1 fixed map; landmark-anchored placement rides 2c tier 2.
6. **Milestone gating + on-demand deep analysis [S]. ✅ DONE.** Regional deep
   analysis runs on the compound-driven milestone cadence
   ([photo-cadence.ts](../src/lib/photo-cadence.ts)); most shots get only the instant
   readout + comparability. Add a **Journal affordance: tap a picture → run deep
   analysis on demand** (the manual escape hatch when the user wants a rich read
   off-cadence). **Milestone gating already existed** (`runInstantRead` auto-runs the
   Sonnet read only when the scheduled `nextScientificAt` has passed and the chain
   has 2+ shots) — verified, not rebuilt. **New work:** `runScientificAnalysis` now
   takes an optional `targetId` so the deep read can run on **any** shot of the
   track, not just the newest (target replaces `latest` for the uri, tilt delta,
   `photoAt`, `updatePhoto`, ledger `photoId`, and the resulting note; baseline stays
   the anchor, and a no-op guard skips the baseline itself). The Journal's photo
   strip is now **per-thumbnail tappable** → `/photos?analyze=<id>`, which focuses
   that photo's track, selects it, and fires the deep read once the track has
   switched (two-step effect, since `sessionPhotos`/`baseline` must reflect the new
   track first). The param is **consumed** (`setParams({ analyze: '' })`) because the
   tab stays mounted — otherwise a second tap on the same photo would be a no-op.
   The in-tab "deep comparison" button now also targets the *selected* shot rather
   than always the latest. New i18n `photos.runDeepOnShot/runDeepOnShotHint` (×6).
   Green: tsc / lint / i18n(6) / 455 tests / web.
7. **Measurement guide-line overlay [M] (owner mockup 2026-07-22). ✅ DONE.**
   **Built:** `measurement-guides.tsx` (`MeasurementGuides`) replaces the plain
   text fields in the capture flow's measurement step with the just-taken shot
   carrying a **horizontal guide line per spot** (neck / waist / hips + the chosen
   extra), each with a **tappable value chip** (mono numerals, dark instrument
   chip, NOT the mockup's rough white box) that opens an inline numeric field, plus
   a **drag grip** to move the spot. Line uses the same dark-halo-under-light
   treatment as the 2a.4 leader lines; frame aspect matched to the photo via
   `onLoad` so spots sit where they were placed. Positions seed from the 2a.5
   `MEASURE_POS` anatomy map, are overridden by the user's own saved spots
   (`profile.measureGuides`, new field), stay local while dragging and persist once
   on finish **or skip** (so a repositioned spot is never lost). Body-fat readout +
   the extra-measurement selector survive below the photo. New i18n
   `photos.guideHint` (×6). Green: tsc / lint / i18n(6) / 455 tests / web.
   ⚠️ V1 positions are stored-relative-to-the-shot; landmark-anchored re-projection
   (same spot regardless of framing) rides the 2c tier-2 keypoint work. Original
   scope for reference: In the
   measurement step, draw a **horizontal guide line at each measurement spot** (chest,
   waist, hips…) on the photo with a **tappable value chip** on the line (instrument
   `Metric`/`StatusPill` pill, mono numerals — NOT the rough white box) to enter/edit
   the number, replacing the plain text fields. Purpose: **consistency** — the user
   wraps the tape at the same anatomical spot every session, so the trend is signal
   not measurement noise. The line is a **positional guide only** (a 2D photo can't
   measure circumference). **V1:** positions stored relative to the shot (AI-suggested
   initial spots). **Later:** landmark-anchored re-projection so the line lands on the
   same anatomical spot regardless of framing — rides the **2c tier-2** keypoint work.
   Reuses the same leader-line primitive as the arrows.

Original raw braindump (kept for provenance):
> First step is ghost (1), measurement logging (3), and photo score (2). As part
> of step three, do we add a "photo category" part? Shouldn't the AI detect it
> automatically? Why do we have that step beforehand? This would get rid of the
> ugly "photo type" selector that comes before taking the pic (guided vs free).
> Second step: clear screen, leave the new photo, show the progress arrows (up,
> down, no change), and where the score was in the previous screen, show the photo
> comparison analysis.

**2b. Context-dependent coaching in the body comparison, RESOLVED + SCOPED (owner 2026-07-22)**

Grounding: `analyze_photo` already receives most of the context (`measurementDelta`,
`cycleWeek` = the early-water-vs-late-muscle gate, weight delta, avg protein/
calories/sleep, recent doses, `bodyTypeCalibration`, `transitionContext`,
`priorAnalyses`). The **one missing hinge is strength context**, `StrengthSession`
/ `Benchmark` exist ([store.tsx](../src/lib/store.tsx)) but never flow into the
analysis, so "late across-the-board drops = maybe muscle, *unless* strength held"
is impossible today.

Posture: this is **allowed, personalized lifestyle coaching** (CLAUDE.md rule 3,
calories/training/recovery), *not* dosing. The split matches 2a: **bold coaching,
humble diagnosis.** Muscle-loss inference is always hedged and always paired with
the reassuring alternative + the strength check; never a standalone alarm. Calorie
coaching always carries its health-positive reason ("to protect muscle"), never
bare "eat more." Intensity coaching stays soft ("if you're able to").

The fat-loss logic is a 2×2 of window phase (`cycleWeek`) × strength-held:
- **Early + across-the-board drop** → expected water/glycogen; reassure, no muscle talk.
- **Late + drop + strength HELD** → fat with muscle preserved; **praise** adherence + training. The good outcome the arrows celebrate.
- **Late + drop + strength DOWN/unknown** → muscle concern warranted; **coach** protein/calorie nudge + hold intensity, hedged.
- **Localized drop (waist down, limbs stable)** → clean fat loss; unambiguous praise.

Weight-gain mirror (owner-approved draft), keyed on the waist-vs-limbs tell:
- **Limbs/shoulders up, waist stable, strength climbing** → productive (muscle) gain; praise the progressive overload.
- **Waist climbing fastest, strength flat** → surplus too aggressive; coach a smaller/slower surplus, keep overloading, watch waist as the fat proxy.
- **Early window** → expect water/glycogen/gut-fill inflation (creatine, GH peptides); don't over-alarm.
- Strength is the arbiter throughout. Recomp is its own branch (weight flat, arrows + measurements carry the story).

**Strength-held signal, subjective chip primary, passive fill opportunistic
(owner-decided).** Most users won't log full sessions, so a subjective **"lifting
felt: same / harder / easier" standing daily field** in the detailed log is the
ground truth + override. Passive fill is a *suggestion* layer on top, and the
backbone already exists: [integration-sync.tsx](../src/lib/integration-sync.tsx)
already pulls every provider on mount + foreground and autofills the log; Apple
Health already pulls workouts (duration + avg HR). What's missing for the chip:
workout **type** (strength vs cardio) + Apple's iOS 18 **effort score** (sparse
RPE-like). Platform reality: **iOS** = presence + type + HR + sparse effort score;
**Android/Health Connect** = presence + type + HR proxy, **no passive RPE** (no
effort record type; and HC doesn't pull exercise sessions at all yet). Honest
signal = "trained (strength) today at ~usual/higher/lower intensity"; HR is a
confounded proxy (GH peptides, stimulants, heat) so it only nudges. The chip stays
authoritative.

**Routine learning + post-sync reconciliation (reusable, owner-requested).**
Workout readings are timestamped, so an **invisible modal-workout-window** model
gates the proactive question: don't ask before the usual window; if data is present
after it, auto-fill silently; ask only when the window has passed and passive fill
came up empty. Generalized as a reusable pattern (see the pointer under point 1):
**post-sync reconciliation**, on foreground, run the sync, *then* auto-fill every
detailed-log field it now has data for and **defer-ask** (a follow-up message, not
an immediate opener) only the fields it still lacks, with a fallback fire so it
never hangs. Applies to strength, nutrition, sleep, steps, any autofillable field.
Routine model stays invisible (gates timing only, never announces "we noticed you
train at 3pm").

Stepped plan:

1. **Coaching-framing layer** keyed on {intent, `cycleWeek` phase, strength-held,
   region/measurement pattern}; hedged muscle read + reassuring alternative +
   strength check; consumes 2a's `regions[]`. `[M]` ✅ **DONE**
   Built: `visionCoachingLines(session, ctx)` composer module in `ai-service`
   (body sessions with a real body intent only; face + wellness-only users get no
   coaching layer at all). Encodes the fat-loss 2×2 verbatim: early+across-the-board
   = water/glycogen, reassure and never raise muscle; late+drop+strength held/up =
   praise adherence + training by name; late+drop+strength down = hedged muscle
   concern ALWAYS paired with the reassuring alternative + one protein/calorie nudge
   carrying its health-positive reason; late+drop+strength **unknown** = ask how
   lifting felt rather than guess; localized waist drop = unambiguous praise.
   Register rails: at most ONE coached thing, soft/optional intensity language,
   empty string beats filler, and an explicit "never a dose, schedule or
   combination" line (CLAUDE.md rule 3 — lifestyle is personalized, dosing never is).
   New `coaching` output field (schema + required + degraded fallback + locale line),
   persisted on the `AnalysisRecord`, rendered as a "What to do with this" block in
   the analysis card.
2. **Explicit `intent` + derived `strengthHeld` into `dataContext`.** `[S]` ✅ **DONE**
   Built: pure core `src/lib/strength-context.ts` (+ 11 tests) —
   `resolveBodyIntent(cutting, bulking)` → cut/gain/recomp/maintain, and
   `resolveStrengthTrend({felt, sessions, from, to})` → up/held/down/**unknown**.
   The subjective chip is primary and overrides logged sessions outright (≥2 chip
   days, ±0.34 mean band); the session fallback compares per-exercise best Epley
   e1RM across the window's two halves and only counts exercises present in BOTH
   (±2% band), so a movement started mid-window carries no false trend. `unknown`
   is passed through deliberately rather than omitted — the prompt must know the
   question is OPEN so it asks instead of assuming. `AnalysisDataContext` gains
   `intent` + `strength`, both gated on a real baseline window; intent resolves
   through the **exported** `resolveIntent` in `verdict-engine` so the coaching and
   the charts can never disagree about which way is good.
3. **Strength-felt standing chip** (same/harder/easier) in the detailed log. `[S]` ✅ **DONE**
   Built: new `strength_felt` check-in field (`easier|same|harder`), surfaced by the
   `body_comp` + `fat_loss`/`muscle` paths, evening-weighted, customizable, rendered
   as `SingleSelectChips` with the hint "compared with your own normal, not anyone
   else's". Deliberately chips rather than a 1-5 scale: this is a RELATIVE signal and
   is distinct from `workout_effort` (absolute RPE). Snapshot-only for now (no
   normalized column, so no migration); i18n ×6.
4. **Passive strength fill:** add workout **type** + **effort score** (iOS 18+) to
   the Apple Health pull; add exercise-session pull to Health Connect (type + HR,
   no RPE); derive the chip suggestion; user override; subjective fallback. `[M]`
5. **Routine-learning gate + post-sync reconciliation**, invisible modal-window
   model; auto-fill if present, defer-ask only when absent + window passed,
   fallback fire. **Reusable infra**, not photo-specific. `[M]`
6. **Proactive "how'd your lifting feel?" Pepi opener** (opener only, no
   notification), gated on the routine window, fired only when the analysis needs
   it and passive fill came up empty. `[S]`
7. **Weight-gain mirror** (waist-vs-limbs, strength-as-arbiter). `[S]` ✅ **DONE**
   Built: the gain branch of `visionCoachingLines` — limbs/shoulders up + waist
   holding + strength climbing = praise the progressive overload by name; waist
   climbing fastest + strength flat = coach a smaller/slower surplus while keeping
   the overload, waist named as the fat proxy; early window = expect water/glycogen/
   gut fill (creatine, GH-class), never read as fat gain; strength unknown = ask
   first. Plus a recomp branch: weight is expected flat, so the arrows and the tape
   carry the story, said explicitly when a flat scale is being misread as no progress.

**Status: 2b.1 / 2b.2 / 2b.3 / 2b.7 shipped. 2b.4 / 2b.5 / 2b.6 remain blocked**
(2b.4 on the integration-provider block, 2b.5 + 2b.6 on the Point-1 opener infra).
The chip already carries the signal end to end, so the blocked steps are additive
suggestion/timing layers, not prerequisites.

Original raw braindump (kept for provenance):
> Fat loss: if measurements are dropping across the board (possibly signaling
> muscle loss), praise the diet adherence and exercise discipline, but emphasize or
> recommend more effort (higher RPE) or slightly higher calories to avoid muscle
> loss. First couple weeks = mostly water and muscle stores; week 6 = might be
> muscle loss UNLESS the user logs strength being the same (maybe a proactive Pepi
> message + add another thing to the detailed logging menu). Weight gain: same
> behavior adapted, needs a draft.

**2c. Arrows for custom poses, RESOLVED + SCOPED (owner 2026-07-22)**

Grounding: the pose model ([photo-pose.ts](../src/lib/photo-pose.ts)) locks the four
canonical poses to the scientific compare; `other` + custom "parts" never feed
analysis today, so per 2a custom poses currently get **no arrows**. But the
comparison substrate is already pose-agnostic (ghost overlay + self-baseline +
`poseLabel` already passed to the vision call).

Key insight (dissolves the either/or): arrows need two separable things,
**change detection** ("did this region change vs my own baseline of this same
pose?", pose-agnostic, works now) and **anatomical labeling + placement** (naming
+ locating the region, needs pose knowledge). We ship the spotlight without the
label first, then add the label. It is a maturity ladder, not anatomical-vs-community.

**Labels are two-layer (owner-decided).** The **UI label is the user's freeform
name** (any weird name they like). The **backend attaches an anatomical label** to
help the AI, invisible to the user, **moderated** for mistakes (owner during beta,
an **AI moderation agent post-release**). Display and analysis are decoupled.

**Tier 3 is silent pose-geometry learning, NOT a displayed community library
(owner clarification).** The AI silently recognizes recurring pose geometries (the
3/4 legs-and-glutes show-off pose) to place regions better. Never surfaced, never
"community pose #N", nobody feels unoriginal. Abstract geometry only, never user
imagery.

**Consent reconciliation (owner-decided 2026-07-22), the load-bearing part.**
The live consent makes an absolute promise tier 3 would break ("Never used to
train any AI model. Ever."). Resolution:
- **Production consent copy** stays clean and honest: automated AI analysis +
  *abstract pose geometry (never your image)* to improve pose recognition; never
  trained on your images; never used to identify you. **No human-review line**
  (it spooks people, and post-release there is no human review). Soften the one
  absolute line to the precise version ("Never used to train models on your images,
  and never to identify you").
- **No operator/human-review disclosure in the shipped app.** During beta the owner
  reviews labels manually, but that window is covered by the **closed-beta tester
  terms** (known, consented cohort), not the production consent. Post-release an
  **AI moderation agent replaces the owner**, so the clean production copy becomes
  fully accurate.
- **Sequencing:** the copy/spec edits (CLAUDE.md rule 2 + spec 11 + consent i18n)
  land **with tier 3**, not now, changing live consent to describe a capability
  that doesn't exist yet would itself be inaccurate. Decision locked; edits deferred
  to build time.

Stepped plan (all tiers in scope per owner; order-independent):

1. **Tier 1, self-baseline unlabeled spotlights [M].** Custom poses get arrows
   (arrow + "this area" + %/note/confidence, no anatomical name). Extends the 2a
   `regions[]` contract; `region` is a generic locator. Comparability-gated (custom
   poses lean harder on it: bad ghost-alignment = no arrows, prompt retake).
2. **Tier 2, anatomical labeling + placement [M].** Server-side, on the uploaded
   image (arrows are post-capture, so **no device build**): extend the `regions[]`
   structured output with an anatomical label + normalized coords. Two-layer labels
   (freeform UI + BE anatomical). Optional **live** pose-guidance keypoints
   (on-device frame processor, e.g. MediaPipe/ML Kit) are a *separate deferred
   device-build enhancement*, not required for arrows.
3. **Tier 3, silent pose-geometry learning [L].** BE recognizes recurring pose
   geometries to improve guesstimation, never surfaced. Moderation: lightweight
   Supabase admin view of label + abstracted geometry (owner during beta → AI agent
   post-release). Gated on the consent reconciliation above.
4. **Consent reconciliation [M], executes with tier 3.** Update CLAUDE.md rule 2 +
   spec 11 + consent copy in lockstep to the precise wording above; add the
   pose-geometry disclosure; NO human-review line; closed-beta terms cover the
   manual-review window; wire the post-release AI moderation agent.

Original raw braindump (kept for provenance):
> So this would work beautifully for "default" poses, but how would it work for
> custom? Surely it'd be capable? Do we use anatomical measurements or do we use
> community poses eventually? Surely people aren't unique, so they "average out" to
> common poses?

**2d. New-pose handling + the detail drawer, RESOLVED + SCOPED (owner 2026-07-22)**

Mostly the operational layer of 2c; the scary parts (legal, who-moderates) are
already settled there. Grounding: [photo-pose.ts](../src/lib/photo-pose.ts) already
has `POSE_CONFIRM_THRESHOLD = 0.75` + `needsPoseConfirm` (low-confidence classify →
reel asks to confirm) and an `unsorted` triage group, reuse both. Users can
already create named custom "parts."

Three decisions:

1. **The "new" flag is an internal fail-safe, not a user badge.** The real risk is
   applying the *wrong* template (a "waist" arrow on a glute shot), worse than no
   template. So a **template-match-confidence threshold** (reuse the 0.75 pattern):
   below it, **fail safe to tier-1 unlabeled self-baseline spotlights** (always
   correct, self-referential) and queue the geometry for moderation. Never force a
   shaky template. The classification *mechanics* stay hidden (no "unknown pose"
   badge, no confidence score shown), it collides with the "silent, don't make
   people feel unoriginal" rule.
2. **Not every pose gets a template.** One-offs live on tier-1 spotlights **forever**
   (safe, free, no moderation). Only **recurring** geometries graduate to a moderated
   template, recurrence, not novelty, is the trigger, so the queue stays small and
   frequency-sorted. (Recurrence detection needs tier-3 clustering; beta = manual
   eyeballing at low volume.)
3. **Two new-pose signals:** explicit (**user creates a named custom part**, a
   strong "I care about this pose" signal, free) + implicit (AI recurrence
   detection for unnamed repeated angles). Observe how the named-part signal behaves.

**The detail drawer (owner idea, resolved).** Reuse the **dose-logging sheet
pattern** for one photo/pose detail surface that converges 2a + 2c + 2d:
- **Freeform name** (editable, the user's own words, 2c).
- **"Tracking: glutes, hamstrings, waist"**, the internal anatomical label surfaced
  as **plain-language "what the arrows look at," NEVER a clinical pose
  classification with a score.** Warm output, hidden mechanics. This is a trust
  builder (the instrument visibly knows what it measures) and lands on the
  anti-dysmorphia goal.
- **Correctable regions** ("that's my quad, not my hamstring"). A correction is
  **explicit, consensual teaching** (strengthens the tier-3 consent story vs silent
  learning) and a **high-quality moderation signal**. Guardrail (2d trap 4): a
  correction adjusts **that user's** label + feeds the moderation queue as weighted
  input; it **never** auto-writes the shared template (one mislabel must not corrupt
  the pose for everyone).
- **Arrow tooltip detail** (%/note/confidence, 2a) lives in this same drawer. So the
  2a tooltip, 2c naming, and 2d drawer are *one* surface, no new primitive.

Guardrails carried: tier-1 feedback is immediate, never blocked on moderation;
"new" means new to the *system* (per-user-new inherits the existing template
silently); templates are versioned + correctable (owner → AI agent) and geometry-only.

Stepped plan:

1. **Template-match confidence fail-safe [S].** Below threshold → tier-1 spotlights
   + queue for moderation. Reuses the 0.75 / `needsPoseConfirm` scaffolding.
2. **Recurrence-gated graduation [M].** One-offs stay tier-1; clustered geometries
   enter the frequency-sorted moderation queue (depends on tier-3 clustering; beta
   = manual).
3. **Photo/pose detail drawer [M].** Dose-logging sheet pattern; freeform name +
   plain-language tracked regions + correction + arrow tooltip in one surface.
4. **User-correction → moderation signal [S].** Per-user label fix + weighted queue
   input; never a global auto-write.

(Legal / consent / who-moderates: resolved in 2c. Moderation UI: the beta Supabase
admin view from 2c, fed by this queue.)

Original raw braindump (kept for provenance):
> Do we do this for every single pose? For new poses, do we put a "new" flag in the
> UI to avoid making mistakes and then have a moderator see the photo and add the
> "placeholder" arrows on top? Would this be an issue legally?

**2e. Pose-template injection (prompt architecture), RESOLVED + SCOPED (owner 2026-07-22)**

Heavily pre-answered by 2c/2d + point 3. Grounding: the AI service
([index.ts](../supabase/functions/ai-service/index.ts), one edge function) is
already **action-dispatched** with a stable per-action prompt builder
(`visionSystemPrompt(session, hasBaseline, locale, ctx)` injects
measurement/cycle/symptom/transition context into ONE prompt), `classify_pose`
already exists (cheap Haiku), and the classified pose is **already stored on
`PhotoEntry.pose`** at capture. So "classify → analyze with context injected into
one prompt" is already how it works.

Resolution (dissolves "pose-specific prompts + agent forwarding" into a simpler,
safer pattern the service already uses):
- **A pose template is structured DATA, not a prompt**, a region-map
  `[{region, coords, lookAt}]` (the moderator-authored / tier-3-refined artifact
  from 2c/2d). One stable prompt, N data templates. Adding a pose = adding a data
  row, never writing/safety-reviewing a new prompt.
- **Server-side injection, code-level lookup (owner-agreed A).** At analysis time
  the pose is already known (`PhotoEntry.pose`, no re-classify) → server does a
  **DB lookup** of the matching template → injects it as one more structured field
  into the one `visionSystemPrompt` → analyze. Templates **stay on the server**
  (privacy-sensitive geometry + tier-3 IP); the client only sends the image.
  **No per-pose prompts, no per-pose agents, no extra model hop.**
- **Templates are structured region DATA, never free-text instructions
  (owner-agreed B).** Enum regions + bounded coords + look-at hints, consumed as
  data. The observational/hedged/never-diagnose gate stays **immovable in the one
  vetted base prompt**; templates only say "where to look," never "what to
  conclude." Critical post-release, when an **AI agent** authors templates:
  agent-generated content re-entering a prompt must be constrained data so a
  hallucinated/compromised template can't hijack the analysis.
- **Template versioning on each analysis (owner-agreed C).** Record which template
  version an analysis used (via the observation ledger / `priorAnalyses`) so a later
  template fix doesn't silently invalidate past reads; the 2a on-demand deep-analysis
  can re-run them.
- **"Learn the placeholder position" = refining the DATA template** (2d corrections
  + tier-3 geometry clustering), never the model and never the prompt. Keeps clear
  of the "no training on photos" line and keeps the prompt vetted.
- **Missing template → fall back to tier-1** (2d fail-safe); the base prompt works
  with or without a template, so the template is always optional context.

No separate stepped plan: 2e's work is subsumed by 2c tiers 2–3 (template authoring
+ injection) + point 3 (the general "data over prompts, dispatch over mega-prompt"
principle, which the service already follows). Flagged here so the architecture
decision is findable from the photo work.

Original raw braindump (kept for provenance):
> Could AI learn the placeholder position and tweak the prompt for that specific
> pose? Do we create pose-specific prompts and have one of the agents forward it to
> the analysis agent?

**2f. Face analysis, RESOLVED + SCOPED (owner 2026-07-22)**

Not a new mechanism: the same 2a–2e region-arrow + template machinery applied to
the face session. Grounding: the vision prompt already branches on
`session === 'face'` with a region guide ("jawline, cheek fullness, under-eye area,
neck, overall puffiness vs definition"), already carries the water-vs-fat concept
(hypothesis example: "water shift rather than fat loss alone"), and already has the
**identity guard** ("Do NOT identify or describe the person's identity"). So face
arrows already land on face regions and the model already knows puffiness ≠
definition.

2f's real content is three additions, all under *elevated* caution:

1. **Intent-keyed face region templates (owner-agreed A)** via the 2e injection,
   replacing today's one static guide: fat_loss face (cheeks, chin, jaw, jowls);
   weight_gain face (same regions, localized-vs-global foregrounded); beauty face
   and trans face are their own upcoming templates.
2. **Clean-gain expectation:** a lean gain shouldn't move the face much, so face
   change during weight gain is a *fat or water* signal (intent-aware baseline,
   tied to the 2b mirror + `cycleWeek` = early water).
3. **Localized-vs-global disambiguation as first-class (owner-agreed C, observe in
   action):** change concentrated in fat-prone regions (cheeks/chin/jowls) leans
   fat; uniform whole-face puffiness leans water.

**Face-specific guardrails (why face is the highest-caution session):**
- **Identity guard stays ironclad.** Arrows describe *change in a region*, never
  identity, attractiveness, or a face judgment. "Jaw appears more defined" yes;
  "you look better / younger / more masculine" never.
- **Water-vs-fat confidence stays LOW, alternatives always surfaced.** Facial
  puffiness moves with sleep, sodium, alcohol, cortisol, GH peptides (water), cycle,
  time of day. Never a confident "face fat" claim.
- **Face regression arrows gated HARDER than body (owner-agreed B).** A "puffier /
  rounder" arrow is usually noise/water and maximally dysmorphia-triggering, so
  negative face reads require higher comparability + persistence before showing
  boldly and default to the water/sleep/time-of-day alternative framing. Progress +
  maintenance arrows stay normal; only the negative read earns extra restraint. The
  face-specific application of "bias toward uncertainty."
- **Face comparability weights capture time-of-day + lighting harder** (morning vs
  evening puffiness is dramatic).
- **Beauty/aesthetic reads stay observational + refer for anything clinical** (see
  the beauty-compounds sub-point next).

No separate stepped plan: implemented as face-keyed templates within 2c tier 2 +
the 2e injection, plus the regression-gating rule (a small extension of the 2a
comparability gate). Flagged here so the face caution rules are findable.

Original raw braindump (kept for provenance):
> Fat loss: show arrows in appropriate places like cheeks and chin. Weight gain:
> face shouldn't be affected per se if it's clean weight gain; if we detect fat,
> make sure it's fat (localized) and not water retention (general face puffiness).

**2-beauty. Beauty compounds (face + skin categories), RESOLVED + SCOPED (owner 2026-07-22)**
*(owner's second "2e"; renamed to avoid the duplicate label)*

Two distinct pieces:

**Piece 1, beauty face regions.** Just another **intent-keyed face template**
(the "beauty face" template flagged in 2f): crow's feet, smile lines, forehead,
under-eye bags, puffiness. Mechanics fully covered by the 2e injection + 2f face
guardrails. Only new nuance: beauty/anti-aging reads border on dermatology, so
**observational only** ("skin around the eyes appears smoother," never "you look
younger") + a **"check with a dermatologist"** pointer for clinical signs (OTC-style
posture, CLAUDE.md rule 3). Face-regression gating from 2f applies, harder.
(Make-up detected → tell the user to retake without it; make-up confounds the read.)

**Piece 2, conversational entity-creation card (the genuinely new, reusable
primitive).** Skin compounds affect user-specific areas, so categories can't be
predefined. Flow: Pepi asks ("where does your skin usually get dry?") → parse the
NL answer (reuses the quick-log parse) → **show a tickable confirmation card** of
candidates → user ticks which to create → written as custom "parts"/tags (storage
already exists). The **tickable card is the new chat affordance** (today Pepi has
suggestion pills + answer chips, no multi-select-create card) and it is **reusable
app-wide** (goals, compounds, symptom tags, any set of user-defined tracking
entities from free text). Build for skin, design reusable; don't speculatively
refactor all entity creation onto it. The card is the human-in-the-loop step that
keeps the parse from creating unwanted categories (stay conservative: only what the
user named).

**Photo-content policy, DECIDED (owner 2026-07-22, prior-settled, re-confirmed).**
Intimate-area categories (FUPA, lower abdomen, etc.) **are photo-eligible**, and
**nudes are accepted**, minimal coverage is the highest-confidence analysis, and
the app never *solicits* nudes; a user tracking their own progress that way is their
choice. **No nudity-specific block.** Rejection is on **tracking value, not on
skin:** the existing quality/coverage gate already drops non-trackable content (a
genital-only closeup tracks nothing vs a physique baseline → low score → not saved),
while a full-body progress nude tracks plenty → passes. So "sexual-only" content
fails on its merits, no special-casing. CSAM mitigation: **age-restrict the app
listing in the stores** + **formal legal review once there's traction** (owner will
consult a lawyer). Residual item for that review (not covered by age-restrict): the
**AI vendor's acceptable-use policy** on sexual content is a separate constraint
since analyzed photos are sent to the Anthropic API, verify current policy before
the tester pool widens. Reconciles with spec 04/11 photo policy; edits land when
this area is built. Decision locked; do not relitigate.

Stepped plan:

1. **Beauty face template** (crow's feet / smile lines / forehead / under-eye) via
   2e injection, observational + derm-referral posture, make-up retake prompt. `[S]`
2. **Conversational entity-creation card** (Pepi ask → parse → tickable card →
   create custom parts/tags). Reusable primitive; build for skin categories. `[M]`
3. **Photo policy:** confirm the quality/coverage gate cleanly drops non-trackable
   content (incl. sexual-only) with no nudity-specific rule; age-restrict store
   listings; legal review deferred to traction. `[S]`

Original raw braindump (kept for provenance):
> Face: focus on common pain points like crow's feet, smile lines, forehead, bags
> under eyes, general puffiness. Skin: places that get dry easily. Use Pepi chat as
> soft onboarding to create tags/photo categories: "where do you see your skin
> getting dry" → user says "forearms, legs, crotch" → Pepi shows a card of
> categories to tick and create. Reusable for the rest of the app.

**2-trans. Transition tracking, RESOLVED (owner 2026-07-22, light).**
*(owner's second "2f")*

Already mostly plumbed: `transitionContext` (`mtf`/`ftm`) is passed to
`analyze_photo` today and the prompt does direction-aware framing ("goal is the
intent signal, sex alone never implies it"). So this is **two more intent-keyed
templates** (mtf / ftm), body + face:
- **Body:** hip/thigh vs waist fat redistribution, shoulder line, water retention,
  body-hair regions.
- **Face:** cheek fullness, roundness, jaw softening (mtf) / squaring (ftm), hairline.
- **Hair loss (ftm on T, DHT):** observational + **"see a hair specialist"**
  referral (derm-style posture).
- **Voice:** post-MVP, an audio feature not a photo one, out of scope here.
- **Posture:** affirming, "changes consistent with the direction you're tracking,"
  never "you look more/less [gender]," never misgender. Hormone dosing stays
  track-only/observational (testosterone/estrogen are controlled, already gated).

Plan: mtf + ftm templates via the 2e injection; hair-loss referral; voice deferred. `[S]`

**2g. Mole tracking, RESOLVED (owner 2026-07-22, light).**

The one real line is **regulatory**: an app that *screens for skin cancer* is a
medical device (FDA territory) and we are **not** that. Strict posture:
- **Track silently** (a mole is just another region whose change we can detect).
- **On a persistent, comparable change** (size/color/shape), surface a gentle,
  non-alarming **"this spot has changed, worth a professional look"** referral.
- **Never diagnose, never name a condition, never a risk score** (any of these =
  medical device), **never reassure** ("looks fine" is dangerous), and only flag
  *comparable, persistent* change so lighting noise doesn't cause panic.
- Change-detection + referral, deliberately **not** screening. Face moles interact
  with the identity guard, but change-only tracking stays clear of identity.

Plan: mole-change detection reuses the region machinery; referral-only output;
explicitly not positioned as screening. `[S]`

Original raw braindump (kept for provenance):
> Trans, Body: arrows where hormones affect physique (hips, arm hair, water
> retention, maybe voice? post-MVP). Face: cheeks, roundness, hair (point out hair
> loss + suggest a specialist? extra DHT). Moles, keep track, especially face
> moles; silent until something's worth a dermatologist visit.

**3. Prompt architecture, RESOLVED + SCOPED (owner 2026-07-22)**

Grounding: the AI service is **already well-factored, not a mega-prompt.** Action
dispatch (11 discrete actions, each its own focused prompt builder); a shared safety
module already exists ([`_shared/posture.ts`](../supabase/functions/_shared/posture.ts)
= the single `market_category → posture` gate, built to be reused by the Wave-8 MCP
connector too) + `_shared/transition-context.ts`; **code-level hard gates**
(controlled → `isTrackOnly` → no model call); model tiering (Haiku cheap / Sonnet
capable); structured outputs everywhere. So point 3 is "formalize + extend," not
"replace."

**Answer: neither one mega-prompt nor agents. A layered composition model
(owner-agreed A).**
- **"Skills" = composable code modules** (posture.ts is one already). Extend the
  pattern: extract a **voice/hedging** module (currently repeated inline), a
  **locale-rule** module (repeated), a **region-template loader** (2c/2e), a
  **coaching-register** module (2b observe/nudge/coach). Each action composes what
  it needs. **NOT** the Claude "Agent Skills" runtime (SKILL.md loaded at runtime),
  prompts are built server-side in code, deterministically; well-factored code
  modules are the right tool, the runtime would be machinery we don't need.
- **No autonomous agents.** Every surface is a single-shot transform (input → one
  focused call → structured output). An agent that plans its own steps adds
  latency/cost/unpredictability **and erodes the deterministic code gate that is the
  app's most important safety property** ("controlled → no model call" only holds
  because code guarantees it). Multi-step needs (classify → template-lookup →
  analyze in 2e; anomaly → opener → conversation in point 1) are **code-orchestrated
  workflows** (deterministic pipelines, one bounded model job per step), the
  "workflow" tier, never the "agent" tier. Revisit a real agent only for a genuinely
  open-ended, exploratory use case against the four-criteria bar
  (complexity/value/viability/cost-of-error); most Pepi AI fails "open-ended" by
  design.

**The mega-prompt risk lives in ONE place: the vision prompt** (the accumulator,
base rules + session regionGuide + measurement + cycle + transition, and the roadmap
piles on pose templates, coaching branch, face/trans/beauty templates, intent
framing). Fix = **composition, not accumulation:** the vision prompt becomes a
**composer** assembling only the modules relevant to *this* call (a plain body shot
stays lean; a fat-loss-cut-with-strength shot composes more); "what to look at"
(regions) moves entirely into **data/templates** (2e) so the prompt stays about
**posture + hedging + format** (stable, bounded); the safety gate stays in the one
shared module, never re-written per branch.

Traps: (1) premature agent framework, cost + breaks the code-gate safety
determinism (the worst available move); (2) prompt-by-accumulation on the vision
prompt; (3) duplicating the safety gate per branch (must stay one `_shared` module);
(4) over-modularizing (extract only modules with a real reuse/safety reason);
(5) Wave 8's MCP connector is a second AI surface needing the *same* gates, the
shared-module discipline is what makes it safe without re-implementing, so point 3
and Wave 8 reinforce each other.

Stepped plan:

1. **Vision-prompt composer refactor [M], near-term, lands BEFORE the 2c/2e/2b
   templates (owner-agreed B).** Turn the vision prompt into a conditional composer
   so the mega-prompt risk is designed out rather than accumulated. Highest-leverage
   point-3 action; cheap now, expensive after five features append to a monolith.
2. **Extract the next `_shared/*` modules [M]:** voice/hedging, locale-rule,
   region-template loader, coaching-register. Composable, safety-critical fragments
   written once.
3. **Keep multi-step needs as code-orchestrated workflows [S]:** no agent framework;
   deterministic pipelines with one bounded model job per step.

(Applies across the whole app's AI, not just photos. 2e is the worked example of the
"data over prompts" half of this principle.)

Original raw braindump (kept for provenance):
> How do we structure this to avoid making the prompt mega-large and convoluted? Do
> we use agents or skills?

## Implementation order (dependency-sequenced, 2026-07-22)

Every **pending** item across all phases, ordered by **code-block dependency**, not
by size or difficulty (owner: "regardless of implementation size/difficulty/
complexity"). Waves 1-6 + most of Wave 7 are shipped; only their leftovers appear
here. Sequencing into calendar waves is a later pass; this is the build-order
skeleton. Annotations: **needs** = hard prerequisite; **unblocks** = what it opens up.

**0. Beta unblockers (independent, first)**
- **Item 31, Google sign-in return leg** — ✅ **code side DONE (2026-07-22).** Audit
  found no code bug: the native `GoogleSignin` path is wired, the client IDs are in
  every eas.json profile (so the native path runs on device and the browser dead-end
  is bypassed), and the browser-fallback return handling is correct. The dead-end is
  **pure config** (Supabase URL configuration + Google/Apple consoles). Owner has the
  dashboard/console checklist; verified in the batched build.
- **Device-gated verification** (not code-ordered, runs at the next native build,
  owner deferred to a later batched build): item **44** runtime perf profiling
  (Moto G60s class), item **45** minify/R8 smoke test, on-device OLED dark-mode pass,
  and all pending native rebuilds (vision-camera face detector, notifications,
  integrations/HealthKit, lottie).

**1. AI prompt-architecture foundation (Point 3)** — ✅ **DONE 2026-07-22 (commit ed050a9)**
- **3.1 Vision-prompt composer refactor ✅** — `visionSystemPrompt` is now a composer
  of 8 local block-helpers (each returns `string[]` / `[]`, spread in the original
  load-bearing order). Adding a pose region-template later is one helper + one spread.
- **3.2 Extract `_shared/*` modules — partial ✅ + scoped-down.** Extracted the one
  genuinely-clean cross-surface fragment: `_shared/prompt-lines.ts` (`localeLine`,
  vitest-guarded, applied in vision/lab/insights/simple/ledger). Voice/units were
  **left inline** (meaningful per-surface variation; extracting would flatten intended
  wording). The **region-template loader + coaching-register land WITH their features**
  (2c/2e and 2b), not as empty scaffolding now (anti-over-modularization, point-3 trap).
- **3.3 Multi-step needs stay code-orchestrated workflows** (no agent framework) — a
  standing principle, nothing to build.
- ⚠️ Edge function is outside the app green gate (Deno): app gate passed (typecheck /
  lint / i18n / 441 tests / web export); run `deno test` + a branch-deploy smoke check
  before the next `ai-service` deploy. Not yet deployed.
- *Unblocks:* every Point-2 photo sub-point; also feeds connector posture reuse (B1).

**2. Region-arrow contract + arrow UI (2a), the contract every photo sub-point consumes**
- **2a.1 One smart camera** (auto session+pose, picker demoted to fallback). ✅ DONE.
- **2a.2 Review ends on the comparison card** (capture → readout → measurements →
  card). ✅ DONE. Clean-photo card now; arrows backfill once 2a.4 lands.
- **2a.3 `regions[]` structured output** in `analyze_photo` — **separate `direction`
  (grew/shrank) + `favour` (good/bad) + free coords**. ✅ DONE (code; not deployed —
  needs `deno test` + branch smoke). Built on `observations[]` (+favour/x/y/pct).
- **2a.4 Arrow overlay** — `TrendMarker` glyph, direction × color (green ▲ muscle /
  green ▼ fat loss / red ▲ fat gain / red ▼ muscle loss / grey dash none / yellow dash
  low-conf), contrast-adaptive leader lines, tappable tooltip (X / tap-away). ✅ DONE.
  Pure `photo-arrows.ts` + `PhotoWithArrows`; renders once 2a.3 is deployed.
- **2a.5 Measurement-delta arrows** (magnitude allowed, measured, not judged). ✅ DONE.
  Grey/favour-neutral by design; shares the vision overlay + tap paradigm.
- **2a.6 Milestone gating + on-demand deep analysis** (Journal "run deep analysis").
  ✅ DONE. Gating already existed; added per-photo targeting + the Journal tap.
- **2a.7 Measurement guide-line overlay** ✅ DONE. **2a is now complete end to end.**
  Guide line + value chip at each spot for
  consistent measurement; V1 stored positions, later landmark-anchored (2c tier 2).
- *Unblocks:* 2b coaching, 2c, 2d, 2f, beauty, trans, moles.

**3. Pose templates + detail drawer (2e / 2c / 2d), build on regions[] + composer**
- **2e Server-side template injection** (DB lookup keyed on stored pose → into the one
  prompt; templates stay server-side; versioned). **Needs** 3.1 + 2a.3.
- **2c tier 1, unlabeled self-baseline spotlights** (custom poses get arrows). **Needs** 2a.3.
- **2d Template-match fail-safe** (low match → tier-1 + queue) **+ the detail drawer**
  (unifies 2a tooltip + 2c freeform name + 2d correctable regions). **Needs** 2a.4.
- **2c tier 2, anatomical labeling + placement** (server-side; label + coords in
  `regions[]`; no device build). Optional live-guidance keypoints deferred (device build).
- **2d Recurrence-gated graduation** + **user-correction → moderation signal** (per-user
  fix, never a global auto-write).
- **2c tier 3, silent pose-geometry learning** + **consent reconciliation** (CLAUDE.md
  rule 2 + spec 11 + consent copy edits land WITH this; gates tier 3).
- *Unblocks:* face/beauty/trans templates are just more of this machinery.

**4. Integration provider extensions (prereq for 2b passive fill), reusable data plumbing**
- **Apple Health:** add workout **type** + iOS-18 **effort score** to the pull.
- **Health Connect:** add exercise-session pull (type + HR; no RPE on Android).
- *Unblocks:* 2b.4 passive strength fill; also improves TRIMP/load context generally.

> **⚠️ Play Console gate before any PUBLIC Android release (not internal testing).**
> Health Connect read permissions were added to the manifest 2026-07-24 (fixing a
> hard crash on connect: the `react-native-health-connect` config plugin declares
> none of them). **Internal testing tracks do not require review, so the closed beta
> is unblocked.** But Google Play requires a **Health Connect declaration form** plus
> a hosted **privacy-policy URL** before a production/open-testing release, and
> `READ_MENSTRUATION` sits in the sensitive tier that gets the most scrutiny. Fill
> this in during the Branding round (track E), which is already the pass that stands
> up the domain the privacy policy will live on.

**5. Proactive coaching notifications (Point 1), opener infra feeds 2b.6**
- **1.1 `weight_plateau` detection** (extend `anomaly.ts`).
- **1.2 Anomaly → one coach-gated reactive notification** (foreground, 1/day cap).
  1.1 + 1.2 **unblock 2b.6**.
- **1.3 Declining-metrics reflect-and-refer** (observation only, never a dose direction).
- **1.4 Food / plateau in-app Pepi copy** (mechanism not menu; never push).
- **1.5 Alarming-anomaly remote push, deferred to track G** (block 9).

**6. Context coaching + passive fill (2b), needs regions[] + block 4 + Point 1 opener**
- **2b.3 Strength-felt standing chip** in the detailed log (surface already shipped).
- **2b.2 Explicit `intent` + derived `strengthHeld` into `dataContext`.**
- **2b.1 Coaching-framing layer** (2×2 fat-loss logic + weight-gain mirror). **Needs**
  2a.3 + the coaching-register module (3.2).
- **2b.4 Passive strength fill.** **Needs** block 4.
- **2b.5 Routine learning + post-sync reconciliation** (reusable across log fields;
  uses `integration-sync`, exists).
- **2b.7 Weight-gain mirror.**
- **2b.6 Proactive "how'd your lifting feel?" opener.** **Needs** 1.1-1.2.

**7. Face / beauty / trans / moles, consume templates + intent-keying (block 3)**
✅ **DONE 2026-07-24** (commits e06a522 + the tickable card). Owner added **acne**
to scope: hormone-driven in both sexes, visible in the face shots already captured,
and one of the few things a user genuinely cannot self-assess week over week.
- **2f Face templates** (fat_loss / weight_gain) + **regression arrows gated harder
  than body** + localized-vs-global fat-vs-water. Identity guard ironclad. ✅
- **Beauty** face template (crow's feet / smile lines) + the **conversational
  entity-creation card** (Pepi ask → parse → tickable card → create; reusable primitive). ✅
- **Trans** mtf/ftm templates (`transitionContext` already exists) + hair-loss referral. ✅
- **Moles** change-detection + referral-only (never screening/diagnosis/reassurance). ✅

**Built:** `visionRegionGuide` replaces the single static face guide with an
intent-keyed one (cut/recomp → cheeks/chin/jaw/jowls; gain → the same regions
judged localized-vs-uniform, since a clean gain should barely move the face;
mtf/ftm contours; beauty regions behind the `skin` goal; user-named areas last).
Two new composer modules: `visionFaceCautionLines` (negative face reads need
higher comparability **and** persistence, ordinary explanation first, make-up
retake, no attractiveness/age judgments — deliberately one-sided, positive reads
keep the normal bar) and `visionSkinLines` (breakouts as a first-class
observation; moles as change-detection + dermatologist referral only, **never**
a characterization and never reassurance, since "that mole looks fine" is the
read that stops someone seeing a doctor). New `parse_areas` action (Haiku,
extraction-only, never invents a category) feeds the tickable card in Pepi;
result persists to `profile.focusAreas` and flows back into the vision context.

**Deviation from the stated dependency:** built as composed server-side strings,
NOT the block-3 DB template injection (2e), which is still unbuilt. 2e's value is
user-editable versioned templates; four fixed intents do not need that, and the
vision prompt is already a composer whose own comment anticipates exactly this
("one more helper + one more spread"). When 2e lands, these become its default
set. **Block 7 therefore did not need block 3, and block 3 is still open.**

**⚠️ Edge function needs redeploy** (`ai-service`) — client side is pure JS.

**8. Connectors (Wave 8), backend-only, parallelizable from the start; reuses posture.ts**
- **47 B0 Server + auth + inbox** (`connector_event` table; Supabase Auth OAuth; RLS scoping).
- **48 B1 Tool surface, two-way** (reads + inbox writes; **reuses/extends `_shared/posture.ts`**
 , benefits from 3.2; photos excluded; +5th eval boundary).
- **49 B2 Directory launch** (OpenAI + Anthropic review, long pole).
- **50 B3 Widgets** (Today + Verdict cards).

**9. Post-beta platform tracks (larger; grouped as their own code blocks)**
- **G Remote push infra** → **unblocks 1.5** + the step-goal proximity ping + connector push.
- **A Web workbench [L].**
- **F Full per-entity sync engine [L]** (pairs with A; the `connector_event` inbox folds in).
  **Concrete motivation (2026-07-24 incident):** the current snapshot-blob sync has
  no way to express "this device's local state is empty" separately from "the user
  deleted everything" — it's one JSON blob, last-write-wins, wholesale. A sign-in
  race (store not yet hydrated) merged an empty local state over real cloud data,
  and both the snapshot and the F6 normalized mirror faithfully replicated the
  emptiness, permanently losing a user's protocol/doses/symptoms (no paid backup
  tier on this project, so unrecoverable server-side). Patched with defensive
  guards (`isEffectivelyEmpty` refuses to overwrite/delete cloud data with nothing
  — see `src/lib/merge-states.ts`, `src/lib/sync.ts`) rather than fixed at the root,
  because the root fix is this track. Per-entity rows with field-level conflict
  resolution make the failure mode structurally impossible: an empty local state
  has nothing to say about individual check-in/dose/symptom rows, so there's
  nothing to overwrite them with.
- **D HealthKit cycle read + Pepi cycle setup.** ✅ **DONE** (commit db0cb7b).
- **C Monetization** (trial/billing).
- **E Branding round** (custom domain, auth email templates, website, one coordinated pass).

**10. Deferred / backlog (no active dependency)**
- Vial scan (AI vision), storage hardening (pairs with the cloud/sync track), Terra
  (~500 users), storage quotas (pricing-dependent), community cohort insights (needs
  aggregates + N thresholds), per-region posture overrides (mechanism reserved).

**Standing cross-cutting themes** (not phases, carried through the blocks above):
the region-arrow contract (2a.3), the detail drawer (2d), the post-sync reconciliation
+ invisible routine learning pattern (2b.5), the conversational entity-creation card
(block 7), and the consent reconciliation (block 3) are each built once and reused.
