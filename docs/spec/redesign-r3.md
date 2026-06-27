# Redesign R3 — beta feedback round (device testing)

Owner feedback from the first TestFlight build, all decisions resolved. Source of
truth for the R3 pass. Per standing rule, this plan contains **no open questions** —
every item below is decided. Every new user-visible string is translated across all
6 locales (en/es/fr/de/pt/ru) in the same change.

## Locked decisions (from Q&A)

- **Health retroactive import:** default window = **1 year**; add a **"Sync all data"**
  action in the integration's settings for full history. (HealthKit allows arbitrary
  historical date-range queries; Health Connect returns whatever it retains.)
- **Button feedback:** async actions show a **spinner**; submit/save/destructive
  actions show a brief **success checkmark** on completion.
- **Camera overlay legibility:** **both** — brightness-flip text black/white where a
  frame luma signal is available (vision/face camera), with a contrast outline +
  scrim fallback everywhere (incl. the body/expo-camera path).
- **"Me" page weight:** prefilled from the latest check-in weight, **editable** as a
  profile baseline.
- **Logging default:** remove the Today "Detailed" button; rename "Quick Log" → **"Log"**
  (opens quick by default). The **QUICK/DETAILED toggle stays inside** the Log screen,
  and notifications **deep-link** straight to detailed when relevant.
- **Photos compare:** a **horizontal scrollable strip of recent photos** (4 visible at
  a time); tap any to compare it against baseline. Replaces the wipe view as the main
  element. Keep the **Face/Body** selector (it switches two distinct photo sets).
- **Onboarding:** add an **optional account step** (create / sign in / skip) + a
  **health-connector step**. Connector offered **by platform, no account required**
  (iOS → Apple Health for everyone; Android → Health Connect for everyone); local
  import works without an account, cloud backup still needs one separately.
- **Fit pre-check:** a cheap **pre-flight vision gate (Haiku)** runs before the deep
  (Sonnet) photo analysis — if clothing is too tight / pic is low quality, warn the
  user and **skip** the expensive call.
- **Navigation:** convert nested pages from RN Modals to **native-stack routes** so
  iOS edge-swipe-back + Android back work everywhere.
- **Compound cycle tagging:** **auto-derived from dose history** — a photo is tagged
  with the compounds active around its date and the week number (weeks since the first
  dose of the current run). No stop-date entry; **editable per-photo** in Photo History.

## A. Foundations / cross-cutting

1. **Native-stack navigation.** Replace the `OverlayProvider` Modal system with
   expo-router native-stack routes for: Settings, Add compound, Compound detail,
   Logging, and the new nested pages (Me, Privacy & data, Notifications, Photo history).
   Gives native back gesture on both OSes. Retest all entry points.
2. **Header safe-area fix.** Nested/overlay headers overlap the status bar/notch
   (Registro/Ajustes collide with the clock; the Log header sometimes renders
   off-screen so back is unreachable). Fix the header to respect top inset; this is
   expected to resolve the intermittent "can't go back" Log bug. Investigate + confirm
   root cause during implementation.
3. **Hide scrollbars** globally (`showsVerticalScrollIndicator={false}` /
   horizontal) on all scroll views.
4. **Button feedback system.** Extend `PrimaryButton` (and relevant pressables) with a
   `loading` spinner (exists) + a transient **success checkmark** state on completion;
   apply to save/add/submit/sign-in/AI actions.
5. **Cog icon.** The Today/Protocol header glyph renders sun-like — verify `GearIcon`'s
   SVG and replace it with a proper cog.
6. **Hide Terra** from Data Sources until implemented.

## B. Settings → list of nested pages

Settings becomes a short list that pushes into nested routes. Fix the header to fit
the screen.
- **Appearance** stays inline (segmented Light/Dark/Auto).
- **Notifications** → its own nested page (move the whole card).
- **"Me"** nested page: name, app language (picker overriding device default), sex,
  height, weight (prefill latest check-in, editable), bodyfat % (optional). Move
  **Body composition** here as a **dropdown/select** (was chips). Move **Cycle tracking**
  here; change activation from a chip/anchor to a **button**.
- **"Privacy & data"** nested page: move the **"Your data"** card (export, coach PDF,
  delete, consents) and the **Google Drive** connector here.
- **Data sources** stays in Settings (Terra hidden); add the **"Sync all data"** action.

## C. Today

- **Charts:** all metric charts **enabled by default**; remove the inline metric chips
  and add a **pencil icon at the top-right of the chart area** that opens a **modal** to
  toggle which charts show.
- **Move the Log button above** the distillation summary.
- **Single "Log" button** (quick by default); Detailed button removed (see logging
  decision). Order: header → charts(+pencil) → Log → summary → today's doses.

## D. Photos

- **Horizontal scrollable recent strip** (4 most-recent visible); tap a photo to
  compare it against baseline. Keep Face/Body selector.
- **Persistent floating capture button** ("Take a photo") pinned above the tab bar,
  visible regardless of scroll, scoped to the Photos page.
