# PepiProgress — Design Fix Implementation Plan

> Turns [DESIGN-ANALYSIS.md](DESIGN-ANALYSIS.md) into an executable sequence. The four big changes were
> discussed and folded in (see **Decisions** below). Phases run A → H.
>
> Effort: S (under ~1h), M (a few hours), L (a day+). Each item names the issue it closes from the analysis.

## Decisions (locked 2026-06-23)

- **Home IA:** 3 tabs — Today / Photos / Protocol (photos become first-class; check-in becomes a focused task).
- **Type system:** migrate everything to the instrument scale now + author DESIGN.md.
- **State matrix:** full pass now across all interactive controls.
- **i18n:** AI translation pass now (Claude), flagged for human review before public launch.

**Sequencing rationale:** foundations first (A-C), onboarding is independent so it slots early (D), then the
structural Home pivot (E) so AI-robustness and adherence work (F-G) lands in the final structure. The i18n
pass is **last** (H) so we translate once, after every new/renamed string from D-G exists.

---

## Phase A — Token foundations (unblocks everything) ✅ done

| # | Change | Files | Effort | Closes |
|---|--------|-------|--------|--------|
| A1 | Darken `textMuted` + `label` until body text clears 4.5:1 and 10px text clears ≥3:1 (both themes); keep them quieter than `textSecondary`. Verify vs `#F0EFEC` / `#131210`. | `constants/theme.ts` | S | P1 contrast / easy win #1 |
| A2 | Replace the hardcoded `#3c87f7` in `linkPrimary` with a theme token. | `components/themed-text.tsx`, `constants/theme.ts` | S | minor / easy win #3 |
| A3 | Add a **secondary** button variant (outlined/sunken, not filled) + lock the action-affordance vocabulary: primary = filled, secondary = outlined, tertiary = text link. | `components/form.tsx` | S–M | enables P2 affordance, D2 |

**Exit:** muted text legible, no off-brand color, a secondary action style exists.

---

## Phase B — Type-system migration + DESIGN.md (BC2) ✅ done

| # | Change | Files | Effort | Closes |
|---|--------|-------|--------|--------|
| B1 | Migrate onboarding, quick-log, and insights off the legacy sans scale (`title`/`subtitle`/`default`/`small`/`smallBold`) onto the instrument scale (`display`/`body`/`mono`/`label`). | `features/onboarding/*`, `features/chat/quick-log.tsx`, `features/insights/insights.tsx` | M | P1 two type systems |
| B2 | Once nothing references them, delete the legacy `ThemedTextType` entries (or mark clearly deprecated if any third-party screen still needs them). | `components/themed-text.tsx` | S | P1 / consistency |
| B3 | Author **DESIGN.md** (run `impeccable document`): colors, the instrument type scale, spacing/radii tokens, the primitive components, and the affordance vocabulary from A3. | `DESIGN.md` (root) | M | big change BC2 |

**Exit:** one type scale across the app; the design system is documented so future work stops drifting.

---

## Phase C — Component state matrix, full pass (BC4) ✅ done

Every interactive control gets the full set: default / focus / active / disabled / loading / error (where applicable).

| # | Change | Files | Effort | Closes |
|---|--------|-------|--------|--------|
| C1 | `LabeledInput`: focus ring (`onFocus`/`onBlur`) + `error` prop (red border + message). | `components/form.tsx` | M | P2 form states |
| C2 | `PrimaryButton` + `SecondaryButton`: real `loading` state (inline spinner + disabled), replacing manual label swaps. | `components/form.tsx`, callers | M | minor / consistency |
| C3 | Chips (`OptionChip`), `ScaleSelector`, `StatusPill`, and bare `Pressable`s: ensure visible pressed/disabled states and `accessibilityState` everywhere. | `components/form.tsx`, `components/surface.tsx`, feature pressables | M | BC4 |
| C4 | Inline-validate weight (reject non-numeric / out-of-range rather than silently dropping). | `features/checkin/daily-checkin.tsx` | S | P2 error prevention |

**Exit:** no control ships half its states; daily-used inputs validate and give feedback.

---

## Phase D — Onboarding correctness (independent of Home IA) ✅ done

| # | Change | Files | Effort | Closes |
|---|--------|-------|--------|--------|
| D1 | Require ≥1 goal before continuing (disable Continue, or surface the specced "I'm not sure" path from area 02). | `features/onboarding/onboarding.tsx` | S | P2 / easy win #4 |
| D2 | Style onboarding **Back** as secondary (uses A3). | `features/onboarding/onboarding.tsx` | S | P2 / easy win #2 |
| D3 | Progress indicator across **all 7 steps** (the 3 consent steps currently show none). | `features/onboarding/*` | M | minor |
| D4 | Remove the dead `FULL_SCREEN_STEPS` + `void` workaround. | `features/onboarding/onboarding.tsx` | S | minor |

