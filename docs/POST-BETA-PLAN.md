# Post-beta phased plan (V2 + Deferred)

> Folds the **V2** and **Deferred** backlogs from [ROADMAP.md](ROADMAP.md) into an executable sequence.
> **Organizing principle:** order by *buildability now*. The closed-beta EAS build is gated on Apple
> Developer activation (~48h). Everything that needs **no device build** (Supabase, edge functions,
> pure client logic) runs first — it fills the wait productively and de-risks the data moat before
> any native work. Device-gated and blocked items are sequenced after, with their gate named.

Legend: 🟢 no device build needed (do now) · 🟡 needs a native device build · 🔴 externally blocked.

---

## Phase 1 — Community aggregates (the data moat) 🟢

The V2 differentiator, and **fully server-side** — zero device dependency. Normalized tables have
been populated since the M1 sign-up migration, so the data already exists to aggregate.

- **Aggregation layer (Supabase):** SQL functions / materialized views over the normalized tables →
  `community_aggregate`. Stratify outcomes by compound covariates (peptide + TRT/AAS + ancillaries +
  supplements).
- **k-anonymity gate (≥ 50):** no stat reported below the floor; rare compound combinations suppressed
  unconditionally. Enforced in the aggregation query, not the client.
- **Provenance:** every aggregate carries `source` + `confidence` + `n` (cross-cutting rule #2).
- **Lab-value consent:** separate opt-in toggle from general community contribution; lab stats excluded
  unless that toggle is on.
- **Read surface:** edge-function read API + an in-app "community insights" view (gated; output/scale
  gating per rule #5 — never gate input).
- **Refresh cadence:** scheduled aggregation (cron/edge function) rather than on-read.

**Exit:** a signed-in user sees anonymized, provenance-stamped outcome stats for their compounds,
with the k-anonymity floor provably enforced.

---

## Phase 2 — Deeper AI insights 🟢 ✅ (implemented)

Edge-function + client work, no device. Builds on the M3 AI service.

- ✅ `ai-service` `insights` action (capable model via `AI_INSIGHTS_MODEL`, default `claude-sonnet-4-6`):
  - **Trend analysis** (`mode: 'trend'`) — trends across the user's history.
  - **Own-data Q&A** (`mode: 'qa'`) — natural-language questions over full history.
  - **"What changed"** (`mode: 'correlation'`) — temporal-association surfacing around protocol starts /
    symptom clusters; never claims causation (hard rule in the system prompt).
- ✅ Client `runInsights` in `src/lib/ai.ts` + `src/features/insights/insights.tsx` (Trends / What-changed
  buttons + a free-text question box), mounted in the check-in (today view) once ≥ 4 check-ins exist.
  History is assembled compactly on-device (check-ins, doses, symptoms, integration metrics, protocol starts).
- Hard rules baked in: grounded in the user's own data, hedged, no medical/dosing advice; `insufficientData`
  signal when too sparse. Deployed in `ai-service` **v8**.

**Exit:** ✅ user can ask "how's my sleep trended since I started X" and get a hedged, data-grounded answer.

---

## Phase 3 — Integration breadth via Terra 🟢 ✅ (implemented; needs creds to verify)

Terra is a **cloud aggregator** (browser-widget auth + REST pull) — **no native SDK**, so it is the one
integration fully buildable without a device. It unlocks much of V2's tier-1 list through a single
integration: scales, wearables, nutrition, CGM.

- ✅ **Terra proxy in the edge function** (`ai-service` `terra` action, v8): `widget_session` generates a
  Connect-widget URL; `pull` fetches body/daily/sleep/activity and maps to canonical `ProviderReading`s
  **server-side**. Credentials (`TERRA_DEV_ID`, `TERRA_API_KEY`) stay in edge secrets — never the client.
- ✅ **Client provider** `providers/terra.ts`: `authenticate` opens the widget via `WebBrowser.openAuthSessionAsync`
  and captures `terraUserId` from the `pepi://terra` redirect; `pull` calls the proxy. `nativeReady` is
  gated on `EXPO_PUBLIC_TERRA_ENABLED` so the row shows "coming soon" until the owner flips it on.
  Provider contract extended: `authenticate` returns `{ ok, patch }`, `pull` takes `{ since, connection }`.
- ✅ **Effort normalization** — Whoop-style strain (0–21) mapped to a 0–100 `activity.effort` in the
  server-side mapper (`mapTerraRecord`); raw stays at source.
- ✅ **Auto-fill into the daily log** — `src/lib/integrations/autofill.ts` (`metricForDate` + `weightInUnits`);
  the check-in weight card offers "use synced weight" when a `body.weight` reading exists for the day and
  no matching manual entry.

**Exit:** ✅ (code) connecting Terra populates weight/sleep/HR/HRV/steps into the log; auto-fill offers it
in the check-in. ⚠️ **Untestable until** the owner creates a Terra project and sets `TERRA_DEV_ID` +
`TERRA_API_KEY` (edge secrets) and `EXPO_PUBLIC_TERRA_ENABLED=true`.

**Needs:** Terra signup → edge secrets `TERRA_DEV_ID` / `TERRA_API_KEY` + client flag `EXPO_PUBLIC_TERRA_ENABLED=true`.

---

## Phase 4 — Native integrations 🟡 (do when the device build lands)

Gated on a native build + physical device — naturally sequenced after Apple activates.

- **Apple Health (iOS):** implement `readHealthKit` in `providers/apple-health.ts`, flip `nativeReady`.
  Needs a HealthKit dep + config plugin + iOS device.
- **Health Connect (Android):** same for `providers/health-connect.ts`.
- **Cycle import** — Apple Health / Health Connect → `cycle.phase`, `cycle.day` (augments the manual
  M4 cycle settings). The canonical mapping can be written in Phase 3; the read is device-gated here.
- **vision-camera face detector** — verify on iOS + Android after `prebuild --clean` (top de-risk item).
- **On-device body-pose detection** — separate dep spike for the body session; do alongside the camera
  device pass.

**Exit:** Apple Health / Health Connect readings flow into the log on a real build; camera USP verified.

---

## Phase 5 — Tier-1 direct adapters 🟡 (V2 depth, where Terra falls short)

Where the aggregator's coverage/cost/control isn't enough. Each is a provider object against the
existing framework; most carry their own OAuth + native nuances. Build only the ones beta feedback
shows users actually have.

- **Scales:** Withings, Renpho, Eufy, Garmin Index → `body.weight/fat_pct/lean_mass`.
- **Wearables:** Garmin, Fitbit, Whoop, Oura, Polar, Apple Watch → sleep/HR/HRV/strain/steps/energy.
- **Nutrition:** Cronometer → MacroFactor → MyFitnessPal (build order locked) — central to the training loop.
- **Lifting:** Hevy **and** Strong → `activity.strength.volume/session`.
- **CGM:** Dexcom / Freestyle Libre (or via Levels / Nutrisense) → `vitals.glucose`. Carries regulatory
  weight (spec 11) — firm V2 inclusion.

**Exit:** the integrations that Terra couldn't cover well are available as direct connections.

---

## Phase 6 — Infra hardening (pairs with the cloud track) 🟢/🟡

- **Normalized per-entity sync engine** — replace the interim `user_state` snapshot blob with
  field-level last-write-wins + SQLite + MMKV backend. Spike first (top risk #2). 🟢 logic / 🟡 verify on device.
- *(Storage hardening for cross-device photos already landed this session — signed-URL fallback in
  `src/lib/photos.ts`.)*

---

## Blocked / revisit 🔴 (not scheduled — gate named)

- **Educational dosing cards** — until a legal solution exists (spec 05/11). Controlled compounds stay
  track-only. Hard gate.
- **Write-back to Apple Health / Health Connect** — read-only for MVP to avoid HealthKit policy issues
  (spec 11); revisit later.
- **V3 — Community & Sharing** — protocol sharing, public photos, and the moderation + age-verification
  stack. Out of scope here (the user scoped this plan to V2 + Deferred); see ROADMAP § V3.

---

## Recommended order while waiting for Apple

**Phase 1 → 2 → 3** are all 🟢 and independent of the build — that's the wait-window work, in
descending leverage (moat → insights → breadth). **Phase 4** starts the moment the device build is in
hand. **Phase 5/6** follow beta feedback.

**Status:** Phase 2 (insights) and Phase 3 (Terra + auto-fill + effort normalization) are implemented
and green (`ai-service` v8). Phase 1 (community aggregates, behind a feature flag) is the next wait-window
task. Phase 3 needs Terra creds to verify end-to-end.
