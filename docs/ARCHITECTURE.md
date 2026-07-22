# PepiProgress — App Architecture (for design)

A daily progress-tracking journal: subjective check-ins and consistent progress photos become a personal timeline, plus anonymized community aggregates. Peptide and compound protocols are one tracked domain, alongside general wellness goals (sleep, recovery, body composition). Omniplatform (iOS / Android / web), local-first, 6 languages. This doc describes the **current** structure and visual system so a design pass can work against real screens, IA, and tokens.

> Stack: Expo SDK 56 + Expo Router, React Native + react-native-web, TypeScript, local-first store (AsyncStorage today). Charts/diagrams use `react-native-svg`. Backend is Supabase (auth, storage, edge AI) but the app runs fully offline pre-account.

---

## 1. Design language ("CyberLife instrument")

The intended aesthetic is a **monochrome precision instrument**: engraved/debossed panels, hairline grooves, tabular numerals, tight corners (not rounded/playful). Two co-equal themes (light "daylight" + dark "at night") share one treatment and are a pure token swap. **No emojis. No accent hues** — color is reserved for data semantics only (good/bad deltas, status).

### Recently retuned for contrast (D-01)
Cards now sit **lighter than the background** (light theme) / **lighter elevation** (dark) so they visibly lift; sunken wells go darker. All text tiers hit WCAG AA. If the design still reads "flat/grey," push surface separation and hierarchy further — that is the known weak point.

### Color tokens (`src/constants/theme.ts`)
| token | light | dark | role |
|---|---|---|---|
| `background` | `#EDEBE7` | `#0A0B0C` | screen base (dark = near-black canvas) |
| `surfaceRaised` | `#FBFAF8` | `#14171A` | cards (lift above bg) |
| `surfaceSunken` | `#DBD9D4` | `#070809` | inset wells, inputs |
| `text` | `#1A1918` | `#E4E1DB` | primary copy |
| `textSecondary` | `#5A5752` | `#9C9892` | secondary (~6:1) |
| `textMuted` | `#66625D` | `#837F79` | quiet (~4.7:1 AA) |
| `label` | `#6E6A65` | `#787470` | engraved labels |
| `numeral` | `#3A3834` | `#B0ACA6` | metric ink |
| `accent` | `#2A2825` | `#E8E5DF` | solid control / selected / chart line |
| `onAccent` | `#FBFAF8` | `#131210` | text on accent |
| `border` | `rgba(0,0,0,.12)` | `rgba(255,255,255,.10)` | carved groove (shadow side) |
| `borderHighlight` | `rgba(255,255,255,.80)` | `rgba(0,0,0,.50)` | groove lit side |
| `signalGood` / `signalWatch` / `signalBad` | green / amber / red | green / amber / red | **data semantics only** (verdict 3-state) |

**Motion** (`Motion` in `theme.ts`, presets in `src/lib/motion.ts`): durations
`instant 90 / fast 160 / base 240 / slow 360` (ms); ease-out bezier curves only, no
bounce/elastic; `pressScale 0.97`. See the census (§9) for the reusable presets.

Theme is resolved by `lib/theme-provider.tsx` from `profile.themePreference` (`light`/`dark`/`auto`) + device scheme. `useTheme()` returns the palette; `useResolvedScheme()` returns the name.

### Type scale (`src/components/themed-text.tsx`, `<ThemedText type=…>`)
| type | font | size/weight | use |
|---|---|---|---|
| `display` | sans light | 27 / 300 | screen H1 |
| `label` | mono medium | 10 / uppercase / +tracking | engraved panel labels |
| `metric` | mono | 42 | the one big number per card |
| `metricSm` | mono medium | 22 | delta / secondary stat |
| `mono` / `monoSm` | mono | 12 / 10 | data rows, fine print |
| `body` | sans | 14 | body copy |
| `small` / `smallBold` | sans / sans-semibold | 14 | card titles, names, actions |

Fonts: Inter (sans) + IBM Plex Mono (mono). Spacing scale `Spacing` = 2/4/8/16/24/32/64. Corners are tight (`Radii` = 2–3px) by design.

