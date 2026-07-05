# Pepi Redesign — Instrument / Verdict-First (implementation plan)

> Status: **proposal, not started.** Explored as a live HTML mock at `.preview-mockup/index.html`
> (throwaway, gitignored). This document scopes turning that direction into the real app. Nothing
> here is built yet. Owner has separate notes on the current mock to reconcile before sign-off.
>
> Cross-refs: extends the "CyberLife Instrument" tokens in [src/constants/theme.ts](../src/constants/theme.ts);
> obeys the locked cross-cutting rules in [CLAUDE.md](../CLAUDE.md) and [docs/spec/SPEC.md](spec/SPEC.md);
> voice per [docs/VOICE.md](VOICE.md). No em dashes in any copy (O-06 guard).

---

## 1. Thesis (the locked direction)

Pepi is not a dashboard. It is a **reassurance instrument**: the user opens it exhausted mid-protocol
and needs one thing answered fast — "is my suffering producing measurable results?" Every screen
serves that by reducing uncertainty, and shows the *conclusion before the data*.

Principles, applied app-wide:

1. **Verdict / evidence-first hierarchy.** Conclusion → evidence → explanation → actions. Never a
   flat stack of equal-weight widgets.
2. **One protagonist per screen.** Exactly one element owns the visual weight; everything else recedes.
3. **No AI-cliché status dots.** The glowing colored dot + bold status word (PeptaBase / PeptIQ look)
   is banned. Certainty is shown as a *reading*, not an LED.
4. **Typography is semantic.** Mono (IBM Plex Mono) = anything measured or computed. Sans (Inter) =
   human prose. This is a hard rule, not decoration.
5. **Monochrome + certainty color only.** Green = evidence supports; amber = needs more / watch;
   red = likely failing. Nothing else gets color.
6. **Descriptive verdicts only (legal "rung 1").** State measured status; never diagnose, predict
   hard outcomes, or prescribe. A mild goal-timeline forecast ("~18 days to target") is allowed.
   Dosing stays deferred app-wide; controlled compounds track-only. Gate enforced at the AI layer.
7. **Two co-equal themes** (at-night + luminous daylight), one engraved treatment.
8. **Faint breathing background** (molecular lattice; logo stand-in until a real mark exists) — barely
   noticeable, desaturated.
9. **No em dashes**, ever, in any string (guard already enforces for i18n).

The signature, only-Pepi interaction: **the verdict reconciles felt-bad against measured-good, and can
be cracked open to show its work** — the weighted stack of signals that produced it. No spreadsheet or
single-metric health app can do this because it fuses subjective + wearable + photo + protocol layers.

---

## 2. Design-system foundation (Phase 1 — app-wide, low risk, no behavior change)

All screens consume these, so land them first. No feature logic changes here.

### 2.1 Tokens — `src/constants/theme.ts`
- **Add a "watch" certainty token** to both themes: `signalWatch` + `signalWatchBg` (amber). Today only
  `signalGood`/`signalBad` exist; the verdict needs a three-state scale (good / watch / bad).
- **Add `lattice` tokens**: the desaturated sage used by the background (a ~50%-desaturated green),
  plus its base opacity. Keep it distinct from `structure` (the existing faint diagonal lines).
- Confirm accent stays monochrome (near-white at night / near-black daylight). Certainty colors are the
  *only* hues in the app.

### 2.2 Typography — `src/components/themed-text.tsx`
- Fonts are already loaded (Inter + IBM Plex Mono). Formalize the **mono = measured / sans = prose**
  rule and audit existing screens for violations (mono used decoratively, or numbers set in sans).
- Add scale entries the mock needs: `hero` (large tabular mono figure, ~46px) and `heroUnit` (small
  mono unit). Keep `display` (sans H1), `metric`, `mono*`, `body`, `small*`.

### 2.3 Background — new `src/components/instrument-background.tsx`
- Tiling molecular-lattice (hexagon + node) rendered with `react-native-svg`, absolutely positioned
  behind screen content, `pointerEvents="none"`.
- **Breathing**: slow opacity + scale pulse (~11s) via `react-native-reanimated` (already a dep chain
  via Expo). Respect `AccessibilityInfo.isReduceMotionEnabled` → static when reduce-motion is on.
- Barely-visible (desaturated `lattice` token, ~0.03–0.07 opacity). Mounted once in the tab/root layout,
  not per screen, so it is continuous behind the app.

### 2.4 Primitives — `src/components/surface.tsx` (+ a few new files)
Restyle/extend existing; add the new verdict pieces:
- **Exists, keep:** `Card`, `Sunken`, `Divider`, `EngravedLabel`, `Metric`, `SignalText`, `StatusPill`,
  `Placeholder`, `Skeleton`.
- **New `HeroFigure`** (`src/components/hero-figure.tsx`): big mono number + unit + a `TrendMarker`
  (▲/▼) whose direction and color come from the engine's favourability flag (green good / amber caution),
  not from the raw sign. Engine-agnostic presentational component.
