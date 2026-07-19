# Android beta findings, 2026-07-18

First real Android device session (Moto G60s, internal testing build) after Google/Apple auth
landed. Raw owner findings, captured for triage.

---

## ⚠️ DISCLOSURE: discuss every bullet before any plan is written

**No implementation plan, wave assignment, or effort estimate is to be produced from this
document until EVERY bulleted item below has been individually discussed with the owner and
driven to an explicit decision.**

This is deliberate. Several items below look like small fixes but are actually forks with real
product consequences (the button-system standardization touches every screen; the dose drawer
changes a core logging flow; the optimization round may require an AGP/R8 upgrade that affects
the whole build). Guessing at intent here would bake wrong assumptions into a large diff.

Per the standing working-style rule, the output of each discussion is a *decision*, not a
parking lot. Items carry hypotheses below to make the conversation faster, but **a hypothesis is
not a decision** and none of them are approved.

---

## 🚩 Flagged: two items that are bigger than they look

Both are buried inside bullets below, surfaced here because they carry dependencies that could
reshape sequencing and cost. Neither is a decision yet.

### A. The OAuth branding fix (item 3) is a paid add-on with a blast radius

Removing `pjdbxnycrvibmebfumel.supabase.co` from Google's notification email and the OAuth
consent screen requires putting a **custom domain in front of Supabase Auth**. That is:

- A **paid Supabase add-on**, not a config toggle.
- A **callback URL change everywhere it is registered**, and each one breaks auth if missed:
  - Google Cloud console authorized redirect URIs (web client)
  - Apple **Services ID** return URL
  - the **Apple client secret JWT we generated 2026-07-18** (its `sub` is the Services ID; the
    Services ID's registered return URL must match the new domain), so the secret likely needs
    regenerating, see [[apple-oauth-secret-renewal]]
  - Supabase redirect allow-list
- Doing this *after* testers have accounts is fine for identity (the Supabase user IDs do not
  change), but every provider config must land in the same window or sign-in breaks mid-beta.

**Therefore:** decide this before, not after, we widen the tester pool. Doing it once, early, is
cheap; doing it twice or mid-beta is not.

### B. The performance round (item 9) may not be one workstream

Play Console's advice is "upgrade to AGP 9 and use R8." But **Expo SDK 56 pins its own Android
Gradle Plugin version**, so AGP 9 may not be freely selectable without either an Expo upgrade or
ejecting from the managed toolchain. That is a build-system decision, not a perf tweak.

**Therefore:** treat build-level (AGP/R8/shrinking/obfuscation) and runtime-level (our own render
cost) as **two separate tracks that can proceed independently**. The runtime track needs a
profile first and is not blocked on any toolchain decision; the build track may be blocked
entirely until an Expo SDK bump. Do not bundle them into a single "optimization" estimate.

---

## 1. Onboarding dark mode is too dark (buttons barely legible)

Moto G60s, dark mode, onboarding. Buttons are close to unreadable against the background.

- Owner's proposed direction: use a **library for the social sign-on buttons** (the vendors'
  official/default buttons) instead of the current custom `SocialButton`.
- Note: Apple already ships `AppleAuthentication.AppleAuthenticationButton` (we use it on iOS).
  Google has an official branded button in `@react-native-google-signin/google-signin`.
- **To discuss:** vendor buttons everywhere vs fixing our contrast tokens vs both. Vendor buttons
  also carry brand-compliance benefits for store review, but they will not match the instrument
  design language. This is an aesthetic-vs-compliance fork.

## 2. Does onboarding use the same colors as the main app?

Audit request: verify onboarding pulls from the same theme tokens as the rest of the app, or
whether it has drifted to its own palette.

- **To discuss:** if drifted, whether to unify onto the main tokens or intentionally keep a
  distinct onboarding treatment.

## 3. Google sign-in flow breaks on Android (redirect + branding)

Two separate defects in one flow:

- **Redirect dead-end.** The OAuth flow ends on `http://localhost:3000/#access_token=...`
  instead of closing the browser, returning to the app, and signing in. Had to fall back to
  email. Supabase *did* create the account (provider list shows `email` + `google`), so the
  server side worked and only the client return leg failed. Strongly suggests the browser-based
  fallback path ran instead of the native `GoogleSignin` path (native returns an idToken with no
  redirect at all), and/or the Supabase redirect allow-list still points at `localhost:3000`.
- **Branding leak in the Google notification email.** The mail reads "you used Sign in with
  Google to sign in to `pjdbxnycrvibmebfumel.supabase.co`". Owner does not want the project URL
  exposed to testers.
  - Fixing this means putting a **custom domain** in front of Supabase Auth (paid add-on) so the
    OAuth consent + notification show a Pepi domain.