### Primitives (`src/components/surface.tsx`)
`Card` (raised panel) · `Sunken` (inset) · `Divider` (carved hairline = shadow line over highlight line) · `EngravedLabel` (uppercase mono w/ highlight text-shadow) · `Metric` (big numeral + unit) · `SignalText` (good/bad/neutral value) · `StatusPill` (chamfered status chip) · `Placeholder` · `Skeleton` (pulsing load bars).
Form primitives (`src/components/form.tsx`): `OptionChip`, `SingleSelectChips`, `SegmentedControl`, `ScaleSelector` (1–5 segmented), `LabeledInput`, `PrimaryButton` (variant `secondary`) + `SecondaryButton`, `TextButton`.
Instrument shell: `ChamferBox` (octagonal SVG surface — the core treatment), `ConfidenceBadge` (3-dot meter), the four Journal primitives (`SourceBadge`/`CompletenessDots`/`WeekStrip`/`ValueRow`), `HeroFigure`, `InstrumentBackground`, `CroppedPhoto`, `SyncStatus`, `OverlayHeader`. See the full census in §9.
Icons (`src/components/icons.tsx`, SVG, 1.5px stroke). Charts: `LineChart` (`src/components/line-chart.tsx`).

---

## 2. Information architecture

```
Root (src/app/(tabs)/_layout.tsx)
├─ if !onboarded → Onboarding (FULLSCREEN, no tab bar)
└─ if onboarded → 4 tabs (app-tabs.tsx) + full-screen pages/overlays

  TABS (bottom, app-tabs.tsx):
    1. Today      (src/app/(tabs)/index.tsx)     — verdict + check-in + quick-log
    2. Pepi       (src/app/(tabs)/pepi.tsx)       — conversational companion (full page)
    3. Photos     (src/app/(tabs)/photos.tsx)     — reel, capture, compare, analysis
    4. Analysis   (src/app/(tabs)/insights.tsx)   — trends, trajectory, narrative
    (5. Journal   — coming as item 41b: day-in-review; order becomes
        Today · Pepi · Photos · Analysis · Journal)

  PAGES / OVERLAYS (src/app/*.tsx, presented over the tabs):
    • protocol.tsx  — protocol items, inventory, reconstitution (one-time setup)
    • logging.tsx   — the detailed/quick log surface
    • me.tsx / settings.tsx / privacy.tsx / notifications-settings.tsx /
      typical-day.tsx / whatilog.tsx — settings + config pages
    • add-compound.tsx, compound-detail.tsx, photo-history.tsx,
      signal/[metricId].tsx — drill-ins
```

**Protocol is not a tab** — it is a nested setup page reached from Settings. Full-screen
overlays use `lib/nav-overlay.tsx` (RN `<Modal>`, reliable cover of the native tab bar);
each takes an `onClose` prop and renders an `OverlayHeader` (back chevron + title).

---

## 3. Screen inventory (what's on each)

### Onboarding — `features/onboarding/onboarding.tsx` (fullscreen, 4 steps, segmented progress bar)
1. **About you** (`age-gate.tsx`): DOB (day/month/year, 18+ gate) + **Sex** chips (Male / Female / Trans masc FTM / Trans fem MTF) + **Units** chips + conditional **cycle opt-in** (only Female/FTM).
2. **Photo storage consent** (`consent-photos.tsx`).
3. **Photo AI consent**.
4. **Goals** (`onboarding.tsx`): goal chips **+ interactive body silhouette** (`body-silhouette.tsx`) whose regions illuminate per selected goal. Requires ≥1 goal to finish.
   *(Compound selection was removed from onboarding; users add compounds later.)*

### Today / Dashboard — `features/home/dashboard.tsx`
Glanceable, **no forms**. Top-to-bottom:
- Header: engraved "TODAY" label + display date + **gear** (→ Settings).
- Sync status row.
- **Swipeable carousel** (horizontal pager): body-photo compare (baseline vs latest) → face-photo compare → one page per selected **metric line chart**. Empty state when no data.
- Metric selector chips (toggle which metrics chart).
- Distillation summary card (logged-today? / doses today).
- **Two buttons**: `Quick log` (→ Logging/quick) · `Detailed log` (→ Logging/detailed).

