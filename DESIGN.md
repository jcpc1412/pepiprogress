---
name: PepiProgress
description: A daily peptide-tracking journal rendered as a precision measuring instrument.
colors:
  ink: "#1A1918"
  background: "#F0EFEC"
  surface-raised: "#E6E4E0"
  surface-sunken: "#DDDCD8"
  text-secondary: "#6E6B67"
  text-muted: "#817D78"
  label: "#88847F"
  numeral: "#3A3834"
  accent: "#2A2825"
  on-accent: "#F0EFEC"
  border-shadow: "#0000001A"
  border-highlight: "#FFFFFFB3"
  signal-good: "#2B6947"
  signal-bad: "#7A2E2E"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "27px"
    fontWeight: 300
    lineHeight: "30px"
    letterSpacing: "-0.3px"
  metric:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "42px"
    fontWeight: 400
    lineHeight: "42px"
  metric-sm:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "22px"
    fontWeight: 500
    lineHeight: "24px"
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "10px"
    fontWeight: 500
    letterSpacing: "1.3px"
  mono:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    letterSpacing: "0.4px"
  mono-sm:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "10px"
    fontWeight: 400
    letterSpacing: "0.6px"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  body-strong:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "20px"
rounded:
  chamfer: "2px"
  panel: "3px"
  pill: "2px"
spacing:
  half: "2px"
  one: "4px"
  two: "8px"
  three: "16px"
  four: "24px"
  five: "32px"
  six: "64px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.chamfer}"
    padding: "16px 24px"
    height: "50px"
  button-secondary:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.chamfer}"
    padding: "16px 24px"
    height: "50px"
  input:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.chamfer}"
    padding: "8px 16px"
    height: "44px"
  chip-selected:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.mono}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
  chip-idle:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.surface-raised}"
    rounded: "{rounded.panel}"
    padding: "16px"
  status-pill:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.text-muted}"
    typography: "{typography.mono-sm}"
    rounded: "{rounded.chamfer}"
    padding: "2px 8px"
---

# Design System: PepiProgress

## 1. Overview

**Creative North Star: "The CyberLife Instrument"**

PepiProgress is dressed as a precision measuring device, not an app. The surface is a single sheet of
machined material into which controls are engraved and debossed: labels are etched, dividers are incised
grooves, numerals are read off the panel like a gauge. The whole system is monochrome on purpose, so the
only color a user ever sees carries data meaning. It is calm, dense, and exact, the way a good scientific
instrument is, and it never editorializes the numbers it shows.

The system is value-swappable: two co-equal themes, a luminous "daylight" and a low "at night", are the
same structure with inverted material tones. A theme switch is one token lookup, never a redesign. Density
is high but quiet: small mono type, hairline grooves, tight corners. The instrument should disappear into
the reading.

This system explicitly rejects the consumer-health-app look: no rounded pastel cards, no gradient hero
metrics, no glassmorphism, no emoji-driven encouragement, no neon-on-dark "tech" cliche. Warmth comes from
material and restraint, not from color or decoration.

**Key Characteristics:**
- Monochrome material surface; color is reserved for data signal only.
- Engraved and debossed, never floated: depth is carved, not shadowed.
- Tabular IBM Plex Mono numerals for all data; Inter for prose.
- Tight geometry: 2-3px corners, hairline borders, square not rounded.
- Two themes, one structure, value-swappable.

## 2. Colors

A tinted-neutral monochrome palette with two reserved data-signal colors. Every neutral is warmed toward
the brand hue, never pure `#000` or `#fff`. Values below are the daylight theme; the at-night theme inverts
the material tones against a near-black `#131210` ground.

### Primary
- **Instrument Ink** (`#2A2825`): the single solid control color. Filled primary buttons, selected chips,
  filled scale segments. Near-black in daylight, near-white at night. Its darkness is the emphasis; there
  is no second accent.

