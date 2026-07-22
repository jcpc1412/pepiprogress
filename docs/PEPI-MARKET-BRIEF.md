# Pepi (PepiProgress): market brief + product overview

Self-contained document, written 2026-07-14, intended for sharing with people and other
LLMs for feedback. No credentials or internal infrastructure details included. Feedback
welcome on: positioning, gaps in the competitive read, feature priorities, and risks we
are underweighting.

---

## 1. What Pepi is

Pepi is a mobile-first (iOS/Android/web) progress instrument for people running peptide
and compound protocols (BPC-157, ipamorelin, GLP-1s, TRT, and similar). It connects what
you take to what actually changes: consistent progress photos analyzed by vision AI,
daily subjective check-ins, body measurements, doses, symptoms, and wearable data, and it
renders a single daily verdict on whether the protocol appears to be working.

One sentence: dose trackers log your vials, wellness apps interpret your watch, **Pepi
closes the loop between protocol and outcome.**

## 2. Who it is for

The compound-curious and compound-committed: peptide users, GLP-1 users, TRT patients,
and the people stacking these with training and diet. Two personas inside that niche:

- **The leverager:** disciplined, logs everything, wants measurement rigor and honest
  hedged analysis, hates hype.
- **The corner-cutter:** took the shortcut compound but does not know how to eat, train,
  or recover; wants the app to think for them.

Pepi serves both through an adaptive coaching level (silent inference of how much
guidance the user wants: just log / nudge me / coach me), rather than forking the product.

## 3. Market landscape

Two existing camps, with an empty intersection:

**Camp 1: horizontal AI health coaches.** Bevel, Vora, and wearable-native apps (Whoop,
Oura). Interpretation layers over Apple Health: recovery, sleep, strain scores, nutrition
tracking, biological age, bloodwork photo extraction, conversational AI coaching. Mature,
funded, aggressive free tiers. None of them touch compounds; a mainstream longevity brand
structurally cannot wade into grey-market peptides (brand, store review, investor optics).

**Camp 2: peptide utility trackers.** Peptide Tracker, PepTracker, Dose Track,
PeptideCalc, Shotsy (GLP-1). Dose logs, vial inventory, reconstitution and half-life
calculators, injection-site rotation, reminders. Useful and cheap, but they stop at "what
you took": no outcome measurement, no photo analysis, no AI interpretation, no community
data.

**Pepi's position: compound-aware outcome measurement.** The utilities record inputs;
the coaches interpret generic outputs; Pepi attributes outcomes to the protocol. The
niche is real (GLP-1 use alone reached roughly 1 in 8 US adults in 2024 polling, and the
grey-market peptide scene around it keeps growing), and the intersection is unoccupied.

Defensibility:
- Horizontal players will not follow into compounds (structural allergy, see above).
- Utility trackers lack the measurement substrate (photo pipeline, check-in engine,
  verdict model) to bolt on real outcome attribution.
- The community stack dataset ("users on similar stacks reported...") is a network
  effect neither camp has a path to.

## 4. Current product mechanics (shipped, July 2026)

**Local-first, account optional.** The app runs fully offline with no sign-up; an
account adds encrypted cloud backup and cross-device restore. Data is never sold; photos
are never used to train models.

**Onboarding:** units, sex (including MTF/FTM, which tunes body-fat formulas and photo
analysis direction), goals, compound stack (38-compound catalog + custom entries), body
type calibration, optional menstrual-cycle settings.

**Field surfacing (no personas):** what the daily log asks = the union of the user's
goals, their compounds' expected-effect tags, and their compounds' monitoring tags. Add
a compound, and the log adapts; sporadic (as-needed) compounds surface fields only on
dose days.

**Verdict-first home:** a single daily state (on track / watch / off track) with a hero
metric, decomposed into a weighted signal stack (each signal shows tone, role,
sparkline, weight; tap for a full evidence ledger). Goal-aware direction logic (weight
down is good for a cut, bad for a bulk). Confidence is explicit; missing data lowers
confidence rather than faking a read.