- **New `ReasonButton`**: the dark, blends-into-canvas secondary action ("See the reasoning →").
- **Primary button** = bright/high-contrast (the `Log` action). Secondary = the blending style. Settle
  the emphasis + copy question (see §7, open item) before wiring globally.
- **Gauge** (`FAIL · WATCH · ON TRACK` level meter): built in the mock, then removed for busyness.
  Keep the component in the library but **not on the Home screen** by default; it is a candidate for the
  decompose screen header. Parked, not deleted.
- Retire the status-dot pattern everywhere it appears (breadcrumbs, cold-start, sync).

### 2.5 Chrome
- **Remove the in-app "SYNCED" indicator** from the top of screens; surface sync state in Settings only
  (see §4.7). The top strip is OS chrome, not app status.
- Header context line condensed to a single mono eyebrow: `DD MMM · <PROTOCOL TYPE> · WEEK N`
  (e.g. `03 JUL · CUT · WEEK 7`). Date rendered from the real day, `DD MMM`.

**Phase 1 exit / green gate:** typecheck, lint (incl. no-hardcoded-string), i18n key-parity (6 locales,
no em dashes), web export. Existing screens still work, now on the enriched tokens. No verdict yet.

---

## 3. The verdict engine (Phase 2 — the core new logic, behind the scenes)

The real engineering. A **pure, deterministic** module plus a **thin AI prose layer**. Build and test it
in isolation before any screen depends on it.

### 3.1 New `src/lib/verdict-engine.ts` (pure, offline, unit-tested)
Inputs (all already in the store / already derived):
- `entries` (manual check-ins), `metricReadings` (integrations),
- `deriveMetrics(...)` output from [src/lib/derived-metrics.ts](../src/lib/derived-metrics.ts),
- photo drift / comparability from the photo features,
- `protocolItems` (→ `startedAt` → cycle week), `symptomEvents`,
- `profile` (goals, sex, dob, units).

Output (one object):
```ts
type Verdict = {
  state: 'building' | 'on_track' | 'watch' | 'off_track';
  confidence: 'low' | 'medium' | 'high';   // from signal count + agreement
  hero: { metricKey: string; value: string; unit: string; favour: 'good' | 'watch' | 'bad'; trend: 'up' | 'down' };
  signals: SignalContribution[];           // the decompose stack (weighted, sign-oriented)
  reconciliation?: string;                 // "dragging signals track training load, not fat regain"
  forecast?: string;                       // optional mild goal-timeline ("~18 days to target")
  explanationKey: 'template' | 'ai';       // how the prose sentence was produced
};
```

### 3.2 Hero-figure selection (engine picks, not the user)
The hero is **whichever signal is most decision-relevant today**, per protocol goals — not always weight.
Ranked by: (a) largest deviation from personal baseline (anomaly), OR (b) the signal most load-bearing for
today's state, tie-broken by goal relevance (a healing protocol favors a recovery/symptom marker; a cut
favors fat-loss velocity or weight; a GH protocol favors sleep/recovery). Must handle **multi-compound**
protocols — the engine reads the active compounds' effect/monitoring tags to weight relevance.

### 3.3 Verdict state + confidence + cold-start
- **Cold-start:** below the observation threshold (reuse the `BASELINE_MIN_SAMPLES` honesty bar from
  derived-metrics) → `state: 'building'`, no verdict, no faked confidence. Hero becomes the photo (or an
  empty photo placeholder + baseline CTA when none exists).
- **Confidence** = function of how many independent signals are present and how strongly they agree.
  Conservative by design: a wrong-but-confident verdict is worse than none.
- **Reconciliation:** identify signals dragging against the verdict; check whether each is *explained* by
  training load (ACWR/TRIMP), cycle week, or a logged compound's known effect. If explained, annotate
  ("expected at week 7") rather than counting it as failure. This is the felt-bad vs measured-good line.

### 3.4 Prose layer — reuse `ai-service` + `src/lib/ai.ts`
- One short **descriptive** sentence per verdict, produced by the existing cheap-model path (Haiku), with
  the observational/no-diagnosis/no-dosing gate reaffirmed in the system prompt.
- **Deterministic template fallback** when AI is unavailable (local-first, no keys) so the Home always
  renders a sentence. The engine output is complete without the AI; AI only prettifies the prose.

### 3.5 Legal gate (reaffirmed)
Descriptive only. No prognosis beyond a mild goal-timeline forecast, no advice, no dosing. Controlled
compounds track-only. Same gate as the current AI service; add a test asserting the engine never emits
prescriptive strings.

**Phase 2 exit:** `verdict-engine.test.ts` green (cold-start, hero selection across goal types,
multi-compound, reconciliation, confidence tiers). Engine is not yet wired to any screen.

---

## 4. Screen-by-screen application (Phases 3–4)

### 4.1 Home / Today — full rebuild (Phase 3) — `src/features/home/dashboard.tsx`
Replace the carousel-of-equal-charts with the verdict-first flow:
1. Eyebrow (`DD MMM · TYPE · WEEK N`) + gear.
2. **Hero figure** (engine-picked) + `favour` trend marker + optional forecast sub-line.
3. **Explanation** (one sans sentence — the old "distillation" finds its home here).
4. **ReasonButton** → decompose screen.
5. **Evidence** (engine-picked: contextual photo compare, or the single most relevant chart) with camera
   reticle framing for photos.
