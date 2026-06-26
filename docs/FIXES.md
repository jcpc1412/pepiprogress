# PepiProgress — Locked Fix Specs

Specs that have been driven to a decision and are ready to implement. Source issues live in [ISSUES.md](ISSUES.md).

---

## D-01 — Contrast pass + Light/Dark/Auto toggle

**Decision:** Keep the "CyberLife instrument" engraved aesthetic. Fix readability by (a) widening surface value gaps so cards separate from the background, (b) raising every text tier to WCAG AA, and (c) adding a user-facing Light / Dark / Auto override on top of the existing system-driven selection.

### Root cause
The two themes already exist and already follow the device via `useColorScheme()`. The problem is the palette is grey-on-grey: in the light theme `background #F0EFEC` / `surfaceRaised #E6E4E0` / `surfaceSunken #DDDCD8` sit within ~5% lightness of each other, and raised cards are *darker* than the background (debossed), so on a real display the hairline-engraved edges wash out and the screen reads as one flat field. Muted text tiers were intentionally tuned to ~3:1 ("ornament, not data"), which is sub-readable for real content.

### Part 1 — Token changes (`src/constants/theme.ts`)

Emboss logic: **raised surfaces lighter than background, sunken surfaces darker**, with a minimum ~6–8% lightness gap so cards lift without needing the hairline to carry separation. Hairline borders/highlights stay as ornament on top.

Proposed values (AA-targeted; fine-tune during implementation against a real device):

**Light ("daylight")**
| token | current | new | notes |
|---|---|---|---|
| background | `#F0EFEC` | `#EDEBE7` | base, slightly deeper so raised can be lighter |
| surfaceRaised | `#E6E4E0` | `#FBFAF8` | cards now lift above bg |
| surfaceSunken | `#DDDCD8` | `#DBD9D4` | wells recede below bg |
| text | `#1A1918` | `#1A1918` | keep (~14:1) |
| textSecondary | `#6E6B67` | `#5A5752` | → ~5.7:1 |
| textMuted | `#817D78` | `#66625D` | → ~4.7:1 (AA) |
| label | `#88847F` | `#6E6A65` | → ~4:1 (large/label) |
| border | `rgba(0,0,0,0.10)` | `rgba(0,0,0,0.14)` | deepen groove shadow |
| borderHighlight | `rgba(255,255,255,0.70)` | `rgba(255,255,255,0.85)` | keep lit edge crisp |

**Dark ("at night")**
| token | current | new | notes |
|---|---|---|---|
| background | `#131210` | `#121110` | near-black base |
| surfaceRaised | `#1D1C1A` | `#232220` | cards lift above bg |
| surfaceSunken | `#0F0E0D` | `#0C0B0A` | wells recede |
| text | `#D4D1CB` | `#E4E1DB` | more pop |
| textSecondary | `#7A7671` | `#9C9892` | → ~6.4:1 |
| textMuted | `#6A6661` | `#837F79` | → ~4.8:1 (AA) |
| label | `#65615C` | `#787470` | → ~4:1 |
| border | `rgba(255,255,255,0.07)` | `rgba(255,255,255,0.10)` | stronger groove |

Signal colors (good/bad deltas) unchanged — already legible and semantic.

### Part 2 — Light / Dark / Auto override

- Add `themePreference: 'light' | 'dark' | 'auto'` to the persisted profile/settings in the store, default `'auto'`.
- New `ThemeProvider` context that resolves `themePreference` + `useColorScheme()` → active theme name. `'auto'` → follow system; `'light'`/`'dark'` → forced.
- `useTheme()` reads the resolved theme from the provider instead of calling `useColorScheme()` directly.
- Toggle UI: a 3-segment control (Light / Dark / Auto) in the new **Settings** page (depends on P-01; until Settings exists, can land temporarily in Protocol settings).

### Verification
- Manual: on a real device, flip system light/dark → app follows on Auto; set forced Light/Dark → app ignores system. Confirm cards visibly separate from background in both themes and in bright light.
- Contrast: spot-check secondary/muted/label tiers hit ≥4.5:1 (body) / ≥3:1 (large) with a contrast checker.
- Green gate: typecheck / lint / i18n parity / web export.

### Dependencies
- Toggle UI placement depends on **P-01** (Settings page). Tokens and provider can land independently first.

---

## P-01 — Extract Settings into its own screen

