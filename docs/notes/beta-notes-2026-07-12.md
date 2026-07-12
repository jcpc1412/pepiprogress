# Beta notes round 2: analysis (2026-07-12)

Owner notes analyzed point by point: pros, cons, easy wins, easy traps, implementation
sketches, and how each piece ties into what already exists. No code changed. Every open
decision is asked directly in chat (per the working style rule); where I take a position
here it is a recommendation, not a lock.

Effort tags: [S] under a day, [M] days, [L] a week or more of focused work.

---

## 1. Photos

### 1.1 "Get rid of tags at the top" [S if deferred, see 1.3]

Assuming this means the FACE / BODY session chips on the Photos tab (confirming in chat).

**What they do today.** The chips are not just filters: they route capture. Face goes to
the vision-camera auto-capture flow, body goes to expo-camera with the measurement panel.
They also scope the reference photo, the ghost overlay, and the milestone cadences
(face and body have separate encouragement/scientific schedules).

- **Pro of removing:** one less decision before capturing. The tab already defaults to
  the session with the most recent capture, so the chips mostly matter on first use.
- **Trap:** removing them before auto-classification (1.3) exists breaks capture routing
  and reference pairing. There would be no way to tell Pepi "this is a body shot" and the
  ghost overlay would compare across body parts.
- **Recommendation:** keep them until the classifier lands, then remove them as part of
  that rework. They are the manual stand-in for what the AI will do. If they feel loud in
  the meantime, demote them visually (smaller, secondary ink) rather than delete.

### 1.2 Auto-crop to torso [S/M]

Three ways to do it, from cheapest to heaviest:

1. **Capture-time framing guide [S].** A torso-shaped guide overlay on the body camera
   (the level indicator and ghost already live there). Encourages closer framing at the
   source instead of fixing it after. Zero AI cost, zero new deps.
2. **Analysis-time crop box [S/M], recommended.** `analyze_photo` already looks at every
   milestone photo with Sonnet. Ask it to also return a normalized torso bounding box in
   the structured output, store it on `PhotoEntry`, and apply it as a display crop in the
   timeline strip and compare views. We pay nothing extra (same call), and the original
   file is never modified.
3. **On-device body detection [L].** A pose-detection native dep. We already decided
   against body-pose for capture once ("no body-pose gain"); nothing has changed the math.

- **Rule regardless of option: never destructive.** Store the original, crop at display
  and analysis time. A bad auto-crop on a stored file is unrecoverable.
- **Trap:** LLM-vision bounding boxes are decent but not pixel-perfect. Use generous
  padding, and fall back to uncropped when the box confidence is low.