6. **Actions:** primary `Log` + quick `Quick / Photo / Dose`.
The existing 10-day chart window + `chart-series` builder feed the evidence slot; the carousel is retired.

### 4.2 Decompose / reasoning screen (Phase 3) — new `src/features/home/verdict-reasoning.tsx`
The signature interaction. Renders `verdict.signals` as the weighted stack (name, sparkline, weight,
role: supports / drags / neutral) + the reconciliation footer. Reached from the Home ReasonButton and
(recommended) by tapping the hero figure itself, so the signature interaction is discoverable even though
the button is quiet.

### 4.3 Insights tab — `src/features/insights/insights-screen.tsx`
Already refactored this session (shared `chart-series`, protocol-span window, integration + derived data).
Restyle to the instrument language; ensure charts use mono numerals and the certainty palette. The AI
insights surface (`insights.tsx`, `ask-pepi`) becomes "invisible infrastructure" — no "AI" branding.

### 4.4 Check-in / logging — `src/features/checkin/daily-checkin.tsx`
Restyle onto the tokens + primitives (already partly done). Keep frictionless. Fields stay mono for values,
sans for labels. This is where logging happens, so honor the "log and leave" calm (see §7 button question).

### 4.5 Protocol tab — `src/features/protocol/*`
Restyle inventory / dose logging / reconstitution to the instrument surfaces. Attention banner uses the
certainty palette (watch = amber, expired = bad).

### 4.6 Photos — `src/features/photos/*`
Reframe as measured evidence: reticle framing, comparability as a reading, milestones as observations
(not "Photo #14"). Aligns with the Home evidence slot.

### 4.7 Settings — `src/features/settings/*`
New home for the **sync status** removed from the top strip (`settings-screen.tsx`). Theme toggle already
exists (`appearance-settings.tsx`). Restyle.

### 4.8 Onboarding + tab bar
Restyle onboarding chrome to match. Tab bar is already mono/uppercase; verify against the final palette.

---

## 5. Sequencing

| Phase | Scope | Risk | Gate |
|------|-------|------|------|
| 0 | This doc signed off + owner notes reconciled | — | agreement |
| 1 | Design-system foundation (§2): tokens, watch color, hero/reason primitives, breathing background, chrome | low | green gate, screens unchanged in behavior |
| 2 | Verdict engine (§3), pure + tests, no UI | med | engine tests green |
| 3 | Home rebuild + decompose screen onto the engine (§4.1–4.2) | high | on-device verdict correct across states |
| 4 | Propagate instrument language to Insights / Check-in / Protocol / Photos / Settings / Onboarding (§4.3–4.8) | low–med | green gate per screen |
| 5 | Polish: a11y (reduce-motion, contrast), both themes, i18n (6 locales), copy pass | low | full green gate |

Rationale: the visual language (Phase 1/4) is low-risk and independently shippable. The verdict engine
(Phase 2/3) is the real bet and must prove itself in tests before the Home screen depends on it. Do not
big-bang all of it at once.

---

## 6. i18n
Every new string (verdict states, hero labels, reconciliation templates, reason button, forecasts) goes
through `t()` and into all 6 locales in the same commit, machine-translated, **no em dashes**. Verify with
`scripts/check-i18n-keys.mjs` (parity + em-dash guard) before each commit.

---

## 7. Decisions defaulted here (confirm on review — owner has notes)
Per the no-open-questions rule these are **decisions with a default**, not unresolved questions. Flag any
you disagree with:
- **Verdict register = descriptive only (rung 1).** Default locked for legal reasons; going further
  (predict/recommend) is a separate product+legal track, not this redesign.
- **One primary verdict** (not per-goal dashboards). Secondary goals live inside the decompose stack.
- **Cold-start hero = photo (or empty photo placeholder + baseline CTA).** No verdict until the
  observation bar is met.
- **Gauge parked** off the Home (too busy); may return on the decompose header.
- **Logging emphasis / copy — the one genuinely open item.** The mock currently makes `Log` the bright
  button and the reason button quiet, but the product goal is to *encourage logging*, so a shouty
  all-caps `LOG` may fight that. Proposed default: keep `Log` visually present but **medium** weight
  (not the max-contrast slab), and warm the copy (`Log today`) to invite rather than command. Decide at
  sign-off.
- **Hero is engine-picked and multi-compound-aware**, never weight-only.

---

## 8. Definition of done
- All screens on the instrument language, both themes, reduce-motion respected, AA contrast held.
- Verdict engine deterministic + tested; AI prose optional with a template fallback; legal gate tested.
- Home reads verdict → evidence → explanation → actions; decompose interaction reachable.
- Full green gate: typecheck / lint / i18n parity (6, no em dashes) / web export; on-device verdict
  sanity-checked across building / on-track / watch / off-track.
- `docs/spec/SPEC.md` updated so the redesign is the source of truth, not just this plan.
