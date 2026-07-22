# PepiProgress (Pepi): Product context

> The design-architecture companion to [DESIGN.md](DESIGN.md) (design language),
> [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (reusable inventory / census), and
> [docs/VOICE.md](docs/VOICE.md) (voice & tone). This file holds the strategic
> "who / why / what-not" so future work stops re-inferring it. When copy is at
> stake, VOICE.md wins; when tokens are at stake, DESIGN.md wins.

register: product

## Product purpose

A daily peptide-tracking journal that turns subjective check-ins plus consistent
progress photos into a personal timeline, and aggregates anonymized data into a
community knowledge base. Omniplatform (iOS / Android / web), lightweight, six
languages. The photo pipeline (consistent capture + hedged AI comparison over
time) is the USP.

The product is an instrument, not a coach. It reflects the user's readings back
plainly, tells the truth when data is thin, and never tells them what to do with
their body. Design serves that job; the design is not the product.

## Users

- **Self-experimenters running peptide / compound protocols** who already track
  in spreadsheets or notes apps and want something purpose-built, private, and
  honest. Range from meticulous (labs, reconstitution math, injection-site
  rotation) to casual (log a weight, snap a photo).
- **Privacy-sensitive by default.** Photos are the most sensitive asset; users
  must trust they are stored (not discarded), hardened, and never used to train
  models. Public sharing is deliberately post-MVP.
- **Global from day one.** Six locales (en / es / fr / de / pt / ru); no locale
  is a second-class citizen.
- Local-first: the app must be fully usable offline with no account. An account
  adds cloud backup, cross-device, and community contribution, never gates input.

## Register: product

The design serves the task. Success is the user logging their day in seconds,
reading a clear verdict, and trusting the photo comparison. Restraint is the
default; the "instrument" aesthetic is a means to legibility and trust, not
decoration. When a screen and the aesthetic conflict, legibility wins.

## Voice & tone

Full detail in [docs/VOICE.md](docs/VOICE.md). In one breath: **a precise lab
instrument that's on your side.** Precise over promotional, honest over
flattering, terse over chatty, observational never prescriptive, calm not loud.
Lead with the number or fact. Hedge every AI observation (*appears, may,
slightly, trends toward*). No exclamation marks, no emoji, no hype, no shame.

*Engraved dial, not a cheerleader.*

## Strategic principles (locked; see docs/spec/SPEC.md)

1. **No hardcoded English, ever.** Every user-visible string goes through `t()`
   and ships in all six locales in the same commit. Lint + key-parity CI enforce
   it. This has the same weight as a correctness bug.
2. **Photos: private by default, stored (not discarded), hardened bucket, never
   used to train models.** Public sharing is post-MVP.
3. **Dosing is observational only, never individualized, never for controlled
   compounds.** Pepi may surface general, attributed compound info ("commonly
   reported ranges are A to B") but never personalizes a dose. Lifestyle coaching
   (calories / training / sleep) is direct and personal; OTC items are
   direct-but-hedged with a "check with your doctor or pharmacist" pointer. The
   bright line: coach around the protocol, never prescribe the protocol.
4. **What surfaces in the log = goals ∪ compound effect-tags ∪ monitoring-tags.**
   No personas.
5. **Never gate data input** (logging / integrations / contribution). Gate
   output and scale instead.

## Anti-references (what Pepi is deliberately not)

- **Not a hype fitness coach.** No "crush it", "let's go", flame emoji, streak
  guilt, or manufactured enthusiasm. No gamified shame mechanics.
- **Not a chatty AI assistant.** Pepi answers in short readbacks, not paragraphs
  of personality. It is a readout, not a conversation partner.
- **Not a medical / diagnostic app.** It never diagnoses, never prescribes, never
  claims a cause. Every AI observation is hedged and observational.
- **Not a generic SaaS dashboard.** Avoid the hero-metric template (big gradient
  number + supporting stats), identical card grids, and side-stripe accent
  borders. The instrument treatment (engraved labels, chamfered surfaces,
  tabular numerals, two co-equal monochrome themes) is the identity.
- **Not a social / sharing product (yet).** No feeds, no public profiles, no
  follower counts in the MVP.

## Design system pointers

- **Language & tokens:** [DESIGN.md](DESIGN.md) and `src/constants/theme.ts`.
  The "CyberLife instrument" treatment: two co-equal monochrome themes (luminous daylight +
  at-night) sharing one engraved/debossed treatment, tabular-numeral type scale,
  chamfer / hairline / Radii / Fonts tokens. Never `#000` / `#fff`; neutrals are
  tinted toward the ink hue. IBM Plex Mono (numerals / labels) + Inter (display /
  body).
- **Reusable inventory + standing gate:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
  §9. Reuse an existing component / pure lib / hook before adding one; any new
  reusable thing (including a motion or haptic pattern) adds its one-line census
  entry in the same commit.
- **Format rules that bite:** no em dashes anywhere (i18n lint bans them); units
  always attached to numbers; sentence case for body copy.
