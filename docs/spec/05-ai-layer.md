# 05 — AI Layer

Model: **Claude** (vision + text) server-side via edge functions (10). Keys never touch the client.

## Capabilities
1. **Photo analysis** (see 04) — drift scoring, visual-change estimation, normalization.
2. **Educational compound info (observational, non-prescriptive):** ✅ **SHIPPING** (owner decision 2026-07-12, reversing the earlier app-wide defer). Surfaces *general, attributed, non-individualized* info: *"commonly reported ranges are A to B"* (internet-sourced + cited now; community-weighted later, 07). Governed by the hard rules below. Two lines that do **not** move: (a) **never personalized to the user** (*"for someone your size, take Y"* is out; the personalization is the regulated part, not the number); (b) **controlled compounds (testosterone/TRT + anabolics) stay track-only** + observational community data only, no pushed ranges. What stays deferred is the *individualized / prescriptive* version, pending legal input + a lawyer-backed doc if these compounds ever become legal.
3. **Lab/report parsing** (06) — vision-parse a photographed bloodwork PDF (or DEXA/InBody) into structured biomarkers; user confirms before save.
4. **Vial/label scan** (03/06) — vision-populate inventory + reconstitution math from a vial photo.
5. **Log suggestions** — the "I don't know what to track" path (02): given goals/compounds, suggest what to log and which metrics matter.
6. **Insights** — narrate the user's own trend ("your sleep score rose 12% over 3 weeks on this protocol") strictly from *their* data, stratified by their full stack.
7. **Conversational parse** (13) — natural-language / voice quick-log → structured 03/08 entities; multilingual (09); the cheap text path of this service.
8. **Lifestyle coaching (direct, personalized):** ✅ direct, personalized guidance on the *non-compound* levers: calorie/macro targets, training effort, cardio, recovery, sleep, hydration, micronutrients. *"Someone your size should eat ~X for maintenance; to cut, try Y,"* then a real back-and-forth about what to change. Standard wellness-app territory (Whoop/Oura/MFP), no compound dosing involved, so it is **direct and personalized**, the deliberate contrast with capability #2. Depth is governed by the adaptive coaching level (13). This is the "think for me" path for users who do not know how to train / eat / recover. The distinction from capability #2 is the one rule to hold: **coach freely on how to live around the protocol; never prescribe the protocol itself.**

## Dosing AI — the hard rules (locked: educational, non-prescriptive)
This is the highest-liability + app-store-risk feature. As of 2026-07-12 the *observational, non-individualized* slice ships (capability #2); these rules are what keep it safe, and they are now live, not hypothetical:
- Never "you should take X," and never *"for someone your size, take Y"* (no individualization). Always general + observational: *"commonly reported ranges are…"*.
- **Every fact carries `source` + `confidence`.** Internet-sourced now (cited), community-weighted later (07). No bare numbers.
- Persistent disclaimer; not medical advice; encourage professional consultation.
- Sources of truth are versioned/curated, not raw model hallucination. The model *summarizes a sourced record*, it doesn't invent doses.
- **Controlled substances (testosterone/TRT + anabolics) get NO dosing/synergy AI at all** — track-only + observational community data ("people on similar stacks reported…"). The `controlled` flag on `compound` (08) gates this in code, not just copy.

## Architecture
- All inference server-side (edge functions). Client sends structured request, gets structured response.
- **Model tiering (cost):** quick-log/conversational parse (13) runs on a **cheap small model** (Haiku-tier) — tight structured task, fractions of a cent, so free chat logging is subsidizable (12). Vision (photos/labs/vials) + deep insights run on the capable model — the expensive, paywalled paths.
- Cost control: cache catalog-level content (same for all users); only personalize the framing.
- Photo/vision calls are the expensive path — async, only on user action, behind the paywall (12).

## Decisions
- Model tiering: cheap model for quick-log parse, capable model for vision/insights.
- **Compound info (2026-07-12):** the observational, attributed, *non-individualized* slice ships (capability #2). Individualized/prescriptive dosing stays deferred pending legal input; controlled compounds (test/TRT + anabolics) stay track-only + community-observational only. Revisit the prescriptive version only with a lawyer-backed doc.
- **Lifestyle coaching (2026-07-12):** direct + personalized on the non-compound levers (calories/training/cardio/recovery/sleep). The bright line is direct-lifestyle vs never-prescribe-the-protocol.

## Active guardrails for the shipping observational info
*(These were the gate to un-deferring; capability #2 shipping makes them live requirements, not future questions.)*
- Retrieval source for seed dosing data: internet-sourced + cited now, curated/community-weighted later (07). The model *summarizes a sourced record*, it does not invent doses.
- Represent `confidence` without implying endorsement.
- Guardrail/eval suite to catch prescriptive drift (any "you/your size should…" leakage) and any dosing output on a `controlled` compound. Required before the observational info is exposed in a build.
