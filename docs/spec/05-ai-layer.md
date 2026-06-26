# 05 — AI Layer

Model: **Claude** (vision + text) server-side via edge functions (10). Keys never touch the client.

## Capabilities
1. **Photo analysis** (see 04) — drift scoring, visual-change estimation, normalization.
2. **Educational dosing / synergy cards** — ⚠️ **DEFERRED app-wide** (post-MVP) until a legally sound approach exists. Surfacing "commonly reported ranges" is itself a dosing suggestion; deferring per product-owner caution. When built: *non-prescriptive*, sourced, non-controlled compounds only (peptide / GLP-1 / supplement); controlled compounds (testosterone/TRT + anabolics) never. Until then, only **observational community data** ("what people logged," not a recommendation) and **general non-dosing education** ship.
3. **Lab/report parsing** (06) — vision-parse a photographed bloodwork PDF (or DEXA/InBody) into structured biomarkers; user confirms before save.
4. **Vial/label scan** (03/06) — vision-populate inventory + reconstitution math from a vial photo.
5. **Log suggestions** — the "I don't know what to track" path (02): given goals/compounds, suggest what to log and which metrics matter.
6. **Insights** — narrate the user's own trend ("your sleep score rose 12% over 3 weeks on this protocol") strictly from *their* data, stratified by their full stack.
7. **Conversational parse** (13) — natural-language / voice quick-log → structured 03/08 entities; multilingual (09); the cheap text path of this service.

## Dosing AI — the hard rules (locked: educational, non-prescriptive)
This is the highest-liability + app-store-risk feature. Design rules, not just copy:
- Never "you should take X." Always observational: *"commonly reported ranges are…"*.
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
- Dosing/synergy cards deferred app-wide (above) until a legal solution.

## To resolve when the deferred dosing feature is designed
*(Not parked indefinitely — these are the questions that gate un-deferring dosing cards; revisit only when we take that on with legal input.)*
- Retrieval source for seed dosing data (curated dataset vs. live web + citation).
- How to represent `confidence` without implying endorsement.
- Guardrail/eval suite to catch prescriptive drift before release.