- **Tie-in:** the quality score (PH-1) can gain a framing component ("subject fills X% of
  frame") computed from the same box, which feeds the "closer pics" incentive loop:
  closer shot, higher score, highscore promotion to reference.

### 1.3 The photo reel: dump, auto-recognize, auto-catalogue [L, phased]

The vision: shoot or import a pile of photos, AI classifies body part / pose, the library
groups itself, and only "progress" photos are locked to canonical poses.

**Why it is right.** It matches real behavior (people already take gym mirror pics in
their camera roll), it turns the strictest part of the app into the most forgiving one,
and every extra photo is engagement plus training context for the timeline. Retroactive
import (expo-image-picker with EXIF dates) already exists, so the ingestion door is open.

**The traps, honestly:**

- **Cost per image.** Classification is a cheap Haiku-vision call, but a 40-photo dump is
  40 calls. Mitigations: classify only on import/save (never re-classify), batch requests,
  downscale aggressively (classification needs far less resolution than analysis).
- **Storage cost.** Today photo volume is bounded by the milestone rhythm. A reel makes it
  unbounded. Supabase storage is cheap but not free; we should cap upload resolution and
  consider "originals stay local, cloud gets compressed" for non-progress photos.
- **Junk and misclassification.** People will dump screenshots, pets, other people.
  Human-in-the-loop fixes this cheaply: the classifier proposes, a one-tap chip row
  confirms ("Body: front relaxed. Correct?"). Confirmed labels are ground truth.
- **Comparability erosion.** Uncontrolled poses cannot feed the scientific compare. The
  locked-pose "progress" track solves this: analysis, ghost overlay, and milestones only
  ever use locked-pose photos; the reel is context and engagement.
- **Scope.** This is a full Photos-tab rework, not a feature. Phasing keeps it shippable:

| Phase | What ships | Effort |
|---|---|---|
| 1 | Multi-shot capture session + manual pose chips at save + reel view grouped by label | [M] |
| 2 | Haiku auto-classification on save/import, confirm-chip flow, session tabs removed (1.1) | [M] |
| 3 | Full reel UX: timeline dump view, pose filters, per-pose ghost references | [M/L] |

**Data model:** `PhotoEntry` gains `pose` (canonical enum + `other`), `poseConfidence`,
`isProgress` (locked-pose flag). `pickReference` extends to prefer same-pose references
(it already ranks by coverage and quality, so this is one more sort key).

**On the canonical pose set:** the notes list front relaxed, side chest, front face, side
profile. Note that "side chest" is a flexed bodybuilding pose; mixing flexed and relaxed
in one progress track hurts comparability more than camera distance does (flexing changes
apparent muscularity and waist). Recommendation: relaxed poses for the core track (front
relaxed, side relaxed, front face, side profile), flexed poses allowed as additional
tracks for users who want them. Confirming the set in chat.

### 1.4 Watermarked download, Strava style [S/M]

Two distinct products hiding in this note:

1. **Stat card [S], recommended first.** A branded share image: timeframe, weight delta or
   body-fat band, a sparkline, the Pepi mark. No photo needed. This is the Strava-effect
   artifact (screenshots in group chats), and it is the safest thing to let loose.
2. **Photo export with optional watermark [S/M].** Render photo + overlay to an image via
   view-shot, hand it to the OS share sheet. With/without watermark toggle as noted.

**Spec check:** this does not collide with the deferred public-sharing area (14). Area 14
defers in-app hosting/feeds and the moderation stack. This is user-initiated export to the
user's own device through the OS share sheet; we host nothing and distribute nothing. The
photos-private-by-default rule stays intact because the user is explicitly exporting.

- **Traps:** (a) keep medical-sounding claims off the card; a body-fat number on a shared
  image should read as an estimate band, not a lab result. (b) Watermark default should be
  off for photos (a brand mark on a shirtless progress pic is a bigger ask than on a run
  map); on by default for the stat card is fine. (c) Never watermark the stored original;
  bake it only into the exported copy.
- **Tie-in:** the natural moment is right after a milestone analysis or a new quality
  highscore; the celebration UI (PH-2) can offer "Share this" contextually.

### 1.5 Review step rework: two steps, big quality score [M]

**Grounded pain:** in `photo-capture.tsx` the retake/save bar renders inside the review
ScrollView below the measurement panel, so on body sessions the primary actions are below
the fold. That is a straight bug-tier UX miss, worth fixing even if nothing else here ships.

**Proposed flow (matches the notes):**

- **Step 1: the shot.** Photo in a dark frame (near-black surface token, not #000, per
  the tinted-neutral rule), a large quality score, capture metadata (tilt, distance), and
  a fixed footer with Retake / Continue that never scrolls away. The instant read (PH-2)
  already computes the score here; if quality clears the threshold, kick the deeper
  analysis off in the background during step 1 so its result is warm by the time the user
  finishes step 2. Copy sets the expectation: analysis comes after this.
- **Step 2: measurements (body only).** Waist / hips / neck / extra, prefilled from the
  last entry with a one-tap "same as last time", skippable. The hedged body-fat estimate
  already updates live here.

- **Pro:** primary actions always visible; the score gets the stage it deserves; the
  measurement ask stops competing with the save decision.
- **Trap:** a second step can depress measurement completion. Prefill plus one-tap carry-
  forward is the mitigation; a skip is honest (they were already optional).
- **Tie-in:** step 1's big-score moment is the same surface where the highscore
  celebration and the share offer (1.4) live. One coherent "result" screen.

### 1.6 Progress overlay: lines and triangles on the photo [L, prototype first]

Directional (owner is sketching). Feasibility and risk analysis so the sketch lands on
solid ground:

**Feasibility.** Free-coordinate drawing from LLM vision is the weak point: models are
good at "what changed where" in words and mediocre at consistent pixel coordinates across
two photos. The robust version is **zone-anchored annotation**: define fixed anatomical
zones per canonical pose (jawline, shoulders, upper abdomen, waist, hips, thighs), have
the model return per-zone direction + confidence + note, and let the client render arrows
at pre-defined anchor points for that pose. Deterministic rendering, model only does what
it is good at. This also only works reliably on locked-pose photos, which ties it to 1.3.

**Direction colors:** reuse the verdict engine's goal-aware favour mapping (up_good /
down_good per metric and goal). A leaner waist arrow is green for a cutter, and the same
visual system flips correctly for gain goals. No new semantics needed.

