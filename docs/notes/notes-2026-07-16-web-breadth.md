# Notes round 3: web interface, breadth, storage, partnerships (2026-07-16)

Owner notes organized per topic: summary, what was said, my analysis (the requested two
cents), and the questions I asked in chat. Owner answers get recorded inline per topic;
once all are answered this hardens into the plan.

Question numbering (Q1 to Q10) matches the chat message of 2026-07-16.

---

## 1. Web interface: the data workbench

**Summary:** a desktop/web surface built around a fully editable calendar. Editing any
day opens the detailed logging sheet (even when empty) so text and images can be logged
retroactively. Positioned as the "Excel competitor": the people currently tracking
protocols in spreadsheets are a core segment, and the web surface courts them directly.

**What the owner said:**
- Calendar view with fully editable information; editing shows the detailed log sheet
  even if empty; retroactive logging of text and images.
- The "Excel competitor" angle.
- ChatGPT/Claude connectors could ship data into it from conversations and act as a
  "fetch" system instead of relying on Pepi's own prompt; possibly part of external
  automations.
- Market the website as the primary pull, then ship users to the App Store when the
  photo requirements come? Double onboarding?
- If the phone is the condensed version, what does desktop look like?
- Custom charts: web > insights > new custom chart > select from a managed metric list.
  Do they sync to the phone? Do we control what displays on the phone? Mirror
  duplication or per-surface interfaces?
- Static site vs heavy animation: owner leans "web as a playground for animations and
  design while staying close to the phone's architecture."

**My two cents:**
- **The Excel-competitor framing is the strongest new idea in these notes.** The
  leverager persona lives in spreadsheets today; a keyboard-friendly, calendar-first,
  bulk-editable web surface is a real switching pitch that no one in either competitor
  camp offers. It also gives the connectors story its natural home: assistants write
  events in, the web workbench is where you audit and correct them.
- **One codebase.** The app already exports to web (Expo + expo-router, SPA). Desktop is
  the same app with responsive, denser layouts and web-only views (calendar, chart
  builder), not a second product. A separate web app would double every i18n string,
  token, and store change forever. The "playground" instinct is compatible: animation
  and density can diverge per surface while tokens, copy, and data stay shared.
- **Web-first marketing has a real problem: the USP is native.** Camera capture, ghost
  overlay, vision auto-capture, HealthKit: all phone. Web-primary onboarding sells the
  weakest surface first and creates the double-onboarding cost the owner already
  suspects. The stronger sequencing: phone remains the product's front door; web is the
  power surface marketed to the spreadsheet crowd and unlocked by the same account.
  Web-based photo *upload* (drag a folder of dated pics into the calendar) is fine and
  actually great; photo *capture* stays native.
- **Custom charts: yes, curated.** The canonical metric namespace already exists
  (spec 06); the builder is "pick 2 or 3 metrics, overlay on one time axis, save". Saved
  charts are data (a small config object), so they sync like everything else; the phone
  renders a compact pinned version on the Analysis tab. Per-surface presentation, shared
  definitions: not a pixel mirror.
- **Sequencing:** this is a post-beta track that pairs naturally with the connectors
  work (both need the account + normalized-ish cloud story). Calendar + detailed-sheet
  editing first (it is the retro-logging feature), chart builder second, animation
  polish last.

**Owner answers (2026-07-16), all four DECIDED:**
- **Q1 architecture:** one codebase, and push the responsiveness further than
  phone/desktop: the goal is interface-agnostic reuse ("if I want to use it with an
  Xbox, I could"). Implication: layouts key off capability classes (pointer/touch/remote,
  density, input method), not device names; tokens/copy/store stay single-source.
- **Q2 role:** fully agreed: web is the power workbench, phone stays the front door.
  Web photo upload yes, capture stays native.