**Exit:** no empty-profile dead end, clear Back/Continue hierarchy, honest progress, no dead code.

---

## Phase E — Home IA re-architecture (BC1) — the structural pivot ✅ done

| # | Change | Files | Effort | Closes |
|---|--------|-------|--------|--------|
| E1 | Add a third tab: **Today / Photos / Protocol**. | `components/app-tabs.tsx`, `app/`, tab icons, `i18n` `tabs.*` | M | P1 USP buried |
| E2 | Extract Progress Photos out of the check-in into the **Photos** tab as a first-class destination. | new `app/photos.tsx` (or route), `features/photos/progress-photos.tsx`, `features/checkin/daily-checkin.tsx` | L | P1 USP buried |
| E3 | Slim the check-in to a focused, completable **Today** task (essentials first; move bloodwork/customize/history into a less prominent position or disclosure). | `features/checkin/daily-checkin.tsx` | M | P2 cognitive load |
| E4 | Give **Insights** a clear home (Today summary card linking out, or a section on Photos), no longer buried at the bottom of the check-in. | `features/insights/insights.tsx`, placement | M | P1/usability |

**Exit:** the wedge is a primary destination; the daily loop is a task, not a catch-all canvas.

---

## Phase F — AI surface robustness ✅ done

| # | Change | Files | Effort | Closes |
|---|--------|-------|--------|--------|
| F1 | Inline **Retry** on AI failures (quick-log, insights, photo analysis) instead of a dead sentence. | `features/chat/quick-log.tsx`, `features/insights/insights.tsx`, `features/photos/progress-photos.tsx` | M | P2 / easy win #7 |
| F2 | Differentiate error states: not-configured vs network vs server, distinct copy. | F1 surfaces + `lib/ai.ts` | M | P2 error recovery |
| F3 | Rename "What changed" to concrete copy ("Correlations" / "What moved together"). | `features/insights/insights.tsx`, `i18n` keys | S | easy win #5 |
| F4 | Replace bare spinners with skeletons where the load is content-shaped (insights answer, photo analysis). | F1 surfaces | M | minor |

**Exit:** AI failures are recoverable in place and clearly explained; loads don't jump layout.

---

## Phase G — Adherence & feedback loop ✅ done

| # | Change | Files | Effort | Closes |
|---|--------|-------|--------|--------|
| G1 | Quiet **"saved"** microconfirmation on the check-in (autosave is invisible today). | `features/checkin/daily-checkin.tsx` | S | minor / easy win #6 |
| G2 | A small **earned end-of-check-in moment** (peak-end): one-line reflection or a nudge toward the photo timeline once today's essentials are logged. | `features/checkin/daily-checkin.tsx` | M | adherence |
| G3 | Quiet **cloud-sync status** indicator (synced / syncing / offline). | `lib/cloud-sync.tsx`, small status component | M | minor |

**Exit:** the daily loop confirms itself and gives a reason to return; backup is visibly trustworthy.

---

## Phase H — i18n full translation pass (BC3) — last, so we translate once ✅ done

| # | Change | Files | Effort | Closes |
|---|--------|-------|--------|--------|
| H1 | AI translation pass (Claude) over every key that is still an English placeholder in es/fr/de/pt/ru, including all new/renamed strings from A-G (tabs, errors, retry, saved, adherence, renamed actions). | `i18n/locales/{es,fr,de,pt,ru}.json` | M | big change BC3 |
| H2 | Mark the pass as machine-translated pending human review (a note in each file header or a tracking doc); keep the key-parity CI green. | `i18n/locales/*`, `docs` | S | BC3 quality gate |

**Exit:** all 6 languages are real for beta; flagged for human review before public launch.

---

## Execution notes

- **Order:** A → B → C → D → E → F → G → H. A unblocks B/C; D is independent; E is the structural pivot so
  F/G land in the new layout; H is deliberately last.
- **Green gate per phase:** typecheck / lint (incl. no-hardcoded-string) / i18n key-parity (6 locales) / web export.
- **No device or external account needed** for any phase. (Terra creds, Apple build, etc. are unrelated tracks.)
- **Re-run** `impeccable critique` after E and after H to confirm the score moves (target: 26 → 32+).
