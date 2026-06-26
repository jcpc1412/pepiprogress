# 02 — Onboarding & Goals

## Principles
1. **Goals drive everything the user sees.** Onboarding learns goals + compounds, then configures the daily log so the user is only ever asked for things that matter to *them*.
2. **Time-to-first-value over completeness.** Get the user to a first meaningful log fast; defer everything that isn't required for that. A new user should feel the product before being asked to connect scales or enter a full stack.

## The shape of onboarding
Split into **Core** (required to get value) and **Deferred** (offered after first value, or in Settings later).

### Core (first run, kept short)
1. **Language + units** — auto-detected, overridable (09).
2. **Goal multi-select** — weight loss, skin/appearance, recovery, sleep, body composition, wellness. Multiple allowed.
3. **Compounds / protocol** — what they're taking (compound model, 08): peptides, GLP-1, testosterone/TRT, ancillaries, supplements (other anabolics loggable but not curated — 08). Dose, ester, route, frequency. (Asked up front because the log is only meaningful once we know the stack — its effect-tags shape what to log.)
4. **A first log right away** — drop them into the configured check-in (03) so they feel value immediately.

### Deferred (prompted after first value, skippable, resumable)
5. **Connect integrations** (06) — offer Health / scale / fitness / nutrition links to auto-fill the log. Framed as "log less, by connecting what you already use."
6. **Photo baseline** — first face/body capture to anchor the consistency engine (04).
7. **Reminder time** for the daily check-in.

> Rationale: goals + compounds is the minimum for a *meaningful* first log; integrations/photos/reminders are earned after first value. Requiring device connections up front is the classic activation killer.

## Goal → log-field mapping (the core table)
Data, not hardcoded — editable without a release. Drives which canonical metrics (06) surface.

| Goal | Prompts added to the check-in | Auto-fill source (06) |
|------|------------------------------|------------------------|
| Weight loss | weight, appetite/satiety | smart scale, Health |
| Skin / appearance | face photo, skin notes | — |
| Body composition | body photo, weight, measurements | scale, DEXA/InBody parse |
| Sleep | perceived sleep quality | Health, wearable |
| Recovery | soreness, energy, workout effort | wearable, lifting app |
| Wellness | mood/wellness, energy | wearable |

- **Symptom events** (03) and **free note** are always available, every goal.
- **Bloodwork** (06) surfaces for anyone on TRT/anabolics or who opts into lab tracking — independent of goal.
- **Cycle** (06) surfaces for users who have cycle data / select it.

### What actually surfaces = goals ∪ compound tags
The mapping above is the *goal* contribution. The full set of fields/metrics surfaced is:

> **goals (explicit) ∪ compound effect-tags ∪ compound monitoring-tags**

Each compound in the catalog (08) carries:
- **effect tags** — what it's expected to influence: `fat_loss`, `muscle`, `recovery`, `healing`, `skin`, `sleep`, `cognition`, `libido`, `glucose`, `hormonal`…
- **monitoring tags** — what to watch: e.g. testosterone → `hematocrit`, `estradiol`, `lipids`; GLP-1 → `appetite`, `nausea`.

So a user on testosterone + BPC-157 automatically gets strength/libido/mood + recovery fields *and* prompts for the relevant bloodwork — without ever declaring a goal for it. This is deterministic, data-driven, and directly serves the thesis: log the outcomes a compound should move + the safety markers it requires.

## The "I don't know what to track" path
For users who don't know which goals fit:
- They instead enter **which compounds they're on** (or pick from common stacks).
- A **suggestion engine** maps compounds → suggested goals + what to log + which metrics matter. *Rules-first* (a curated compound→logging table we control), with **AI filling gaps** for compounds/combos not in the table (05). Always framed as suggestions the user confirms.
- If they know neither goals nor compounds: offer a **minimal default** — track weight + a daily photo + wellness — so they still start.

## No personas — compound effect-tags instead (locked)
We do **not** model meathead/biohacker as a persona/tribe — many users straddle both. Prioritization of which fields/integrations surface first is driven by the **compound effect + monitoring tags** (above), unioned with goals. A stack spanning training and optimization simply carries tags across both; nothing to pick. "Meathead/biohacker" remains informal marketing language only, never a system concept.

## Account / auth timing (locked)
**Try first, sign up to save.** Onboarding + first log run **local-first** (10); account creation is prompted to persist/sync. Best activation; requires local→account migration logic (flagged for 10). Anonymous local state must survive until sign-up.

## Customization (locked)
**Goal-driven defaults + advanced override.** Goals (and compound tags) set the default fields; a power-user "customize what I log" option in settings lets users add/remove fields. Important for the core power-user audience — they must not feel boxed in.
