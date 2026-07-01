# PepiProgress — Roadmap

Single source of truth for implementation sequence, phase scope, and locked product/architectural decisions. The 14 spec area files (`docs/spec/`) cover *what* features do; this file covers *when* and *why* decisions were made.

---

## Implementation sequence

```
M0 → M1 → M2 → M3 → M4 → M5 → Polish → V2 → V3
                └── M3 AI service; M4 reuses it
     M5 consent/age-gate must land before M4 photos reach real beta users
```

> **V2 + Deferred execution sequence:** [POST-BETA-PLAN.md](POST-BETA-PLAN.md) folds the V2 and
> Deferred backlogs below into phases ordered by *buildability now* — server-side / edge-function
> work (community aggregates, AI insights, Terra) runs during the Apple-review wait; native and
> blocked items are sequenced after with their gate named.

---

## M0 — Skeleton & foundations ✅
**Goal:** an Expo app that builds for iOS/Android/web, wired to Supabase, with i18n + CI guardrails from commit 1.

- Expo + Expo Router; iOS/Android/web targets building (10).
- Supabase hosted project for shared dev (10). Local Docker stack deferred to beta.
- i18n scaffold (`i18next` + `expo-localization`), 6 locale files, `no-literal-string` lint rule + missing-key CI check on from the first commit (09).
- CI: typecheck + lint (incl. i18n) + test. Supabase→TS type generation pipeline (10).
- Design tokens / theme + nav shell.

**Exit:** blank app runs on all 3 targets in a non-English locale with lint/CI green.

---

## M1 — Data model, auth, local-first ✅
**Goal:** the schema exists, auth works, and writes are local-first with anonymous→account migration.

- Migrations (08): `compound` (+ effect/monitoring tags, `controlled`), `user_profile`, `protocol`/`protocol_item`, `log_entry`, `symptom_event`, `dose_event`, `inventory_item`, `photo`. RLS per-user; catalog read-only.
- Seed the `compound` catalog (starter set with tags + controlled flags).
- Supabase Auth (email/password). **Auth UI is built** (`auth-screen.tsx`, reached via the account section in Protocol settings). OAuth providers still off (owner decision).
- **Local-first store** (AsyncStorage), with sign-up migration → cloud and sign-in restore.
- **Continuous cloud backup ✅ ON** — `CloudSync` (`src/lib/cloud-sync.tsx`) debounce-mirrors the full state to the `user_state` snapshot table on every change while signed in, and flushes on background. Sign-in restores from the snapshot (falls back to the normalized reconstruction for pre-snapshot accounts). The normalized tables are still populated on sign-up for community aggregates.

**Still deferred:** OAuth providers; the normalized **per-entity sync engine** with field-level conflict resolution + SQLite/MMKV backend (Polish — the snapshot blob is the interim mechanism); local Docker stack (beta).

**Exit:** create data offline as anonymous → sign up → it migrates, backs up continuously, and restores on another device.

---

## M2 — Onboarding + core logging ✅
**Goal:** the full manual loop — onboard, then log daily.

- Onboarding (02): units → goals → compounds → first log.
- **Field surfacing engine:** `goals ∪ effect-tags ∪ monitoring-tags` (02).
- Daily rolling check-in (weight/sleep/wellness/note) with day-stepper backfill (03).
- Symptom events (timestamped + duration) — quick-add (03).
- Protocols + inventory + dose events + reconstitution math (03).
- **Customize what I log** — field add/remove persisted to profile (03).
- Offline logging works from M1.

**Exit:** a user can run the whole daily tracker by hand, offline. This alone is a real product.

---

## M3 — AI service + chat quick-log ✅
**Goal:** the reusable AI edge-function service; first consumer = conversational logging.

- **One AI edge-function service** with input-type router (05/10); `controlled`-flag + deferred-dosing enforced in code.
- Text/voice quick-log parse on the **cheap model** (Haiku) → structured entities; multilingual (05/09/13).
- Voice via device dictation; **auto-save with undo** + low-confidence confirm (13).
- Model is an env placeholder (`AI_PARSE_MODEL`); provider bake-off deferred — see *AI provider decision* below.
- Requires: `ANTHROPIC_API_KEY` in Supabase edge-function secrets + app `.env` Supabase URL/anon key.

