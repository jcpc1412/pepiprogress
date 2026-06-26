# PepiProgress — Design & Product Analysis

> Produced with the `impeccable` skill (product register, critique flow), grounded in the actual
> screen code, not just the overview. Date: 2026-06-23.
>
> **Method note.** This is a React Native (Expo) app: styling lives in `StyleSheet` objects, not
> HTML/CSS markup, so the skill's automated markup detector does not apply, and there is no live web
> page to inspect with browser overlays. Findings below come from reading the source:
> `constants/theme.ts`, `components/surface.tsx`, `components/form.tsx`, `components/themed-text.tsx`,
> and the `features/*` screens (onboarding, daily-checkin, quick-log, progress-photos, insights,
> integration-settings). No PRODUCT.md / DESIGN.md exist yet, so register and intent were inferred.

---

## TL;DR

PepiProgress has a **genuinely distinctive visual identity** ("CyberLife instrument": monochrome,
engraved, tabular numerals) that passes the AI-slop test with room to spare. The product thinking is
strong: the field-surfacing rule, conversational logging with undo, and the photo-consistency USP are
real differentiators. The gaps are not taste, they are **finish and structure**: an unfinished
migration between two type systems, text-contrast failures that will bite the older TRT cohort, an
overloaded single-scroll Home that buries the USP, and onboarding that lets users start with an empty
profile. None of these are hard to fix; together they are the difference between "promising beta" and
"feels designed."

**Design Health: ~26/40 (Solid, with clear gaps).**

---

## Design Health Score (Nielsen heuristics)

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 3 | Good async feedback (analyzing, sending); autosave and cloud sync are silent, no "saved" confirmation |
| 2 | Match system / real world | 3 | Domain language is excellent (reconstitution, cycle week, controlled). Some labels lean technical |
| 3 | User control and freedom | 3 | Quick-log undo and free backfill are standout; consent steps 0-3 have no Back |
| 4 | Consistency and standards | 2 | Two parallel type scales (legacy sans vs instrument), Back styled identical to Continue, mixed button-vs-underline affordances, one hardcoded blue link |
| 5 | Error prevention | 2 | Onboarding proceeds with zero goals and zero compounds; forms have no inline validation |
| 6 | Recognition over recall | 3 | Chips, visible catalog, last-site hint, recent doses all help |
| 7 | Flexibility and efficiency | 3 | NL + voice quick-log, auto-apply, integration auto-fill, customizable fields |
| 8 | Aesthetic and minimalist | 3 | Aesthetic is committed and clean; Home screen IA is the opposite of minimal |
| 9 | Error recovery | 2 | Failure copy is generic ("Couldn't analyze right now"); no retry affordance in place |
| 10 | Help and documentation | 2 | Good consent/disclaimer copy and a voice hint; no in-app help, glossary, or first-run coachmarks |
| **Total** | | **26/40** | **Solid, with clear gaps** |

A 4 means genuinely excellent. Most shipping apps land 20-32; 26 is a credible, honest beta score.

---

## Anti-patterns / AI-slop verdict

**Verdict: not slop.** This is the rare product UI with a point of view. The monochrome instrument
system (`theme.ts`), the carved-groove `Divider` (two stacked hairlines), engraved labels with a single
highlight shadow, tabular IBM Plex Mono numerals, and tight 2-3px radii read as a deliberate aesthetic,
not a component-library default. It avoids every shared absolute ban: no side-stripe borders, no gradient
text, no glass-by-default, no hero-metric template, no identical-card-grid. The color discipline is
notable: signal colors (`signalGood` / `signalBad`) are reserved for data semantics only, which is
exactly the product-register rule.

The one slop-adjacent leak: `linkPrimary` hardcodes `#3c87f7`, a generic SaaS blue that bypasses the
theme entirely. It is legacy and barely used, but it is the only color in the system that does not
belong.

---

## Strong points

1. **A committed design system.** `theme.ts` + `surface.tsx` give a coherent, theme-swappable
   instrument language with real primitives (`Card`, `Sunken`, `Divider`, `EngravedLabel`, `Metric`,
   `SignalText`, `StatusPill`). The two themes are a single value swap. This is more design infrastructure
   than most beta apps have.
2. **Conversational logging with a real undo.** `quick-log.tsx` auto-applies confident parses and offers
   a batch undo toast that reverses the whole message. That is a textbook "user control and freedom" win,
   and it makes the AI feel safe to trust.
3. **The field-surfacing rule is product-grade thinking.** `goals ∪ effect-tags ∪ monitoring-tags`
   driving what appears (pure, deterministic, in `field-surfacing.ts`) means the log adapts without
   personas. It is the kind of mechanic competitors fake with hardcoded templates.
4. **Inputs respect touch.** `ScaleSelector` segments are 44px minimum with `accessibilityState`, chips
   and buttons carry `accessibilityRole`. The most-touched control was clearly designed first.
5. **Honest-by-construction AI.** Every edge-function system prompt bakes in "observational only / no
   dosing / hedge / no identity." Comparability is judged and surfaced rather than hidden. This is both
   an ethical and a trust differentiator.

