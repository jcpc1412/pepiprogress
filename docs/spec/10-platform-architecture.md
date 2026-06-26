# 10 — Platform & Architecture

Most of this was decided implicitly while speccing other areas; this file makes it explicit. Engineering choices are stated as decisions, revisitable during build.

## Client — Expo (one codebase → iOS, Android, web)
- **Expo + Expo Router** (React Native + web target). Satisfies "omniplatform incl. web, lightweight."
- **Camera:** `react-native-vision-camera` + frame processors (on-device face/body detection, ghost overlay, alignment) on native (04); web falls back to `getUserMedia` with reduced guidance.
- **State/data:** TanStack Query over the API; optimistic writes.
- **i18n:** `i18next` + `expo-localization`, no hardcoded strings, lint-enforced (09).

## Local-first + sync (the activation backbone)
Onboarding + daily logging must work **offline and pre-account** (02: try-first, sign-up-to-save; 03: mornings/bad signal).
- **Local store:** SQLite (structured logs) + MMKV (light prefs). All core writes land locally first.
- **Anonymous → account migration:** local state is created under an anonymous local id; on sign-up it's claimed and synced to the user's row-scoped data. This migration path is a first-class requirement, not an afterthought.
- **Sync engine:** background push/pull to Supabase; last-write-wins per field with updated_at; queued mutations replay on reconnect.
- **What works offline:** logging (check-in, symptom events, dose events), viewing own data/timeline. **Online-only:** AI calls (05/13), integration sync (06), community (07).

## Backend — Supabase
- **Postgres + RLS** (08) — per-user isolation on everything; catalog tables (`compound`, `compound_fact`) global/read-only to clients.
- **Auth** — Supabase Auth (email + OAuth); OAuth providers double as integration entry where useful.
- **Storage** — encrypted bucket for photos + parsed lab images; signed-URL access only, no public buckets (11).
- **Edge Functions** — all AI, integration sync/webhooks, aggregate materialization. Secrets server-side only.

## The AI service (one reusable service — load-bearing for 5 features)
Photos (04), lab/DEXA parsing (06), vial scanning (06), conversational logging (13), and insights (05) all route through **one edge-function AI service**, not five ad-hoc integrations.
- **Router by input type:** image → vision pipeline (photo-analysis / lab-parse / vial-parse by context); text/voice-transcript → intent-parse or insight.
- **Cost control:** cache catalog-level content (same for all users); text quick-log is the cheap path; vision + insights are the expensive, async path — only on user action.
- **Enforcement boundary lives here:** the `controlled` flag (08) and the **deferred-dosing** rule (05) are enforced at this service, in code — no dosing output for controlled compounds, and (currently) no dosing suggestions at all.

## Integrations runtime (06)
- **Native:** HealthKit / Health Connect modules read on-device → push canonical `metric_reading` up.
- **Cloud + aggregator:** edge functions handle OAuth, polling/webhooks, mapping → `metric_reading`. Aggregator-first for breadth, direct adapters where needed (06).
- **Destinations (Drive):** edge function with `drive.file`-scoped OAuth for export + encrypted photo backup (06/11).

## Platform capability matrix
| Capability | iOS | Android | Web |
|-----------|-----|---------|-----|
| Ghost-overlay capture | full | full | reduced |
| HealthKit / Health Connect | yes | yes | no (cloud APIs only) |
| Push reminders | yes | yes | web-push |
| Voice quick-log (13) | yes | yes | yes (web speech) |
| Photo / lab / vial AI | yes | yes | yes |
| Offline logging | yes | yes | limited (PWA cache) |

## Repo & environments (decisions)
- **Repo:** single Expo app (iOS + Android + web from one project). Shared logic (canonical metric model, types, i18n catalogs, compound-tag rules) lives in internal modules structured for later extraction to packages — **don't** stand up a full monorepo until a second surface (e.g. admin/web-only) actually needs it.
- **Environments: local → preprod → prod** (three Supabase projects).
  - **local** — Supabase CLI/Docker; fast iteration, migrations tested here first.
  - **preprod** — hosted; the safety gate before prod. Runs migrations against prod-like data, exercises real OAuth callbacks (Health/Drive/aggregator) without touching live users, and is where releases are verified.
  - **prod** — live users; nothing reaches it that hasn't passed preprod.
  - **EAS Build** for native, Expo/Vercel hosting for the web target.
- **Secrets:** vault/edge-function env only; never in the client bundle.
- **Generated types:** Supabase → TypeScript types shared across client + edge functions, single source of truth with 08.