- **To discuss:** whether the custom domain happens now (cost, and it changes the callback URL
  everywhere: Google console, Apple Services ID return URL, the Apple client secret's audience)
  or is deferred past closed beta.
- ⚠️ **Security note:** the failing URL pasted during triage contained a live access token,
  refresh token, and Google provider token. Not recorded here. Owner advised to revoke sessions.

## 4. Photos do not download after signing in

App reports 7 photos but none render after sign-in on a fresh device.

- Consistent with the known gap in CLAUDE.md: the `user_state` snapshot carries **local file
  URIs**, which are meaningless on a second device. Cross-device photo display needs the
  `cloudPath` → signed-URL path to be the source of truth on restore.
- **To discuss:** this is the "storage hardening" item already deferred to Polish. Does it get
  pulled forward now that cross-device is a live beta scenario?

## 5. Logging out does not log out

Sign-out turns off cloud sync but leaves the user in the app with local data; it does not return
to the auth screen.

- **To discuss:** intended behavior. Options: (a) full sign-out returns to auth and clears local
  state, (b) sign-out returns to auth but *keeps* local-first data (the app is usable with no
  account by design), (c) offer both ("sign out" vs "sign out and erase this device"). Option (b)
  vs (c) matters because wiping a local-first user's data on sign-out would be destructive.

## 6. Dose logging should become a small drawer

Requested shape:

- Compound name shown.
- Dose **fully editable**. If the user overrides the dose, ask whether to apply the change to
  **all future doses** (i.e. edit the protocol item, not just this event).
- Dose **date/time editable**, opening the **native** time picker (hour + minute) and a day
  picker.
- **To discuss:** the "change all future doses?" prompt is a protocol mutation from inside a
  logging flow. Needs a decision on wording, default, and whether it also rewrites already-logged
  history (it must not, presumably). Also whether this replaces the current tap-to-confirm
  one-tap logging or sits alongside it, since one-tap speed is a deliberate feature.

## 7. Standardize buttons; kill the stray anchors; wrong font in shared dialogs

From the "log a photo" screenshot, which is a component reused in several places:

- It renders in **Roboto** (the Android system default), not our typeface. Any text not going
  through `ThemedText` is falling back to system font.
- The "Cancel" **anchor** should be a **button**. More broadly: "we have a ton of anchors spread
  throughout the app which makes it feel unfinished."
- Requested standard, mirroring the Home page hierarchy:
  - **Primary action:** black in light theme, white in dark theme.
  - **Secondary action:** a semi-matching shade of the background (light theme: white; dark
    theme: dark grey, lighter than the background).
- **To discuss:** this is a design-system change that touches nearly every screen. Needs an
  agreed component API (`PrimaryButton` / `SecondaryButton` / when a text link is still legit)
  before any sweep, plus a decision on whether the sweep is one big pass or incremental.

## 8. Permission-grant button has wrong padding

From the "Camera access lets you take consistent progress photos" screenshot: the ENABLE CAMERA
button's padding is visibly off (text nearly touching the chamfer edges).

- Owner request: **document the padding architecture in the design doc** so button padding is
  standardized and this class of bug stops recurring.
- **To discuss:** where this lives (`DESIGN.md` vs `docs/spec`), and the actual scale (a padding
  token set tied to `Spacing`, with per-component minimums).

## 9. Optimization round (Android performance)

Play Console reports: **App optimization: Low**, Optimization score `-`, Obfuscation score `1%`,
Shrinking score `-`, R8 configuration `-`, with "Upgrade to AGP version 9.0 and use R8 to get the
best performance."

Owner's lived experience matches: tapping and page changes "take ages" on the Moto G60s.

Two distinct workstreams, do not conflate:

- **Build-level:** AGP 9 upgrade, R8 full mode, shrinking/obfuscation, ProGuard rules. Expo SDK
  56 pins its own AGP; this may not be freely upgradable.
- **Runtime-level:** our own render cost. Candidates to measure (not assume): re-render storms
  from the single large store context, `useResolvedUris` over all photos, unmemoized list
  rendering, the instrument background SVG/chamfers, navigation transition cost.
- **To discuss:** scope and sequencing. Profiling must come first; optimizing without a profile
  is guesswork. Also whether this becomes its own wave.

## 10. Pepi chat: hide suggestion pills + Android keyboard behavior

- Hide the pill suggestions once the user is actively chatting.
- The text box does not "scooch" up when the keyboard opens on Android. Possibly Android-only,
  though it was flagged on iPhone previously too.
- **To discuss:** whether pills hide on first message, on input focus, or on any typing; and
  whether the keyboard fix is a `KeyboardAvoidingView`/`softwareKeyboardLayoutMode` config change
  or needs the newer keyboard-aware approach.

---

## Cross-cutting observations

- Items 1, 7 and 8 are all facets of one thing: **the design system is not being applied
  uniformly**, and the gaps show hardest on Android where system defaults (Roboto, native
  contrast) leak through. Worth deciding whether these are handled as one "design system
  enforcement" pass rather than three separate fixes.
- Items 3, 4 and 5 are all facets of **the account lifecycle being under-tested** end to end on a
  real second device. Worth one deliberate auth/sync hardening pass.