### Neutral
- **Panel Ground** (`#F0EFEC`): the base surface the whole instrument sits on.
- **Raised Material** (`#E6E4E0`): cards and raised panels, a step up from ground.
- **Sunken Material** (`#DDDCD8`): inset wells, inputs, the quick-log box, status pills.
- **Primary Ink** (`#1A1918`): body and heading text.
- **Numeral Ink** (`#3A3834`): the large tabular metrics; slightly softer than primary ink.
- **Secondary Ink** (`#6E6B67`): supporting text and mono data rows (~4.4:1 on ground).
- **Muted Ink** (`#817D78`): fine print and low-priority data (~3.4:1 on ground).
- **Label Ink** (`#88847F`): engraved panel signage, the faintest legible tier (~3.1:1).
- **Carved Groove** (`#0000001A` shadow over `#FFFFFFB3` highlight): the two-line incised divider.

### Signal (reserved)
- **Signal Good** (`#2B6947`): a positive data reading only (a goal-aligned delta, a NOMINAL status).
- **Signal Bad** (`#7A2E2E`): a negative data reading only (a goal-counter delta, LOW STOCK, EXPIRED).

### Named Rules
**The Signal-Only Color Rule.** Green and red appear ONLY on data semantics: deltas, status pills,
comparability. They are forbidden as decoration, as button color, or as emphasis on inactive state. If a
color is not reporting a measurement, it is wrong.

**The Goal-Resolved Sign Rule.** A delta's good/bad tone is decided against the user's goal, never the
arithmetic sign. A weight drop is good for a cut, bad for a bulk. Callers pass the resolved tone; the
component never colors a raw sign.

**The Tinted-Neutral Rule.** Never `#000` or `#fff`. Every neutral carries a faint warm tint toward the
brand hue. Pure black or white reads as a different material and breaks the instrument.

## 3. Typography

**Display / Body Font:** Inter (with system-ui, sans-serif fallback)
**Numeral / Label / Data Font:** IBM Plex Mono (with ui-monospace, monospace fallback)

**Character:** Inter carries prose and the one screen heading; IBM Plex Mono carries everything that reads
like an instrument, that is all numerals, all panel labels, and all data rows. The mono is doing the
"machined readout" work; Inter keeps human sentences human.

### Hierarchy
- **Display** (Inter Light 300, 27px, 30px line, -0.3 tracking): the one screen or step heading. Used for
  the date readout, onboarding step prompts, screen titles. There is no larger heading.
- **Metric** (IBM Plex Mono 400, 42px): the single big tabular number per card, read like a gauge.
- **Metric Small** (IBM Plex Mono Medium 500, 22px): secondary numerals, deltas, stats.
- **Label** (IBM Plex Mono Medium 500, 10px, 1.3 tracking, UPPERCASE): engraved panel signage, the
  section header pattern (see EngravedLabel). Also the letter-spaced button text.
- **Mono** (IBM Plex Mono 400, 12px, 0.4 tracking): data rows, compound names, log values.
- **Mono Small** (IBM Plex Mono 400, 10px, 0.6 tracking): fine print, hints, units, comparability notes.
- **Body** (Inter 400, 14px, 20px line): prose, descriptions, supporting copy. Cap prose at 65-75ch.
- **Body Strong** (Inter SemiBold 600, 14px): emphasis within prose, item names, inline actions.

### Named Rules
**The One Heading Rule.** `display` is the only heading style in the app. There is no `title`/`subtitle`
ladder. A screen has one display heading; everything below it is a section EngravedLabel. (The legacy
32px/48px sans headings were removed in the type-system migration.)

**The Numerals-Are-Mono Rule.** Every number a user reads as data is IBM Plex Mono and tabular. Numbers
never appear in Inter. This is what makes the surface read as an instrument.

## 4. Elevation

This system uses **no drop shadows**. Depth is conveyed two ways: tonal layering (raised material is
lighter than ground, sunken material is darker) and a carved hairline groove that reads as an incised
line in both themes. Engraved labels carry a single 1px highlight text-shadow on the lit edge, the only
"shadow" in the system, and it is used to fake an etched-in feel, not to lift anything off the surface.

### Carved Groove (the divider)
- **Incised hairline** (a `border-shadow` hairline stacked over a `border-highlight` hairline): the
  shadow line over the highlight line reads as a groove cut into the panel. This is the only divider.

### Named Rules
**The Carved-Not-Floated Rule.** Nothing floats. Surfaces are distinguished by tonal step (raised vs
sunken) and by incised grooves, never by drop shadow or blur. If an element looks like it is hovering
above the panel, it is wrong.

