# PepiProgress — Issue Backlog (Beta Round 1)

Collected from first eyes-on review. Each item gets a spec discussion before moving to FIXES.md.

---

## Design

**D-01 — Light / dark theme tied to phone settings**
Currently the app sits in a middle-grey that reads poorly in both bright and low-light environments. Replace with two co-equal themes (light / dark) that follow the device's system preference automatically. Dark theme is the existing direction; light theme needs to be designed from scratch against the same token system.

---

## Onboarding

**O-01 — Fullscreen onboarding (hide nav bar)**
The tab bar is visible during onboarding, letting users skip past incomplete setup. Onboarding should be a modal or root-level screen that covers the nav bar entirely until the flow is complete.

**O-02 — Condense onboarding steps; integrate sex + cycle into age gate**
The hormonal cycle step is currently isolated and sparse. Consolidate: move sex picker and cycle opt-in onto the age gate screen. Sex options should include male, female, and transgender (FTM / MTF) — transition drug tracking (e.g. testosterone for FTM) is a meaningful use case for this user segment.

**O-03 — Unit selection moves to age gate screen**
Units (metric / imperial) are currently a standalone step. Collapse onto the age gate screen alongside sex and cycle.

**O-04 — Compound step: searchbar + custom compound + move outside onboarding**
The compound selection step has too few options and no search. More importantly the step itself may create drop-off — users don't know what they're taking well enough to commit at signup. Proposal: remove the compound step from onboarding entirely and replace with a soft "add your first compound" prompt once the user is inside the app. The compound screen itself should have a searchbar and a "can't find it? add a custom compound" escape hatch.

**O-05 — Extended compound catalog**
Current catalog has 12 compounds. Add the following (~30 new) plus Estrogen. Already-present compounds marked ✓.

| Category | Compound | Status |
|---|---|---|
| Fat-burning | AOD-9604 | add |
| Fat-burning | 5-Amino-1MQ | add |
| Fat-burning | Tesofensine | add |
| Fat-burning | Cagrilintide | add |
| Fat-burning | Melanotan II | add |
| Fat-burning | LIPO-C | add |
| GLP-1 | Semaglutide | ✓ exists |
| GLP-1 | Tirzepatide | ✓ exists |
| GLP-1 | Retatrutide | add |
| GLP-1 | Survodutide | add |
| GLP-1 | Mazdutide | add |
| GLP-1 | Cotadutide | add |
| Growth hormone | CJC-1295 | ✓ exists |
| Growth hormone | Ipamorelin | ✓ exists |
| Growth hormone | Tesamorelin | add |
| Growth hormone | GHRP-2 | add |
| Growth hormone | GHRP-6 | add |
| Growth hormone | Hexarelin | add |
| Growth hormone | Sermorelin | add |
| Mitochondrial | MOTS-c | add |
| Mitochondrial | SS-31 (Elamipretide) | add |
| Mitochondrial | Humanin | add |
| Mitochondrial | BPC-157 | ✓ exists |
| Mitochondrial | Thymosin Alpha-1 | add |
| Mitochondrial | ARA-290 | add |
| Mitochondrial | KPV | add |
| Mitochondrial | SLU-PP-332 | add |
| Brain / libido | Oxytocin | add |
| Brain / libido | PT-141 | add |
| Brain / libido | Kisspeptin-10 | add |
| Brain / libido | Setmelanotide | add |
| Support | Semax | add |
| Support | Selank | add |
| Support | NAD+ | add |
| Support | GHK-Cu | ✓ exists |
| Support | TB-500 | ✓ exists |
| Hormones | Testosterone | ✓ exists |
| Hormones | Estrogen | add |

Each new compound needs: slug, display name, category, effect tags, monitoring tags, controlled flag, injectable flag, and typical vial sizes (for reconstitution). These need to be specced before implementation and added to both the bundled catalog (src/data/compound-catalog.ts) and the Supabase seed.

**O-06 — Remove em dashes everywhere**
Em dashes (—) appear in labels, descriptions, and UI copy throughout the app. Replace with commas, colons, or rewritten sentences. No em dashes anywhere in the UI.

**O-07 — Objectives screen: interactive body diagram**
The objectives screen is visually flat. Replace the list with a human body outline (front view) where body regions light up as the user selects relevant goals (e.g. selecting "muscle" lights up arms/chest/legs; "skin" lights up the face region; "sleep" / "wellness" highlight a softer full-body glow). The goal chips can remain as secondary confirmation below the diagram.