**Exit:** "took 1mg arimidex, felt nauseous this morning" logs correctly in all 6 languages, with undo.

---

## M4 — Photo consistency ✅ (core loop done; fringe items deferred)
**Goal:** ghost-overlay capture + AI analysis, on hardened storage.

- **Design system:** CyberLife instrument tokens — two monochrome themes (daylight/night), engraved treatment, tabular numerals, chamfer/hairline radii. Primitives: `Card`, `Sunken`, `Divider`, `EngravedLabel`, `Metric`, `SignalText`, `StatusPill`.
- **Capture + ghost overlay:** front cam, permission gate, prior-photo ghost at 35%, capture → review → save. `expo-sensors` accelerometer → live level indicator + `tilt` stored as metadata.
- **vision-camera face capture ✅ ON (code)** — the **face** session uses `react-native-vision-camera` + `-face-detector` (`vision-camera-capture.tsx`): real-time face bounding-box, distance hint (current vs baseline `boxRatio`), and auto-capture when level + in range. The **body** session stays on `expo-camera` (`photo-capture.tsx`) — it carries the measurement panel and has no body-pose detection to gain from vision-camera.
  - ⚠️ **Native config follow-up:** the installed `react-native-vision-camera@5.0.11` ships **no `app.plugin.js`**, so the old bare-string plugin entry in `app.json` crashed all Expo config loading (web export + prebuild) — it has been removed. The library autolinks and the camera permission comes from the `expo-camera` plugin, but vision-camera's frame-processor build flags (normally set by its config plugin) must be enabled manually at device-build time (or via a vision-camera build that ships the plugin) before the face detector actually runs on device. Verify with `prebuild --clean` on a real device.
- **Wipe/slider compare:** drag handle, baseline vs selected, comparability badge overlay, "LATEST / BASELINE" labels.
- **Timeline strip:** tappable thumbnails with per-photo comparability dot.
- **Vision AI:** `analyze_photo` edge-function action (Sonnet, capable model), drift score + comparability + hedged change note. Client: `analyzePhoto` in `src/lib/ai.ts` (resizes via `expo-image-manipulator` → base64).
- **Photo milestone system** (two-tier, cost-gated): encouragement (Haiku, text-only, short cadence) + scientific (Sonnet vision, floor cadence). Compound-group cadences in `src/lib/photo-cadence.ts`. Buttons always visible; next date shown as formatted string.
- **Cloud upload:** all photos → `progress-photos` Supabase Storage bucket on save when signed in. Signed URLs for display.
- **AI encouragement:** `simple_analysis` edge-function action (Haiku), text-only check-in with recent logs + last scientific result context.
- **Visual symptom trigger:** logging a visual symptom (face_bloat, acne, water_retention, etc.) shows a dismissable banner prompting a progress photo.
- **Structured measurements:** waist/hips/optional extra (chest/arms/thighs) in body-session review step. Saved to `CheckinEntry`, sent as measurement delta to AI.
- **Body type calibration + cycle settings:** body type chip selector (slim/average/athletic/heavyset) + optional menstrual cycle tracking (last period + cycle length). Context passed to `analyze_photo`.
- **Full AI context wired:** scientific analysis receives cycle phase (luteal detection), measurement delta, recent visual symptoms, and body type calibration in every call.

**Deferred to Polish:** luma/brightness metadata; body-pose detection for the body session (separate dep spike); storage hardening (persistent URI → encrypted cloud bucket + signed-URL display for cross-device photos).

**⚠️ Native rebuild required:** `expo-camera` / `expo-sensors` / `expo-image-manipulator` + bundle id `com.pepiprogress.app` + `eas.json`. Run `npx expo prebuild --clean && npx expo run:ios --device`.

**Exit:** capture guided by ghost, wipe-compare two photos, get drift/change score, milestone system schedules re-analysis.

---

## M5 — Privacy, consent, age gate → beta-ready ✅ (code complete; EAS build is owner action)
**Goal:** make it safe and shippable as a closed beta.