**Decision:** Slim the Protocol tab down to actual protocol data. Move all app-wide settings into a dedicated **Settings screen**, reached via a **gear icon** in the top-right header (pushed over the tabs, with a back affordance) — not a tab. Keeps the tab bar free for daily-use destinations (a Logging tab is coming in H-03).

### Navigation
- New route `src/app/settings.tsx` rendering `<SettingsScreen/>`. As a non-tab route it presents as a push over the native tabs (and renders via `TabSlot` on web). Provide a back/close affordance in its header.
- Gear icon (SF Symbol `gearshape` on iOS / Material `settings` on Android; match the app's existing icon approach) in the top-right header of **Today** (primary) and **Protocol** (where these settings used to live, easing the transition). `onPress` → `router.push('/settings')`.

### Settings screen contents (ordered)
Each is an existing component, moved verbatim unless noted:
1. **Account** — `AccountSection` (sign in / up / out). Promoted to its own top-level row; currently buried inside `PrivacySettings`.
2. **Appearance** — Light / Dark / Auto toggle (from **D-01**). New.
3. **Language** — app locale override (proposed addition; today locale is device-detected only). Optional — cut if undesired.
4. **Reminders** — `NotificationSettings`.
5. **Data sources** — `IntegrationSettings`.
6. **Body & cycle** — `CycleSettings` (body type calibration + menstrual cycle).
7. **Privacy & data** — `PrivacySettings` with `AccountSection` extracted out to row 1. Still contains data export, account delete, consent toggles, "stored not trained on" messaging, and `DriveSettings` (Drive backup).

### Removed from `protocol-screen.tsx`
Delete the imports + render of `IntegrationSettings`, `NotificationSettings`, `CycleSettings`, `PrivacySettings`. Protocol keeps: attention banner, protocol items + add form, inventory + add form, recent doses, reconstitution calculator.

### Explicitly deferred
- **Lab-results import** (`LabImport`) stays in Protocol for now. Its real home is the Logging page per **H-06**; relocating it there (not to Settings) avoids moving it twice.
- **P-02** (inventory summary at top) and **P-03** (add-compound flow + auto-reconstitution) further rework what stays in Protocol — separate specs.

### Verification
- Gear icon on Today + Protocol opens Settings; back returns. All seven sections render and function (toggle theme, connect integration, set reminders, export data, sign in/out).
- Protocol screen no longer shows settings sections; protocol/inventory/doses/recon intact.
- Green gate: typecheck / lint / i18n parity / web export. New i18n keys: `settings.title`, `settings.account`, `settings.appearance`, `settings.language`, section headers as needed (6 locales).

### Dependencies
- **D-01** supplies the Appearance toggle (`themePreference` + `ThemeProvider`). If D-01 lands first, the toggle slots straight in; otherwise stub the row.

---

## P-02 — Inventory summary at top of Protocol

**Decision:** A compact, read-only **stock summary** at the very top of the Protocol screen, above the protocol items. Hidden entirely when no inventory is logged (no empty state). It absorbs the current standalone "needs attention" banner — status lives in the summary instead of a separate strip.

### Layout
- New `InventorySummary` component, rendered at the top of `protocol-screen.tsx` (replacing the attention banner).
- One row per inventory item:
  - **Name** — compound name (vial) or label (consumable).
  - **Remaining** — `amountRemaining` + unit (e.g. `12.4 mg`, `38 ct`).
  - **Depletion bar** — thin horizontal fill = `amountRemaining / amountInitial`, in the engraved/instrument style. Omitted (text only) when `amountInitial` is unknown.
  - **Status pill** — OK / Low / Expiring / Expired, reusing `inventoryAttention` logic + `StatusPill` from `surface.tsx`. Low/Expired styled with `signalBad`.
- Read-only at a glance; item management (edit/remove/add) stays in the existing Inventory section lower on the screen.

### Model change
- Add `amountInitial?: number` to `InventoryItem` (store). Set `= amountRemaining` when an item is created, and reset on an explicit "refill." Powers the depletion bar; everything degrades gracefully (text-only row) when absent, so this is backward-compatible with already-stored items.

### Verification
- With inventory: summary shows at top, bars reflect remaining vs initial, status pills correct (force a low/expired item). Logging a linked dose decrements the vial and shrinks its bar.
- With no inventory: summary entirely absent; old attention banner gone.
- Green gate. New i18n keys: `inventory.summaryTitle`, status pill labels if not already present (6 locales).

### Notes
- Considered a literal chart; a per-item depletion **bar+pill table** is more legible than a chart across mixed units (mg vs count). Kept the instrument aesthetic.

---

## P-03 — "Add compound" screen with auto-reconstitution

**Decision:** Replace the inline `AddProtocolForm` with a prominent **"Add compound"** button that opens a dedicated, pushed screen. The screen asks compound, dose, unit, route, frequency, start date. For reconstituted injectables it **auto-suggests the BAC water volume** live under the dose field, optimizing for a round per-dose draw, and offers a pre-checked option to log the matching inventory vial.

### Navigation + entry
- New route `src/app/add-compound.tsx` → `<AddCompoundScreen/>`, pushed over the tabs with a back/close affordance (same pattern as Settings P-01).
- A primary **"Add compound"** button near the protocol-items section header in `protocol-screen.tsx`. `onPress` → `router.push('/add-compound')`.
- The standalone `ReconstitutionCalculator` section is removed from the Protocol scroll; its math is folded into this screen (live suggestion + manual override). A standalone calculator utility can return later if requested.

### Form fields
Compound (searchable picker — catalog grows to ~38 in O-05, so a searchbar, reusing the O-04 pattern), dose, unit (`mg`/`mcg`/`iu`), route, frequency, start date ("beginning"). On submit: `addProtocolItem`, and set `concentration` on the item from the suggestion when computed.

### Auto-reconstitution
**Gated to** `compound.reconstituted === true` AND dose unit ∈ {`mg`, `mcg`} (IU is not mass-convertible). Hidden otherwise.

**Vial size source (layered, no forced input):** prefer a logged inventory vial for this compound → else `compound.commonVialSizesMg[0]` catalog default → else a pre-filled editable field. Best case zero input; worst case one pre-filled number.

**Algorithm** — new pure helper `suggestReconstitution(vialMg, doseMg)` in `src/lib/reconstitution.ts`:
1. `dosesPerVial = vialMg / doseMg`.
2. Candidate units-per-dose, preference-ordered (comfortable + round), multiples of 5 in [10, 50]: `[25, 30, 20, 40, 50, 15, 35, 45, 10]`.
3. For each candidate `U`: `water = U × dosesPerVial / 100`. Accept the first whose `water` falls in [0.5, 5] mL; prefer a candidate that also lands `water` on a 0.5 mL grid when one exists in the accepted set.
4. Return `{ waterMl, concentrationMgPerMl: vialMg / waterMl, perDoseVolumeMl, perDoseUnits: U }`.
5. If no candidate yields water in range (extreme dose/vial ratios), fall back to a fixed 1 mg/mL concentration and just report the resulting draw — never show nothing.

Worked example: `vialMg=30, doseMg=3` → 10 doses → U=30 → water 3 mL → 10 mg/mL → draw 30 units. Display: "Add **3 mL** BAC water → 10 mg/mL → draw **30 units (0.30 mL)** per dose."

**Manual override:** an expandable "Adjust" control lets power users set their own water volume; the per-dose draw recomputes live. The stored `concentration` reflects whatever is shown.

### Auto-inventory (pre-checked)
Once a vial size is known, show a pre-checked **"I have this vial on hand"**. On submit (if checked): `addInventoryItem` a `vial` with `compoundSlug`, `concentration`, `amountRemaining = amountInitial = vialMg`, `unit = 'mg'`. Enables depletion tracking + auto-decrement (and feeds P-02's bar) from day one. User can uncheck.

### Catalog schema additions (`compound-catalog.ts` + `seed.sql`)
Add to `CatalogCompound`:
- `injectable: boolean`
- `reconstituted: boolean` — powder needing BAC water (drives the calc). Note: pre-mixed injectables like testosterone-in-oil are `injectable: true, reconstituted: false` → no BAC suggestion.
- `commonVialSizesMg?: number[]` — default vial strengths for the fallback (also pre-fills the manual field).

These fields are required by the O-05 catalog expansion too — spec them together so every new compound ships with injectable/reconstituted/vial data.

### Verification
- Add a reconstituted injectable (e.g. Retatrutide) → suggestion appears, matches `suggestReconstitution`, updates as dose changes; manual override recomputes draw; protocol item stores concentration.
- Pre-checked vial logs to inventory with correct concentration + initial amount; appears in P-02 summary; logging a dose decrements it.
- Oral/IU/non-reconstituted compound → no BAC suggestion shown.
- `suggestReconstitution` unit-covered for the worked example + a mcg-dosed peptide + an out-of-range fallback.
- Green gate. New i18n keys for the screen, suggestion string, override, and the inventory checkbox (6 locales).

### Dependencies
- Catalog fields shared with **O-05** (compound expansion). Searchable picker shared with **O-04**. Inventory `amountInitial` shared with **P-02**.

---

## O-04 — Compounds out of onboarding; searchable picker + custom compound

**Decision:** Remove the compound-selection step from onboarding. Replace with a **soft prompt** to add your first compound once inside the app. Build one **searchable `CompoundPicker`** (with a custom-compound escape hatch) shared by onboarding-era flows and the P-03 add-compound screen.

### Remove from onboarding
- Delete `profileStep === 2` (the `COMPOUND_CATALOG` chip grid + disabled note) from `onboarding.tsx`. Profile steps become units → goals → cycle. `TOTAL_STEPS` drops accordingly (further reduced by O-02/O-03, which fold units + cycle into the age gate — coordinate the final count there).
- Field-surfacing already handles an empty `compoundSlugs` (goals + minimal default, spec 02). When the user later adds compounds, surfaced fields update automatically. No data-model loss.

### Soft onboarding prompt
- A dismissable "Add your first compound" CTA shown after onboarding until the first protocol item exists. Primary placement: **Protocol** empty state (upgrade `protocol.empty` into a prominent CTA that opens the P-03 add-compound screen). Secondary: a one-time dismissable nudge on **Today**. Tracked via a `dismissedAddCompoundPrompt` flag + `protocolItems.length === 0`.

### `CompoundPicker` component (shared with P-03, used wherever a compound is chosen)
- **Search**: text input filters `allCompounds()` by `canonicalName` + `aliases` (case-insensitive). Results as a scrollable list/chips. Replaces the static full-catalog grid (which doesn't scale to ~38 compounds).
- **Custom compound**: a "Can't find it? Add custom" affordance opens a minimal inline form: name (required), `injectable` toggle, `reconstituted` toggle, optional `commonVialSizesMg`. Optional effect tags can stay out of v1 (custom compounds are track-only by default — they still log doses/inventory, just surface no extra fields). Generated slug `custom-<kebab(name)>-<short id>`, `controlled: false`.

### Model + lookup
- Add `customCompounds: CatalogCompound[]` to the store (each `custom: true`). 
- `allCompounds()` = bundled `COMPOUND_CATALOG` ∪ `customCompounds`; `compoundBySlug` resolves across both. Field-surfacing must consult the merged set so a custom compound with effect tags (if ever added) surfaces correctly — pass custom compounds into `surfaceFields`/lookup rather than importing only the static catalog.

### Verification
- Onboarding no longer has a compound step; finishing with zero compounds works, log surfaces from goals.
- Picker search filters by name + alias; custom compound creates, persists, appears in protocol + inventory pickers, logs doses.
- Soft prompt shows when no compounds, opens add-compound, dismisses, and stays gone after a compound is added.
- Green gate. New i18n keys: picker search placeholder, custom-compound form, soft-prompt CTA (6 locales).

### Dependencies
- Shares `CompoundPicker` with **P-03**. `injectable`/`reconstituted`/`commonVialSizesMg` fields come from **O-05**'s schema work.

---

## O-05 — Extended compound catalog (38 compounds)

**Decision:** Expand the bundled catalog + Supabase seed from 12 to 38 compounds (26 new + Estrogen), each carrying the **P-03 schema fields** (`injectable`, `reconstituted`, `commonVialSizesMg`) alongside the existing tag data. No new `controlled` compounds (controlled stays Testosterone + anabolics per spec rule #3; none of the additions qualify). Existing effect-tag vocabulary covers all additions — no new tags needed.

### Schema (extends `CatalogCompound` + `seed.sql` + a hosted migration)
Add to every catalog row (existing 12 included, backfilled): `injectable: boolean`, `reconstituted: boolean`, `commonVialSizesMg?: number[]`. Mirror into `supabase/seed.sql` and apply a migration adding the columns to `public.compound` (then regenerate `database.ts`).

### Category → tags mapping (from the source list; review/correct freely)
| Category | effectTags | monitoringTags |
|---|---|---|
| Fat-burning | `fat_loss`, `appetite` | `nausea` (MT-II) |
| GLP-1 | `fat_loss`, `appetite` | `glucose`, `nausea` |
| Growth hormone | `recovery`, `sleep`, `muscle` | — |
| Mitochondrial | `recovery`, `healing`, `cognition` | — |
| Brain / libido | `cognition`, `libido`, `mood` (per compound) | — |
| Support | `cognition`, `mood`, `healing`, `skin` (per compound) | — |
| Hormones | (Estrogen) `mood`, `skin` | `estradiol` |

### Per-compound classification (structural — verify vial sizes against supplier catalogs at implementation; these are product strengths for the recon default, not dosing guidance)
| Compound | type | route | injectable | reconstituted | effectTags |
|---|---|---|---|---|---|
| AOD-9604 | peptide | subq | yes | yes | fat_loss |
| 5-Amino-1MQ | other | oral | no | no | fat_loss |
| Tesofensine | other | oral | no | no | fat_loss, appetite |
| Cagrilintide | peptide | subq | yes | yes | fat_loss, appetite |
| Melanotan II | peptide | subq | yes | yes | fat_loss, libido, skin |
| LIPO-C | other | im | yes | no | fat_loss |
| Retatrutide | glp1 | subq | yes | yes | fat_loss, appetite |
| Survodutide | glp1 | subq | yes | yes | fat_loss, appetite |
| Mazdutide | glp1 | subq | yes | yes | fat_loss, appetite |
| Cotadutide | glp1 | subq | yes | yes | fat_loss, appetite |
| Tesamorelin | peptide | subq | yes | yes | recovery, muscle |
| GHRP-2 | peptide | subq | yes | yes | recovery, muscle, appetite |
| GHRP-6 | peptide | subq | yes | yes | recovery, muscle, appetite |
| Hexarelin | peptide | subq | yes | yes | recovery, muscle |
| Sermorelin | peptide | subq | yes | yes | recovery, sleep |
| MOTS-c | peptide | subq | yes | yes | recovery, cognition |
| SS-31 (Elamipretide) | peptide | subq | yes | yes | recovery, healing |
| Humanin | peptide | subq | yes | yes | recovery, healing |
| Thymosin Alpha-1 | peptide | subq | yes | yes | healing, recovery |
| ARA-290 | peptide | subq | yes | yes | healing, recovery |
| KPV | peptide | subq | yes | yes | healing, gut |
| SLU-PP-332 | other | oral | no | no | fat_loss, recovery |
| Oxytocin | peptide | subq/nasal | yes | yes | mood, libido |
| PT-141 | peptide | subq | yes | yes | libido |
| Kisspeptin-10 | peptide | subq | yes | yes | libido |
| Setmelanotide | peptide | subq | yes | yes | fat_loss, appetite |
| Semax | peptide | nasal | no | yes | cognition, mood |
| Selank | peptide | nasal | no | yes | cognition, mood |
| NAD+ | other | subq/im | yes | no | recovery, cognition |
| Estrogen | hormone | oral/topical | no | no | mood, skin |

Notes: nasal peptides (Semax/Selank) ship as powder → `reconstituted: true` but `injectable: false` (no BAC recon for injection; still reconstituted for nasal spray — the P-03 BAC calc gates on `injectable && reconstituted`, so they correctly show no injection suggestion). NAD+ and LIPO-C are pre-mixed → `injectable: true, reconstituted: false`. Aliases per compound filled at implementation.

### Verification
- 38 compounds load in the picker; search finds each by name + alias.
- Reconstituted injectables trigger P-03's BAC suggestion; orals/nasal/pre-mixed do not.
- `seed.sql` + bundled catalog + hosted `compound` table agree by slug; `database.ts` regenerated.
- Green gate.

### Dependencies
- Schema fields shared with **P-03**. Picker is **O-04**. Effect tags must stay within the field-surfacing vocabulary (`fat_loss, muscle, recovery, healing, gut, skin, sleep, cognition, libido, appetite, mood`) so surfacing keeps working.

---

## O-01 — Fullscreen onboarding (lift above the tab bar)

**Decision:** Render onboarding *instead of* the tab navigator while `!onboardingComplete`, so the native tab bar doesn't exist during onboarding and can't be tapped.

### Root cause
`src/app/index.tsx` renders `profile.onboardingComplete ? <DailyCheckin/> : <Onboarding/>` — i.e. onboarding lives *inside* the Home tab, with `AppTabs` (native tabs) mounted around it. The tab bar is therefore visible and tappable.

### Fix
- In `_layout.tsx`, extract an inner `RootContent` (mounted inside `StoreProvider` so it can read `useStore`) that branches: `profile.onboardingComplete ? <AppTabs/> : <Onboarding/>`. Keep the `ready` splash gate. With onboarding rendered in place of `AppTabs`, no tab navigator is mounted → genuinely fullscreen.
- Simplify `index.tsx` to just `<DailyCheckin/>` (the onboarding branch moves up to root).
- Onboarding uses no `router`/`<Link>` navigation (pure step state), so mounting it without the navigator is safe; `AppTabs` mounts the moment `completeOnboarding()` flips the flag.

### Verification
- During onboarding no tab bar is visible or reachable on iOS/Android; completing it drops into the tabs. Web export still renders. Green gate.

---

## O-02 + O-03 — Consolidated "About you" first screen (sex + cycle + units into the age gate)

**Decision:** Fold units selection and a new sex picker (with cycle opt-in) into the age-gate screen, making it a single "About you" step. This removes two standalone steps.

### Age-gate screen becomes (in order): DOB → sex → units → (conditional) cycle opt-in
- **DOB** — unchanged 18+ gate.
- **Sex picker** — new. Options: **Male**, **Female**, **Trans masc (FTM)**, **Trans fem (MTF)**. Product rationale: transition/hormone tracking is a target segment (testosterone reshapes the face; estrogen drives MTF changes) and these users want a progress journal. Labels are adjustable — flag for review.
- **Units** — metric/imperial chips, moved verbatim from the old units step (O-03).
- **Cycle opt-in** — moved from the old standalone cycle step. Shown **only when sex ∈ {Female, FTM}** (the populations with a menstrual cycle). Sets `lastPeriodDate`/`cycleLength` exactly as today.

### Model
- Add `sex: 'male' | 'female' | 'ftm' | 'mtf'` to `LocalProfile` (optional until set; required to leave the screen). 
- Pass `sex` into the AI vision context (`analyze_photo`) alongside the existing `cycleContext`/`bodyTypeCalibration` — it materially informs expected facial/body change. (Wire-through only; no new AI logic required here.)

### Flow / mechanics
- `AgeGate`'s callback becomes `onComplete` (DOB still validated 18+); sex + units written via `setProfile` on selection; the confirm button requires valid DOB **and** a chosen sex **and** units. Cycle is optional.
- New onboarding step order after this + O-04: **About you** (DOB/sex/units/cycle) → consent storage → consent AI → **goals**. Compounds step removed (O-04). `TOTAL_STEPS` becomes 4; update `StepProgress` and the step indices accordingly.

### Verification
- One consolidated first screen collects DOB/sex/units; cycle opt-in appears only for Female/FTM; can't continue without DOB+sex+units. Onboarding is 4 steps. `sex` persists and reaches the AI context. Green gate. New i18n keys: `onboarding.about.*`, `sex.male|female|ftm|mtf` (6 locales).

### Dependencies
- Step-count math interacts with **O-04** (compound step removal). Land them together or sequence O-04 first.

---

## O-07 — Objectives screen: interactive body diagram

**Decision:** Replace the flat goal-chip list with a front-view human body silhouette whose regions illuminate as goals are selected. Goal chips remain below as the actual control + confirmation; the body is the visual feedback.

### Implementation
- Add **`react-native-svg`** (also unblocks the deferred true-45° chamfers in the design system — a shared win). Build a `BodySilhouette` component: a front-view outline with named region paths (head/face, chest, arms, core/waist, legs, full-body glow layer).
- Map each goal → highlighted region(s), lit with the theme `accent` / a soft glow when its goal is selected:
  | Goal | Region(s) |
  |---|---|
  | `weight_loss` | core / waist |
  | `body_comp` | chest, arms, legs |
  | `skin` | face |
  | `sleep` | head + soft full-body glow |
  | `recovery` | arms, legs (joints/muscles) |
  | `wellness` | soft full-body glow |
- Selecting/deselecting a goal animates the corresponding region on/off. Keep it monochrome + engraved to match the design language (no emojis, per O-06 spirit).

### Fallback (if we defer the dependency)
- A static body PNG with absolutely-positioned glow overlays per region. Hackier, avoids the dep — but since `react-native-svg` is wanted for chamfers anyway, prefer the SVG path.

### Verification
- Selecting each goal lights the mapped region(s); deselecting clears it; multiple goals stack. Renders in both themes; web export OK (react-native-svg supports web). Green gate.

### Dependencies
- `react-native-svg` (new dep — also enables design-system chamfers later). Requires a native rebuild for the dev client.

---

## O-06 — Remove em dashes from user-facing copy

**Decision:** Strip em dashes (`—`, U+2014) from everything the user can read — the i18n catalogs — and add a CI guard to keep them out. Code comments are out of scope (never rendered; the codebase's comment style uses them heavily), but can be swept later if desired.

### Scope
- Footprint: en.json (16), de/fr/pt (8), ru (9), es (5). ~54 occurrences across 6 locales.
- **Context-appropriate replacement, not blind substitution** — depending on the sentence: a comma, a colon, parentheses, or a rephrase. (`—` → `,` is wrong as often as it's right.) Each locale edited per its own punctuation norms; machine-translated strings that introduced em dashes get the same treatment.
- Also scan for en dash `–` (U+2013) used as a stylistic dash (ranges like "1–5" are fine and stay; prose dashes go).

### Guard (prevent regression)
- Extend `scripts/check-i18n-keys.mjs` (or add a sibling `check-i18n-style.mjs` wired into the same CI step) to fail if any locale JSON value contains `—`. Cheap string scan; runs in the existing i18n CI gate.

### Verification
- `grep "—" src/i18n/locales/*.json` returns nothing. App copy reads naturally in all 6 locales. The new guard fails when an em dash is reintroduced (test by adding one). Green gate (typecheck / lint / i18n parity + new style check / web export).

### Notes
- If you want comments scrubbed too ("everywhere" taken literally), that's a separate mechanical sweep of `src/**/*.ts(x)` — say the word and it gets its own pass.

---

# Home / Logging cluster (H-01 – H-06)

**Shared IA decision.** Tabs stay at three (Today, Photos, Protocol). **Today** becomes a glanceable dashboard, not a form. The daily check-in form moves to a **Logging** screen pushed from two buttons on Today (Quick = chat, Detailed = form), with a mode toggle. Settings is the gear (P-01); Add-compound is pushed from Protocol (P-03). The 457-line `DailyCheckin` is split: its form → Logging detailed mode; its `QuickLog` → Logging quick mode; `SymptomEvents` form → conversational intake (H-04).

---

## H-01 — Today as a dashboard

**Decision:** Today shows distilled progress + two log buttons, no inline form.

### Layout (top → bottom)
- **Header:** title + gear icon → Settings (P-01).
- **Swipeable progress card** (`ProgressCarousel`): horizontal pager whose pages are: body-photo compare (baseline vs latest), face-photo compare, then one page per configured **metric chart**. Page dots; photo pages carry the comparability dot from `progress-photos.tsx`. If no photos exist, the carousel is charts-only (the photo USP still lives in full on the Photos tab).
- **Configurable charts:** simple line/spark charts rendered on `react-native-svg` (shared dep with O-07; matches the instrument aesthetic — no chart lib). Source any numeric series we store or can compute: check-in fields (weight, protein, calories, 1–5 telemetry), `metricReadings` (steps, sleep, HR, HRV, body fat), and derived series (e.g. rolling weight average, weight delta). User picks which metrics appear (persisted to profile, e.g. `dashboardMetrics`). Fallback default when nothing chosen: weight (or the first available series).
- **Two log buttons:** **Quick log** → `router.push('/logging?mode=quick')`, **Detailed log** → `?mode=detailed`.
- **Compact "today" summary** (distillation): what's logged today, next scheduled dose, low-stock pings rolled in. Read-only; taps route to the relevant surface.

### Verification
- Carousel swipes photos↔charts; charts render real series in both themes; metric selection persists. Buttons open Logging in the right mode. No form on Today. Green gate.

### Dependencies
- `react-native-svg` (O-07). Logging route (H-03).

---

## H-02 — Chat has a home

**Decision:** The chat (`QuickLog`) is the **Quick log** mode of the Logging screen, reached by the Today button — solving "chat is missing from the UI." It's removed from `DailyCheckin`. No separate floating button needed; a primary button on the landing screen is accessible enough.

### Verification
- Quick log button opens chat; chat no longer renders inside the old check-in. Green gate.

---

## H-03 — Logging screen (Quick + Detailed, feature parity)

**Decision:** New pushed route `src/app/logging.tsx` → `<LoggingScreen/>`, opened with a `mode` param, a segmented **Quick / Detailed** toggle at top, back affordance.

- **Quick mode:** the upgraded `QuickLog` chat (conversational symptoms via H-04).
- **Detailed mode:** the manual form migrated out of `DailyCheckin`: weight (+ Health autofill), nutrition (+ autofill), 1–5 telemetry (surfaced fields), bloodwork markers, the **day-stepper/backfill**, **customize what I log**, and **history**. Plus **lab upload** (H-06) and a compact symptom add (H-04).
- **Parity:** anything loggable in one mode is loggable in the other (weight/checkin/nutrition/symptom/dose). Both write the same store entities.
- `index.tsx`/Today no longer renders the form; `daily-checkin.tsx` is refactored into `LoggingScreen`'s detailed mode (keep the surfaced-fields + customization logic intact).

### Verification
- Toggle switches modes; detailed form logs everything the old check-in did, including backfill to past days; parity holds. Green gate.

---

## H-04 — Conversational symptom intake

**Decision:** Remove the verbose symptom sub-form. Symptoms are logged conversationally, via **guided slot-filling** (deterministic follow-ups, not a heavy LLM dialogue — keeps the cheap-parse path, spec 05).

### Flow
- User says e.g. "I'm nauseous." The existing parse returns a `symptom` with `symptomType` but missing `severity`/`duration`.
- Instead of committing immediately, the chat asks follow-ups inline: show a **severity scale (1–5)**, then a **duration** prompt (with a "skip" for brevity). Once filled (or skipped), commit via `addSymptomEvent`. The free-text note field is dropped (the original message is the note).
- Reuse for the **detailed-mode** compact "add symptom": same mini-flow (type → severity → duration), so parity holds without the old four-field form.
- `SymptomEvents` viewing list (recent) moves into Logging (read-only recent + delete). Visual-symptom → photo suggestion (`isVisualSymptom`) is preserved.

### Notes
- True free-form multi-turn LLM chat (open dialogue) is a later enhancement; guided slot-filling delivers the "asks intensity, then duration" behavior reliably and cheaply now.

### Verification
- "I'm nauseous" triggers severity then duration prompts, commits a complete symptom; detailed-mode add uses the same flow; old form gone. Green gate.

---

## H-05 — End-of-day macro reminder via chat

**Decision:** A daily local notification at a user-set evening time prompts macro logging; tapping deep-links into Logging quick mode, pre-seeded with the macro question.

### Mechanics
- Extend `notifications.ts` + `notification-settings.tsx` with a "macro reminder" time (reuse the existing daily-reminder scheduling). Default ~20:00, user-editable, toggleable.
- Notification tap → deep link `/logging?mode=quick&prompt=macros`; the chat opens with a seeded assistant line ("How much protein and calories today?") and focus on the input.
- **Best-effort conditional:** local notifications can't read state at fire time. Daily schedule fires regardless; if macros are already logged today, the seeded chat acknowledges instead of re-asking. (A skip-if-logged reschedule on app foreground is a possible refinement; note, don't block.)

### Verification
- Reminder fires at the set time; tapping opens quick log seeded for macros; logging protein/calories from there persists to today. Green gate. New i18n keys for the reminder + seeded prompt (6 locales).

---

## H-06 — Lab results upload (photo + PDF) in Logging

**Decision:** Logging (detailed mode) offers lab-result upload by **photo** (camera/gallery) or **PDF**. Relocates the existing `LabImport` here from Protocol (closing the P-01 deferral).

### Mechanics
- **Photo path:** capture/pick an image → AI vision parse (existing `analyzePhoto`/lab path) → extract bloodwork marker values → store (bloodwork markers / lab entries). Works now.
- **PDF path:** add `expo-document-picker` to select a PDF. **Parsing PDFs is deferred** (CLAUDE.md lists lab-PDF parsing as a later AI task): land the upload + storage now, show "saved, parsing coming" if we don't parse yet, or parse via the AI service when that lands. The file is retained for later parse.
- Parsed values feed the bloodwork markers the field-surfacing already watches (TRT/anabolics etc.).

### Verification
- Photo upload parses and stores markers; PDF upload selects + stores the file (parse per availability); entry point lives in Logging, removed from Protocol. Green gate. New i18n keys for the PDF option + states (6 locales).

### Dependencies
- `expo-document-picker` (new dep, PDF). Native rebuild. Photo parse reuses the existing vision service.

---

_All 17 issues specced. Implementation can begin; suggested order honors the dependency graph: D-01 tokens → react-native-svg (O-07/H-01) → catalog schema (O-05/P-03) → CompoundPicker (O-04/P-03) → Settings/Logging routes (P-01/H-03) → the rest._
