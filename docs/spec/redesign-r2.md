# Redesign R2 — mockup reconciliation + Insights tab

Reconciles the shipped app against the CyberLife mockups (June 2026 review) and
specs the new **Insights** tab. Source of truth for the R2 build pass. Decisions
here are **locked** — see the working-style rule in CLAUDE.md.

## Locked decisions (from owner review)

- **Settings entry = cog icon** (top-right on Today + Protocol headers). The
  mockups' sun glyph was wrong; it opens the Settings overlay.
- **4 tabs:** Today · Photos · **Insights** · Protocol. Custom tab bar (not the
  native OS bar).
- **Recovery → soreness field.** The design's "RECOVERY" telemetry row + Today
  metric chip **reuse the existing `soreness` storage field**, relabelled
  "Recovery", value read directly as recovery 1–5 (no inversion, no migration).
  Caveat: `fields.soreness` label becomes "Recovery" app-wide.
- **Expiry dropped entirely.** Remove the `EXPIRING` pill, `EXPIRES Nd` readout,
  and expiry date field/inputs. Stock status pills are only `LOW STOCK` / `NOMINAL`.
- **Recent doses → Today.** A "today's doses" pending/done checklist at the bottom
  of the dashboard, replacing the Recent-doses list on Protocol. Shows protocol
  items **due today** (per frequency) + reminder time; tapping a pending item logs
  the dose and marks it done.
- **Compound detail page** exists (tap a Protocol row): edit dose/freq, dose
  history, and vial management (amount remaining, low-stock threshold, vendor/batch
  — no expiry). Houses what the inline Protocol form used to hold.

## 0. Localization fix (top priority — affects every tab)

The redesign passes added ~75 keys per non-EN locale **with English values copied
in, not translated** (es 78 / fr 80 / de 75 / pt 77 / ru 68). Parity CI passed
because keys exist; values were never translated.

- Translate all English-valued keys across es/fr/de/pt/ru (machine-translate,
  flag proper nouns like "Apple Health"/"Terra" as legitimate identicals).
- **Harden `scripts/check-i18n-keys.mjs`** to also flag values identical to the
  English value (with an allowlist for true identicals) so this can't regress.

## 1. Custom tab bar

Replace `NativeTabs` (and the divergent web pill bar) with one custom component:
64px tall, `background` fill, **engraved groove on the top edge**, 4 items, icon
(20px / 1.4 stroke) + **mono 9px UPPERCASE** label, active = `accent`, inactive =
`textSecondary` @ 0.5. Order: Today · Photos · Insights · Protocol. New pulse/chart
glyph for Insights in `icons.tsx`.

## 2. Today / Dashboard

- Header `TODAY` / date / `DAY 042 · BPC-157 + SEMA` ✓; **cog** top-right (not sun).
- Hero carousel (photo compare / weight / energy) ✓.
- Metric chips: `WEIGHT · ENERGY · SLEEP · RECOVERY` (Recovery = soreness field).
- Distillation card: data-rich line `BPC-157 logged · 83.4 kg · +42g` + `ON TRACK`.
- Buttons `QUICK LOG` / `DETAILED`.
- **NEW — today's doses list** (bottom): protocol items due today, pending/done,
  with reminder time; tap a pending one → logs dose + marks done.

## 3. Photos

- Two-part header `PROGRESS` / `Photos` + groove.
- Session model: keep **Face / Body**; render the mockup's engraved sub-label
  format `FRONT POSE · 42 DAYS` (body) / `FACE · 42 DAYS`. Front/side/back poses
  = future enhancement (not rigged in mockup).
- Default view = static two-cell compare (`DAY 001` / `DAY 042`); wipe-slider stays
  as an interaction.
- `TIMELINE` strip with `Dn` day labels under each thumb; tap swaps compare in place.
- `AI ANALYSIS` card ✓. Milestone/import controls kept but tucked below the hero.
- `CAPTURE TODAY'S PHOTO` → existing camera (ghost/tilt/flip); restyle review step.

## 4. Insights (new tab)

- Header: engraved `INSIGHTS` + display title + cog + groove.
- **Summary/milestone cards** (local, always-on): "Since you started {compound}",
  "Biggest change", goal-aware delta tone.
- **Trend charts** (existing `line-chart`) with dose-start markers on the x-axis.
- **AI analysis** (existing trends/correlations/Q&A) moved here from Photos.
- **Empty state (<4 check-ins):** educational placeholder + `Log {{remaining}} more
  check-ins` progress line; charts/summary render from partial data, AI text gates
  at 4.
- Data: local-first store + existing `runInsights` edge action. No new backend.

## 5. Protocol

- Header `PROTOCOL` / `4 compounds` (count) / `2 FLAGGED · REVIEW REQUIRED`.
- Clean compound rows: name · status pill (`LOW STOCK`/`NOMINAL`) · detail
  `0.5 MG · WEEKLY · LAST: 3D AGO` · depletion bar · stock readout `N VIALS`.
  No expiry. Grooves between.
- Bottom buttons: `LOG DOSE` (solid → quick-log overlay, **quick mode only, no
  toggle**) + `+ COMPOUND` (ghost → Add compound).
- **Remove** the inline inventory add-form and Recent-doses list (move to compound
  detail + Today respectively).
- Tap a row → **compound detail page**.

## 6. Compound detail (new page)

Reached from a Protocol row. Houses: edit dose/route/frequency/started-on; this
compound's **dose history**; **vial management** (amount remaining, low-stock
threshold, vendor/batch — no expiry); remove from protocol.

## 7. Add compound

- `‹ Add compound`; search well `Search 42 compounds...`; `CATALOG` list (mono +
  chevron + grooves); select → green check.
- Configure: `{NAME} · CONFIGURE` + **big debossed dose numeral well** (`250` +
  `MCG · DAILY`). Keep unit/route/frequency inputs (compact). Recon card (green).
  `ADD TO PROTOCOL →`.

## 8. Logging overlay ("Log entry")

- Title `Log entry`; **connected segmented toggle** QUICK/DETAILED (reusable
  component, also used by Settings appearance).
- **Quick:** `QUICK LOG` labelled sunken well (placeholder `Slept 7h, energy 4,
  weight 83.2…`); `QUICK ADD` chips `Slept well · Weight check · Energy dip ·
  Post-dose note · Headache`; `PARSE + APPLY →` pinned bottom; existing
  parse→review→confirm→undo-toast flow.
- **Detailed:** big `WEIGHT` numeral well + `KG`; `SUBJECTIVE TELEMETRY` rows
  `ENERGY · SLEEP · RECOVERY · MOOD` (5-segment selectors, grooves); **explicit
  `SAVE LOG →` + undo toast** (replaces silent blur-save). Keep all existing extras
  (nutrition, bloodwork, symptoms, lab import, customize, history, day-stepper,
  autofill) below the telemetry block.

## 9. Settings

- `‹ Settings`; cards: Account · Appearance · Reminders · Data sources · Privacy;
  footer `PEPIPROGRESS · V1.0.0`.
- Appearance = **true connected 3-segment** LIGHT/DARK/AUTO.
- Reminders = label-left / mono-value-right rows.
- Cycle Settings card = **conditional** (menstruating users only).

## Build order

0. i18n translation sweep + CI hardening
1. Custom 4-tab bar + shared segmented-control primitive
2. Protocol redesign (clean list) + compound detail page + today's-doses list on Today
3. Insights tab
4. Logging restyle (quick + detailed) + Add compound restyle
5. Settings + Photos polish (segmented control, headers/grooves, distillation line)