---

## Weak points (priority issues)

### [P1] Text-contrast failures on the muted palette
`textMuted` (`#9A9590`) on the light background (`#F0EFEC`) is roughly **2.5:1**, and `label`
(`#8E8983`) is similar. Both fail WCAG AA (4.5:1) and even AA-large (3.0:1). These tokens carry a lot of
real content: `monoSm` fine print at 10px, engraved labels, integration sync status, the insights
disclaimer. The dark theme's `textMuted` (`#4E4B47` on `#131210`) is also borderline (~3:1). For a TRT /
hormone audience that skews older, sub-AA gray-on-gray at 10px is a daily friction.
**Why it matters:** core data and status text is hard to read for a meaningful slice of the target users.
**Fix:** darken `textMuted`/`label` until body-size text clears 4.5:1 and small text clears at least 3:1;
keep them visibly quieter than `textSecondary`, just legible. Reserve the faintest tone for true ornament.

### [P1] Two type systems coexist, unfinished migration
`themed-text.tsx` ships an "instrument" scale (`display`, `metric`, `mono`, `label`) **and** a legacy sans
scale (`title` 48, `subtitle` 32, `default`, `small`). Onboarding renders in the legacy scale
(`subtitle` 32), while the check-in and photos render in the instrument scale. quick-log and insights mix
in `smallBold` / `small`. The result: the first screen a new user sees does not look like the app they
land in.
**Why it matters:** consistency is the product-register virtue; the seam is visible at the highest-stakes
moment (first run).
**Fix:** migrate onboarding, quick-log, and insights onto the instrument scale; delete the legacy types
once nothing references them. Pick one heading style for the whole app.

### [P1] The USP is buried in a single-scroll Home
The Home tab stacks quick-log, weight, telemetry scales, free-text fields, **progress photos**,
bloodwork, symptoms, insights, customize, and history into one long `ScrollView` inside `daily-checkin`.
Photos, the stated wedge of the entire product, are a mid-scroll section, and Insights sit at the very
bottom. There are only two tabs (Home, Protocol).
**Why it matters:** the thing that differentiates you is the thing a user has to scroll past to find;
the daily loop feels like one heavy form rather than a set of purposeful destinations.
**Fix (bigger):** promote Photos to a first-class tab/destination and give Insights its own home. Let the
daily check-in be a focused, completable task, not a catch-all canvas.

### [P2] Affordance inconsistency: buttons vs underlined text vs identical primaries
Primary actions are filled (`PrimaryButton`), but several first-class actions are underlined
`textSecondary` text (Insights "Trends" / "What changed" / "Ask"; integration connect/sync/disconnect).
In onboarding, the Back button uses `PrimaryButton`, so Back and Continue are visually identical filled
buttons. Disconnect uses `signalBad` text, which reads as an error rather than an action.
**Why it matters:** users cannot reliably tell what is tappable or which action is primary.
**Fix:** define a secondary/tertiary button variant; make Back clearly secondary; standardize action
affordances so "tappable" has one vocabulary.

### [P2] Weak error prevention in onboarding and forms
Onboarding advances with zero goals and zero compounds selected, which produces a near-empty surfaced
log. `LabeledInput` has only a default state (no focus ring, no error state); weight parsing silently
drops invalid input. The product-register rule is that every interactive control ships
default/focus/active/disabled/error; the form layer is missing focus and error.
**Why it matters:** users can configure themselves into an empty experience and get no feedback when input
is wrong.
**Fix:** require at least one goal (or an explicit "I'm not sure" path) before continuing; add focus and
error states to `LabeledInput`; validate weight inline.

### [P2] Generic failure copy, no retry in place
AI failures resolve to flat strings ("Couldn't analyze right now. Try again.", "error") with no inline
retry control; photo analysis fails silently as non-fatal. There is no skeleton state, only spinners.
**Why it matters:** error recovery is left to the user to figure out; silent failures erode trust in the
USP.
**Fix:** add an inline Retry affordance to AI surfaces; differentiate "not configured" from "network" from
"server"; use skeletons for content-shaped loads.

---

## Easy wins (high impact, low effort)

1. **Fix the muted-token contrast** (P1). A handful of hex values in `theme.ts`; instantly more legible.
2. **Style onboarding Back as secondary** (P2). One variant, removes the two-identical-primaries confusion.
3. **Replace the hardcoded `#3c87f7`** in `linkPrimary` with a theme token. Removes the lone off-brand color.
4. **Require one goal before continuing onboarding.** A single guard; prevents the empty-log dead end.
5. **Rename "What changed"** to something concrete ("Correlations" / "What moved together"). Clearer intent.
6. **Add a "saved" microconfirmation** to the check-in. Autosave is invisible; one quiet pulse closes the
   loop on "did it take?".
7. **Give AI errors an inline Retry button** instead of a dead sentence.

---

## Big changes (worth scoping deliberately)

1. **Re-architect Home navigation around the USP.** Photos becomes a primary destination; the daily
   check-in becomes a focused, completable task. Consider a third tab or a clear Today / Photos / Protocol
   structure. This is the single highest-leverage UX change.
