# 06 — Integrations (the dynamic API)

> Goal (product owner): **cover as many bases as possible — weight, exercise, food, sleep** — so the AI can learn what peptide combos actually do *in real bodies*. Most published studies use sedentary subjects; capturing training, nutrition, and sleep lets us control for the confounders real users have. Built for the meathead POV first, but must serve biohackers too.

This is a first-class area. Two reasons it matters:
1. **Lower logging burden** → better retention (auto-fill the daily log, 03).
2. **Richer signal for the AI + community DB** → the actual research value (below).

## Why coverage = the scientific edge
A peptide's effect is entangled with training load, protein intake, calorie balance, and sleep. If we only log the peptide, we get noise. If we also capture exercise/food/sleep, the AI can **control for confounders** and the community DB (07) can answer questions no study does: *"BPC-157 + training vs. BPC-157 sedentary,"* *"GLP-1 outcomes at high vs. low protein."*

That's why "integrate with a million things" isn't feature-creep — each domain we cover is a variable the model can hold constant. **Four domains are the priority: weight, exercise, food, sleep.**

## Two directions of integration
Name the distinction explicitly — they have different interfaces and trust models.

- **Sources (data IN)** — providers that supply readings we ingest (Health, scales, fitness, nutrition, CGM). The bulk of this doc.
- **Destinations (data OUT)** — sinks the user ships their own data to: **Google Drive**, exports, backups, reports. See "Destinations" below.

---

## Sources — design principle
One internal **canonical metric model**; every integration is a *provider* that maps its data in. Adding a source = one adapter, not touching the app.

### Canonical metrics (the normalized vocabulary)
Stable namespace everything maps into. Reading shape: `{ metric, value, unit, timestamp, source_provider, confidence, raw_ref }`.

**Weight / body**
- `body.weight`, `body.fat_pct`, `body.lean_mass`, `body.measurement.{waist,chest,arm,thigh,…}`

**Exercise** (meathead + general)
- `activity.workout` (type, duration), `activity.effort` (normalized strain/RPE), `activity.steps`, `activity.energy`
- `activity.strength.volume` (sets×reps×load), `activity.strength.session` (lifts, PRs) — *key for the meathead use case; most fitness APIs under-serve this, may need manual/lifting-app support*

**Food / nutrition** (meathead: protein + calories; biohacker: micros, timing)
- `nutrition.energy` (kcal), `nutrition.protein`, `nutrition.carbs`, `nutrition.fat`, `nutrition.fiber`, `nutrition.water`
- `nutrition.timing` (meal timestamps — relevant for GLP-1 appetite effects)

**Sleep**
- `sleep.duration`, `sleep.quality`, `sleep.stages`, `sleep.hr_dip`

**Vitals / recovery** (biohacker-leaning)
- `vitals.hr_rest`, `vitals.hrv`, `vitals.glucose` (CGM — strong biohacker signal), `vitals.spo2`

**Labs / biomarkers** (TRT/peptide crowd lives here — confounder *and* outcome)
- `labs.testosterone_total`, `labs.testosterone_free`, `labs.estradiol`, `labs.hematocrit`, `labs.igf1`, `labs.lipids.*`, `labs.*` (extensible)
- Source: manual entry **+ AI parse of a photographed lab PDF/report** into structured biomarkers (ties to 05 vision). Same pattern covers DEXA/InBody body-comp reports.

**Cycle** (makes female-user data interpretable)
- `cycle.phase`, `cycle.day` — imported from Apple Health / Health Connect. Major confounder for weight/mood/recovery.

The daily log (03) reads only canonical metrics — it never knows which provider supplied a value.

### Compounds as covariates
Every compound the user takes — peptide, GLP-1, **testosterone/TRT, ancillaries (AI/SERM/HCG), supplements** (and other anabolics logged as covariates) — is captured in their protocol (03/08) and treated by the AI + community DB (05/07) as a covariate to stratify on. Untracked co-administered compounds are the #1 source of noise; capturing them is the whole point. See the compound model in 08.

### Provider interface (every source implements)
- `authenticate()` — OAuth / native permission / API key
- `pull(range)` — fetch since last sync
- `subscribe()` / webhook — push where supported, else poll
- `map(raw) → CanonicalReading[]` — the only provider-specific logic
- `capabilities` — which canonical metrics it supplies (drives UI: "this source can fill weight + sleep")

## Source roadmap by tier