---

## Home screen ("Today")

**H-01 — Restructure Home as a data dashboard, not a logging form**
Home should display progress, not inputs. Primary content: a swipeable card component that cycles between (a) body photo comparison, (b) face photo comparison, (c) configurable metric charts. If no photos exist, fall back to charts only. Charts should be selectable by the user (weight, steps, sleep, HR, etc.).

**H-02 — Chat / quick-log is missing from the UI**
The AI chat quick-log feature exists in code but has no visible entry point on the main screen. It needs a persistent, obvious access point — discuss placement (floating button, bottom bar item, top of Logging page, etc.).

**H-03 — Create a dedicated "Logging" page**
Move the detailed daily data-entry form off Home and onto its own tab or screen. The Logging page presents two modes: quick (chat-driven) and detailed (manual form). Both modes should have full feature parity — anything you can log in the form, you can log via chat, and vice versa.

**H-04 — Remove inline symptom entry; move to chat flow**
The current symptom quick-add form (type, severity, duration, note) is too much friction for brief symptoms. Remove it from the logging form. Instead, the chat should handle symptom intake conversationally: user says "I'm nauseous", chat asks for intensity (1–5), follows up on duration, and stores the record. The notes field is unnecessary in that flow.

**H-05 — End-of-day macro logging notification via chat**
The chat should send a push notification at end of day prompting the user to log macros (protein / calories) if they haven't already. Tapping the notification opens the chat pre-prompted with the macro question.

**H-06 — Lab results: photo and PDF upload in Logging**
The Logging page should offer a way to upload lab results — either as a photo (camera or gallery) or a PDF. The AI layer will parse the values. Exact UI placement to be specced.

---

## Protocol

**P-01 — Move non-protocol items to a Settings page**
The Protocol tab currently mixes compound management with app-wide settings (notifications, integrations, body composition questions, privacy, my data). Extract all non-protocol items into a dedicated Settings screen / tab. Protocol stays focused on compounds, dosing, inventory, and reconstitution.

**P-02 — Inventory summary at top of Protocol**
If the user has logged inventory, display a compact chart or table at the top of the Protocol screen showing current stock levels (vials, consumables, amounts remaining). If no inventory is logged, this section is hidden entirely — no empty state shown.

**P-03 — "Add compound" button with auto-reconstitution suggestion**
Replace the current compound add flow with a dedicated screen opened by a prominent "Add compound" button. The screen walks through: compound, dose, unit, route, frequency, start date. As part of the dose entry, when the compound is an injectable peptide with a known vial size, automatically calculate and display the suggested BAC water volume and concentration — no extra user input required. Example: 3 mg dose, 30 mg vial → system shows "Add 3 mL BAC water → 10 mg/mL → draw 0.3 mL per dose". This replaces / integrates the current reconstitution calculator.

---

# Beta Round 2 (added 2026-07-14)

## Protocol

**P-04: Off-cadence dose silently re-anchors a recurring schedule** FIXED 2026-07-16 (src/lib/dose-schedule.ts: anchored slots + off-slot prompt)
For an interval/cadence compound (e.g. testosterone every 3 days), "due" is computed from the *last actual logged dose* (`today-doses.tsx`: `daysSince = daysBetween(lastBeforeToday, today)`, due when `daysSince >= interval`). So if the user logs a dose a day early (took it early for whatever reason), the whole cadence slides forward: the app re-anchors to the early dose and won't flag the originally-scheduled day.
Desired: the schedule should be anchored to a fixed reference (protocol `startedAt` + N·interval), and a logged dose *completes the nearest scheduled slot* rather than moving the anchor. When a dose lands off the expected slot, **ask before adjusting**: a prompt like "Did you take [Wednesday]'s dose early, or is this an extra dose?" with keep-schedule / shift-schedule / extra-dose. Never silently re-slide. Note this only affects the interval (`frequency`) model; the weekday (`doseDays`) model is already anchor-stable. Spec discussion should decide whether to migrate interval compounds onto an anchored-interval representation vs. patch the due calc.

