# PepiProgress (Pepi) — App Overview

> A single-file synthesis for external review. Pulled from the codebase, specs, and roadmap as of
> 2026-06-23. For authoritative depth see [`docs/spec/SPEC.md`](spec/SPEC.md) (14 areas) and
> [`docs/ROADMAP.md`](ROADMAP.md). Post-beta plan: [`docs/POST-BETA-PLAN.md`](POST-BETA-PLAN.md).

---

## 1. What it is

**One-liner:** A daily peptide-tracking journal that turns subjective check-ins + consistent photos into
a personal progress timeline — and aggregates anonymized data into a community knowledge base on what
actually works.

- **In-app nickname:** Pepi · **Store/public name:** PepiProgress (`pepiprogress.com`)
- **Platforms:** iOS + Android + web (one Expo codebase)
- **Languages:** 6 — English, Spanish, Portuguese, French, German, Russian
- **Audience:** people running peptide / hormone / supplement protocols who want an honest, visual,
  data-grounded record of whether it's working.

## 2. The wedge (why it wins)

The peptide-tracker space is crowded (PeptIQ, Peptify, PepTracker, Regimen, Pep AI…). They all do
dose / inventory / side-effect logging. **None lead with AI photo-consistency or a community outcomes
database.** Those two are *the product*; everything else is table stakes Pepi matches.

1. **AI photo-consistency (USP):** consistent progress photos via a ghost-overlay camera, face-detection
   alignment, level/tilt sensors, and an AI "comparability" judge — so a before/after is honest, not a
   lighting trick. Then a hedged, observational AI note on visible change.
2. **Community outcomes DB:** anonymized, k-anonymity-gated aggregates of what protocols correlate with
   what outcomes, every stat carrying `source` + `confidence` + `n`. (Goes live V2.)

## 3. Goals & product principles

- **Honesty over hype.** Photo comparability is judged and flagged; AI never diagnoses, never promises.
- **No shame mechanics.** Backfill/edit any past day; no streak punishment (spec 03).
- **The log adapts to you, not personas.** What surfaces = `goals ∪ compound effect-tags ∪ monitoring-tags`.
- **Lower the logging burden.** Conversational/voice quick-log + integration auto-fill reduce typing.
- **Local-first.** Fully usable offline with no account; cloud is additive (backup + community + AI).

## 4. Non-negotiable cross-cutting rules

1. **No hardcoded English, ever** — every string from an i18n catalog; enforced by lint + a missing-key
   CI check across all 6 locales.
2. **Photos are biometric PII** — private by default, stored (not discarded), hardened bucket, RLS,
   **never used to train models**. Public sharing is post-MVP (drags in moderation + age-verification).
3. **Dosing suggestions are deferred app-wide** until a legal solution exists. Controlled compounds
   (testosterone/TRT + anabolics) are **track-only** — a `controlled` flag gates this in the AI service.
4. **What surfaces in the log = goals ∪ effect-tags ∪ monitoring-tags** — no personas.
5. **Never gate data INPUT** (logging / integrations / contribution); only gate OUTPUT/scale (freemium).
6. **Every dosing/synergy/community fact carries `source` + `confidence`** — never a bare number.

## 5. Feature map (what's built)