### Logging overlay — `features/logging/logging-screen.tsx`
Header + **Quick / Detailed** segmented toggle.
- **Quick** = `features/chat/quick-log.tsx`: one text box → AI parse → entities auto-apply with an undo toast; **conversational symptom completion** (asks severity scale, then duration) for incomplete symptoms; can be seeded for end-of-day macros.
- **Detailed** = `features/logging/detailed-log.tsx`: the manual form — day-stepper backfill, weight (+Health autofill + goal-aware delta), nutrition (protein/calories), 1–5 telemetry rows, bloodwork markers, symptom add + recent list, **lab upload (photo + PDF)**, "customize what I log", history list. Fields shown are data-driven (see §5).

### Photos — `features/photos/…`
Capture (face via vision-camera, body via expo-camera; ghost overlay, tilt/level), baseline↔latest compare, timeline strip, AI drift/comparability + hedged change note, retroactive import.

### Protocol — `features/protocol/protocol-screen.tsx`
- Header: "Protocol" + **gear** (→ Settings).
- **Inventory summary** (`inventory-summary.tsx`) at top: per-item name, remaining, **depletion bar**, **status pill** (OK/Low/Expiring/Expired). Hidden when empty.
- **Add compound** button (→ Add-compound overlay).
- Protocol items list (compound + dose/route/freq, last injection site, tap-to-log dose) or soft "add your first compound" prompt.
- Inventory management list + add form.
- Recent doses list.

### Add compound overlay — `features/protocol/add-compound-screen.tsx`
`CompoundPicker` (search + custom) → dose, unit, route, frequency, start date → **live reconstitution suggestion** for reconstituted injectables ("Add 3 mL BAC water → 10 mg/mL → draw 30 units") with a pre-checked "I have this vial on hand" that logs inventory.

### Settings overlay — `features/settings/settings-screen.tsx`
Stacked cards: **Account** (sign in/up/out) · **Appearance** (Light/Dark/Auto) · **Reminders** (check-in, doses, end-of-day macros, inventory, photos + times) · **Data sources** (Apple Health / Health Connect) · **Body & cycle** · **Privacy & data** (consent toggles, export JSON, delete, Drive backup, "stored, never trained on").

### Shared compound picker — `features/compounds/compound-picker.tsx`
Search box filtering the 42-compound catalog by name+alias; "add custom" inline form (name, injectable/reconstituted toggles, vial sizes).

---

## 4. Primary user flows
- **First run:** Onboarding (About you → consents → goals) → Today dashboard.
- **Daily log:** Today → Quick log ("slept badly, 182 lbs, nauseous") → AI applies + asks symptom severity/duration → undo toast. Or Detailed log form.
- **Photo:** Today carousel or Photos tab → capture with ghost overlay → compare/AI note.
- **Set up a compound:** Protocol → Add compound → pick + dose → auto-reconstitution → log vial → tap-to-log doses → inventory depletes.
- **Reminders:** end-of-day macro push → opens Quick log seeded for protein/calories.

---

## 5. Data model & key logic (what drives the UI)
Local-first store `src/lib/store.tsx` (React context, `useStore()`), persisted to AsyncStorage. Entities: `profile` (units, goals, sex, themePreference, consents, notify prefs, dashboardMetrics, cycle/bodyType), `entries` (per-day check-ins: weight, protein, calories, 1–5 scales, notes, measurements, labValues), `symptomEvents`, `protocolItems` (compound, dose, route, frequency, concentration, startedAt), `doseEvents`, `inventory` (vials/consumables, amountRemaining/Initial, expiry), `photos` (face/body, uri, metadata, AI scores), `metricReadings` (canonical health metrics), `integrations`, `customCompounds`.