- **Q3 custom charts:** as proposed (curated metric overlays, saved as synced config,
  compact pinned rendering on the phone's Analysis tab).
- **Q4 calendar:** the calendar is the web's **primary** navigation metaphor. The web
  surface IS the spreadsheet-journal; phone-mirroring tabs are secondary.

---

## 2. Value for non-compound users

**Summary:** if the focus sharpens on compound users, what keeps non-compound users
around? Is the AI photo analysis + storage enough?

**What the owner said:**
- How do we provide value to non-compound users?
- Is the AI analyzer and image storage enough?

**My two cents:**
- The evidence engine is compound-agnostic by construction: field surfacing is
  goals ∪ effect-tags ∪ monitoring-tags, and with zero compounds it degrades gracefully
  to goals-driven tracking. A non-compound user gets: photo AI + timeline, the verdict,
  typical-day logging, integrations, lifestyle coaching (now direct), PDF reports. That
  is genuinely a product, roughly "Bevel with photo evidence."
- **But do not spend positioning on them in v1.** The differentiated story is protocol
  to outcome; diluting the pitch to court users the horizontal camp already serves well
  is how the wedge gets blunt. Serve them, do not market to them.
- **The quiet strategic value: they are the control group.** Non-compound users
  running the same goals with the same measurement rigor make the future community
  comparisons meaningful ("users on X vs users on nothing"). Worth keeping them healthy
  in the funnel for data reasons alone.

**Owner answer (2026-07-16), DECIDED with a sharpening:** no marketing spend on them,
but the app must be **self-marketable** to non-PED users: shown cold to, say, an HRT
subreddit, it has to sell itself and never feel gated for performance-drug users. Geared
to athletes primarily, but it must visibly help cosmetics users (GHK-Cu), trans users,
and people who do not exercise at all.

**Resulting work item (SM-1, small):** a self-marketability pass over onboarding and
store-facing copy: goal-first framing, the compound step reads as clearly optional (not
a gate), at least one non-PED goal path feels first-class end to end (cosmetic/skin,
transition, plain body comp), and App Store subtitle/screenshots lead with
protocol-to-outcome evidence rather than PED vocabulary.

---

## 3. Storage caps and photo weight

**Summary:** should there be a storage cap to avoid abuse; how heavy are our images; is
this even a real worry?

**What the owner said:**
- Reckon we should cap storage to avoid abuse; how much is enough?
- We send compressed images, but how much do they weigh?
- Is this an unnecessary worry?

**My two cents (with the actual numbers):**
- **Finding: uploads are heavier than assumed.** Capture is JPEG at quality 0.8 with
  **no downscale on the upload path** (only the AI-analysis path resizes, to 768px). A
  modern iPhone frame at q0.8 lands around 2 to 4MB. Two photos a week is roughly 300MB
  per user per year.
- At Supabase storage pricing (~$0.021/GB/month) that is about $6/month per 1,000
  active users: not scary, but the photo reel (multi-shot dumps) multiplies it, and
  full-res originals buy nothing for display or vision.
- **Recommended fix now [S]:** resize on upload (long edge ~2048px, q0.8, roughly 0.5 to
  0.8MB each; plenty for comparison and vision) while keeping the full-res original in
  the local file store. That cuts cloud weight ~4x before any policy is needed.
- **Caps: a freemium design question, not a beta one.** Track per-user storage (one
  column, cheap) from now; define quota tiers when the paid plan is specced. A
  server-side max-file-size guard on the bucket is worth adding immediately as an abuse
  backstop. Verdict on the worry: half-necessary; the compression fix matters now, the
  cap can wait.

**Owner answer (2026-07-16):** no objection to the compression fix (**proceeding**:
resize-on-upload ~2048px long edge at q0.8, original kept in the local file store, plus
a bucket max-file-size guard). Quotas defer to the pricing-model decision. The owner's
substantive reply went to the freemium premise itself ("the problem with freemium is
that it might be too good to pay for premium"), which merged into the Q9 monetization
thread below.

---

## 4. Partnering with compound databases

**Summary:** feasibility/legality of partnering with an existing compound-experience
database to nourish ours, offering Pepi at a discount to their audience. Named:
peptidebase.io, reptides.co.

**What the owner said:**
- Would it be feasible/legal to partner with an existing database re: compound
  experience, to constantly nourish our database?
- Provide our app at a discount to them?

**My two cents (checked what these actually are, 2026-07-16):**
- **reptides.co is not an experience database; it is better for us than one.** It is an
  evidence wiki: ~60 peptides, ~1,600 cited sources, claim checks, evidence-ranked tiers.
  That is *exactly* what rung 1 of the spec-05 sourcing ladder wants (curated, cited,
  versioned facts). A content-licensing deal (their cited summaries feed `compound_fact`
  with attribution, their brand gets in-app credit + a discount code for their readers)
  is legally ordinary and high value.
- **peptidebase.io is a provider directory** (2,700+ vendors/clinics scored, FDA
  records). A partnership there is an *acquisition* channel (their users need a tracking
  layer), not a data source. Caution: it is vendor-adjacent; deep integration with a
  compound-seller directory is exactly the "steroid app" optics store review punishes.
  Cross-promo and a discount code: fine. In-app vendor matching: not in v1.
- **Legality in general:** licensing curated, published content is a standard agreement
  (provenance is their cited public sources). If any partner ever offers *user*
  experience data, that changes the analysis entirely (consent chain, health-data
  transfer); none of the named ones do.

**Owner answer (2026-07-16), DECIDED: hold all outreach.** Only reptides is
interesting (owner believes they may be community-sourced; needs to dig more), and there
is a real competitive fear: approaching them could inspire them to build their own Pepi.
Posture until further notice: no contact; treat their public wiki purely as a
*reference* when curating our own `compound_fact` entries (our citations go to the
primary sources they cite, never wholesale copying their content). Peptidebase
cross-promo: not pursued for now.

---

## 5. All-in-one breadth: cycle, nutrition, workouts

**Summary:** the market moves to all-in-one. Candidate additions: lightweight cycle
tracker, nutrition, workouts (API pull + AI parse + AI adjustment). Owner acknowledges
it might be too much, but sees engagement that makes the app undroppable and could fund
a free plan where "their payment is the data they provide," with premium making that
optional.

**What the owner said:**
- Lightweight cycle tracker.
- Nutrition app (unsure what).
- Workouts: pull from a database via API, parse with AI, track; helps the effort story
  and overall load; AI could adjust based on sleep, goals, progress, combined with
  nutrition.
- Something else?
- Simple implementations, "although nothing is ever simple."
- Maybe too much, but the engagement could make the app undroppable and fund a free
  plan (data as payment; premium makes it optional).

**My two cents: rank breadth by verdict contribution, not by category checkbox.**
The moat logic (and the one non-fluff thing in the external review) says depth first:
every added surface must feed the evidence engine or it is Bevel cosplay.
- **Cycle tracker: yes, already decided** (2026-07-12: chat-based lightweight setup +
  Health read). Cheap, feeds photo analysis and the verdict. No new decision needed.
- **Workouts as evidence: mostly exists; finish it.** Health already syncs workouts,
  duration, HR (feeding TRIMP load); the chat parser can take "bench 5x5 at 80kg". The
  gap is a modest strength-log entity + volume/load trends. That is [M] and directly
  improves the effort/recovery signals. **AI-adjusted programming** (adjust training by
  sleep/goals/progress) is a *coach-tier feature on top of existing data*, not a workout
  app build; it fits the direct-lifestyle-coaching decision and the adaptive coaching
  level. Sequence it after the compound-intelligence core.
- **Nutrition logger: no.** This is the biggest trap in the list. Food logging is a
  brutal, saturated, low-margin product (databases, barcode scans, portioning UX) and
  the Health backdoor + typical-day + manual macros already deliver the data the verdict
  needs. Revisit only if beta shows the backdoor failing for most users. AI
  photo-of-meal estimation is a cheaper future experiment than a logger.
- **"Something else":** nothing new; the highest-engagement additions are already
  decided (micro check-ins, anomaly openers, compound intelligence).
- **On "their payment is the data":** today community contribution is opt-in and
  independent of tier, and input is never gated. Making the free tier *require*
  contribution inverts that into forced consent, which is legally fragile for health
  data (GDPR consent must be freely given; conditioning core service on it fails that
  test) and reputationally off-voice. The defensible version: free tier exists on its
  own merits; contribution stays opt-in with real perks (community insights access).

**Owner answers (2026-07-16):**
- **Q8, DECIDED with the bloat constraint made explicit:** the fear is app bloat; the
  answer is lightweight, evidence-first implementations only. The typical-day chips
  (usual/less/more) are the named model for how breadth should feel. Cycle tracking is
  "a given" (already decided). Nutrition logger stays rejected. For strength, the owner
  asked what "a modest strength-log entity + AI-adjusted programming" would look like;
  the design sketch was given in chat and is recorded as section 8 below.
- **Q9, DECIDED: data-as-payment is rejected** (the consent problem is another reason
  against freemium in the owner's view). Monetization is now an open decision being
  actively discussed: the owner is skeptical of freemium entirely ("free might be too
  good to pay for premium") and asked for alternatives; options were laid out in chat
  (hard paywall + trial / AI-depth freemium / free-local + paid-cloud) with a
  recommendation. Decision lands here when made. The one invariant that survives any
  model: **input is never gated** (spec 12).

---

## 6. Loss/gain predictions and "on track"

**Summary:** owner asks whether Pepi's loss/gain predictions use Apple Health's
tracking, proposes using those as a base adjusted to reality since they are exaggerated,
and asks whether that is how "on track" is decided.

**What the owner said:**
- Are predictions using Apple Health's tracking?
- Use those as base, adjusted to match reality (they are exaggerated).
- Is that how things are "on track"?

**Factual answer (from the code, not vibes):**
- **No Apple Health involvement.** The days-to-target forecast (`weightForecast`,
  verdict engine) is computed purely from the user's own weight series: observed
  velocity (first-to-last over the window), projected only when actually moving toward
  the target, capped at a 365-day honest horizon, and phrased as an observed pace, never
  a promise. Apple Health only *supplies weight data points* when synced; it supplies no
  predictions.
- **"On track" is separate from the forecast.** The verdict state comes from the
  weighted, goal-aware signal stack (each metric's direction vs the user's goal), not
  from projecting a date. The forecast is a garnish on the weight hero.
- So the owner's desired property ("adjusted to match reality") already holds by
  construction: the pace *is* reality, re-derived from the data every day.
- **The buildable improvement hiding in this note [M]:** a visible projected trajectory
  on charts (dotted extrapolation with widening uncertainty), made smarter than the
  current straight line: recency-weighted slope, plateau detection (a stall flattens the
  projection instead of promising last month's pace), and later, expectation-timeline
  priors per compound ("GLP-1 users commonly see pace decay after week N"). This ties
  directly into the attribution ladder and expectation-timeline roadmap items.

**Owner answer (2026-07-16), DECIDED:** not a backlog note; scope it now and add it.
Scoped as section 7 below.

---

## 7. Scoped: projected trajectory line (TRAJ-1) [M]

Owner-directed scope (Q10). A visible, honest projection on the weight chart (phone
Analysis tab first; the web chart builder inherits it).

**Core (pure lib, testable):** a `projectSeries(points, horizonDays)` function in a new
`src/lib/trajectory.ts`:
- **Recency-weighted slope:** exponentially weighted regression over the trailing
  window (recent days dominate), replacing the current first-to-last straight line.
- **Plateau detection:** when the trailing 10 to 14 days are flat within noise, the
  projection flattens instead of promising last month's pace. Reuses the plateau
  concept already present in the evidence picker (R2-B).
- **Uncertainty band:** widens with distance from today, derived from residual variance
  of the fit. The band IS the honesty; the line never appears without it.
- **Honest-horizon rules carried over from `weightForecast`:** minimum data points,
  project only toward the target, cap at 365 days, say nothing rather than guess.

**Rendering:** dotted extrapolation + shaded band appended to the weight series in
`chart-series.ts` consumers; goal line (targetWeight) drawn where set; i18n for the
"projected" label + accessibility description (6 locales).

**Verdict tie-in:** `weightForecast` (days-to-target) switches to the same
recency-weighted slope so the hero figure and the chart never disagree.

**TRAJ-2: energy-balance calibration (owner-directed 2026-07-16) [M].** The owner's
original note decoded: not Apple's predictions (none exist), but Apple's *data* (active
energy burned, steps) feeding our prediction, with Apple's known exaggeration corrected
against reality. That is a calibrated personal TDEE loop (the MacroFactor core mechanic,
which we can run off the Health backdoor instead of a food logger):
- **Personal TDEE estimator:** observed weight delta (in kcal, ~7700 kcal/kg) vs logged
  intake over the trailing window solves for actual expenditure. No device estimate
  needed once enough data exists.
- **Calibration factor:** actual expenditure vs Apple's reported burn yields a per-user
  bias multiplier ("your watch overreports by ~18%"), which is exactly the
  "use their data as base, adjusted to match reality" the owner asked for.
- **Blended forecast:** TRAJ-1's observed trend blended with the energy-balance
  expectation (intake minus calibrated expenditure). Disagreement between the two is
  itself a signal ("pace is slower than your logged deficit implies: likely underlogged
  intake or adaptation").
- **Proactive hooks:** intake spikes vs next-day weight bumps ("cheat-meal water weight,
  expect it to pass"), step-count drops, strain vs recovery context. Feeds the anomaly
  engine (beta-notes 3.4).
- **Graceful degradation:** without intake data the forecast stays observed-trend-only
  (TRAJ-1); the energy-balance layer activates only when nutrition + activity data flow.

**Later (explicitly not in this scope):** per-compound expectation-timeline priors
("GLP-1 pace commonly decays after week N") once the compound-intelligence layer lands;
the projection then blends prior + observed instead of observed-only.

---

## 8. Design sketch: modest strength log + coach-adjusted effort (answering Q8)

The anti-bloat version, as discussed in chat. Not a workout app: one small entity, two
entry paths that already exist, coaching that rides chat.

- **Entity:** `StrengthSession { date, movements: [{ name, sets, reps, weight }] }` with
  derived tonnage (sets x reps x weight), per-movement volume, and estimated 1RM
  (Epley). One new store slice; sessions are evidence, not a program.
- **Entry paths (no new screens):** (a) the quick-log/chat parser accepts "bench 5x5
  80kg, rows 3x10 60" (the parse schema gains one entity type); (b) Health-synced
  workouts keep providing duration + HR (TRIMP load) and pair with the session when
  timestamps overlap. A compact widget on the detailed-log sheet lists/edits the day's
  session.
- **What it feeds:** tonnage + est-1RM trends become chartable series; workout-quality
  and load signals in the verdict get a real progressive-overload input instead of
  duration-only; the strength data makes gain-goal verdicts meaningfully smarter
  (section 1.8 of the positioning note).
- **AI-adjusted programming = coach behavior, not a planner UI.** At nudge/coach level,
  Pepi adjusts *effort targets* conversationally from existing signals: "recovery has
  been low three days and yesterday's squat volume was 20% over your four-week average;
  consider capping today around RPE 7." Direct lifestyle coaching (allowed, spec 05
  capability 8), driven by data already in the store. No periodization tables, no
  program builder, no exercise database beyond free-text movement names normalized
  lightly at parse time.
- **Bloat guard:** ships as [M]; if the widget + parser path is not enough for real
  users, that is evidence before any bigger build is considered.

---

## 9. The plan (hardened 2026-07-16)

**Now / with current beta work:**
1. Resize-on-upload photo compression + bucket size guard [S] (Q6).
2. SM-1 self-marketability pass over onboarding + store copy [S/M] (Q5).
3. TRAJ-1 projected trajectory line [M] (section 7), with the `weightForecast`
   unification.

**Post-beta track A: web workbench** (pairs with the connectors track, `docs/CONNECTORS-PLAN.md`):
calendar-primary responsive web surface on the one codebase (capability-class layouts,
Q1/Q4), detailed-sheet editing incl. retroactive text + photo upload, custom chart
builder with pinned sync to phone (Q3). Connectors act as the fetch/automation layer
feeding it (Q2).

**Post-beta track B: breadth as evidence** (bloat-guarded, Q8):
strength-log entity + parser + coach-adjusted effort (section 8); cycle tracking as
already decided; nutrition stays on the Health backdoor + typical-day chips.

**Open thread (active, not parked):** monetization model. Freemium is in doubt
(too-good-free problem + the rejected data-as-payment idea); alternatives under
discussion in chat. Never-gate-input survives any outcome. Decision gets recorded here.

**Held:** reptides/peptidebase outreach (competitive fear; dig first). Storage quotas
(until the pricing model is chosen).