### Onboarding & daily loop
- **Onboarding:** units → goals → compounds (+ optional soft cycle-tracking step). Works offline via a
  bundled compound catalog (pre-account users can't read the `authenticated`-only DB table).
- **Daily check-in:** surfaced 1–5 scale fields (sleep, wellness, appetite, energy, soreness, workout
  effort, libido), weight with goal-aware delta tone, notes. Rolling one-per-day with a day-stepper for
  backfilling/editing past days. "Customize what I log" toggles.
- **Field-surfacing engine** (`field-surfacing.ts`): pure, deterministic implementation of the
  goals ∪ tags rule → which check-in fields + bloodwork markers appear.

### Protocols, dosing, inventory
- **Protocols** (Protocol tab): add items (compound / dose / unit / route / frequency / start date).
- **Dose logging:** tap-to-confirm + recent doses; injection-site rotation with "last site" hint.
- **Reconstitution calculator** (`reconstitution.ts`): mg/mL concentration → dose → volume → U-100 units.
- **Inventory:** vials + consumables, low-stock / expiry / expiring-soon badges, private vendor/batch.
  Vials auto-decrement by dose-in-mg when a linked dose logs; an attention banner surfaces low stock.

### Photos (the USP)
- **Capture:** `expo-camera` with a 35%-opacity ghost overlay of the prior shot; capture → review → save.
- **Face session:** `react-native-vision-camera` + face-detector — real-time face box, distance hint,
  auto-capture when level + in range. **Body session:** expo-camera + a structured measurement panel
  (waist / hips / optional chest|arms|thighs).
- **Level/tilt:** `expo-sensors` accelerometer → live level indicator; `tilt` stored as metadata.
- **Vision AI:** drift score + comparability badge + hedged change note + retake hint; cycle-week,
  body-type, cycle-phase, measurement-delta, and symptom context all fed to the model.
- **Timeline strip + wipe-compare:** scrub any past shot against baseline; comparability dot per thumb.
- **Milestone cadence** (`photo-cadence.ts`): two-tier — short-cadence Haiku encouragement (text-only) +
  longer-cadence Sonnet scientific (vision), cadence keyed to compound group.
- **Retroactive import** (`expo-image-picker`, EXIF date) for mid-cycle joiners.
- **Cloud + cross-device:** photos upload to a private Supabase Storage bucket; display falls back to
  signed URLs when the local file is absent (second device).

### AI (one reusable edge service)
- **Conversational quick-log** (`quick-log.tsx` + `ai.ts`): "log in one box" → structured entities
  (weight/checkin/symptom/dose). Confident parses auto-apply with a batch **undo toast**; low-confidence
  waits for a tap. Voice = device keyboard dictation into the same box.
- **Deeper insights** (`insights.tsx`): data-grounded **trend** analysis, own-data **Q&A**, and
  **"what changed"** temporal-association surfacing — all over the user's own history, hedged, no advice.
- **Lab parsing & vial scan** (`lab-import.tsx`): photo → numeric marker values (image never stored) /
  vial label → compound + concentration.
- **Visual-symptom trigger:** logging a visual symptom prompts a progress photo.

### Integrations (provider framework)
- **Canonical metric model** (`integrations/types.ts`): stable keys (`body.weight`, `sleep.duration`,
  `activity.effort`, …) that the log reads without knowing the source.
- **Providers:** Apple Health (iOS), Health Connect (Android), Terra (cross-platform aggregator).
  Apple/Health Connect are framework-complete but `nativeReady: false` (native read = device-build step).
  **Terra is fully implemented** (edge-proxied widget auth + REST pull + server-side canonical mapping +
  effort normalization), gated on `EXPO_PUBLIC_TERRA_ENABLED` until creds are set.
- **Auto-fill** (`autofill.ts`): the check-in offers a synced weight when a reading exists for the day.

### Account, privacy, sync
- **Auth:** email/password (Supabase); OAuth providers off by owner decision.
- **Cloud sync:** continuous debounced mirror of full state to a `user_state` snapshot; sign-in **merges**
  local + cloud per-entity (last-write-wins) so anonymous data isn't lost. Normalized tables also populate
  for community aggregates.
- **Privacy/consent:** age gate, photo consent, "stored not trained on" messaging, data export, account
  delete. **Coach/doctor PDF export** (`report.ts` via `expo-print`).
- **Drive backup** (`drive-backup.ts`): optional Google Drive `appDataFolder` backup/restore (OAuth).
- **Local reminders** (`notifications.ts`): daily check-in + dose reminders, photo-milestone one-shots,
  foreground low-stock/expiry. Local-only (no remote push yet); no-ops on web.

## 6. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Client | **Expo SDK 56** + Expo Router, React Native 0.85, React 19.2, TypeScript | `src/` layout, typed routes, React Compiler on |
| State | Local-first **AsyncStorage** repository + React context (`store.tsx`) | Interim; SQLite + MMKV + per-entity sync engine is the planned replacement |
| Camera | `react-native-vision-camera` (+ face-detector), `expo-camera`, `expo-sensors`, `expo-image-manipulator` | face vs body sessions |
| Backend | **Supabase** — Postgres + RLS, Auth, Storage, Edge Functions | project `pjdbxnycrvibmebfumel` |
| AI | **Claude** via one reusable edge function (`ai-service`) | Haiku 4.5 for cheap parse/encouragement; Sonnet 4.6 for vision/lab/insights; models are env placeholders |
| i18n | i18next + react-i18next, `expo-localization` | 6 locales, device detection, key-parity CI |
| Fonts | IBM Plex Mono + Inter (`@expo-google-fonts/*`) | per-weight family map; needs a device build to verify |
| Build | EAS (preview/production profiles), bundle id `com.pepiprogress.app` | iOS build gated on Apple Developer activation |

- **Design system:** "CyberLife instrument" tokens (`constants/theme.ts`) — two co-equal monochrome
  themes (luminous daylight + at-night), engraved/debossed treatment, tabular numerals, chamfer/hairline
  tokens. Primitives in `components/surface.tsx` (Card/Sunken/Divider/EngravedLabel/Metric/SignalText/StatusPill).

### Data model (Supabase, 7 migrations)
- Enums + compound catalog (`compound`, `compound_fact`, RLS read-only) + seed (12 compounds).
- Full user-scoped schema with owner-only RLS; auto-create-profile-on-signup trigger.
- `community_aggregate` table; function hardening (pinned `search_path`, revoked RPC EXECUTE on
  trigger-only fns); `compound_slug`; `user_state` snapshot table; `progress-photos` storage bucket.

### The AI edge function (`ai-service`, currently v8)
Actions: `parse_log` (Haiku), `analyze_photo` (Sonnet vision), `simple_analysis` (Haiku encouragement),
`parse_lab` / `scan_vial` (Sonnet vision), `insights` (Sonnet), `terra` (aggregator proxy — no Claude
call). Hard rules (no dosing/medical advice, observational-only vision, values-only lab, grounded/hedged
insights, no identity) are baked into every system prompt. `verify_jwt: true` (anon key is a valid JWT).

## 7. Status & roadmap

Milestones **M0–M5 are code-complete** (scaffold → data model + auth + local-first → core loop → AI
quick-log → photos USP → beta-ready privacy/consent/export/reminders). **Polish** is largely done
(integrations foundation, coach export, retroactive import, cycle-week AI, storage hardening). The app is
**beta-ready in code**; the only blocker is the EAS iOS build, gated on Apple Developer activation (~48h).

- **Base** (closed beta, free): AI chat logging + AI photo analysis + core tracking + foundations.
- **Polish** (public launch): integrations, lab parsing, vial scan, **freemium + 10-day trial**.
- **V2:** community aggregates go live; integration depth (scales, wearables, nutrition, lifting, CGM);
  deeper AI insights. *(Insights + Terra already implemented ahead of schedule.)*
- **V3:** protocol sharing, public before/after photos + the moderation/age-verification stack.

**Monetization:** free closed beta → freemium + 10-day trial at public launch. Free = core logging + AI
chat + limited photo analysis; paid = full AI cadence, coach export, integrations, lab parsing. **Gate
output/scale, never input.** Sponsorship (non-affiliate, no dosing-linked revenue) scales later.

## 8. Quirks & sharp edges (for a reviewer)

- **`web.output: "single"`** (SPA) — the app sits behind onboarding/auth, and this stops Node static
  render from evaluating `supabase-js`. `supabase.ts` no longer throws when env is unset
  (`isSupabaseConfigured` flag) so the app runs fully local-first with no `.env`.
- **vision-camera native caveat:** the installed `react-native-vision-camera@5.0.11` ships no
  `app.plugin.js`; its bare-string plugin entry was crashing all Expo config loading and was removed.
  The frame-processor native flags must be enabled at device-build time before the face detector runs —
  needs a `prebuild --clean` device test.
- **Native rebuild required** for: `expo-camera`/`expo-sensors`/`expo-image-manipulator`,
  `expo-notifications`, `expo-image-picker`, vision-camera face detector, and the custom fonts. A Metro
  reload is not enough.
- **Interim persistence:** AsyncStorage snapshot blob stands in for the normalized per-entity sync engine
  (field-level conflict resolution + SQLite/MMKV), which is deliberately deferred. The snapshot carries
  local photo URIs only — cross-device photo display relies on the signed-URL fallback.
- **Secrets model:** all provider/API keys live in Supabase **edge secrets**, never the client bundle.
  Client only holds `EXPO_PUBLIC_*` flags (Supabase URL + anon key, Terra/Drive enable flags). Terra's
  key was deliberately moved server-side (the old `EXPO_PUBLIC_TERRA_API_KEY` was a security smell).
- **`nativeReady: false` pattern:** providers can be fully framework-bound but show "coming soon" until a
  device build wires the native SDK — avoids faking a connection.
- **Untestable-until-creds:** Terra is coded but can't be verified end-to-end until a Terra project +
  edge secrets exist. Apple Health/Health Connect native reads need a physical device build.
- **Shared hosted dev DB:** work runs directly against the hosted Supabase project (local Docker stack
  deferred to beta) — no `db reset` safety net yet; it's shared dev data.

## 9. What's deferred / blocked (and why)

- **Educational dosing cards** — hard-blocked until a legal solution; controlled compounds stay track-only.
- **Community aggregates (V2)** — depends on accumulated normalized data; will ship behind a feature flag
  with a server-side k-anonymity floor (n ≥ 50) so nothing renders early.
- **Public sharing (V3)** — needs the full moderation + age-verification stack first.
- **Write-back to Apple Health / Health Connect** — read-only for MVP (avoids HealthKit policy issues).
- **Remote push notifications** — local-only for now.
- **Normalized sync engine + storage hardening (full)** — infra, pairs with the cloud track.
- **AI provider bake-off** — model is an env placeholder; swap needs no code change.

## 10. Repo orientation

- `src/app/` — Expo Router entry + tab navigator (Home check-in, Protocol).
- `src/features/<area>/` — screen-level features (auth, chat, checkin, insights, lab, onboarding, photos,
  protocol, settings, symptoms).
- `src/lib/` — engines & infra (store, ai, sync, field-surfacing, photo-cadence, reconstitution,
  notifications, report, drive-backup, integrations/).
- `src/data/compound-catalog.ts` — on-device catalog mirror (offline onboarding).
- `src/i18n/locales/` — 6 JSON catalogs (key-parity enforced).
- `supabase/` — migrations, `seed.sql`, `functions/ai-service/`.
- `docs/spec/` — 14 spec areas; `docs/ROADMAP.md`, `docs/POST-BETA-PLAN.md` — sequence & decisions.

**Quality gates (all green):** `typecheck` · `lint` (incl. no-hardcoded-string) · `i18n:check`
(6 locales) · web export.