**Tier 0 — aggregators (most coverage, least work) — do first**
- **Apple Health (HealthKit)** — native on-device read; weight, sleep, workouts, HR, nutrition; most scales/apps already write here.
- **Google Health Connect** (Android) — the Android equivalent.
- One **cloud health aggregator** — **Terra** or **Spike** — single integration → hundreds of devices/apps (Garmin, Fitbit, Whoop, Oura, Withings, Polar…). Fastest path to breadth *and* it covers web (where HealthKit doesn't exist).

**Tier 1 — direct cloud APIs (where coverage/cost/control demands it)**
- Scales: Withings, Renpho, Eufy, Garmin Index
- Wearables: Garmin, Fitbit, Whoop, Oura, Polar, Apple Watch
- **Nutrition: MyFitnessPal, Cronometer, MacroFactor** (protein/calorie tracking — central to the meathead loop)
- **Lifting: Hevy, Strong, or manual** (strength volume/PRs — the gap general fitness APIs leave)
- **CGM: Levels, Nutrisense, Dexcom/Libre** (biohacker glucose signal)

**Tier 1.5 — labs & cycle (MVP scope)**
- **Bloodwork/labs:** manual entry + **AI PDF/photo parsing** (05) → structured biomarkers. MVP.
- **Menstrual cycle:** import from Apple Health / Health Connect.
- **AI vial/label scan → inventory** (03): same vision pipeline auto-populates inventory + reconstitution math.

**Tier 2 — long tail**
- Strava, Polar specifics, manual CSV import, generic webhook for anything custom.

## Which metrics surface — driven by compound tags, not personas
We don't model meathead/biohacker personas (see 02). Which canonical metrics surface/prioritize is driven by **goals ∪ compound effect-tags ∪ compound monitoring-tags** (08). The table below is *illustrative* of two common leanings, not a system concept — a real user's stack just carries tags across whichever rows apply.

| Domain | Training-led stacks tend to surface | Optimization-led stacks tend to surface |
|--------|----------------------|------------------------|
| Weight/body | scale weight, body-comp, measurements | weight, fat% |
| Exercise | **strength volume, PRs**, training load | HRV-based strain, recovery |
| Food | **protein, calories** | micros, meal timing, glucose response |
| Sleep | duration, quality | **stages, HRV, HR dip** |
| Labs | hematocrit, estradiol, lipids (if on TRT/AAS) | glucose, lipids, hormones |

No user sees a log full of irrelevant fields — tags gate what shows.

---

## Destinations (data OUT) — incl. Google Drive
A separate, smaller interface: `authenticate()` + `push(payload)`. Used to ship the user's own data out.

**Google Drive** — first destination:
- **Photo backup** — encrypted archive of progress photos to the user's own Drive (their data, their cloud) — a user-owned archive *in addition to* our operational storage (we still store photos to power ghost-overlay/analysis; 04/11).
- **Data export** — periodic CSV/JSON dump of logs + metrics (GDPR export aligns, 11).
- **Reports** — generated progress PDFs/summaries shipped to a Drive folder.
- OAuth, scoped to an app-specific folder only (`drive.file`), never full-Drive access.

Other future destinations: Dropbox, generic webhook, email export.

> Note: Drive holds *user-owned* exports. It is **not** part of the community pipeline (07) — that's anonymized aggregates only, never raw exports.

---

## Cross-cutting: conflict, trust, sync
- Same metric from multiple sources → resolve by `confidence` + recency + user-preferred source. Always show provenance; user can override/disconnect any source.
- Sync: webhooks where supported (real-time, cheap), else scheduled poll. Cadence per provider.
- Native sources read on-device; cloud sources via edge functions (10) so secrets stay server-side.

## Decisions (locked)
- **Aggregator vs. direct adapters** → *Both, phased.* Tier 0 (Health + one aggregator) first for breadth; add direct Tier-1 adapters where coverage/cost/control justify (esp. nutrition + lifting, which aggregators serve poorly).
- **Effort normalization** → map heterogeneous scores (Whoop strain, Garmin, RPE) into a single 0–100 `activity.effort` with the raw value kept in `raw_ref`; document the mapping, accept it's approximate.
- **Write-back to Health** → *read-only for MVP.* Revisit writing body-weight back later; read-only avoids a class of HealthKit policy issues (11).
- **Lifting/strength** → *MVP integrates a lifting app* (Hevy/Strong-style) to pull strength volume/PRs. A native in-app strength logger is a **post-release** add, only if users ask for it. (Avoids building a logger we're not sure is wanted.)
- **Nutrition** → support **all three** (MyFitnessPal, Cronometer, MacroFactor) so we don't lose any segment. Implement easiest/cleanest API first; MFP's gated/paid API may land last despite its size.
- **Drive (destination)** → launch with **export + encrypted photo backup**. Reports/PDFs deferred. Photo backup is a *user-owned archive in addition to* our operational storage — we still store photos for ghost-overlay/analysis (04/11).

## Decisions (resolved 2026-06-23)
- **Aggregator vendor → Terra.** Broadest device/app coverage, mature docs, web support (covers the no-HealthKit web target), and a workable health-data posture. Spike stays as the fallback if Terra's pricing or coverage disappoints in practice. Revisit only if a concrete blocker surfaces.
- **Nutrition build order → Cronometer first, then MacroFactor, then MyFitnessPal.** Driven by API accessibility, not market size: lead with the cleanest/least-gated API and let MFP's gated/paid API land last despite its reach. Order may shift if a partner API turns out to be unavailable at build time.
- **Lifting apps → both Hevy and Strong.** Build both adapters so neither lifting userbase is excluded; ship whichever has the readier API first, then the other. (Spec 06 already names lifting volume/PRs as the gap general fitness APIs leave.)
- **CGM → V2 (biohacker tier).** Continuous glucose monitors (Dexcom/Libre, or via Levels/Nutrisense). Deferred out of Base/Polish because of the regulatory weight (11) and because the glucose signal pays off alongside the V2 community-aggregate work, not before. Strong signal for GLP-1 stacks, so it's a firm V2 inclusion, not a maybe.
