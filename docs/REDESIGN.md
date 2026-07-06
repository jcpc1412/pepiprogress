# Pepi Redesign – Instrument / Verdict-First (implementation plan)

> Status: **proposal, not started.** Explored as a live HTML mock at `.preview-mockup/index.html`
> (throwaway, gitignored). This document scopes turning that direction into the real app. Nothing
> here is built yet. Owner has separate notes on the current mock to reconcile before sign-off.
>
> Cross-refs: extends the "CyberLife Instrument" tokens in [src/constants/theme.ts](../src/constants/theme.ts);
> obeys the locked cross-cutting rules in [CLAUDE.md](../CLAUDE.md) and [docs/spec/SPEC.md](spec/SPEC.md);
> voice per [docs/VOICE.md](VOICE.md). No em dashes in any copy (O-06 guard).

---

## 1. Thesis (the locked direction)

Pepi is not a dashboard. It is a **reassurance instrument**: the user opens it exhausted mid-protocol
and needs one thing answered fast – "is my suffering producing measurable results?" Every screen
serves that by reducing uncertainty, and shows the *conclusion before the data*.

Principles, applied app-wide:

1. **Verdict / evidence-first hierarchy.** Conclusion → evidence → explanation → actions. Never a
   flat stack of equal-weight widgets.
2. **One protagonist per screen.** Exactly one element owns the visual weight; everything else recedes.
3. **No AI-cliché status dots.** The glowing colored dot + bold status word (PeptaBase / PeptIQ look)
   is banned. Certainty is shown as a *reading*, not an LED.
4. **Typography is semantic.** Mono (IBM Plex Mono) = anything measured or computed. Sans (Inter) =
   human prose. This is a hard rule, not decoration.
5. **Monochrome + certainty color only.** Green = evidence supports; amber = needs more / watch;
   red = likely failing. Nothing else gets color.
6. **Descriptive verdicts only (legal "rung 1").** State measured status; never diagnose, predict
   hard outcomes, or prescribe. A mild goal-timeline forecast ("~18 days to target") is allowed.
   Dosing stays deferred app-wide; controlled compounds track-only. Gate enforced at the AI layer.
7. **Two co-equal themes** (at-night + luminous daylight), one engraved treatment.
8. **Faint breathing background** (molecular lattice; logo stand-in until a real mark exists) – barely
   noticeable, desaturated.
9. **No em dashes**, ever, in any string (guard already enforces for i18n).
10. **Lean mobile, analytics on web** (owner decision). The phone app is for glance + log + chat.
    Deep analytics move to the web app; protocol *configuration* moves into Settings; the app never
    traps the user in analysis. AI is invisible infrastructure, surfaced through a Chat page, never
    marketed as "AI".

The signature, only-Pepi interaction: **the verdict reconciles felt-bad against measured-good, and can
be cracked open to show its work** – the weighted stack of signals that produced it. No spreadsheet or
single-metric health app can do this because it fuses subjective + wearable + photo + protocol layers.

---

## 2. Design-system foundation (Phase 1 – app-wide, low risk, no behavior change)

All screens consume these, so land them first. No feature logic changes here.

### 2.1 Tokens – `src/constants/theme.ts`
- **Add a "watch" certainty token** to both themes: `signalWatch` + `signalWatchBg` (amber). Today only
  `signalGood`/`signalBad` exist; the verdict needs a three-state scale (good / watch / bad).
- **Add `lattice` tokens**: the desaturated sage used by the background (a ~50%-desaturated green),
  plus its base opacity. Keep it distinct from `structure` (the existing faint diagonal lines).
- Confirm accent stays monochrome (near-white at night / near-black daylight). Certainty colors are the
  *only* hues in the app.

### 2.2 Typography – `src/components/themed-text.tsx`
- Fonts are already loaded (Inter + IBM Plex Mono). Formalize the **mono = measured / sans = prose**
  rule and audit existing screens for violations (mono used decoratively, or numbers set in sans).
- Add scale entries the mock needs: `hero` (large tabular mono figure, ~46px) and `heroUnit` (small
  mono unit). Keep `display` (sans H1), `metric`, `mono*`, `body`, `small*`.

### 2.3 Background – new `src/components/instrument-background.tsx`
- Tiling molecular-lattice (hexagon + node) rendered with `react-native-svg`, absolutely positioned
  behind screen content, `pointerEvents="none"`.
