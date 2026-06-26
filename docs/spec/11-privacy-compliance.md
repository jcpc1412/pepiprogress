# 11 — Privacy & Compliance

This area can sink the app if ignored. Health data + biometric photos + dosing content = three regulated surfaces.

## Biometric / photo PII
- Face & body photos are **biometric, identifying PII**. Treated as the highest-sensitivity data.
- **Stored** (process-and-discard can't support ghost-overlay/face-tracking), but hardened: separate encrypted bucket, per-user RLS, short-lived signed URLs, no public buckets.
- **Private by default** — never shown to anyone but the user. (Private health photos are app-store-acceptable like medical apps; the nudity/CSAM exposure comes almost entirely from *public display*, so private-by-default is the load-bearing mitigation.)
- Explicit, separate consent for: (a) storing photos, (b) AI processing them (05), (c) any anonymized community use (07).
- **Stored for inference + the user's own timeline, never for model training** — neither us nor the model provider (Anthropic API, contractually) trains on user photos. Messaging must be precise: "stored privately for you; measured from, not trained on" — not "we don't store your face."
- **Bodies/faces are not trivially anonymizable** — community use is limited to *derived numeric scores*, never raw images.
- Regional: GDPR (EU), **BIPA / Illinois + other US biometric laws** (explicit consent, retention limits, no sale).

## Age gate & CSAM (proportional to the *public* surface, not user count)
**Core principle: moderation weight tracks your public photo surface, not your user count.** The CSAM base rate for private body-progress photos is genuinely low (you're not a photo-sharing destination). The reason to carry *any* protocol is risk = probability × impact: probability tiny, impact catastrophic + *criminal*. So the burden is light when nothing is public and heavy only when photos are distributed.

**Tier 1 — MVP (photos private-only): light burden.**
- **18+ DOB gate** (neutral birthdate screen, stored) + 17+/Mature store rating.
- **ToS** prohibiting illegal content + a **delete/report path** if something ever surfaces.
- **Do NOT proactively scan private photos** — that's its own privacy violation. With no public surface you don't host/redistribute and don't acquire "knowledge"; obligation is to act on what's reported, not to surveil. This is the same posture as any fitness app where users store body pics (JEFIT-tier).
- DOB gate itself doesn't reduce store visibility; the Mature rating (driven by content regardless) does, and the lost reach is non-target (under-18). Never game the rating down.

**Tier 2 — public photo sharing ships (area 14): heavy stack.**
- Escalate to **third-party age verification** (Yoti/Veriff/Persona) before a user can make any photo public.
- **Early stage: founder manually reviews every shared photo** — at low volume this is more reliable than automation and costs only time.
- **As volume outgrows manual:** AI pre-screen + **CSAM hash-matching (PhotoDNA/equiv)** + human queue; **report to NCMEC on actual knowledge** (18 USC §2258A).

⚠️ **Get outside legal counsel on the CSAM/age piece before turning on public sharing** — downside is criminal, not civil. For private-only MVP, the Tier-1 burden above is proportionate. (GDPR/ISO certification is orthogonal — it does not cover this.)

## Health data
- Apple HealthKit: data read via HealthKit **cannot** be used for advertising or sold; must be disclosed. Health Connect has parallel rules. Respect both.
- Clear data-use disclosure; user export + delete (GDPR right to erasure) from day one.

## Dosing content & app-store policy (ties to 05)
- Apple/Google restrict apps giving dosing guidance for unapproved substances. Our **educational, non-prescriptive, sourced** posture is the mitigation — must be enforced in product, not just ToS.
- **Controlled substances (testosterone/TRT + any anabolic, Schedule III in US): track-only.** No dosing/synergy AI for them — enforced by the `controlled` flag on `compound` (08), not just copy. Tracking is harm-reductive journaling; dosing guidance for controlled substances is the line we don't cross.
- Persistent "not medical advice" disclaimer; encourage professional consultation.
- Age gate: **tiered** (DOB now; hard verification before public sharing) — see "Age gate & CSAM" above.

## Consent UX pattern (for every opt-in that can't default-on)
For each opt-in we legally can't enable by default (community/research data, photo storage, photo AI processing, biometric use), the consent prompt is **not** a wall of text + a toggle. It's a **side-by-side "on vs off" comparison screen** showing what the user gains — rendered with demo/sample data, in the visual style of onboarding (e.g. "off → flat list" vs "on → cohort comparison + insights"). Make the value legible at a glance so consent is *informed*, not skipped.
- Applies to: community contribution (07), photo storage + AI (04), bloodwork retention (below).
- Still meets the legal bar (explicit, specific, informed) — the visual is *in addition to* the plain-language disclosure, not a replacement.
- **Chat can proactively suggest enabling an opt-in** when it would clearly help the user's current goal (13) — e.g. "you're comparing photos a lot; turning on AI analysis would score consistency for you" — surfacing the same comparison screen. Suggest, never auto-enable.

## Lab / biomarker data
- Bloodwork (06/08) is sensitive health data — same encryption + RLS + consent regime as the rest. AI-parsed lab PDFs: the source image is treated as sensitive; user confirms parsed values before save; raw report retained only with consent.

## Data governance
- Retention policy per data type; hard-delete on account deletion incl. storage bucket + aggregates de-link.
- Audit trail for integration data provenance (06).
- Secrets in vault; no API keys client-side.

## Decisions (locked)
- **Community contribution is opt-in**, separate consent, off by default (see 01/07).
- **Privacy review before EU launch:** yes — a formal review + DPA where processors apply is required before processing EU health/biometric data. Treat as a launch gate, not an afterthought.
- **Jurisdiction posture:** broad launch (per 01), but biometric features (photos) ship with consent + retention controls that satisfy the strictest regime (BIPA-style) by default, so we don't geo-fork the product.
