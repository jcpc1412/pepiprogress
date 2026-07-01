# Voice & Tone — "The Instrument"

How PepiProgress talks. Apply this to every user-facing string (all go through `t()`, all
six locales). When you add copy, match this doc instead of inventing a new register.

## The persona
Pepi speaks like a **precise lab instrument that's on your side** — the readout on a good
scale or a spectrometer, not a hype coach and not a chatty assistant. It reflects your
readings back plainly, tells the truth when data is thin, and never tells you what to do
with your body. Calm, exact, quietly confident.

Think: *engraved dial, not a cheerleader.*

## Principles
1. **Precise over promotional.** Report the reading, not a pep talk. Lead with the number or fact.
2. **Honest over flattering.** If the data is sparse or a photo isn't comparable, say so. No manufactured enthusiasm.
3. **Terse over chatty.** Short lines. Active voice. Second person ("you"). Cut filler.
4. **Observational, never prescriptive.** Describe what's logged or visible. Never suggest a dose, schedule, or medical action (locked rule, spec 05/11). Hedge every AI observation: *appears, may, slightly, trends toward.*
5. **Calm, not loud.** No exclamation marks, no emoji, no hype. (The UI's UPPERCASE engraved labels are a *visual* device — they are not the tone of prose.)
6. **The user owns the data.** We surface and compare it; we don't judge it. No shame mechanics (spec 03).

## Lexicon
| Prefer | Avoid |
|---|---|
| log, distill, reading, entry, baseline, comparable, trend, protocol, compound, on track | crush it, journey, magic, guaranteed, cure, "boost" (as a claim), amazing, let's go, 🔥 |
| "appears / may / slightly" (for AI) | definitive health claims ("this fixed your…") |
| "Couldn't reach the service." | "Oops! Something went wrong 😢" |

## Microcopy patterns
- **Quick-log confirmation (the AI `reply`):** one short line that reflects the readings back.
  *"Logged: sleep 7h, energy 4/5, weight 83.2 kg."* · *"Recorded 3 entries for today."*
- **Empty state:** *"No readings yet. Your first log starts the timeline."*
- **In-progress:** *"Distilling…"* (ellipsis, present tense).
- **Error:** *"Couldn't reach the service. We'll retry automatically."* (state fact + what happens next).
- **AI photo observation (hedged, observational):** *"Waistline appears slightly reduced vs. baseline. Lighting is comparable."*
- **Encouragement (supportive, never hype):** *"Six days logged this week. The trend is holding."*

## Format rules
- **No em dashes (`—`)** — the i18n lint bans them. Use a period or colon.
- Sentence case for body copy; units always attached to numbers (`83.2 kg`, `4/5`).
- One idea per line. Prefer two short sentences to one long one.
- Ellipsis `…` (single glyph) for ongoing states.

## Localization
Keep the same terse, precise register in every locale — don't let a translation get chattier or
add exclamation. The "distill" metaphor may adapt to the nearest natural cognate per language.
Machine-translate, then flag anything needing human review; never ship an English value in a
non-English catalog (see [09-i18n](spec/09-i18n.md)).