**The traps, and they are real:**

- **"Exaggerated interpretation" is false precision.** Lines drawn on a photo read as
  measurement, not vibes. The vision gate (observational, hedged) exists precisely to
  avoid overclaiming; an exaggerated overlay un-hedges it visually even if the words stay
  hedged. Mitigations: only render at high comparability, show confidence, cap at one or
  two zones per compare, and label the overlay as an estimate.
- **Body-image harm.** This audience skews body-focused; red down-triangles on a body
  photo on a bad week is a churn and wellbeing risk. The no-shame principle (spec 03)
  should extend here: regression states get neutral treatment, not red alarms.
- **Body-fat in the footer:** show the Navy band when measurements exist; an AI-eyeballed
  number has a wide error and should render as a range with "estimated", never a point.

**Recommendation:** wait for the sketch, then build a flag-gated prototype on locked-pose
pairs only, zone-anchored. Do not ship exaggeration; ship confidence.

### 1.7 Cycle-aware analysis copy and a lightweight tracker [S + M]

**What already exists (relevant, partly built):**

- Cycle settings (last period date + cycle length) live in Protocol settings and already
  flow into `analyze_photo` as `cycleContext`.
- The Apple Health provider declares a cycle capability, but there is **no read
  implemented** for menstrual data yet (verified: the quantity map and category reads do
  not include it). Flo, Clue, and Apple Cycle Tracking all write to HealthKit, so one
  category-read addition gets us third-party tracker data with no partnership.

**The deltas, in order of effort:**

1. **[S] Prompt copy pass.** When cycle phase suggests water retention (late luteal /
   menstrual), the vision prompt should attribute rather than criticize, and hedge.
   Suggested register: "some water retention is consistent with this point in your
   cycle" rather than the notes' "hormonal inflammation detected", which reads as a
   diagnosis and would trip the observational gate. Suppress bloating-as-regression
   language entirely when phase data supports it. Only when data exists; never guess.
2. **[M] HealthKit menstrual read.** Add the category read, map to the canonical cycle
   metric, feed the same `cycleContext`. Rides the same pending device build as the rest
   of HealthKit.
3. **[M] Conversational setup for non-trackers.** The typical-day setup flow through Pepi
   chat is the exact pattern: Pepi asks last period + rough regularity, writes the same
   profile fields the settings screen writes. Irregular cycles get wider uncertainty
   windows (suppress confidently-phrased attributions when regularity is low).

**Sensitivity note:** menstrual data is special-category health data in most privacy
regimes and politically sensitive in some markets. It already stays local-first and out
of community aggregates (metric readings never migrate); keep it that way and say so in
the privacy copy.