**One-box conversational logging:** natural-language quick-log ("slept like shit, 250mcg
ipa, weight 82.4") parsed by a cheap AI model into structured entities, with confident
parses auto-applied and an undo. Voice via device dictation. A single chat surface
(Pepi) also answers questions about the user's own data and runs correlation reads
("what moved together this month").

**Typical-day baselines:** sparse repetitive metrics (nutrition, sleep schedule) get a
one-time "normal day" setup plus usual/less/more deviation chips, so daily logging burden
approaches zero while charts and the verdict treat chip days as low-confidence estimates.

**Progress photos (the USP):**
- Guided capture: face session with real-time face framing, distance hint vs baseline,
  auto-capture when level and in range; body session with ghost overlay of the prior
  photo, tilt/level metadata, and structured measurements (waist/hips/neck/extra).
- Photo quality scoring with a "highscore" reference system: the best-quality,
  most-comparable shot becomes the comparison anchor; instant post-capture feedback.
- Two-tier AI analysis: frequent cheap text encouragement; scheduled scientific vision
  analysis (drift score, comparability badge, hedged change notes, retake hints), with
  cadences tuned per compound group and cycle-phase-aware language for users who track
  their cycle.
- Retroactive import from the camera roll with EXIF dating.

**Protocol + inventory:** protocol items (compound, dose, route, weekday schedule),
one-tap dose logging with undo, injection-site rotation hints, reconstitution calculator
(mg/mL to syringe units), vial + consumable inventory that auto-decrements per dose,
low-stock/expiry flags, and a coach/doctor PDF report export.

**Integrations:** Apple Health / Health Connect read (weight, body composition, sleep
stages, activity, workouts + HR, resting HR/HRV/SpO2/temperature, nutrition via the
Health backdoor from MacroFactor/Cronometer/MFP), plus write-back of weight, body-fat
estimate, and waist to Apple Health. Manual entry everywhere as fallback; synced values
autofill the log.

**Safety architecture (a feature, not a disclaimer):** every compound in the catalog
carries a market category (inoffensive / OTC / grey / controlled) that gates what the AI
may say, enforced in code at the AI service:
- Lifestyle coaching (calories, training, cardio, recovery, sleep) is direct and
  personalized.
- OTC items get direct-but-hedged guidance with a mandatory "check with your doctor or
  pharmacist" pointer.
- Grey-market compounds get observational, attributed, never-individualized info
  ("commonly reported ranges are A to B", never "for your size take Y").
- Controlled compounds (testosterone/TRT, anabolics) are track-only plus
  community-observational. No pushed ranges, ever.
- No diagnosis, no prescriptive dosing, one US-calibrated posture globally.

**Design and UX:** a monochrome "instrument" design language (two co-equal themes,
engraved/debossed surfaces, chamfered corners, tabular numerals, color reserved
exclusively for data signal), six languages from day one (EN/ES/FR/DE/PT/RU) with
enforced key parity, no-shame logging (backfill any day, no streak guilt), and local
notifications for check-ins, doses, photo milestones, and low stock.

## 5. Near-term roadmap (decided, in build order)

1. Passive nutrition sync fix + photo review rework (two-step, prominent quality score).
2. Compound intelligence layer: per-compound attribution insights ("since starting X,
   your sleep is +0.8 vs baseline"), expectation timelines (reported onset curves vs the
   user's own), observational compound cards.
3. Companion pivot: micro check-ins as chat snippets (chips first, free-text parsed),
   snooze and notification control by chat, proactive anomaly detection with context
   memory (explained anomalous days are excluded from baselines), adaptive coaching level.
4. Photo reel: multi-shot capture + camera-roll dump, AI auto-classification into body
   parts/poses, locked canonical poses only for required progress shots, watermarked
   share cards.
5. ChatGPT app + Claude connector: one MCP server (OAuth, user-consented) exposing
   two-way tools (read verdict/today/logs; write doses/check-ins), photos excluded,
   aimed at both directories.
6. Transition tracking v1 (MTF/FTM goal, direction-aware analysis).

## 6. Business model

Free closed beta now. Freemium at public launch with a hard principle: **never gate data
input** (logging, integrations, contribution stay free); gate output depth and scale
(advanced AI analysis, history depth, exports). Community aggregates ship only above
k-anonymity thresholds.

## 7. Honest weaknesses and risks

- **Team size:** effectively a solo-built product racing funded horizontal players on
  the general layer. Mitigation: do not compete there; the general layer stays "good
  enough to feed the verdict."
- **Cold start:** community stack data is the long-term moat but is empty at launch;
  interim sourcing is curated citations plus clearly-labeled unverified general info.
- **Store review:** Pepi is a progress-tracking app first, but its compound-logging
  surface (peptides, hormones, and other prescription-adjacent substances) lives near
  App Store guideline sensitivities; the market-category posture system exists largely
  as the review defense for that surface. Same scrutiny applies to AI-platform connector
  directories.
- **Retention is unproven:** the verdict-first loop is designed for it (a daily state
  change beats a log form), but beta data does not exist yet.
- **Bevel-class free tiers** set user expectations for polish on recovery/sleep scoring
  that a niche app must meet with far less engineering.

## 8. Questions we would ask a reviewer of this brief

1. Is the "compound-aware outcome measurement" wedge as empty as we think? Name
   competitors we missed.
2. Which of the section-5 roadmap items would you reorder, and why?
3. Where is the safety architecture too conservative to be useful, or too loose to
   survive review?
4. What would make the community dataset reach critical mass fastest without
   compromising k-anonymity?
5. As a user in this niche, what would make you switch from a free dose-tracker utility
   plus a general AI coach to a single paid app?
