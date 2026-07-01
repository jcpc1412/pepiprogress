@AGENTS.md

# PepiProgress (Pepi) — project guide

A daily peptide-tracking journal that turns subjective check-ins + consistent photos into a personal progress timeline — and aggregates anonymized data into a community knowledge base. Omniplatform (iOS/Android/web), lightweight, 6 languages.

> ⚠️ See `AGENTS.md` (imported above): **Expo SDK 56 is bleeding-edge — read the versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing Expo code.** APIs differ from training data.

## Read these first (source of truth)
- **[docs/spec/SPEC.md](docs/spec/SPEC.md)** — the index to 14 fully-specced areas. Every product/architecture decision is locked there. Read it before touching anything.
- **[docs/ROADMAP.md](docs/ROADMAP.md)** — full implementation sequence (M0→M5→Polish→V2→V3), locked product/legal decisions, cost model, and M4 test checklist.
- **[docs/VOICE.md](docs/VOICE.md)** — brand voice & tone ("The Instrument"). Match it for every user-facing string + AI-generated copy (quick-log replies, insights, encouragement). Don't invent a new register per feature.

## Status
- **Scoping complete.** All 14 spec areas written, reconciled, decided — no open parking lots (except the deliberately-deferred dosing-card questions in area 05).
- **M0 complete** — Expo app (SDK 56, expo-router, `src/`), i18n (6 locales, device detection), no-hardcoded-string lint (verified it bites) + i18n key-parity CI, Supabase scaffold, type-gen script. All green: typecheck / lint / web export.
- **M1 in progress** — schema applied + client typed:
  - `supabase/migrations/` (6 files): enums + catalog (compound/compound_fact, RLS read-only), full user-scoped schema + owner-only RLS, community_aggregate + auto-create-profile-on-signup trigger, function hardening (pinned `search_path`, revoked RPC EXECUTE on trigger-only fns), schema gaps + compound_slug, and `user_state` snapshot table (owner-only RLS). **Applied** to `pjdbxnycrvibmebfumel`; `get_advisors` security = clean. File names match the recorded migration versions.
  - `supabase/seed.sql` — starter compound catalog (12 compounds; applied).
  - `src/types/database.ts` generated; `src/lib/supabase.ts` typed with `<Database>`. `src/lib/auth.tsx` = `AuthProvider`/`useAuth` (email + session restore), wired in the root layout.
  - **Auth UI is built** — `src/features/auth/auth-screen.tsx` (email/password sign-up/sign-in), reached via the account section in Protocol settings. OAuth providers still off (owner decision).
  - **Cloud sync ✅ ON** — sign-up runs `migrateToCloud` (normalized tables, for community aggregates) + seeds a `user_state` snapshot; sign-in restores from the snapshot (falls back to normalized reconstruction). **Continuous backup**: `src/lib/cloud-sync.tsx` (`CloudSync`, mounted in the root layout) debounce-mirrors the full state to `user_state` on every change while signed in + flushes on background. The interim snapshot blob stands in for the normalized per-entity sync engine (field-level conflict resolution + SQLite/MMKV), which stays Polish-tier.