- **Breathing**: slow opacity + scale pulse (~11s) via `react-native-reanimated` (already a dep chain
  via Expo). Respect `AccessibilityInfo.isReduceMotionEnabled` → static when reduce-motion is on.
- Barely-visible (desaturated `lattice` token, ~0.03–0.07 opacity). Mounted once in the tab/root layout,
  not per screen, so it is continuous behind the app.

### 2.4 Primitives – `src/components/surface.tsx` (+ a few new files)
Restyle/extend existing; add the new verdict pieces:
- **Exists, keep:** `Card`, `Sunken`, `Divider`, `EngravedLabel`, `Metric`, `SignalText`, `StatusPill`,
  `Placeholder`, `Skeleton`.
- **New `HeroFigure`** (`src/components/hero-figure.tsx`): big mono number + unit + a `TrendMarker`
  (▲/▼) whose direction and color come from the engine's favourability flag (green good / amber caution),
  not from the raw sign. Engine-agnostic presentational component.
- **New `ReasonButton`**: the dark, blends-into-canvas secondary action ("See the reasoning →").
- **Primary button** = bright/high-contrast (the `Log` action). Secondary = the blending style. Settle
  the emphasis + copy question (see §7, open item) before wiring globally.
- **Gauge** (`FAIL · WATCH · ON TRACK` level meter): built in the mock, then removed for busyness.
  Keep the component in the library but **not on the Home screen** by default; it is a candidate for the
  decompose screen header. Parked, not deleted.
- Retire the status-dot pattern everywhere it appears (breadcrumbs, cold-start, sync).

### 2.5 Chrome
- **Remove the in-app "SYNCED" indicator** from the top of screens; surface sync state in Settings only
  (see §4.7). The top strip is OS chrome, not app status.
- Header context line condensed to a single mono eyebrow: `DD MMM · <PROTOCOL TYPE> · WEEK N`
  (e.g. `03 JUL · CUT · WEEK 7`). Date rendered from the real day, `DD MMM`.

**Phase 1 exit / green gate:** typecheck, lint (incl. no-hardcoded-string), i18n key-parity (6 locales,
no em dashes), web export. Existing screens still work, now on the enriched tokens. No verdict yet.

---

## 3. The verdict engine (Phase 2 – the core new logic, behind the scenes)

The real engineering. A **pure, deterministic** module plus a **thin AI prose layer**. Build and test it
in isolation before any screen depends on it.

### 3.1 New `src/lib/verdict-engine.ts` (pure, offline, unit-tested)
Inputs (all already in the store / already derived):
- `entries` (manual check-ins), `metricReadings` (integrations),
- `deriveMetrics(...)` output from [src/lib/derived-metrics.ts](../src/lib/derived-metrics.ts),
- photo drift / comparability from the photo features,
- `protocolItems` (→ `startedAt` → cycle week), `symptomEvents`,
- `profile` (goals, sex, dob, units).

Output (one object):
```ts
type Verdict = {
  state: 'building' | 'on_track' | 'watch' | 'off_track';
  confidence: 'low' | 'medium' | 'high';   // from signal count + agreement
  hero: { metricKey: string; value: string; unit: string; favour: 'good' | 'watch' | 'bad'; trend: 'up' | 'down' };
  signals: SignalContribution[];           // the decompose stack (weighted, sign-oriented)
  reconciliation?: string;                 // "dragging signals track training load, not fat regain"
  forecast?: string;                       // optional mild goal-timeline ("~18 days to target")
  explanationKey: 'template' | 'ai';       // how the prose sentence was produced
};
```

### 3.2 Hero-figure selection (engine picks, not the user)
The hero is **whichever signal is most decision-relevant today**, per protocol goals – not always weight.
Ranked by: (a) largest deviation from personal baseline (anomaly), OR (b) the signal most load-bearing for
today's state, tie-broken by goal relevance (a healing protocol favors a recovery/symptom marker; a cut
favors fat-loss velocity or weight; a GH protocol favors sleep/recovery). Must handle **multi-compound**
protocols – the engine reads the active compounds' effect/monitoring tags to weight relevance.

### 3.3 Verdict state + confidence + cold-start
- **Cold-start:** below the observation threshold (reuse the `BASELINE_MIN_SAMPLES` honesty bar from
  derived-metrics) → `state: 'building'`, no verdict, no faked confidence. Hero becomes the photo (or an
  empty photo placeholder + baseline CTA when none exists).