### 1.8 Weight-gain users: what do we track and show? [M]

The honest answer to "can AI see muscle vs fat better than the eye": it can describe
composition change directionally (fullness, definition, silhouette) but cannot measure
lean mass from a photo. The product should lean on the signals that are actually
informative for gainers, in this order:

1. **Weight trend vs waist trend.** The classic clean-bulk dashboard: weight up while
   waist stays near-flat is the win condition. Both exist today; the verdict engine is
   already goal-aware (up_good for gain), so this is mostly a surfacing decision.
2. **Circumference growth.** Arms, chest, thighs matter most to this cohort, and today
   the photo flow allows only one extra measurement slot. For gain goals, allow multiple
   extras (or make the set goal-dependent through the existing field-surfacing rule).
3. **Performance data.** Workout minutes and HR already sync; strength progression would
   need Hevy-style integrations (deferred on the keys/signup rule).
4. **Vision language, not vision numbers.** Let the model speak to fullness and shape in
   hedged terms; never output a lean-mass figure from a photo.
5. **Optional [M]: FFMI band** computed from height + weight + the Navy body-fat band,
   presented as a range. Useful for gainers, same hedging rules as body fat.

**Trap:** promising muscle-vs-fat discrimination from photos is an overclaim that will
eventually be visibly wrong (lighting and pump swing apparent muscularity day to day).
Frame everything directional plus measurement-backed.

### 1.9 Transition tracking (MTF / FTM) [M]

More is in place than the notes assume: the sex field already includes mtf/ftm, the Navy
formula selection follows hormonal sex (mtf uses the female formula), and the verdict
engine's fat-pattern logic is keyed the same way.

**Proposed v1 scope:**

- **Goal chip:** "Track my transition" appears in onboarding goals only when sex is
  mtf/ftm. Visible, not preselected (some trans users are here for peptides, not
  transition tracking; auto-forcing the goal assumes intent we do not have). This
  answers the onboarding note (section 2) as well.
- **Field surfacing:** the goal maps into the existing goals-union rule; likely fields:
  skin, mood, libido, plus measurement emphasis on hips/waist ratio for redistribution.
- **Direction-aware analysis:** the photo prompt gets a transition context block, so fat
  redistribution reads as progress in the right direction (hip gain for MTF is a win,
  not a regression), and language follows the user's direction.
- **Unchanged:** the controlled-compound gate. HRT testosterone stays track-only; that
  rule is legal, not editorial.

**Sensitivity:** this data can out someone. Local-first by default helps; transition
data should be excluded from community aggregates until cohort sizes make k-anonymity
real, and the privacy copy should say clearly what is stored where.

**Why it is worth it:** underserved segment with high logging motivation, long time
horizons (multi-year), and a genuine fit for the photo timeline USP.

### 1.10 Prompt architecture (direct question from the notes)

**Current state:** one system prompt per action (`analyze_photo`, `simple_analysis`,
parse, insights), each with the safety gate baked in, and per-user context injected as
structured user-message content (body-type calibration, cycle context, cycle week,
units, goals). There are no separate prompts per sex or goal.

**Recommendation: keep one base prompt per action, compose context blocks.** Reasons:
the gate stays in exactly one place per action (divergent prompts are how gates drift),
prompt caching stays effective (stable system prefix, variable user context), and new
segments (transition, gain, cycle) become additive blocks instead of prompt forks. The
work in these notes adds three blocks: goal-direction block, cycle block (1.7),
transition block (1.9).

---

## 2. Onboarding

Covered by 1.9: conditional "Track my transition" goal chip, shown for mtf/ftm, not
preselected. One extra consideration: the goal list is otherwise identical for everyone,
so the conditional chip must not leak into the community goal taxonomy with tiny N
(k-anonymity, same note as above).

---