**The One-Highlight Rule.** React Native text supports a single shadow; engraving spends it on one lit-edge
highlight. Do not stack text shadows or attempt a bevel.

## 5. Components

### Buttons
- **Shape:** square-ish, 2px corner (chamfer), 50px tall, letter-spaced (1.6) uppercase label.
- **Primary:** filled Instrument Ink (`#2A2825`) with on-accent text. The one main action on a surface.
- **Secondary:** Sunken Material (`#DDDCD8`) with a hairline border and ink text. Supporting actions:
  Back, Cancel, alternate paths.
- **Tertiary:** an underlined text link (Pressable + ThemedText), for inline or low-emphasis actions.
- **Press:** the whole control settles to 0.97 scale on press (the instrument "giving" under a finger).
- **Disabled:** 0.4 opacity.

### Chips
- **Idle:** Sunken Material background, ink text, hairline border, 2px corner.
- **Selected:** filled Instrument Ink, on-accent text. Carries `accessibilityState.selected`.
- **Use:** single-select (units, route, frequency) and multi-select (goals, compounds).

### Cards / Containers
- **Corner:** 3px (panel).
- **Background:** Raised Material (`#E6E4E0`); use Sunken (`#DDDCD8`) for inset wells (quick-log, notes).
- **Shadow:** none (see Elevation). Distinguished by tonal step and a hairline border.
- **Padding:** 16px (spacing.three). Never nest cards.

### Inputs / Fields
- **Style:** Sunken Material background, hairline border, 2px corner, 44px min height, Inter 14px.
- **Label:** an engraved Label above the field.
- **Focus / Error:** focus ring and error state are being standardized in the component state matrix pass
  (see DESIGN-FIX-PLAN Phase C). Target: focus shifts the border to ink; error shifts it to Signal Bad
  with a mono-small message below.

### Navigation
- **Pattern:** bottom tab bar. Today / Photos / Protocol (3 tabs). Labels always shown, never icon-only.
- **States:** active tab uses primary ink, inactive uses secondary ink.

### Signature Components
- **EngravedLabel:** the uppercase mono Label with a single lit-edge highlight shadow. The universal
  section-header pattern; it replaces bold sans subheadings everywhere.
- **Metric:** one large tabular numeral with an optional trailing mono-small unit. One per card.
- **SignalText:** a numeral or delta colored by resolved good/bad/neutral tone (never raw sign).
- **StatusPill:** a small chamfered chip (LOW STOCK / NOMINAL / EXPIRING), tinted only when it carries a
  signal.
- **ScaleSelector:** the 1-5 rating row, the most-touched control: each segment is a >=44px tap target
  that fills with Instrument Ink up to the chosen value.

## 6. Do's and Don'ts

### Do:
- **Do** keep the surface monochrome. Reach for Signal Good / Signal Bad ONLY when the element is reporting
  a measurement.
- **Do** set every number a user reads as data in IBM Plex Mono, tabular.
- **Do** use one `display` heading per screen and `EngravedLabel` for every section header below it.
- **Do** convey depth with tonal layering (raised vs sunken) and the carved groove divider.
- **Do** keep muted/label text above its contrast floor (body >= 4.5:1, 10px >= 3:1). Faint is fine,
  illegible is not.
- **Do** give every interactive control its full state set (default / focus / active / disabled / loading
  / error) and an `accessibilityRole` / `accessibilityState`.
- **Do** tint every neutral toward the warm brand hue.

### Don't:
- **Don't** use drop shadows or glassmorphism to lift elements. Nothing floats (the Carved-Not-Floated Rule).
- **Don't** color a delta by its arithmetic sign; color it by the user's goal (the Goal-Resolved Sign Rule).
- **Don't** use green or red as decoration, button color, or emphasis on an inactive state.
- **Don't** reintroduce a `title`/`subtitle` heading ladder; there is one heading style (the One Heading Rule).
- **Don't** set data numerals in Inter, or set prose in mono.
- **Don't** use `#000` or `#fff`, gradient text, or `background-clip: text`.
- **Don't** ship the consumer-health-app look: rounded pastel cards, gradient hero metrics, emoji
  encouragement, neon-on-dark.
- **Don't** nest cards, and don't round corners past ~3px; the instrument is square.