- **Confidence** = function of how many independent signals are present and how strongly they agree.
  Conservative by design: a wrong-but-confident verdict is worse than none.
- **Reconciliation:** identify signals dragging against the verdict; check whether each is *explained* by
  training load (ACWR/TRIMP), cycle week, or a logged compound's known effect. If explained, annotate
  ("expected at week 7") rather than counting it as failure. This is the felt-bad vs measured-good line.

### 3.4 Prose layer – reuse `ai-service` + `src/lib/ai.ts`
- One short **descriptive** sentence per verdict, produced by the existing cheap-model path (Haiku), with
  the observational/no-diagnosis/no-dosing gate reaffirmed in the system prompt.
- **Cold voice via prompt first (owner decision).** The current deep-analysis output reads as fluffy;
  fix it by rewriting the vision + verdict prompts to be clinical and terse (matches VOICE.md and the
  redesign register), NOT by swapping providers. A Gemini bake-off stays deferred (see the
  `ai-provider-decision-deferred` memory); only revisit if cold-Claude genuinely cannot get there.
- **Deterministic template fallback** when AI is unavailable (local-first, no keys) so the Home always
  renders a sentence. The engine output is complete without the AI; AI only prettifies the prose.

### 3.5 Legal gate (reaffirmed)
Descriptive only. No prognosis beyond a mild goal-timeline forecast, no advice, no dosing. Controlled
compounds track-only. Same gate as the current AI service; add a test asserting the engine never emits
prescriptive strings.

**Phase 2 exit:** `verdict-engine.test.ts` green (cold-start, hero selection across goal types,
multi-compound, reconciliation, confidence tiers). Engine is not yet wired to any screen.

---

## 4. Information architecture + screens (Phases 3–4)

### 4.0 New mobile IA (lean) – decided
The phone app collapses to **three bottom tabs**; everything else is configuration or moves to the web.
- **Today** (verdict Home) · **Photos** (capture + evidence) · **Pepi** (conversational log + AI).
  The third tab is labelled **Pepi** (owner decision 2026-07-06), not "Chat" or "AI" – it is the
  assistant surface named after the product, reinforcing "AI is invisible infrastructure".
- **Protocol configuration** (compounds, doses, routes, inventory, reconstitution) **moves into Settings**.
  It is set-and-forget config, not a daily destination.
- **Dose logging** (the daily action) does NOT go to Settings. It stays instant from Today via a
  **dose drawer** (see 4.1) so logging is never buried. Config lives in Settings; the *act* of logging
  lives on Today.
- **Lean, editable trends on mobile; advanced analytics on web (owner).** Mobile keeps a *lean but editable*
  trends view (correct/adjust logged values, pick which metrics show), not just the verdict. The heavy,
  power-user analytics live on the web app, surfaced in-app as an **included subscription/trial perk**
  ("Your plan includes a web dashboard for deeper analytics"). Insights is demoted from a primary tab but
  the editable trends stay on device.
- Rationale: the phone is the reassurance + logging loop; the web is the analysis surface. This keeps the
  app lean and stops it competing with the user's spreadsheets on small screens.

### 4.1 Today (Home) – full rebuild (Phase 3) – `src/features/home/dashboard.tsx`
Verdict-first flow, replacing the carousel-of-equal-charts:
1. Eyebrow (`DD MMM · TYPE · WEEK N`) + gear.
2. **Hero figure** (engine-picked) + `favour` trend marker + optional forecast sub-line.
3. **Explanation** (one sans sentence; the old "distillation" finds its home here).
4. **ReasonButton** into the decompose screen.
5. **Evidence** (engine-picked: contextual photo compare, or the single most relevant chart) with camera
   reticle framing for photos. Fed by the 10-day window + `chart-series` builder; carousel retired.
6. **Actions:** primary `Log` + quick access.
- **Dose drawer (MyTherapy-style).** A bottom drawer for fast dose logging: scheduled doses for today,
  tap-to-confirm with time logging, and a visible **dose-change history**. This is the "log and leave"
  surface; it must open in one tap from Today and never route through Settings.

### 4.2 Decompose / reasoning screen (Phase 3) – new `src/features/home/verdict-reasoning.tsx`
The signature interaction. Renders `verdict.signals` as the weighted stack (name, sparkline, weight,
role: supports / drags / neutral) + the reconciliation footer. Reached from the Home ReasonButton and by
tapping the hero figure itself, so the signature interaction stays discoverable even with a quiet button.

