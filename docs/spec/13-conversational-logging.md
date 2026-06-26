# 13 — Conversational / Quick-Log

A natural-language surface to log (and later, ask) in one box. The fastest path to the "wake up and log" use case: say one sentence instead of tapping through forms.

> Reuses existing infra — no new data model. Parsing = the **05 AI layer**; output = existing **03/08 entities**; multilingual via **09**.

## Why it fits Pepi specifically
Logging here is fragmented across many shapes (dose event, symptom with onset+duration, weight, check-in field, inventory change). One NL input collapses all of them:
- *"took 1mg arimidex today"* → `dose_event` (ancillary compound) + inventory decrement
- *"felt nauseous in the morning, lasted about an hour"* → `symptom_event` {nausea, onset≈AM, duration≈1h}
- *"woke up at 82.3"* → weight on today's `log_entry`

## Scope (locked): full assistant, minus dosing suggestions
**Can do:**
- **Log** — parse free text → `dose_event`, `symptom_event`, `log_entry` fields, inventory changes (03/08).
- **Own-data insights** — answer questions about the user's *own* tracked data ("how's my sleep trending since I started?"). Strictly from their data.
- **General education** — non-dosing info about compounds (what it is, common uses, cautions).
- **Photo-in-chat** — drop a vial/lab photo into the same box → routed to the vision pipeline (05): vial→inventory, lab PDF→biomarkers.

- **Suggest opt-ins** — when an opt-in would clearly help the user's goal (e.g. photo AI, community data), proactively suggest it and surface the on-vs-off comparison screen (11). Suggest only; never auto-enable.

**Cannot (yet):**
- **Dosing/synergy suggestions are DEFERRED app-wide** until a legally sound approach exists (see 05/11). The assistant never recommends a dose or length.
- **Controlled substances (anabolic/TRT): never** any dosing guidance (05/11), full stop.

## Input modes (locked): text + voice + photo
- **Text** — type it.
- **Voice** — device dictation; the morning use case is naturally spoken.
- **Photo-in-chat** — image dropped in-line routes to the 05 vision service (vial scan / lab parse).

## Parsing pipeline
1. Input (text / transcribed voice / image) → 05 edge function.
2. **Intent + entity extraction**, multilingual (09): action (logged dose / symptom / weight / question), compound resolution (e.g. "arimidex" → anastrozole in catalog; if not on protocol, offer to add), quantity + unit, **time resolution** ("this morning", "yesterday", "an hour ago"), duration, severity.
3. Map to existing entities (03/08).
4. Save per the behavior below.

## Save behavior (locked): auto-save with undo + low-confidence confirm
- **Confident parse → auto-save**, show an undo toast. Fast by default.
- **Low-confidence / ambiguous → confirm first** (unknown compound, ambiguous dose like "1mg vs 10mg", no clear time). The guardrail fires only where health-data accuracy is at risk.
- Every chat-logged entry is editable afterward like any other.

## Cross-cutting
- **i18n (09):** parses + responds in all 6 languages — a genuine edge; users log in their own words.
- **Privacy (11):** chat text is sensitive health data — same encryption/RLS/consent as the rest.
- **Not the only way to log** — an accelerator alongside the structured UI (forms remain better for photos, charts, bulk edits).
- **AI service (05/10):** logging parse is the cheap text path; insights/education are larger calls — cache where possible.

## Decisions (locked)
- Scope: full assistant **minus dosing suggestions** (deferred until legal solution); controlled substances never.
- Save: auto-save with undo; low-confidence parses confirm first.
- Input: text + voice + photo-in-chat.
- No new data model — writes existing 03/08 entities.