- **M2 in progress — core usable loop is live (offline, no account):**
  - **Local-first store** (`src/lib/store.tsx`): AsyncStorage-backed, typed repository + React context (`useStore`). **Interim backend by design** — SQLite + MMKV + the sync engine (spec 10) replace it when auth lands; UI is written against the store interface so the swap won't touch screens.
  - **Field-surfacing engine** (`src/lib/field-surfacing.ts`): the locked rule `goals ∪ effect-tags ∪ monitoring-tags` → check-in fields + bloodwork markers. Pure, deterministic.
  - **Bundled catalog** (`src/data/compound-catalog.ts`): on-device mirror of `seed.sql` — pre-account users can't read the `authenticated`-only `compound` table, and onboarding must work offline.
  - **Onboarding** (units → goals → compounds) + **daily check-in** (surfaced fields, 1–5 scales, weight, notes; rolling one-per-day). Gated inside the Home tab (`src/app/index.tsx`) because expo-router needs the tab navigator mounted at the root layout.
  - **Symptom/side-effect events** (`src/features/symptoms/`): quick-add (type + severity + duration + note, onset=now) + recent list, surfaced on the check-in screen. Voice/NL quick-log is later (spec 13).
  - **Protocols + dose logging + reconstitution** (`src/features/protocol/`, in the Explore→**Protocol** tab): add protocol items (compound/dose/unit/route/frequency), tap-to-confirm dose logging + recent doses, and a reconstitution calculator (`src/lib/reconstitution.ts`, pure: mg/mL concentration + dose→volume→U-100 units). Adding a protocol item auto-adds its slug to `compoundSlugs` so field-surfacing stays in sync.
  - **Inventory** (vials + consumables, in the Protocol tab): amount remaining + unit + low-stock threshold + expiry + private vendor/batch; **vials auto-decrement** by dose-in-mg when a linked dose is logged (`doseToMg`, IU not convertible); low-stock / expired / expiring-soon badges. (Reminders/notifications themselves are still deferred infra.)
  - **Injection-site rotation:** per-protocol-item site field on dose logging + "last site" hint (`src/lib/store` tracks `site` on dose events).
  - **Backfill/edit past days:** the check-in has a day-stepper (`src/lib/dates.ts`) — step back to any past day and edit; no future days; inputs remount per date. No shame mechanics (spec 03).
  - Config decisions made here: `web.output` = `single` (SPA — app behind onboarding/auth, and it stops Node static-render from evaluating `supabase-js`); `src/lib/supabase.ts` no longer throws when env is unset (`isSupabaseConfigured` flag) so the app runs fully local-first with no `.env`.
  - **M2 polish done:** consumable auto-decrement (a pin per logged dose); in-app low-stock/expiry **attention banner** on the Protocol tab (push notifications still deferred); **history** list on the check-in (jump to a past day); **"customize what I log"** (`applyFieldCustomization` + a toggle of `CUSTOMIZABLE_FIELDS`, persisted to `profile.addedFields`/`removedFields`).