### 4.3 Pepi (new tab, was "Chat") – `src/features/chat/*`
The conversational surface that absorbs "the fluff". Everything that is narrative rather than a glanceable
verdict lives here: conversational quick-log (already built), the deep photo-analysis narrative, own-data
Q&A (`ask-pepi`), and general education. **AI is invisible infrastructure** here: it reads as "Pepi
understands my protocol," never "ask the AI". Cold, clinical voice (see 3.4). This is where the existing
quick-log + insights Q&A consolidate.

### 4.4 Photos + Capture v2 – `src/features/photos/*`
Reframed as measured evidence and substantially upgraded. See the dedicated **§4A Photo Capture v2** for
the full feature set (quality score, measurement overlay, BF%, review/edit, side shots, custom parts).

### 4.5 Protocol (now inside Settings) – `src/features/protocol/*` mounted under `src/features/settings/*`
Move the protocol config surfaces (items, inventory, reconstitution, cycle/body settings) under Settings.
Restyle to the instrument surfaces; attention banner uses the certainty palette (watch = amber, expired =
bad). The Protocol *tab* is removed; a Settings entry replaces it.

### 4.6 Settings – `src/features/settings/*`
Now also hosts Protocol config (4.5) and the **sync status** removed from the top strip
(`settings-screen.tsx`). Theme toggle already exists (`appearance-settings.tsx`). Restyle.

### 4.7 Onboarding + tab bar
Restyle onboarding chrome to match. Rebuild the tab bar for the new three-tab model (Today / Photos / Chat),
mono/uppercase, against the final palette.

---

## 4A. Photo Capture v2 (own workstream; plugs into the Home evidence slot)

The photo USP gets a dedicated upgrade. Current-app defects folded in (see §0 fix-now list).

**Capture:**
- **Quality score on first shot + preview** (Dead-Rising-style readout): a live composite of framing,
  distance vs the ghost `boxRatio`, level (tilt), lighting/luma, and blur. Shown live and on the review step.
- **Native camera controls:** volume-button capture, digital zoom. Body session currently on expo-camera;
  volume/zoom need the vision-camera path, so unify capture on vision-camera where feasible.
- **Darker ghost overlay** (raise contrast of the prior-photo guide).
- **Auto-crop** a little toward the ghost framing so successive shots line up (image-manipulator + the
  face/body box).
- **Picky detection + clear communication (owner):** fewer / looser clothes = better accuracy. Compressive
  or form-fitting garments (tight underwear, sports/"slimming" bras, even non-tight boxers) distort the
  silhouette and inflate apparent size. The detector must be *picky*: detect likely-compressive or
  form-fitting clothing and tell the user plainly that minimal, non-compressive clothing improves accuracy.
  This is a **communication + detection** requirement, NOT gated behind storage work. Storage is already
  encrypted at rest (Supabase default) + private bucket + RLS + signed URLs. Private-by-default stays
  locked; the "never trained on" promise is **under owner review** (see section 9).
  - **Low-score retry modal (owner decision 2026-07-06).** The clothing/accuracy nudge is NOT a persistent
    hint on the capture screen. It surfaces only *after* a shot when the composite quality/confidence score
    is **below 80**: pop a modal that (1) states the score is lower than recommended, (2) recommends less
    tight / less baggy clothing for a better read, and (3) reassures "we don't use your photos to train our
    algorithm" (reinforcing the locked promise). Two actions: **Retake photo** (primary) and **Ignore and
    proceed** (secondary, keeps the shot). At or above 80, no modal. All copy via `t()`, no em dashes.
- **Side photos** for both body and face (add a `view: front | side` axis to `PhotoEntry`).

**Measurements + body composition:**
- **Measurement inputs as an overlay on the photo** (waist, neck, hip/circumference), not a separate screen.
- **Body-fat % (Navy method)** from waist + neck + height (+ hip for women), rendered as an **observational
  estimate with error bars**, never a medical measurement. Respect the **user's unit system** (current bug:
  analysis defaults to imperial; must read `profile.units`).
