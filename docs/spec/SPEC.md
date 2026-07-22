# PepiProgress — Product Spec (Index)

> **One-liner:** A daily progress-tracking journal that turns subjective check-ins and consistent photos into a personal timeline, and aggregates anonymized data into a community knowledge base on what actually works. Peptide and compound protocols are one of the domains it tracks, alongside general wellness goals like sleep, recovery, and body composition.

In-app nickname: **Pepi**. Public/store name: **PepiProgress** (`pepiprogress.com`).

## Status
- Phase: **scoping**. No code yet.

> **Also read:** [`docs/ROADMAP.md`](../ROADMAP.md) — implementation sequence and locked architectural/legal decisions (lab storage, HIPAA, community k-anonymity, protocol start date, sporadic compounds, coach export). Do not re-litigate these without updating that file.
- Locked decisions: Expo (iOS + Android + web), 6 languages (EN, ES, PT, FR, DE, RU), AI-photo-consistency as the wedge, freemium + 10-day trial, dosing suggestions deferred until a legal solution.

## The wedge (why we win)
The peptide-tracker space is already crowded (PeptIQ, Peptify, PepTracker, Regimen, Pep AI…). They all do dose/inventory/side-effect logging. **None lead with AI photo-consistency or a community outcomes DB.** Those two things are the product. Everything else is table stakes we must match.

## Spec areas
Each area is its own file and can be specced deeper independently.

| # | Area | File | Owns |
|---|------|------|------|
| 01 | Positioning & Strategy | [01-positioning.md](01-positioning.md) | Who it's for, competitors, the wedge, success metrics |
| 02 | Onboarding & Goals | [02-onboarding-goals.md](02-onboarding-goals.md) | Goal multi-select, goal→log-field mapping, "I don't know" flow |
| 03 | Tracking & Daily Log | [03-tracking-logging.md](03-tracking-logging.md) | Protocols, inventory/pins/stock, daily check-in |
| 04 | Photo Consistency (USP) | [04-photo-consistency.md](04-photo-consistency.md) | Ghost-overlay capture, drift scoring, visual-change estimation |
| 05 | AI Layer | [05-ai-layer.md](05-ai-layer.md) | Vision (photos/labs/vials), conversational parse, insights; dosing cards deferred |
| 06 | Integrations (the dynamic API) | [06-integrations.md](06-integrations.md) | Apple/Google Health, fitness apps, smart scales, provider framework |
| 07 | Community Database | [07-community-db.md](07-community-db.md) | Anonymized aggregates, outcomes, provenance/confidence |
| 08 | Data Model | [08-data-model.md](08-data-model.md) | Entities, schema, relationships |
| 09 | Internationalization | [09-i18n.md](09-i18n.md) | 6-language catalogs, no-hardcoded-English rule |
| 10 | Platform & Architecture | [10-platform-architecture.md](10-platform-architecture.md) | Expo, Supabase, edge functions, offline |
| 11 | Privacy & Compliance | [11-privacy-compliance.md](11-privacy-compliance.md) | Biometric PII, GDPR/BIPA, app-store policy, health-data rules |
| 12 | Monetization | [12-monetization.md](12-monetization.md) | Freemium + trial; sponsorship; acquisition/data thesis (no affiliate) |
| 13 | Conversational / Quick-Log | [13-conversational-logging.md](13-conversational-logging.md) | NL logging + assistant; text/voice/photo; reuses 05/03 |
| 14 | Community & Sharing | [14-community-sharing.md](14-community-sharing.md) | Protocol sharing, copy-protocol, before/after photos, moderation (post-MVP) |
| 15 | Typical-Day Baselines | [15-typical-day-baselines.md](15-typical-day-baselines.md) | One-time "typical day" setup + usual/less/more deviation chips for sparse repetitive metrics (nutrition, sleep); estimated-priority data |

## Roadmap

See **[`docs/ROADMAP.md`](../ROADMAP.md)** — full implementation sequence (M0→M5→Polish→V2→V3), phase scope, locked product/legal decisions, cost model, and M4 test checklist.

## Cross-cutting rules
1. **No hardcoded English, ever.** Enforced by lint. See 09.
2. **Every dosing/synergy fact carries `source` + `confidence`.** Never a bare number. See 05/07.
3. **Photos are biometric PII.** Encryption + RLS + regional rules are non-negotiable. See 11.
4. **Goals + compound tags drive what surfaces.** The log adapts to the union of goals and each compound's effect/monitoring tags — no personas. See 02.