2. **Finish the type-system migration and write DESIGN.md.** Collapse to one scale, document the tokens,
   and run `impeccable document` so future work stops drifting. The legacy scale is technical debt that
   shows on screen.
3. **Translate the 6 locales for real.** The newest keys (insights, lab, drive, terra) are English
   placeholders in es/fr/de/pt/ru. Six languages is a stated core promise; placeholder strings break it
   for exactly the beta users who cannot fall back to English.
4. **Define the component state matrix.** Bring every interactive control up to
   default/focus/active/disabled/loading/error, with skeletons for content loads. This is what moves the
   app from "looks designed" to "feels designed" under real use.

---

## Direction

The strategic direction is sound and, importantly, **defensible**: lead with AI photo-consistency and a
community outcomes DB, treat dose/inventory/side-effect logging as table stakes, defer dosing advice for
legal safety. The build sequence matches the thesis (USP first, community last because it needs data and
moderation). The one tension is that the **navigation does not yet express the strategy**: a product whose
wedge is photos should make photos feel central, and right now the information architecture treats every
feature as equal weight in one scroll. Aligning the IA to the strategy is the next directional move, and it
is bigger than a coat of paint but smaller than a rebuild.

---

## Usability

- **Strengths:** low-friction logging (NL + voice + auto-apply + integration auto-fill), reversible
  actions, shame-free backfill, touch-first inputs, recognition over recall throughout.
- **Frictions:** the long-scroll Home raises cognitive load and makes "am I done?" ambiguous; muted text is
  hard to read; affordances are inconsistent so discoverability suffers; first-run can produce an empty
  log. None are structural defects, all are finish.
- **Net:** the *interactions* are above the bar for the category; the *structure and legibility* are below
  it. Fixing legibility and IA would raise perceived quality more than any new feature.

---

## Ease of adherence (the daily-habit question)

This is a daily-logging product, so adherence is the whole game. What helps: quick-log makes a daily entry
fast, local reminders nudge, and the no-shame model (free backfill, no streak punishment) avoids the guilt
spiral that kills these apps. What is missing: there is almost **no positive reinforcement loop**. The
no-shame stance correctly removes punishment but does not replace it with a reason to come back: no "today
complete" payoff, no gentle progress reflection at the moment of logging, and the most rewarding artifact
(the photo timeline and insights) is buried. The encouragement AI exists but is gated behind cadence and
sits inside the photos section. **Recommendation:** put a small, earned moment of progress at the *end* of
the daily check-in (peak-end rule): a quiet "logged" confirmation plus a one-line reflection or a nudge
toward the timeline. Make the reward visible without making it a streak.

---

## Persona red flags

**Dana (TRT user, 45+, glances on the way to the gym):** 10px mono at ~2.5:1 contrast is genuinely hard to
read; the long Home scroll buries dose logging and photos behind subjective scales he may not care about
daily. Risk: logs the dose, never scrolls to the USP, churns.

**Priya (first-timer, peptide-curious):** can finish onboarding with no goals and no compounds and land in
a near-empty log with no explanation; underlined-text actions in Insights/Integrations are easy to miss;
no in-app help or glossary for terms like "reconstitution." Risk: abandons before the first photo.

**Sam (power logger, quantified-self):** will love quick-log and integrations, but wants the data back:
Insights are buried and gated, there is no trends-at-a-glance surface, and failure states dead-end. Risk:
logs diligently, feels the app does not give enough back, exports to a spreadsheet instead.

---

## Minor observations

- `linkPrimary` hardcoded blue; migrate to a token.
- `FULL_SCREEN_STEPS` is computed then discarded with `void` in onboarding; dead-ish code worth resolving.
- Onboarding progress counter ("step X of 4") only appears for profile steps; the three consent steps show
  no progress, so the real flow is 7 steps but the user only sees a counter for the last 4.
- Spinners used where skeletons would reduce layout shift (insights, photo analysis).
- `monoSm` at 10px is doing a lot of load-bearing work for fine print; combined with low contrast it is the
  least legible text in the app.
- No visible cloud-sync status; for a product that promises cross-device backup, a quiet sync indicator
  would build trust.

---

## Questions to consider

- If photos are the wedge, what would the app look like if the **photo timeline were the home screen**, and
  the check-in were a step you complete *toward* the next comparable shot?
- What is the **one rewarding moment** a user should feel every time they log, and where does it live today?
- Does the daily check-in need to show *everything* every day, or should it show today's essentials and let
  the rest be opt-in?
- Could "I'm not sure" be a first-class onboarding path (it is specced in area 02) so no one starts empty?
- What is the smallest change that makes the six non-English locales real before beta, given that those
  users cannot read the English placeholders?

---

*No code was changed to produce this document. Suggested follow-ups, if you want them later, map cleanly to
impeccable commands: `colorize`/`harden` for contrast and states, `typeset` for the type-system merge,
`layout` for the Home IA, `clarify` for error and action copy, `onboard` for first-run, and `document` to
capture the design system in DESIGN.md.*