- **App-inferred body composition:** drop the manual body-type chip as the primary input; infer body
  composition from measurements/BF% and pass that to the vision AI. Keep the chip only as a cold-start
  fallback. (Answers the owner's "why not have the app choose for you?")

**Review + analysis:**
- **Review/edit measurements** after capture (current gap: no way to correct them) and surface them in the
  distillation.
- **Two-stage analysis:** an immediate **quick, no-fluff** readout on submitting the second photo (drift +
  headline change), while the **deep** comparison (weight/measurement trends) loads. Deep analysis uses the
  cold-Claude prompt (3.4).

**Photos page:**
- **Default to the body part with the most recent capture** (current bug: defaults to face even with no
  face pics). Always show the most recent captured part first.
- **Custom / "problem" body parts** (belly, thighs, pubis, double chin) addable alongside face/body.

---

## 5. Sequencing

| Phase | Scope | Risk | Gate |
|------|-------|------|------|
| 0 | This doc signed off + owner notes reconciled | – | agreement |
| 0.5 | **Fix-now bugs (current app, no redesign dependency):** analysis honors `profile.units` (not imperial default); measurement review/edit + surface in distillation; Photos default to the body part with the most recent capture | low | green gate |
| 1 | Design-system foundation (§2): tokens, watch color, hero/reason primitives, breathing background, chrome | low | green gate, screens unchanged in behavior |
| 2 | Verdict engine (§3), pure + tests, no UI | med | engine tests green |
| 3 | Today rebuild + decompose + dose drawer onto the engine (§4.1–4.2) | high | on-device verdict correct across states |
| 4 | IA restructure: 3-tab model, Protocol into Settings, Chat tab, Insights demoted / analytics to web (§4.0, 4.3, 4.5–4.7) | med | green gate, nav works |
| 5 | Photo Capture v2 (§4A): quality score, native controls, measurement overlay, BF% + inferred body comp, picky clothing detection + accuracy comms, review/edit, two-stage analysis, side shots, custom parts | med–high | green gate |
| 6 | Cold-Claude prompt rewrite for vision + verdict (§3.4) | low | qualitative review vs VOICE.md |
| 7 | Polish: a11y (reduce-motion, contrast), both themes, i18n (6 locales), copy pass | low | full green gate |

Rationale: the visual language (Phase 1/4) is low-risk and independently shippable. The verdict engine
(Phase 2/3) is the real bet and must prove itself in tests before Today depends on it. Phase 0.5 bugs can
ship immediately, before any redesign work. Do not big-bang all of it at once.

---

## 6. i18n
Every new string (verdict states, hero labels, reconciliation templates, reason button, forecasts) goes
through `t()` and into all 6 locales in the same commit, machine-translated, **no em dashes**. Verify with
`scripts/check-i18n-keys.mjs` (parity + em-dash guard) before each commit.

---

## 7. Decisions (owner-confirmed + defaults)
Confirmed with owner on 2026-07-05:
- **Full lean IA restructure** (§4.0): 3 tabs (Today / Photos / Chat), Protocol into Settings, deep
  analytics to web.
- **AI tone: cold-Claude via prompt first** (§3.4); Gemini bake-off stays deferred.
- **Body-fat % = hedged Navy-method estimate + app-inferred body composition** (§4A); accuracy improved by
  **picky clothing detection + plain communication** (not gated behind storage work).
- **Lean editable trends stay on mobile; advanced analytics on web**, surfaced as an included
  subscription/trial perk (§4.0).

Still defaults (flag if you disagree):
- **Verdict register = descriptive only (rung 1).** Going further (predict/recommend) is a separate
  product+legal track, not this redesign.
- **One primary verdict** (not per-goal dashboards). Secondary goals live inside the decompose stack.
- **Cold-start hero = photo (or empty photo placeholder + baseline CTA).**
- **Gauge parked** off Today (too busy); candidate for the decompose header.
- **Logging emphasis / copy – the one open item.** Mock makes `Log` bright and the reason button quiet,
  but the goal is to *encourage logging*. Proposed default: `Log` present but **medium** weight (not the
  max-contrast slab), warmer copy (`Log today`). The dose drawer (§4.1) is the real logging workhorse.
- **Hero is engine-picked and multi-compound-aware**, never weight-only.
- **Trends:** resolved – a lean *editable* trends page stays on mobile; advanced analytics live on web as
  an included plan perk (§4.0).

---

## 8. Definition of done
- All screens on the instrument language, both themes, reduce-motion respected, AA contrast held.
- Verdict engine deterministic + tested; AI prose optional with a template fallback; legal gate tested.
- Home reads verdict → evidence → explanation → actions; decompose interaction reachable.
- Full green gate: typecheck / lint / i18n parity (6, no em dashes) / web export; on-device verdict
  sanity-checked across building / on-track / watch / off-track.
- `docs/spec/SPEC.md` updated so the redesign is the source of truth, not just this plan.

---

## 9. Out of scope / needs a separate decision (legal review required)

Two owner questions raised on 2026-07-05 that this redesign does **not** silently absorb, because they
conflict with a locked rule and carry real legal weight:

- **Training on user photos.** Locked rule (spec 04/11, CLAUDE.md) is: photos are **never used to train
  models**, and "stored, not trained on" is already shown to beta users in the consent UX. Reversing that
  is not a design tweak. Key points to weigh before any decision:
  - The app does **not currently train anything**. Analysis is *inference* via a foundation vision model
    (Claude / optionally Gemini); BF% is a deterministic Navy-method formula. Good accuracy comes from the
    formula + prompts + the foundation model, so a corpus of user pics is **not required** to make the
    feature work. "The algo needs a ton of pics to learn" assumes a custom model we do not have.
  - Faces and bodies are **biometric / special-category data** (GDPR Art. 9); nude images are extra
    sensitive; minors are a hard line (age gate + CSAM exposure). Training on these needs explicit,
    **separate, granular opt-in** consent, purpose limitation, a withdrawal path, and a DPIA.
  - You **cannot retroactively** train on data collected under a "never trained" promise. Any future
    program must be new, opt-in, and clearly scoped ("help improve Pepi"), never bundled or backdated.
  - Recommendation: **keep the promise for beta.** It is a genuine trust/differentiation asset for this
    exact paranoid audience. Revisit training only as a separate, consented, legally-reviewed workstream.
- **Public / third-party photos for calibration or training.** "Publicly available" is not "licensed to
  use." Photos carry the photographer's copyright and the subject's likeness/publicity rights; scraping to
  train is actively litigated and usually violates site ToS. Not needed either (see the formula point
  above). If a calibration/validation set is wanted, use **licensed or research body-composition datasets
  collected with consent** (e.g. DEXA-labeled academic sets), or data from consenting testers – never
  scraped web images. Claude's training data is not a redistributable image source for this.

---

## 10. Data-use tiers + community aggregation V1 (decided)

**Provider:** Claude-only for now (cost is a non-issue at beta scale: ~$0.06 per deep photo analysis, so
even a heavy user at ~30/mo is ~$2). Keep the service model-pluggable via env, but do not add a second
provider until volume justifies it. The two-stage analysis (cheap quick pass, deep pass only when needed)
is the primary cost lever.

**Three data tiers, kept distinct in code and consent:**
- **(a) Raw photos** – storage (private bucket, signed URLs) + transient inference only. **Never trained
  on** (locked). The `ai-service` edge function is stateless: it does not persist the image.
- **(b) Per-user extracted details** (measurements, drift, BF%, observations) – power that user's own
  trends / verdict. Their data, their benefit.
- **(c) Anonymized, aggregated extracted details across users** – the community knowledge base + product
  calibration. Numeric/text only, never images.

**What tier (c) actually improves (set expectations):** NOT the vision model's perception (it is a fixed
foundation model). It improves the *interpretation* layer: (1) calibrate the deterministic BF% formula +
drift/comparability thresholds, (2) power community norms/comparisons, (3) inject relevant aggregates as
context into the analysis prompt so the readout is grounded. "Learning from usage" happens here, and it
never touches the photos-never-trained promise.

**Consent (already modeled, needs finishing):** three separate toggles already exist –
`consentPhotoStorage`, `consentPhotoAI`, `consentCommunity`. Keep them separate (granular,
purpose-specific consent; do NOT fold community contribution into the AI-analysis toggle). Gap: the
`consentCommunity` copy ("Community contribution") is too vague to be *informed* – rewrite it to state
plainly: anonymized numeric details only, never photos, aggregated across users, used for community
comparisons + app improvement.

**Community Aggregation V1 (scaffold exists, currently unbuilt – marked "populated V2"):**
1. On `consentCommunity` opt-in, write **anonymized numeric extracted metrics** (no photos, no
   identifying free-text) to a contribution table.
2. Materialize `community_aggregate` with a **k-anonymity floor** (never surface a bucket below N users).
3. Inject relevant aggregates as analysis context and surface comparisons in the UI.
This is the honest "improve from usage" path; sequence it after the core redesign (own its own phase).
