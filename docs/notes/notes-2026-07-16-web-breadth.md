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

**Questions asked in chat (Q1 to Q4):** architecture confirm (one codebase);
who the web user is (workbench for the leverager vs primary front door for everyone);
custom-charts v1 scope + pinned-sync model; calendar as the web's primary navigation
metaphor vs one tab among the phone's tabs.

**Owner answers:** (pending)

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

**Question asked in chat (Q5):** confirm "serve, don't market" for v1.

**Owner answers:** (pending)

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

**Question asked in chat (Q6):** approve resize-on-upload now + defer quotas to the
freemium spec.

**Owner answers:** (pending)

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

**Question asked in chat (Q7):** which intent to pursue (license reptides content /
cross-promo with peptidebase / both).

**Owner answers:** (pending)

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

**Questions asked in chat (Q8, Q9):** accept the breadth ranking (cycle yes / workouts
as evidence yes, programming later / nutrition logger no); clarify the data-as-payment
intent given the consent constraint.

**Owner answers:** (pending)

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

**Question asked in chat (Q10):** want the visible calibrated trajectory line built as
part of the charts work?

**Owner answers:** (pending)

---

## Next step

Owner answers Q1 to Q10 in chat; answers get recorded above; the document then hardens
into a sequenced plan (likely ordering: storage compression fix now; web workbench +
connectors as the paired post-beta track; breadth items folded into existing decided
work; trajectory line into the charts backlog).