- **M3 in progress — AI service + conversational quick-log:**
  - **Reusable AI edge function** `supabase/functions/ai-service/` (Deno): Claude **Haiku 4.5** (cheap parse path, spec 05), structured outputs, parse-only with the dosing/controlled gate baked into the system prompt. **Deployed** to `pjdbxnycrvibmebfumel` (`verify_jwt: true` — the anon key is a valid JWT, so local-first invokes pass). Excluded from the Expo tsconfig (Deno/npm: imports); eslint already ignores `supabase/*`.
  - **Client:** `src/lib/ai.ts` (`parseQuickLog` via `supabase.functions.invoke`, passes the bundled catalog so it works without a DB read) + `src/features/chat/quick-log.tsx` — the "log in one box" surface at the top of the Home check-in. Confident parses auto-apply; low-confidence/unresolved wait for a tap (spec 13). Writes existing entities (weight/checkin/symptom/dose) — no new data model.
  - **Voice + undo done:** quick-log auto-applies confident parses with an **undo toast** that reverses the whole batch (`addSymptomEvent`/`logDose` now return the new id; checkin/weight undo restores the prior value). **Voice** = device keyboard dictation into the same input (spec 13's "device dictation") + a discoverability hint — no in-app STT dep.
  - Model is an env placeholder: edge function reads `AI_PARSE_MODEL` (default `claude-haiku-4-5`). Provider bake-off deferred — see memory `ai-provider-decision-deferred`.
  - **⚠️ Needs two secrets to actually run** (flagged to owner): `ANTHROPIC_API_KEY` in Supabase edge-function secrets, and the app's `.env` (`EXPO_PUBLIC_SUPABASE_URL` + anon key) — until both are set, the quick-log shows a "not set up yet" hint and the rest of the app runs local-first.
  - **Deferred to M4 (depends on vision):** photo-in-chat (routes to the 05 vision service). Own-data insights + general education are larger AI calls, later.
  - All green: typecheck / lint / i18n key-parity (6 locales) / web export.
- **M4 in progress — photos (the USP):**
  - **Design system first:** "CyberLife instrument" tokens (`src/constants/theme.ts`) — two co-equal monochrome themes (luminous daylight + at-night) sharing one engraved/debossed treatment, tabular-numeral type scale, chamfer/hairline/`Radii`/`Fonts` tokens. Primitives: `src/components/surface.tsx` (`Card`/`Sunken`/`Divider`/`EngravedLabel`/`Metric`/`SignalText`/`StatusPill`), restyled `form.tsx` + `themed-text.tsx`. Check-in recomposed onto it (`daily-checkin.tsx`). Design brief lives in chat history; v1 fidelity uses 2px radius + system mono (true 45° chamfers need `react-native-svg`; IBM Plex Mono/Inter need `@expo-google-fonts/*` — deferred, token-swappable).
  - **Capture + ghost overlay (Layer 1 core, incr. 1):** `src/features/photos/photo-capture.tsx` (expo-camera; front cam, permission gate, prior-photo ghost at 35%, capture→review→save, measurement panel on body) + `progress-photos.tsx` (face/body sessions, baseline→latest compare), mounted in the check-in where `photoComingSoon` was. `PhotoEntry` model + `addPhoto`/`updatePhoto`/`deletePhoto` in the store.
  - **vision-camera face capture ✅ ON in code (was a deferred spike):** the **face** session routes to `src/features/photos/vision-camera-capture.tsx` (`react-native-vision-camera` + `-face-detector`) — real-time face box, distance hint (vs baseline `boxRatio`), auto-capture when level + in range. **Body** stays on expo-camera (measurement panel; no body-pose gain). ⚠️ **Native caveat:** the installed `react-native-vision-camera@5.0.11` ships no `app.plugin.js`; its bare-string entry in `app.json` was crashing all Expo config loading (web export + prebuild) and has been **removed**. Library autolinks + camera permission via expo-camera plugin, but the frame-processor native flags must be enabled at device-build time before the face detector runs. Needs `prebuild --clean` device test.
  - **Tilt/level (incr. 2):** `expo-sensors` accelerometer → live level indicator + `tilt` stored as capture metadata.
  - **Vision AI (Layer 2, incr. 4):** `ai-service` v4 `analyze_photo` action (capable model via `AI_VISION_MODEL`, default `claude-sonnet-4-6`; structured output; observational/hedged gate baked in — no diagnosis, no identity). Client `analyzePhoto` in `src/lib/ai.ts` (resizes via `expo-image-manipulator` → base64). Drift score + comparability badge + hedged change note + retake hint wired into `progress-photos.tsx`.
  - **Timeline strip (incr. 5a):** tappable thumbnail row in `progress-photos.tsx` — each shows a comparability dot; tap to compare any past shot against baseline.
  - **Photo milestone system** (see `docs/ROADMAP.md` → M4): two-tier analysis — Haiku encouragement (short cadence, text-only) + Sonnet scientific (longer cadence, vision). Compound group cadences in `src/lib/photo-cadence.ts`. Milestone ISO dates stored in `LocalProfile` (`nextFace/BodyEncouragement/ScientificAt`). Buttons always visible when 2+ photos exist (early compare always allowed); next scheduled date shown as formatted string (no countdown needed).
  - **Cloud upload** (`src/lib/photos.ts`): all photos upload to `progress-photos` Supabase Storage bucket on save when user is signed in (`uploadPhotoToCloud`). Signed URLs for display. `PhotoEntry.cloudPath` tracks upload state.
  - **AI encouragement** (`simple_analysis` edge function action, Haiku): text-only check-in with recent logs + last scientific result context. `runEncouragementAnalysis` in `src/lib/ai.ts`.
  - **Visual symptom trigger** (`src/features/symptoms/`): after logging a visual symptom (`isVisualSymptom()` from photo-cadence), shows a dismissable in-component banner prompting a progress photo.
  - **Structured measurements** in photo review step (body session): waist, hips, optional extra field (chest/arms/thighs). Saved to `CheckinEntry` via `upsertCheckin`. Sent as measurement delta in the `analyze_photo` AI context.
  - **Body type calibration** + **cycle settings** (`src/features/settings/cycle-settings.tsx`): body type chip selector (slim/average/athletic/heavyset), optional menstrual cycle tracking (last period date + cycle length) — both in Protocol tab settings. Context passed to `analyze_photo` as `bodyTypeCalibration` and `cycleContext`.
  - **Remaining M4 (deferred to Polish):** brightness/luma metadata; body-pose detection for the body session; comparability threshold tuning; **storage hardening** (persistent copy → hardened encrypted cloud bucket + signed-URL display so photos render cross-device — the snapshot only carries local URIs today).
  - **Test plan:** on-device checklist in `docs/ROADMAP.md` → "M4 on-device test checklist" (built green, not yet device-verified — incl. the `prebuild --clean` camera Info.plist fix).
  - **⚠️ Native rebuild required:** added `expo-camera` / `expo-sensors` / `expo-image-manipulator` + bundle id → `com.pepiprogress.app` + `eas.json`. A Metro reload is NOT enough; run `npx expo run:ios` (or the Release variant) to rebuild the dev client.
  - All green: typecheck / lint / i18n key-parity (6 locales) / web export.
- **M5 complete (code) — beta-ready:** age gate, consent UX, "stored not trained on" messaging, data export + account delete (built across M4 polish). Auth UI + continuous cloud backup landed in M1 (see above). **Local reminders ✅** — `expo-notifications` via `src/lib/notifications.ts` + `notification-manager.tsx` (mounted in root layout): daily check-in + "log your doses" at user-set times, photo-milestone one-shots, foreground low-stock/expiry (deduped per day). Prefs in `src/features/settings/notification-settings.tsx` (Protocol tab); shared inventory predicate in `src/lib/inventory.ts`. Local-only (no remote push); no-ops on web. ⚠️ `expo-notifications` plugin added to `app.json` — native rebuild required. Only the EAS closed-beta build remains (owner's Apple Developer account). All green: typecheck / lint / i18n (6) / web export.
- **Polish in progress:**
  - **Integrations foundation:** canonical metric model + provider framework (`src/lib/integrations/` — `types.ts`, `registry.ts`, `providers/apple-health.ts`), `MetricReading` + `integrations` connection state in the store (`addMetricReadings`, `setIntegration`), and a "Data sources" settings card (`integration-settings.tsx`, Protocol tab). **Apple Health** registered (iOS-gated, 7 capabilities) but `nativeReady: false` — HealthKit native read is the device-build step (no HealthKit dep installed blind against RN 0.85). Next: Health Connect + Terra, then auto-fill readings into the log.
  - **Self-contained Polish one-shot ✅:** protocol `startedAt` → `cycleWeek` to the vision AI (edge fn `analyze_photo` v6); sporadic (`as_needed`) compounds surface fields only on dose days (`surfaceFields` options); soft cycle-tracking prompt as an optional onboarding step; goal-aware weight-delta tone in the check-in; **coach/doctor PDF export** (`src/lib/report.ts` via `expo-print`, button in Privacy settings); **retroactive photo import** (`expo-image-picker`, EXIF date) in `progress-photos.tsx`.
  - **Still deferred:** lab-PDF parsing + vial scan (AI-vision, do with integrations/AI focus), Drive backup (OAuth), normalized per-entity sync engine + storage hardening (infra, pairs with cloud track), fonts/chamfers (cosmetic — fonts need a weight→family map in `themed-text`).
  - All green: typecheck / lint / i18n (6) / web export.
- MVP split: **Base** (AI chat logging + AI photo analysis + core tracking + foundations; free closed beta) → **Polish** (integrations, lab parsing, vial scan, + freemium billing = public launch).

## Stack (decided — see area 10)
- **Client:** Expo SDK 56 + Expo Router (RN + web), `src/` layout, TypeScript. `react-native-vision-camera` for the photo USP (add in M4). Local-first (SQLite + MMKV) with anonymous→account migration. TanStack Query. i18next.
- **Backend:** Supabase — Postgres + RLS, Auth, encrypted Storage, Edge Functions.
- **AI:** Claude via one reusable edge-function service (vision + text); cheap model for quick-log parse, capable model for vision/insights.

## Supabase
- Project: **`pjdbxnycrvibmebfumel`** ("Pepiprogress"), connected via the project-scoped `supabase` MCP in `.mcp.json`. Project-scoped = this token only touches this one project.
- Migrations (M1) must run from a session with that MCP connected (i.e. a PepiProgress-rooted session).
- Environments plan: local (Docker) → preprod → prod (area 10). **Local Docker stack deferred until the beta phase** (owner decision) — until then work directly against this hosted project via the MCP. `gen:types` targets the hosted project (`--project-id`); `gen:types:local` is kept for when the local stack comes online. Mind that hosted is shared dev data — no `db reset` safety net yet.

## Non-negotiable cross-cutting rules (full detail in SPEC)
1. **No hardcoded English, ever** — every string from an i18n catalog; lint + missing-key CI enforced (09).
2. **Photos: private by default, stored (not discarded), hardened bucket, never used to train models** (04/11). Public sharing is post-MVP (14) and drags in the heavy moderation/age-verification stack.
3. **Dosing suggestions are DEFERRED app-wide** until a legal solution (05/11). Controlled compounds (testosterone/TRT + anabolics) are **track-only** — the `controlled` flag gates this in code at the AI service.
4. **What surfaces in the log = goals ∪ compound effect-tags ∪ monitoring-tags** — no personas (02/08).
5. **Never gate data INPUT (logging/integrations/contribution); gate OUTPUT/scale** (12).

## Localisation rule (non-negotiable — same weight as no-hardcoded-string lint)
**Every user-visible string goes through `t()` — no exceptions.** This includes:
- Button labels, placeholder text, accessibility labels (`accessibilityLabel`, `accessibilityHint`)
- Error messages, toast copy, status pill labels passed as computed strings
- Any string literal that a user could read on screen

Patterns that violate this rule:
- `accessibilityLabel="Loading"` — must be `accessibilityLabel={t('common.loading')}`
- `label="Sign in"` — must be `label={t('auth.signIn')}`
- Concatenating translated + hardcoded fragments: `t('foo') + ' items'` — add the suffix to the i18n key

When adding a new i18n key, add it to **all 6 locale files** (`en`, `es`, `fr`, `de`, `pt`, `ru`) in the same commit. Use the propagation script pattern in `scripts/check-i18n-keys.mjs` to verify parity before committing. Machine-translate non-EN values (flag them with a comment or prefix if human review is needed later).

## Working style (important)
- **Do not leave "Open questions" parking lots in plans/specs.** Drive every decision to a resolution — either ask, or state a sensible default as a decision. (Standing preference.)
- Decisions are *locked* in the spec; don't silently relitigate them. If something needs changing, flag it and update the spec to match.
- **Trunk-based development — commit directly to `main`, no feature branches.** As soon as a chunk of work is complete and passing the green gate (typecheck / lint / i18n / web export), commit + push to `main` immediately. Never leave work on a branch waiting for the owner to merge a PR. Before the owner runs an EAS build, verify `git status` is clean and `git log origin/main` shows the latest commits.

## Build plan entry point
Continue M0 (i18n + lint/CI guardrails, Supabase local, design tokens), then **M1** (data model + auth + local-first) using the migrations from area 08. De-risk the local-first migration, on-device face/body detection, voice dictation, and cheap-model parse accuracy with spikes before building around them.