## 3. Pepi as companion: the suggestions pivot

### 3.1 What the locked rule actually says

Worth stating precisely, because the notes argue against a broader rule than the one that
exists. The locked rule (spec 05/11) is: **dosing suggestions are deferred app-wide until
there is a legal solution, and controlled compounds are track-only.** It has never
prohibited lifestyle advice. The sterile feel comes from two softer sources: the
Instrument voice (VOICE.md) and the hedged AI gates written to the most conservative
interpretation. So most of this pivot is prompt-and-product work, not a spec reversal.
The one real policy decision is OTC medications (3.3).

### 3.2 Proposed three-tier suggestion policy

| Tier | Contents | Posture |
|---|---|---|
| A: Lifestyle and behavior | Sleep hygiene, hydration, nose rinse, training-effort framing, generic calorie/protein targets, recovery habits | Allowed, including proactively. This is standard wellness-app territory (Whoop, Oura, MFP all do it). |
| B: OTC medications and topicals | "Consider an anti-inflammatory", creams, supplements beyond protein | Reactive only, hedged, referral-framed for beta. Scope with counsel before public launch. See 3.3. |
| C: Never | Dosing or protocol changes for any tracked compound, anything about controlled compounds beyond tracking, diagnosis | Unchanged. Most tracked peptides are grey-market research chemicals; "no suggestions for grey/black market compounds" from the notes and the existing rule are the same rule. |

Generic calorie targets sit in Tier A deliberately: "most people your size aiming to cut
eat around X to Y kcal" is textbook wellness content. Personalized deficit prescriptions
tied to medical conditions would not be.

### 3.3 The anti-inflammatory question, answered directly

Not legal advice, and this needs counsel before launch, but the practical read: telling
someone "consider taking an anti-inflammatory for your knee pain" is generally not
*illegal* as information, but it is (a) personalized medication advice, which moves the
app toward regulated territory (FDA software-as-medical-device framing in the US, MDR
classification risk in the EU, App Store guideline 1.4.1 scrutiny for medical apps), and
(b) a liability surface: NSAIDs are contraindicated for plenty of people, and Pepi knows
the user's compound stack, which arguably *raises* our duty of care rather than lowering
it (we "knew" about interaction risk). A cream is the same category with lower systemic
risk, not a different category.

**Beta posture that keeps almost all the helpfulness:** referral phrasing. "That knee
pain has shown up three sessions in a row. Worth asking a pharmacist about an
anti-inflammatory option" delivers the same nudge while placing the medication decision
with a professional. Tier B graduates to direct suggestions only after counsel scopes it.

### 3.4 Proactive anomaly engine: the ceramics-night loop [M, phased]

The architecture that makes this affordable: **detection is deterministic and free,
AI only handles conversation.**

1. **Local detectors [S/M].** `derived-metrics.ts` already computes baseline-relative
   signals (for example, unexplained RHR elevation with the training-load caveat). Add a
   small set of deviation detectors: sleep quality/duration vs rolling baseline, weight
   jump, dose-adherence drop, workout-quality drop. Pure functions, zero tokens.
2. **Conversational opener [S].** A detector firing queues a Pepi opener chip or a
   notification deep-linking into chat (both patterns exist from typical-day). The opener
   itself is templated i18n copy; no AI call until the user replies.
3. **Context memory [M], the new primitive.** When the user explains ("ceramics class,
   dust, clogged nose"), Pepi stores a small structured note: trigger pattern (weekday
   evenings, tag: ceramics), affected metric (sleep), explanation. Future detector hits
   check context memory first: known cause plus recurrence means Pepi can graduate from
   "why was sleep bad?" to "ceramics night again? have you tried a saline rinse before
   bed on those nights?" (Tier A suggestion). This entity is also gold for the insights
   prompt and the correlation chip, which currently reason from raw numbers only.
4. **Habit inference [M, later].** Recurrence detection over context memory (same
   weekday, same explanation) instead of asking the user twice.