**P-05: Reactive "why are you skipping doses?" nudge** SHIPPED (simple version) 2026-07-16; Wave 3 context-memory upgrade pending
When N consecutive scheduled doses are missed (threshold TBD in spec; likely 2–3), Pepi should reach out reactively: an in-app notification that deep-links into the Pepi chat and asks, non-judgmentally, why doses are being skipped (ran out, side effects, intentional break, forgot). This is an instance of the anomaly-detector + context-memory pattern (see `docs/notes/beta-notes-2026-07-12.md` §3.4): the answer becomes context Pepi remembers (e.g. "intentional deload" suppresses future nudges; "ran out" ties to the low-stock inventory flag). Respects the coaching level and is rate-capped like all proactive pings. Uses the existing notification + chat-deeplink primitives (`notification-manager.tsx`, typical-day opener pattern).

---

_All issues ready to spec. Start wherever._

---

# Beta Round 3 (device testing, added 2026-07-21)

First on-device test of the Wave-7 build (v0.0.33) on Android. Bugs from the owner.

**B3-01: Camera quality score locked (now 30, regardless of the shot)**
The capture score no longer varies with what's photographed (was pinned at 67 before
the `checkFit` confidence fix; now pinned at 30). Root: the hand-built quality score
(ghost comparability + tilt) is fragile — with framing now correctly excluded when the
ghost can't be read, only tilt drives the number, and it isn't moving. Bigger picture:
the from-scratch capture chrome + custom numeric score is the fragile part. See the
**camera-rework** note below. Needs device investigation + likely a rework, not another
point patch. DEVICE.

**B3-02: Journal week strip not rendering on native (Android)**
The chamfered day cells collapse on device — only the logged dots + the completeness
row show; no weekday labels, day numbers, or cell boxes (see owner screenshot). Web
renders correctly, so this is a native ChamferBox flex-sizing bug: `dayFill: {flex:1}`
passed to ChamferBox doesn't get a measured height on native, so the SVG polygon +
content collapse. Fix: give the WeekStrip cells an explicit height (or aspectRatio) so
ChamferBox measures reliably. `src/components/journal-primitives.tsx`. Fixable now
(reasoned), verify on next build.

**B3-03: Health Connect data-source row crashes the app (Android)**
Tapping the Health Connect entry in Settings → Data sources crashes the app. Likely the
Health Connect native module isn't installed/available (only Apple Health is registered;
`nativeReady: false`) and a native call throws unguarded — or the tap invokes something
that assumes a provider that isn't present. Owner had the iOS Health plugged into an
iPhone at the time (probably unrelated — an Android tap shouldn't reach iOS HealthKit).
Needs a guard + device investigation. `src/features/settings/integration-settings.tsx`.
DEVICE.

**B3-04: Journal empty-state + log-action placement**
Three tweaks to the Journal: (1) when a day has no data, render placeholder/skeleton
rows so it looks intentional instead of a bare box; (2) move the log action to a **button
above the check-in header** instead of the bottom anchor; (3) relabel to "add to this
day" or similar. `src/features/journal/journal-screen.tsx`. Fixable now (web-verifiable).

**B3-05: Journal missing the settings gear (top-right)**
Other tabs carry a settings gear top-right (see Today's header); the Journal doesn't.
Add it, matching the placement/opener the other tabs use (`openSettings`).
`src/features/journal/journal-screen.tsx`. Fixable now (web-verifiable).

**B3-06: Sign-out (Android) doesn't return to an auth screen**
After signing out, the user stays inside the app; they expect to land on a login/sign-up
page. Tension to resolve: the app is **local-first** (usable with no account), so item 33
kept the user in-app on sign-out *by design* ("your data stays"). The owner expects a
normal logout that exits to an auth gate. PRODUCT DECISION: does sign-out route to the
auth screen (with a "continue without account" escape), or is the current stay-in-app
correct and only the messaging is off? Decide before coding.

**Camera-rework (owner question 2026-07-21): reuse a library's capabilities, not a
from-scratch capture UX.** The app already ships the capable camera lib
(`react-native-vision-camera`, used for the face session) but the capture *chrome* is
hand-built, so it lacks pinch-to-zoom and volume-button shutter, and the custom quality
score is brittle (B3-01). Direction to evaluate: consolidate both sessions onto
vision-camera (retire the expo-camera body path), wire its native **zoom** (prop + pinch
via the already-installed gesture-handler) and a **volume-button shutter** (a small
listener lib), and replace the fragile numeric score with something robust or lean on
vision-camera's own focus/exposure signals — the ghost overlay (the real consistency USP)
and the AI prompt stay. Caveat: vision-camera@5.0.11 has the known native-config
fragility noted in CLAUDE.md (no `app.plugin.js`; frame-processor flags need device-build
enablement), so this is a native rebuild + device-test effort.