- **Photo History** nested page: all progress photos **grouped by month**,
  **auto-tagged** with the active compound(s) + cycle week (derived from dose history),
  tag **editable per-photo**. **Filter** button: by compound, date range, and session
  (face/body).
- **Shorten the clothing guidance** text to the first part (drop the swimwear lines).

## E. Logging

- Header off-screen / back-unreachable bug → covered by A.2 (safe-area) + A.1
  (native-stack). Verify on device.

## F. Onboarding

- **Sex picker:** Male / Female / **Other**; tapping Other reveals **Trans masc (FTM)**
  / **Trans fem (MTF)**.
- **Add weight** collection.
- **Optional account step** (create / sign in / skip).
- **Health-connector step:** iOS → Apple Health (everyone); Android → Health Connect
  (everyone). On connect, kick off the **1-year** import immediately.

## G. Health integration (native, device build)

- Implement the retroactive read with a **date-range** query (default 1 year), mapping
  to canonical metrics; **"Sync all data"** in integration settings widens to full
  history. Pairs with the existing native HealthKit / Health Connect read work.

## H. Camera

- **Overlay legibility:** brightness-flip text/controls (cancel, camera-swap, body
  guidance) where a luma signal exists; contrast outline + scrim fallback otherwise.
- **Fit / quality pre-flight gate:** before the deep analysis, run a cheap **Haiku**
  vision check for tight clothing / low quality; if it fails, surface a gentle hedged
  warning and **skip** the Sonnet call.

## I. Compound cycle tagging (logic)

- Derive each photo's tags from **dose history**: compounds with doses around the
  photo's date are "active"; **cycle week** = weeks since the first dose of that
  compound's current run. Auto-applied; **editable per-photo** from Photo History.

## Build order

1. **A — Foundations** (native-stack nav, safe-area headers, scrollbars, button
   feedback, cog, hide Terra). ✅
2. **B — Settings restructure** (Me, Privacy & data, Notifications nested pages).
3. **C — Today** (charts default + pencil modal, single Log button, reorder).
4. **D — Photos** (recent strip, floating capture, Photo History + cycle tagging,
   clothing text).
5. **F — Onboarding** (sex/other, weight, account step, connector step).
6. **H — Camera** (contrast, fit pre-check) — device build.
7. **G — Health retroactive import** — device build.

Native-build-required items (camera, health) are sequenced last so the JS-only work
ships and tests via preview/OTA first.

---

## Things to test (device checklist)

### A — Foundations ✅ (commit in main; verify on next TestFlight build)
- [ ] Settings gear icon is a cog (not a sun).
- [ ] Scrollbars hidden on all tab screens and all overlays.
- [ ] Quick Log button: tap, wait → spinner shows → checkmark flashes → idle. No double-tap issues.
- [ ] Terra integration is not visible in the Data sources list.
- [ ] **Native back gesture (the main A goal):** open Settings, swipe left-edge → closes. Open Logging, swipe left-edge → closes. Same for Add Compound and Compound Detail.
- [ ] Android hardware back button: opens Settings → back button → closes (no white screen).
- [ ] Overlay headers are NOT under the status bar (safe-area fix).
- [ ] Switching between all 4 tabs works normally after the (tabs) group refactor.
- [ ] Today, Photos, Insights, Protocol — all render data as before.

### B — Settings restructure (next to build)
- [ ] "Me" page appears as a nested route; tapping back returns to Settings.
- [ ] Language, sex, height, weight, body-fat, body-comp dropdown all persist.
- [ ] Weight prefilled from latest check-in.
- [ ] Privacy & data is a nested page; account delete and export still work.
- [ ] Notifications is a nested page; time pickers still work.

### C — Today
- [ ] All charts rendered with empty frames when < 2 data points.
- [ ] Pencil icon opens toggle modal; toggling a chart persists across app restarts.
- [ ] Single "Log" button visible; no separate "Detailed" button.
- [ ] Log button is above the distillation summary.

### D — Photos
- [ ] Horizontal thumbnail strip shows latest 4, scrollable.
- [ ] Floating capture button above tab bar on the Photos screen.
- [ ] Photo History page reachable; grouped by month.
- [ ] Compound + cycle week auto-tagged from dose history; editable per-photo.
- [ ] Clothing guidance text is shorter.

### F — Onboarding
- [ ] Sex picker: Male / Female / Other (Other reveals FTM/MTF).
- [ ] Weight collection step present.
- [ ] Optional account creation step present.
- [ ] Health connector step present (platform-appropriate).

### H — Camera (device build required)
- [ ] Camera overlay text stays legible on light and dark backgrounds.
- [ ] Fit pre-check Haiku gate runs before the full Sonnet analysis.

### G — Health retroactive import (device build required)
- [ ] "Sync 1 year" is the default; "Sync all data" option available.
- [ ] Weight, sleep, activity, HR, cycle data fill in correctly after connect + sync.
- [ ] Manual protein/calories fields still work when Health has no nutrition data.