- **DOB 18+ age gate** + store-rating prep (11). ✅ (age gate built in M4 polish)
- **Consent UX** (on/off comparison screens) for photo storage + AI processing (11). ✅
- "Stored for you, not trained on" messaging + disclaimers (04/11). ✅
- Data export + account delete (GDPR erasure incl. photo bucket) (11). ✅ (export built)
- Auth UI + continuous cloud backup ✅ (landed in M1 — see above).
- **Local reminders ✅ ON** — `expo-notifications` (`src/lib/notifications.ts` + `notification-manager.tsx`, mounted in the root layout). Daily check-in reminder + daily "log your doses" (both at user-set `HH:mm`), photo-milestone one-shots (scheduled from the milestone ISO dates), and a low-stock/expiry reminder that fires on foreground (deduped per day via `inventoryNotifiedOn`). Preferences + per-category toggles live in `notification-settings.tsx` (Protocol tab). All scheduling no-ops on web; the inventory predicate is shared with the Protocol attention banner (`src/lib/inventory.ts`). Local notifications only — remote push (server + APNs/FCM) is post-MVP. ⚠️ Native rebuild required (`expo-notifications` plugin added to `app.json`).
- **EAS closed-beta/TestFlight builds** (needs Apple Developer account — owner action).

**Exit:** closed-beta build with consent + age gate + delete/export + auth + reminders, ready for real users. Only the EAS build (owner's Apple Developer account) remains.

---

## Polish — data-richness + public freemium launch

**Freemium + 10-day trial goes live (12)** — this is the public launch point.

- **Integrations (06):**
  - **Provider framework ✅ (foundation in)** — canonical metric model (`src/lib/integrations/types.ts`), provider registry (`registry.ts`), `MetricReading` + `integrations` connection state in the store (`addMetricReadings` dedupes by provider+metric+ts; `setIntegration`), and a "Data sources" settings card (`integration-settings.tsx`, Protocol tab) that connects + syncs + ingests readings. Readings ride the `user_state` snapshot.
  - **Apple Health + Health Connect ✅ (code)** — both Tier-0 providers implemented and `nativeReady: true`: `readHealthKit` (`providers/apple-health.ts`, `@kingstinct/react-native-healthkit`) and `readHealthConnect` (`providers/health-connect.ts`, `react-native-health-connect`) request read permission and map to canonical metrics — body weight/fat/lean, steps, active energy, resting HR, HRV, sleep, **nutrition (calories + protein + carbs + fat)**, cycle. ⚠️ **Native rebuild required:** the nutrition read scope is newer than any build made before it was added, so an installed build won't request nutrition permission until rebuilt (`npx expo run:ios` / `run:android`). Device-verify the HealthKit/Health Connect permission + read path.
  - **Passive sync ✅** — `src/lib/integration-sync.tsx` (`IntegrationSync`, mounted in the root layout) pulls every connected + native-ready + platform-available provider on mount and on app foreground (`AppState`), incremental since `lastSyncAt`, rate-limited to 15 min, no-op on web. Removes the "tap Sync now or nothing updates" gap — this is the "pull passively" behavior. The manual "Sync now" in Data sources still works.
  - **Nutrition autofill ✅** — the daily check-in surfaces protein/calories whenever a goal/effect-tag asks OR a synced reading exists for the day, and passively fills an empty field from the reading (a conflicting typed value is never overwritten — it shows a tap-to-apply link instead). `detailed-log.tsx` + `metricForDate`.
  - **Next:** Terra aggregator (dormant on cost). Tier-1 direct adapters are V2.
  - Deferrable overall — AI chat logging already makes manual input painless.
- **Coach/doctor export ✅** — client-side PDF via `expo-print` (`src/lib/report.ts`: check-ins, dose log, symptoms; localized; HTML-escaped; "self-reported, not a medical record" footer). Button in Privacy settings. Premium-gateable at launch (03/12).
- **Retroactive photo import ✅** — `expo-image-picker` "Import a photo from your library" in `progress-photos.tsx`; uses the photo's EXIF capture date when available, else now. Lets mid-cycle joiners establish a real baseline (04).
- **Protocol start date ✅** — `startedAt` on `ProtocolItem` (form field in Protocol tab); the vision AI receives `cycleWeek` (computed from the earliest start date) so a mid-cycle joiner isn't read as day 1. Edge function `analyze_photo` prompt updated + redeployed (v6). (03/08).
- **Sporadic compound field-surfacing ✅** — `surfaceFields` takes `{ sporadicSlugs, activeSporadicSlugs }`; `as_needed` compounds surface their fields only on days a dose is logged for them (selected day or the day before). Prevents noise for infrequent peptides like MOTS-c. (02/03).
- **Soft cycle-tracking prompt in onboarding ✅** — optional final onboarding step ("Track your cycle?") that opts into `lastPeriodDate`/`cycleLength`; still also editable in Protocol settings (02).
- **Goal-aware delta tone ✅** — the check-in weight delta now colors good/bad by the user's goal (weight-loss → down good; body-comp → up good), neutral when ambiguous (`daily-checkin.tsx`).
- **Normalized per-entity sync engine** — replaces the interim `user_state` snapshot blob with field-level conflict resolution (last-write-wins per field) + a SQLite + MMKV backend (replacing AsyncStorage). The snapshot keeps users backed up until this lands. *(Infra — pairs with the cloud track.)*
- **Storage hardening** — persistent URI → hardened encrypted `progress-photos` bucket + signed-URL display so photos render across devices (the snapshot only carries local URIs today). *(Infra — pairs with the cloud track.)*
- **Typography + chamfers** — IBM Plex Mono / Inter via `@expo-google-fonts/*` (needs a weight→family map in `themed-text` so bold renders) + true 45° chamfers via `react-native-svg`. Cosmetic, token-swappable. *(Deferred — focused visual task.)*
- **Lab-PDF parsing & vial scan** — AI-vision features (05/06); build them alongside the integrations/AI focus, not here.
- **Drive backup** — Google OAuth + Drive API (06); its own OAuth-heavy track.

### Harvested from product review (2026-06-30) — see `docs/gpt-analysis-review.md`

Cheap, high-leverage items pulled from the GPT architecture/vision review. Kept small on purpose; the big ideas from that doc (experiment-engine rewrite, knowledge graph, multi-agent AI) are **not** adopted — they're a V2+ lens, not a pre-launch refactor.

- **Provenance surfacing** — metric cards / autofill show the source + freshness ("from Apple Health", "estimated") using the `MetricReading.sourceProvider` + `confidence` the data model already carries. Trust win, near-zero cost.
- **"No measurable change detected"** — a deterministic negative-result output (nothing happened within current data quality). Differentiated + honest for compound users; the encouragement/scientific AI actions narrate it, they don't invent it.
- **Designed silence** — "nothing meaningful changed since your last visit" is a valid, styled home state (Today's Distillation), not a gap to fill with noise. Overproducing insights kills trust.
- **Outcome-first copy** — lead marketing/onboarding with "know whether your protocol is working"; AI mentioned late, never in the headline (it's table stakes in 2026, not a differentiator).

**Locked decisions from the review:** no data-model rewrite pre-launch; wedge stays on peptides/anabolics/hormones while the engine stays intervention-generic underneath; keep the "observability, not recommendations" line (do not adopt the doc's "decision engine" framing — it reintroduces deferred-dosing/advice risk); the **photo reveal is the emotional payoff** (treat it as the reward, not "just another evidence type").

---

## V2 — Integrations depth + community aggregates

**Tier-1 direct adapters (06)** — where the aggregator's coverage/cost/control falls short:
- **Scales:** Withings, Renpho, Eufy, Garmin Index → `body.weight`, `body.fat_pct`, `body.lean_mass`.
- **Wearables:** Garmin, Fitbit, Whoop, Oura, Polar, Apple Watch → sleep, HR, HRV, strain/effort, steps, energy.
- **Nutrition:** Cronometer → MacroFactor → MyFitnessPal (build order locked, 06) → `nutrition.energy/protein/carbs/fat/fiber/water/timing`. Central to the training loop (protein + calories).
- **Lifting:** Hevy **and** Strong (both, 06) → `activity.strength.volume`, `activity.strength.session` (PRs). The gap general fitness APIs leave.
- **CGM:** Dexcom / Freestyle Libre, or via Levels / Nutrisense → `vitals.glucose`. Strong GLP-1 signal; carries regulatory weight (11) — firm V2 inclusion.
- **Effort normalization:** map heterogeneous scores (Whoop strain, Garmin, RPE) into one 0–100 `activity.effort`, raw kept in `raw_ref`.
- **Cycle import** from Apple Health / Health Connect → `cycle.phase`, `cycle.day` (replaces/augments the manual cycle settings from M4).

**Community aggregates go live (07):**
- Anonymized outcomes data, computed server-side from the normalized tables (populated since M1 sign-up migration).
- **k-anonymity floor ≥ 50** before any stat is reported; rare compound combinations suppressed unconditionally (see *Community data* decision below).
- **Lab values require a separate consent toggle** from general community contribution.
- Every aggregate carries `source` + `confidence` + `n` (cross-cutting rule #2). Provenance always shown.
- Stratify outcomes by compound covariates (peptide + TRT/AAS + ancillaries + supplements) and by the confounders the integrations now capture (training load, protein, calories, sleep) — the scientific edge (06).

**Deeper AI insights (05/13):** compound-specific trend analysis, own-data Q&A across full history, "what changed when I added X" correlations. Larger model calls than the M3 quick-parse path.

**"Ask Pepi" — MVP shipped, V2 extends via the same seam (from the product review):** a query bar on the Insights tab (`src/features/ask/ask-pepi.tsx`), **not** a chatbot. Three-stage pipeline with a stable `PepiQuery` contract in the middle: **intent → query → answer** (`src/lib/ask/{types,intent,execute}.ts`).
- **MVP (shipped):** deterministic English keyword matcher (`intent.ts`) + pure offline executor (`executeQuery`, no AI call) over the local log — check-in scales, weight, protein/calories, dose counts. Question shapes: latest / average / total / peak / low over rolling windows, and this-week-vs-prior-week comparison. Discovery via locale-safe suggestion chips that dispatch pre-built queries (bypass the English matcher, so every locale works today). Instrument-style readout, hard "no data" / "not understood" guards.
- **V2 extends without reshaping:** swap the matcher for an AI intent parser that emits the same `PepiQuery` (multilingual free text; the deterministic matcher stays as the offline fast-path); add `{ kind: 'reading' }` metrics (steps/HR/HRV/sleep-duration from integrations) — same executor pattern; add correlation ops; and pass `PepiAnswer` through the `insights` AI action for natural phrasing on top of the deterministic numbers. `executeQuery` is reused verbatim.
- Must never become a friendly assistant ("Hi! 😊") — it's a lab query bar. AI stays invisible infrastructure.

---

## V3 — Community & Sharing (14)

- **Protocol sharing** — publish a sanitized protocol (vendor/batch and other private fields stripped); discover others' protocols.
- **Copy-protocol** — clone a shared protocol into your own (seeds protocol items + field surfacing).
- **Before/after photos** — opt-in public progress shots. Drags in the heavy stack below.
- **Moderation + age-verification stack** — required before any public photo/user content: content moderation pipeline, reporting/abuse flow, stronger age verification than the 18+ self-attest gate. This is the gate for everything user-facing-public.
- **Sponsorship scales (12)** — non-affiliate sponsorship model expands; no dosing-linked monetization.

---

## Monetization timeline (12)

- **Base (closed beta):** free, no billing — proves the loop.
- **Polish (public launch):** freemium + **10-day trial** turns on. Free tier = core logging + AI chat + limited photo analysis; paid tier = full AI analysis cadence, coach export, integrations, lab parsing. Gate **output/scale, never input** (cross-cutting rule #5 — logging/integrations/contribution always free).
- **V3+:** sponsorship scales (non-affiliate; no dosing-linked revenue, 05/11).

---

## Deferred (no phase / blocked)

- **Educational dosing cards** — until a legal solution exists (05/11). Hard gate; controlled compounds stay track-only.
- **On-device body-pose detection** — face detection is on (vision-camera); body-pose for the body session is a separate dep spike.
- **Write-back to Apple Health / Health Connect** — read-only for MVP (avoids a class of HealthKit policy issues, 11); revisit writing body-weight back later.
- **Native in-app strength logger** — post-release, only if users ask (V2 integrates Hevy/Strong instead of building a logger we're unsure is wanted, 06).
- **Additional export destinations** — Dropbox, generic webhook, email export (Drive is the first/only destination at Polish, 06).

---

## Top risks to de-risk early

1. **vision-camera face detection on device** — capture path is wired (face session) but the face-detector frame processor is unverified outside a real device; confirm on iOS + Android after `prebuild --clean`.
2. **Normalized sync engine + conflict resolution** (Polish) — the interim snapshot is simple/idempotent; the per-field-merge engine is the trickier infra. Spike before committing.
3. **Voice dictation quality across 6 languages** (M3) — validate early.
4. **AI parse accuracy + cost** on the cheap model (M3) — validate it's good enough for structured logging.

---

## Product decisions (locked)

These are architectural and legal calls made during development. Do not re-litigate without updating this section.

### Lab documents — store or not?

**Decision: never store the document. Store only the extracted values.**

Storing a lab PDF contains the patient name, provider name, lab name, collection date, and ordering physician — a combination that constitutes a medical record. The correct implementation: user opens a lab result, the app OCRs or the user manually enters the values, the document is never written to disk or cloud storage. Only structured values (testosterone: 650 ng/dL, date: 2026-04-10) land in the database, treated as user-self-reported entries.

### HIPAA liability — lab values

**Decision: PepiProgress is not a covered entity. Standard consumer health-data obligations apply.**

HIPAA applies to healthcare providers, health plans, and clearinghouses — not consumer apps. Storing user-self-reported lab values does not make us a covered entity.

What does apply:
- **FTC Health Breach Notification Rule** — unauthorized access to identifiable health data must be disclosed.
- **California CMIA** and equivalent state laws.
- **App store health-data policies** (Apple, Google) — require explicit privacy policy disclosure.

Required before public launch: ToS/PP must state (a) not a healthcare provider, (b) not medical advice, (c) user self-reports their own data, (d) data is not shared with insurers, employers, or advertisers. Incident response plan for unauthorized access. **Health tech lawyer review of the PP — non-negotiable.**

The local-first architecture helps: if lab values never leave the device without explicit user consent, there is nothing to compel from our servers.

### Community data — lab values and k-anonymity

**Decision: lab values require a separate consent toggle; no aggregate stat is reported until ≥ 50 users match the filter; rare combos suppressed unconditionally.**

The general community-contribution toggle covers check-in fields. Lab values are higher-risk — a small group on a specific compound combination is effectively re-identifiable from the aggregate.

Rules:
- Separate consent for lab values vs general check-in data.
- k-anonymity floor = 50: suppress any stat where fewer than 50 users match the filter.
- Rare compound combinations suppressed unconditionally regardless of total user count.
- No individual-level lab values shared even with consent — community = aggregates only.

### Mid-cycle compound onboarding (protocol start date)

**Decision: add `startedAt` to `ProtocolItem`; pass `cycleWeek` to AI; deferred to Polish.**

A user joining in week 4 of a 16-week Retatrutide cycle has different AI context needs than a day-1 user. The fix: `ProtocolItem.startedAt` (ISO date), `cycleWeek` computed and passed to analysis. First mid-cycle photo labeled "Week N baseline" not "Day 1 baseline." Milestone scheduling offsets from `startedAt`.

Deferred because it requires a protocol-edit UX and a store migration. Not a breaking gap for closed beta — users can note their cycle week in check-in notes.

### Sporadic compound field-surfacing rule

**Decision: `as_needed` frequency compounds surface monitoring fields only on dose-log days (+ 24h window). Deferred to Polish.**

Currently the field-surfacing engine fires every day for every active compound regardless of frequency. For sporadic peptides (MOTSC, BPC-157 used a few times a week), this produces noise. Fix: `frequency = 'as_needed'` compounds enter the surfacing union only on days a `DoseEvent` exists within the past 24 hours. Requires a change to `src/lib/field-surfacing.ts` to accept today's dose events as input.

### Retroactive photo import

**Decision: allow camera roll import with manual date. Deferred to Polish.**

`expo-image-picker` (already in SDK 56, no new native dep). Date picker defaults to EXIF date if available. Imported photos go through the same copy-to-documents + cloud-upload path as captured photos. Ghost overlay still prefers captured photos for alignment.

### Coach/doctor export

**Decision: PDF/JSON structured report, premium feature, Polish phase.**

Content: configurable date range, weight trend, wellness/energy scores, symptom timeline, dosing log, lab value table, AI analysis notes. Generated client-side (`expo-print`). Native share sheet. Labeled "self-reported data, not a medical record." Gated as a premium feature at Polish launch.

### Retroactive check-in data — how far back matters

**Decision: 90 days is the practical AI context horizon; user records are unlimited.**

- AI encouragement (Haiku): 7-day slice — already implemented.
- AI scientific analysis (Sonnet): photos are primary signal; 30-day preceding check-ins is adequate supplementary context; 90 days covers a full long-cycle compound.
- User records: unlimited — users can backfill any past date via the day-stepper.

No code change required; the 7-day encouragement slice is live; scientific calls don't currently pass check-in history (photos are the signal).

### AI provider (model bake-off)

**Decision: deferred. Current implementation uses env placeholder `AI_PARSE_MODEL` (default `claude-haiku-4-5`) and `AI_VISION_MODEL` (default `claude-sonnet-4-6`).**

Cost/quality snapshot was taken during M3. Bake-off (comparing Haiku vs alternatives on parse accuracy, and Sonnet vs alternatives on vision quality) is deferred until after the build plan. The env-var indirection means swapping the model requires no code change.

---

## M4 cost model (reference)

At 5 quick-logs/day, 3 photos/week, 4 encouragement checks/month, 1–2 scientific comparisons/month:

| Line item | Per user/month |
|---|---|
| Quick-log AI (Haiku) | ~$0.15 |
| Encouragement analysis (Haiku) | ~$0.008 |
| Scientific comparison (Sonnet) | ~$0.009–0.018 |
| Storage — all photos (12/month × 500 KB) | ~$0.025 |
| **Total** | **~$0.19–0.20** |

50 users ≈ **$10/month**. 1,000 users ≈ **$200/month**.

---

## M4 on-device test checklist

Run these on a real device after `npx expo prebuild --clean && npx expo run:ios --device`.

- [ ] Camera permission prompt uses our copy; deny → graceful gate; grant → camera shows.
- [ ] Front camera, mirrored preview. First shot: no ghost; saves as Baseline.
- [ ] Second shot: prior photo ghosts at ~35%. Capture → review → retake/save flow.
- [ ] Level bar tracks tilt; turns green within ~5° of upright.
- [ ] Body session review: waist/hips inputs appear; chip selector for chest/arms/thighs; selected key shows value field. Measurements save to today's checkin.
- [ ] Timeline strip: 2+ shots → thumbnail row; comparability dot per thumb; tap selects for wipe compare.
- [ ] Wipe compare: drag handle reveals baseline (right) vs selected (left); "LATEST / BASELINE" labels; "Drag to compare" hint; badge appears when comparability is known.
- [ ] "Deep comparison" triggers Sonnet analysis (requires `ANTHROPIC_API_KEY` + `.env`). Result shows in analysis card with ANALYSIS label.
- [ ] "Weekly check-in" triggers Haiku text note. Result shows in CHECK-IN NOTE card section.
- [ ] Visual symptom (face_bloat / acne / etc.) → dismissable photo suggestion banner appears in symptom events.
- [ ] Body type chip selector in Protocol tab settings persists across app restart.
- [ ] Cycle tracking toggle: enable → date + length fields appear; disable → clears.
- [ ] Clothing hint shown on first (no-ghost) capture; ghost hint on subsequent captures.
- [ ] Next milestone date shows as formatted locale date (not a countdown).
- [ ] Photos persist after app restart (documents dir, not cache URI).
- [ ] 6-language spot check, especially DE/RU button label lengths.