**Field surfacing (the core rule, `src/lib/field-surfacing.ts`):** which fields appear in the log = **goals ∪ compound effect-tags ∪ monitoring-tags** (deterministic, no personas). The Detailed log and dashboard metrics read from this. Compounds carry `effectTags`, `monitoringTags`, `injectable`, `reconstituted`, `commonVialSizesMg` (`src/data/compound-catalog.ts`, 42 compounds).

**Reconstitution (`src/lib/reconstitution.ts`):** `suggestReconstitution(vialMg, doseMg)` targets a round per-dose syringe draw.

---

## 6. Non-negotiable product rules (affect design)
1. **No hardcoded strings** — everything via i18n (6 locales), lint-enforced. **No em dashes** in copy (CI-guarded).
2. **Photos private by default**, stored (not discarded), never used to train models.
3. **No dosing suggestions** anywhere (legal); reconstitution math (volume from a user's own dose) is allowed. Controlled compounds (TRT/anabolics) are track-only.
4. **Never gate data input**; gate only output/scale.
5. Tracking has **no shame mechanics** (missed days editable, no streaks-as-pressure).

---

## 7. File map (design-relevant)
```
src/
  app/                      _layout.tsx (root gate), index.tsx (Today), photos.tsx, explore.tsx (Protocol)
  components/               surface.tsx, form.tsx, themed-text.tsx, icons.tsx, line-chart.tsx, overlay-header.tsx
  constants/theme.ts        color tokens, type scale fonts, spacing, radii
  lib/theme-provider.tsx    light/dark/auto resolution
  lib/nav-overlay.tsx       full-screen overlay system (Settings/Logging/Add-compound)
  features/
    onboarding/             onboarding.tsx, age-gate.tsx (About you), body-silhouette.tsx, consent-photos.tsx
    home/dashboard.tsx      Today
    logging/                logging-screen.tsx, detailed-log.tsx
    chat/quick-log.tsx      conversational logging
    photos/                 capture + compare + timeline
    protocol/               protocol-screen.tsx, inventory-summary.tsx, add-compound-screen.tsx
    compounds/compound-picker.tsx
    settings/               settings-screen.tsx, appearance/notification/integration/cycle/privacy-settings.tsx
    symptoms/, lab/, auth/
```

---

## 8. Where the design most needs help
- **Surface hierarchy / depth** — the engraved metaphor is subtle; cards, wells, and grooves need to read clearly on real screens without becoming a flat grey field.
- **The Today dashboard** — the swipeable photo/chart card is the hero; it should feel like a premium progress instrument, not a list.
- **Onboarding** — the body silhouette + goals step is the personality moment; the About-you step is dense and needs calm structure.
- **Logging** — Quick (chat) vs Detailed (form) should feel like two faces of one tool, equally polished.
- **Empty states** — first-run (no data/photos) should still feel intentional, not barren.
- Keep it monochrome, engraved, tabular; data-only color. Bold and precise, not loud.

---

## 9. Reusable inventory (census)

Seeded in Wave 7 item 35. Purpose: cheap context loading + preventing stray duplicates
(reuse the store/component/lib below before adding a new one). **Standing gate:** any new
reusable component / pure lib / hook / motion-haptic pattern adds its line here in the same
commit; items 36-42 extend the per-screen "used by" notes as they sweep. Screen-level detail
in §3 lags the current UI until each screen is swept, so trust this census over §3 for what
exists.

### Components (`src/components/`)
| file | exports | what / used by |
|---|---|---|
| `surface.tsx` | Card, Sunken, Divider, EngravedLabel, Metric, SignalText, StatusPill, Placeholder, Skeleton | the instrument surface kit; everywhere |
| `form.tsx` | OptionChip, SingleSelectChips, SegmentedControl, ScaleSelector, LabeledInput, PrimaryButton, SecondaryButton, TextButton | all forms/inputs; press-scale via `motion.pressScale` |
| `chamfer.tsx` | ChamferBox | octagonal SVG surface (fill + hairline); buttons, chips, cards, badges |
| `themed-text.tsx` | ThemedText | the type scale; every text node |
| `themed-view.tsx` | ThemedView | themed container |
| `confidence-badge.tsx` | ConfidenceBadge | 3-dot confidence meter; every AI conclusion |
| `journal-primitives.tsx` | SourceBadge, CompletenessDots, WeekStrip, ValueRow | day-in-review kit; Journal (41b) + Today strip (38) |
| `line-chart.tsx` | LineChart | series + projected/band/goal line; Analysis, Today |
| `hero-figure.tsx` | HeroFigure | the big verdict figure; Today |
| `instrument-background.tsx` | InstrumentBackground | animated molecular-lattice backdrop; app shell |
| `cropped-photo.tsx` | CroppedPhoto | analysis-bbox display crop; reel/timeline thumbs |
| `animated-icon.tsx` (+`.web`) | AnimatedIcon | reanimated confirmation icon |
| `overlay-header.tsx` | OverlayHeader | back-chevron + title; every overlay/page |
| `settings-page.tsx` | SettingsPage | settings sub-page scaffold |
| `sync-status.tsx` | SyncStatus | cloud-sync status row |
| `hint-row.tsx` | HintRow | inline hint/nudge row |
| `date-picker.tsx` / `weekday-picker.tsx` | pickers | dose drawer + schedule |
| `app-tabs.tsx` | AppTabs | bottom tab bar (expo-router/ui) |
| `icons.tsx` | SVG icon set | everywhere |
| `external-link.tsx` | ExternalLink | opens URLs |

### Pure libs (`src/lib/*.ts`, deterministic + unit-tested)
- **Verdict / insights:** `verdict-engine`, `derived-metrics`, `signal-ledger`, `sparkline`, `chart-series`, `trajectory` (recency-weighted projection), `energy-balance` (TDEE), `anomaly`, `measure-next`, `confidence`, `narrative`, `attribution`, `expectation-timeline`.
- **Photos:** `photo-quality`, `photo-cadence`, `photo-observations` (F5 ledger), `analysis-context` (F5 fusion), `photo-crop`, `photo-pose`, `pose-live`, `photo-readout`, `photo-reference`.
- **Logging / quick-log:** `quick-log-deterministic` (F3), `quick-log-vocab`, `quick-log-apply`, `dose-draft`, `dose-schedule` (P-04), `micro-checkin`, `chat-pills`, `coaching`, `typical-day`, `journal-day` (F4 — per-day entity assembly + source resolution for the Journal).
- **Compounds / protocol:** `field-surfacing` (goals ∪ effect ∪ monitoring), `reconstitution`, `inventory`, `lab-monitoring`, `body-composition`, `strength`.
- **Platform / motion:** `dates`, `day-boundary`, `haptics` (hapticTap/hapticSuccess), `motion` (presets), `notifications`, `report` (PDF), `merge-states`, `data-facade`.
- **Backend I/O (not pure):** `ai`, `supabase`, `sync`, `photos`, `photo-cloud`, `drive-backup`.

### Providers / stores (`src/lib/*.tsx`, mounted in the root layout)
`store` (`useStore`, the local-first repository) · `auth` · `theme-provider` (`useTheme`) · `today` (`useToday`, day-boundary) · `cloud-sync` · `photo-sync` · `integration-sync` · `health-writeback` · `language-sync` · `notification-manager` · `macro-reminder-handler` · `quick-log-runner` · `nav-overlay`.

### Hooks (`src/hooks/`)
`use-theme` · `use-color-scheme` (+`.web`) · plus `use-coaching-level` (`src/lib/`).

### Motion + haptic patterns
- **Tokens:** `Motion` in `theme.ts` (durations + ease-out beziers + `pressScale`).
- **Presets:** `src/lib/motion.ts` — `easings`, `timing.{instant,fast,base,slow}`, `enterFade`/`exitFade`/`enterRise`/`exitSink`, `layout` (LinearTransition), `pressScale`.
- **Haptics:** `src/lib/haptics.ts` — `hapticTap` (routine confirm), `hapticSuccess` (milestone).
- **Adoption:** form buttons use `pressScale`; screens 36-42 adopt the enter/exit + layout presets and pair haptics with confirmation moments during the sweep.
