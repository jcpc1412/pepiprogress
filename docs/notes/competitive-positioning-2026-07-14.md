# Competitive positioning (2026-07-14)

Owner prompt: Bevel overlaps with a lot of what we do; are we a copy? And: compounds are
the niche opportunity, but "right now we don't really do much with them."

A standalone shareable version of this analysis (plus a full market brief) lives at
`docs/PEPI-MARKET-BRIEF.md`; that copy is written self-contained for sharing with other
LLMs and people. This file is the internal note.

## 1. The landscape has two camps, and Pepi is in neither

**Camp 1: horizontal AI health coaches** (Bevel, Vora, and the wearable-native apps
Whoop/Oura). Interpretation layers over Apple Health: recovery/sleep/strain scores,
nutrition, biological age, bloodwork extraction, conversational AI coach. Mature, funded,
free tiers. **None touch compounds.** Bevel has zero peptide features (verified 2026-07-14).

**Camp 2: peptide utility trackers** (Peptide Tracker, PepTracker, Dose Track,
PeptideCalc, Shotsy for GLP-1s). Dose logs, vial inventory, reconstitution and half-life
calculators, injection-site rotation, reminders. Useful, small, mostly free or cheap.
**None measure outcomes.** No photo analysis, no verdict, no AI interpretation, no
community data. They stop at "what you took."

**Pepi is the intersection, and the intersection is empty:** compound-aware outcome
measurement. The utilities tell you what you took; Bevel tells you how you slept; Pepi
tells you **whether the protocol is working.**

## 2. Why the moat holds

- The horizontal players are structurally allergic to grey-market compounds: brand risk,
  store-review risk, VC optics. Wading in is exactly what a mainstream longevity brand
  cannot do. Our `market_category` posture architecture is the machinery that lets us
  live where they cannot follow.
- The utility trackers could add an AI layer, but they have no measurement substrate: no
  photo pipeline, no check-in engine, no verdict, no field-surfacing model. Bolting a
  chatbot onto a dose log does not produce outcome attribution.
- The community stack dataset ("people on similar stacks reported...") is a network
  effect neither camp has a path to: Camp 1 has no stack data, Camp 2 has no analysis
  layer to make the data worth contributing.

## 3. The owner is right: the compound layer is under-leveraged today

Current compound features are mostly *logging mechanics*: catalog + protocol + dose
logging + reconstitution + inventory auto-decrement + site rotation. That is rough parity
with Camp 2 utilities. The differentiated parts that exist today are thin connective
tissue: effect/monitoring tags driving field surfacing, cycle-week fed to the vision AI,
photo cadences per compound group.

What "actually doing something with compounds" looks like, ranked by value over effort:

1. **Per-compound attribution insights [M].** "Since starting ipamorelin (week 4), your
   sleep quality is +0.8 vs your pre-start baseline." The store has start dates, doses,
   and every metric; nobody in either camp can produce this sentence. This is the single
   highest-leverage build in the app.
2. **Expectation timelines [M].** Per compound group: what users commonly report by week
   N (onset, peak, plateau), shown against the user's own curve. Sources ride the spec-05
   sourcing ladder (curated + labeled-unverified + community later). Turns the verdict
   from "something changed" into "this is on schedule."
3. **The observational info capability itself [M].** Just unlocked in spec 05 and not yet
   built: compound cards with commonly-reported ranges, cycle lengths, side-effect
   profiles, through the posture gate. This is the feature the un-defer decision bought.
4. **Bloodwork-to-compound mapping [S/M].** monitoring_tags already know testosterone
   watches hematocrit and estradiol; when labs land (or are photo-parsed later), flag
   which markers each protocol item wants watched and when they were last checked.
5. **Stack awareness [M].** Surface commonly-reported overlaps in the observational
   register ("BPC-157 and TB-500 are frequently logged together for recovery goals");
   never synergy dosing advice.
6. **Community stack comparisons [L, post-aggregates].** "Users on a similar stack most
   often reported X by week 3." Needs the normalized sync + k-anonymity thresholds.

Items 1 to 3 are the beta-visible answer to "we don't do much with compounds." They also
compound (pun intended) with the coaching pivot: the adaptive coach gets compound-aware
material to coach with.

## 4. Positioning statement

Pepi is the progress instrument for people running peptide and compound protocols: it
connects what you take to what actually changes (photos, measurements, sleep, labs,
subjective signal) and tells you, in a hedged, observational register, whether the
protocol is working. General wellness apps interpret your watch; dose trackers log your
vials; Pepi closes the loop between protocol and outcome.

Strategic corollaries:
- Do not out-Bevel Bevel. The general recovery/sleep layer is table stakes, kept good
  enough to feed the verdict, never the pitch.
- The compound intelligence layer (section 3) is where build effort should concentrate
  after the current beta batch.
- Bevel validates the AI-coach-over-Health-data direction and bloodwork-photo extraction
  (both on our roadmap); their traction de-risks our bets on those mechanics.
