# 08 — Data Model

Postgres (Supabase). Per-user row-level security on everything. Sketch, not final DDL.

## Core entities

**user_profile**
- id, auth_id, locale, units, created_at
- goals[] (enum: weight_loss, skin, body_comp, sleep, recovery, wellness)
- community_opt_in (bool), photo_ai_opt_in (bool)

**compound** (reference catalog, shared/global) — *generalized from "peptide"*
- id, canonical_name, aliases[], common_uses[], cautions[]
- **type** (peptide | glp1 | hormone | ancillary | supplement | other) — drives behavior:
  - `hormone` = **testosterone / TRT** — first-class + curated (the dominant co-administered compound for peptide users; legitimate medical framing)
  - `other` = catch-all incl. **non-TRT anabolics** — *loggable for confounder capture, but NOT curated or marketed.* We don't build an AAS-cycle catalog; we just don't blind the data when someone's on more. Avoids "Pepi is a steroid app" in store review.
  - `controlled` flag (testosterone/TRT + any anabolic) → **track-only, no AI dosing cards** (05/11)
  - **`market_category`** (inoffensive | otc | grey | controlled), added 2026-07-12: drives the per-compound AI posture table in 05, enforced at the AI service. The `controlled` boolean stays as the hard gate (= `market_category = 'controlled'`); migration backfills the enum from the boolean + a categorization pass over the seed catalog (and the bundled on-device mirror `src/data/compound-catalog.ts`).
  - ancillaries (AI/SERM/HCG) first-class so TRT/AAS protocols + bloodwork make sense
- **effect_tags[]** — what it's expected to influence (fat_loss, muscle, recovery, healing, skin, sleep, cognition, libido, glucose, hormonal…)
- **monitoring_tags[]** — what to watch (hematocrit, estradiol, lipids, appetite, nausea…)
- → effect + monitoring tags drive which log fields/metrics surface (02); replaces any persona concept
- dosing facts via `compound_fact`

**compound_fact** (powers educational cards 05 + community 07)
- id, compound_id, type (dose_range | length | synergy | side_effect)
- value (jsonb), source (internet | community), citation, n, confidence, updated_at
- *not generated for `controlled` compounds (track-only)*

**protocol**
- id, user_id, status, started_at, ended_at, notes
- items → `protocol_item`

**protocol_item**
- id, protocol_id, compound_id, dose, dose_unit, ester?, route, frequency (jsonb: daily/EOD/custom)
- a protocol holds compounds of *any* type → the full stack is captured as covariates (07)

**lab_result** (bloodwork / biomarkers — 06)
- id, user_id, drawn_at, source (manual | ai_parsed), source_ref (parsed PDF/photo)
- biomarkers → `lab_biomarker`

**lab_biomarker**
- id, lab_result_id, marker (labs.testosterone_total, labs.estradiol, …), value, unit, ref_range?

**inventory_item**
- id, user_id, kind (vial | consumable), compound_id?, concentration?, amount_remaining, unit, low_threshold, expiry
- **vendor?** — brand/source, one-time per vial; **private to the user** for quality/batch tracking. Never surfaced on shared protocols (14).
- can be auto-populated via AI vial/label scan (05/06)

**dose_event**
- id, user_id, protocol_item_id, taken_at, dose, site (rotation), decrements inventory

**log_entry** (one rolling check-in per day — see 03)
- id, user_id, date, weight?, sleep_quality?, wellness?, note?

**symptom_event** (discrete, timestamped — NOT tied to a daily entry)
- id, user_id, type (typed taxonomy), onset_at, duration?, severity, note
- logged in-the-moment, zero-or-many per day; primary side-effect signal for the community DB (07)

**photo**
- id, user_id, session_type (face | body), captured_at, storage_path (encrypted bucket)
- capture_meta (jsonb: luma, tilt, distance_proxy)
- ai_meta (jsonb: drift_score, change_score, normalized_path) — null until analyzed
- consent flags

**metric_reading** (canonical layer from 06)
- id, user_id, metric (body.weight, sleep.duration, …), value, unit, timestamp
- source_provider, confidence, raw_ref

**integration_connection**
- id, user_id, provider, status, scopes[], last_sync_at, credentials_ref (vault)

**community_aggregate** (materialized from opted-in data, 07)
- compound_id, goal, cohort_key (incl. co-administered stack), metric, summary (jsonb), n, confidence, refreshed_at

## Relationships (high level)
- user 1—* protocol 1—* protocol_item *—1 compound
- user 1—* log_entry (rolling daily check-in)
- user 1—* symptom_event (discrete, timestamped)
- user 1—* lab_result 1—* lab_biomarker
- user 1—* photo
- user 1—* metric_reading (fed by integration_connection)
- compound 1—* compound_fact → feeds community_aggregate

## Notes
- `metric_reading` is the single source the daily log reads for auto-fill, regardless of provider.
- Catalog tables (`compound`, `compound_fact`) are global; everything else is RLS-scoped to user.
- Cohort keys in `community_aggregate` include the full co-administered stack so outcomes can stratify by covariates (e.g. on-TRT vs off-TRT).
- Photos: storage bucket separate from DB, encrypted, signed-URL access only.

## Decisions
- **log_entry = rolling daily**; symptoms are separate `symptom_event` rows (see 03). Settled.
- **metric_reading time-series:** index on (user_id, metric, timestamp); revisit partitioning/retention only if volume demands it. *(Engineering — defer tuning until real load exists.)*