**Trap:** proactive pings are the fastest way to get notifications disabled app-wide.
Anomaly openers should be rare (cap per week), bundled into existing check-in prompts
where possible, and instantly dismissable with "stop asking about this".

### 3.5 Community data into suggestions [M/L, after aggregates exist]

The community pipeline was always meant for output surfaces; spec 12 gates output and
scale, not existence. The safe shape: **observational cohort phrasing with minimum
cohort sizes** ("users on similar stacks most often reported this settling around week
3"), never prescriptive, never dosing (Tier C), and only above an N threshold that makes
re-identification unrealistic. This is downstream of the normalized sync engine actually
populating aggregates, so it is a direction to design toward, not a near-term build.

### 3.6 Instrument vs companion: resolve it as a setting, not a fork [S/M]

The notes frame it as sterile-tool-versus-think-for-me. That is a real segmentation (the
meticulous loggers versus the guide-me majority), and it does not need to be decided
globally: add a **coaching level** preference (observe / nudge / coach).

- **Observe:** today's behavior. Data in, hedged reads out, no unsolicited suggestions.
- **Nudge (default):** anomaly openers (3.4), Tier A suggestions when contextually
  earned, gentle goal framing.
- **Coach:** proactive weekly focus, targets, habit follow-ups.

One prompt parameter plus notification-policy differences. The Instrument voice stays;
warmth was already added in the A-5 pass. Companionship here comes from *timing and
initiative*, not from chattiness.

### 3.7 Cost and the provider question [decision needed, but measure first]

Rough orders of magnitude at current pricing: a Pepi chat turn on Haiku (a few thousand
tokens in with context, a few hundred out) costs about half a cent; even a heavy user
having 10 chat interactions a day lands near a dollar per month. Vision analyses on
Sonnet cost a few cents each and are milestone-gated. The companion features as designed
above deliberately keep the new always-on parts deterministic, template-driven, or
chip-driven, so the marginal AI cost of the pivot is mostly "more chat turns".

**Recommendation:** do not switch providers on a guess. Instrument per-feature token
counts in the edge function (one log line per call: action, model, in/out tokens), let
the beta produce two or three weeks of real usage, then run the bake-off that is already
on file as deferred. Two additional cautions: any provider switch requires re-validating
the safety gates per action (gate behavior is prompt-and-model-specific, and Tier C is
legal exposure, not tone), and prompt-cache economics differ per provider, which can
erase a headline price gap for our long-stable-prefix prompts.

---

## 4. Logging

### 4.1 Conversational micro-logging [M]

Diagnosis in the notes is correct: the detailed log is a once-a-day wall, and side
effects especially want to be captured in the moment, conversationally.

**Design: micro check-ins.** Two scheduled moments by default (morning, evening), each a
Pepi chat prompt covering one to three fields. Answers are **chips first** (1 to 5 scale
chips, yes/no, "usual" from typical-day), which cost zero AI; free-text replies fall
through to the existing quick-log parser, which already writes check-ins, symptoms,
doses, and weight. The rolling one-check-in-per-day model with upsert merging means
snippets through the day compose into the same daily entry with no data-model change.

- **The detailed log stays** as the power-user and backfill surface; micro check-ins are
  an alternative front door, not a replacement.
- **Trap 1: notification fatigue.** Per-prompt opt-out, hard cap on prompts per day, and
  anomaly openers (3.4) ride the same scheduled moments rather than adding new ones.
- **Trap 2: half-empty days.** Fine by design; field-surfacing already adapts, and the
  verdict engine treats missing fields as missing, not zero.

### 4.2 "Ask me in an hour" [S]

Snooze is a reschedule of a local one-shot notification; both primitives exist. Intent
detection can start as a lightweight pattern match in chat ("snooze", "later", "in an
hour") before it earns a slot in the parse schema.

**Adaptive timing [M, next step]:** log when the user actually responds to each prompt,
shift the scheduled time toward the median engagement hour. Deterministic, private,
no AI involved.

### 4.3 "Tone down the notifications" [S]

Map a chat intent onto the existing notification preferences. One rule: **never silently
change settings from chat.** Pepi confirms what changed ("Reduced to one check-in a day.
You can change this anytime in settings") and the change is reversible in the same
place it always was. Same pattern later extends to "ask me about doses at 9 instead".

---

## 5. Miscellaneous: passive calorie sync is broken (bug, P0 of this batch)

Verified in code; this is a real data-correctness bug with two stacked causes:

1. **Daily aggregates can never update.** Health nutrition samples are summed per day and
   stored with a midnight timestamp. `addMetricReadings` dedupes on
   `provider|metric|timestamp`, so the first sync of the day writes "calories so far"
   and every later sync of the same day computes a new total that hits the same key and
   is silently dropped. Whatever value the morning sync captured is frozen all day.
   Exactly the reported behavior.
2. **Incremental windows undercount.** Pulls use `since: lastSyncAt`, so even without the
   dedupe, a later pull would sum only the samples logged since the last sync and call
   that the daily total.

Also relevant: sync runs on mount and foreground with a 15-minute throttle. There is no
iOS background fetch, so "passive" always means "next time the app is opened", which is
expected behavior, not part of the bug.

**Fix plan [S/M]:**

- For summed-per-day metrics, widen the query window to the start of the earliest day
  touched by `since`, so daily totals are always computed from complete days.
- Add upsert semantics for aggregate readings: same provider/metric/timestamp replaces
  when the value changed instead of being skipped. (Point-in-time samples keep dedupe.)
- Display-side, prefer the live resolver over copied snapshots: the manual-beats-synced
  precedence logic already exists from the typical-day work, so a check-in field the
  user never touched can reflect the latest synced total at read time instead of
  freezing at autofill-tap time.

This one should ship before any of the above; it silently poisons the nutrition signal
and the verdict.

---

## 6. Priority map (recommended, not locked)

| # | Item | Effort | Why this slot |
|---|---|---|---|
| 1 | Calorie sync fix (5) | S/M | Data-correctness bug feeding the verdict |
| 2 | Review-step rework + big score (1.5) | M | Fixes a below-the-fold action bar; high-visibility polish |
| 3 | Cycle prompt copy pass (1.7 step 1) | S | Deployed edge-function change, immediate tone win |
| 4 | Coaching-level setting + Tier A prompt work (3.2, 3.6) | M | The companion pivot, cheapest valuable slice |
| 5 | Micro check-ins + snooze + tone-down intents (4.1 to 4.3) | M | Attacks the logging-chore churn risk directly |
| 6 | Anomaly detectors + context memory (3.4) | M | The memorable "Pepi noticed" moments |
| 7 | Stat-card share, then photo watermark (1.4) | S/M | Organic acquisition loop |
| 8 | Reel phase 1: multi-shot + pose chips (1.3) | M | Foundation for auto-classification |
| 9 | Transition goal + prompt block (1.9, 2) | M | Underserved segment, mostly prompt + surfacing |
| 10 | Gain-goal measurement emphasis + FFMI band (1.8) | M | Completes goal symmetry |
| 11 | Reel phase 2 + kill session tabs (1.3, 1.1) | M | Needs phase 1 plus cost instrumentation |
| 12 | Auto-crop via analysis bbox (1.2) | S/M | Piggybacks the vision call |
| 13 | HealthKit cycle read + chat cycle setup (1.7) | M | Rides the pending device build |
| 14 | Progress overlay prototype (1.6) | L | Waits on the sketch; flag-gated |
| 15 | Community-cohort observational insights (3.5) | L | Downstream of normalized aggregates |

Provider bake-off: scheduled by data, not by calendar; instrument token usage first (3.7).
