# Beta feedback, round 2 (2026-07-10)

Owner feedback batch. Status: **recorded, under discussion. No code changes yet.**
Each item below carries the feedback, what the code does today, a proposed direction, and the open question to settle before building. Once discussed, decisions get locked here and items graduate into implementation.

---

## Pepi (chat)

### P-1. Smarter answers for off-card questions
**Feedback:** "If I ask something that isn't the card, it struggles or errors out. Example: 'have I exercised less lately?' I would expect a week to week comparison even if it's a partial week."

**Today:** routing is quick-log parse first, then the deterministic `matchQuery` intent matcher (`src/lib/ask/intent.ts`), then a dead-end "not understood" reply. There is no AI fallback for data questions, even though the `insights` edge action (Q&A mode, capable model) already exists and takes the full history.

**Proposed:** add a third routing tier: when the parse finds nothing to log and `matchQuery` misses, send the question to the `insights` `qa` action with the assembled history (same data facade as A-4). Deterministic stays first (free, instant); AI catches the long tail like partial-week comparisons.

**To discuss:** cost gate. Every miss becomes a capable-model call. Cap per day? Haiku first with Sonnet escalation? Or just ship it and watch spend?

### P-2. Rich metric answers (explanation + chart + projection)
**Feedback:** "For 'how's my weight loss going' I would expect a fancy explanation and maybe a chart with a smart projection."

**Today:** R2-F locked "no charts in chat, Analysis owns every chart." Answers are one mono data line. The verdict engine already computes a hedged days-to-target forecast (`weightForecast`) but only the Home hero shows it.

**Proposed:** a `chart` message variant in the Pepi thread: sparkline (reuse `LineChart`/`sparkline.ts` + `buildMetricSeries`), the verdict explanation line, and the existing forecast when available. Projection stays the engine's hedged observed-pace math (legal rung 1), never an AI-invented number.

**To discuss:** this reverses the R2-F "no charts in chat" decision. Confirm the reversal, and whether the chart taps through to the Analysis signal detail.

### P-3. Pepi can see photo results
**Feedback:** "It needs access to photo results. Right now it's blind to them."

**Today:** `PhotoEntry` carries `driftScore`, `comparable`, `lighting`, and the AI change note, but neither the chat's deterministic ask engine nor the `insights` history assembly includes photos.

**Proposed:** add a compact photo digest (per session/part: last capture date, comparability, latest hedged change note) to `InsightHistory` and to the P-1 Q&A context; add a deterministic intent for "when was my last photo" style questions.

**To discuss:** does the change note text go to the AI as-is (it is already hedged and identity-free), or only numeric metadata?

### P-4. Keyboard handling
**Feedback:** "If I open the keyboard, it goes over everything. It should move the text box up, auto scroll down the conversation, and hide the template cards."

**Today:** `pepi-chat.tsx` has no `KeyboardAvoidingView`; chips row always renders.

**Proposed:** wrap in `KeyboardAvoidingView` (padding behavior, iOS offset), auto `scrollToEnd` on keyboard-show, hide the chips row while the keyboard is up. Pure UI fix, no discussion blocker beyond confirming chips should be fully hidden vs collapsed to one row.

### P-5. Interface cleanup
**Feedback:** "The interface needs a clean up."

**To discuss:** need specifics from the owner (screenshot or a list). Candidates: chips crowding, bubble density, header. Parked until the walkthrough.

---

## Home

### H-1. Hero footer: what is tracking
**Feedback:** "Hero metric should have a small footer saying what's tracking."

**Proposed:** one mono footer line under the hero naming the tracked signal set, e.g. "tracking weight, waist, energy (3 signals)" from `verdict.signals`. Copy through i18n, instrument voice.

### H-2. Mixed verdict says what is throwing it off
**Feedback:** "When signals are mixed, description should say what specifically is throwing things off."

**Today:** the `watch` explanation is a generic template. The engine already computes `role: 'drags'` per signal plus `explained` annotations; the strongest drag is only used for the reconciliation line.

**Proposed:** when state is `watch`/mixed, name the top dragging signal(s) in the explanation ("mixed: soreness and sleep quality are pulling against an otherwise good week"), reusing the existing drag/explained machinery. Template-driven, no AI needed.

---

## Analysis

### A-1. BUG: "hips up" reads as good for a male fat-loss user
**Feedback:** "Why is hips up a good sign? User is a male with a fat loss goal."

**Today:** the verdict engine resolves body-comp metrics to `down_good` whenever there is body intent, so hips up should read bad (weight 0.25 for males, but still bad). The user saw it presented as good, which means some surface (Analysis signal row tone, chart delta arrow, or insights copy) has its own direction logic that bypasses the engine.

**Proposed:** reproduce, find the second codepath, and delete it in favor of the engine's favour resolution. This is the concrete proof for A-4 (one source of truth).

### A-2. "What moved together" is buried; reuse it in chat
**Feedback:** "Insights - what moved together - could be reused. It's hidden in the middle of nowhere."

**Proposed:** surface correlation output as (a) a Pepi ask-chip ("what moved together?") answered via the same correlation path, and (b) possibly a card on Analysis. Depends on P-1 routing landing first.

### A-3. Insights trends ignore integration data
**Feedback:** "Trends only use app data, not integration data. Same issue we had for the charts. That chart bug was fixed so check the logic there."

**Today:** the Insights chart section already uses `buildMetricSeries` (fixed). But the AI insights history assembly (`insights.tsx` buildHistory) maps raw `metricReadings` and manual check-ins separately: no derived metrics, no estimated-mode handling, and its own truncation rules. The AI is reasoning over a different dataset than the charts show.

**Proposed:** rebuild `InsightHistory` from `buildMetricSeries` output (same series the charts render), so what the AI sees is exactly what the user sees. Also fixes the trends window when no protocol `startedAt` exists (verify `windowStart: undefined` behavior).

### A-4. Architecture: single data facade
**Feedback:** "We need to start turning things into stores/components so the different services and prompts use the same data sources and rules always."

**Today:** `buildMetricSeries` (chart-series.ts) is already the canonical series builder, and `computeVerdict` the canonical judgement, but consumers still hand-roll: insights history (A-3), Pepi's ask executor, AI context assemblies, and whatever surface caused A-1.

**Proposed:** one selector module (working name `src/lib/data-facade.ts`): series (manual + synced + derived + estimated mode), verdict, photo digest, protocol context. Every chart, every AI prompt, and every deterministic answer reads from it. Pure functions over the store, unit-tested. This is the enabling work for P-1/P-2/P-3/A-1/A-3.

### A-5. Copy: less clinical, a little warmer
**Feedback:** "Needs data clean up. It's too analytical at the moment. Gotta spruce it up and embellish it a liiitle bit."

**Today:** VOICE.md instrument register, applied strictly. The Analysis tab reads like a lab report.

**Proposed:** a copy pass on Analysis (and verdict explanations) that keeps the instrument voice but adds one interpretive sentence per surface: what the number means for the user's goal, not just the number. AI prose layer (already planned as `explanationKey: 'ai'`) could own the embellishment with the template as fallback.

**To discuss:** how far to push warmth before it fights VOICE.md. Owner examples of "embellished right" would help calibrate.

---

## Photos

### PH-1. Quality highscore: best-quality capture becomes the reference, skin priority
**Feedback:** "If the most recent picture has better lighting, angles, fewer clothes, or better quality overall, use that as the new default quality. If the user is naked, use that as the priority always. Soft lock the user into committing to naked pictures for maximum efficiency and accuracy. Maybe show a 'new quality highscore' when the naked picture is taken."

**Today:** baseline per (session, part) is simply the first photo; ghost + comparisons anchor to it regardless of quality. The vision service returns `lighting`/`framing` but nothing about clothing coverage, and quality never promotes a new reference.

**Proposed:**
- Add a quality score per capture: composite of lighting, framing, drift, plus a new `coverage` field from the vision action (clothed / partial / minimal). Store on `PhotoEntry`.
- When a new capture beats the current reference's quality score, promote it to the ghost/compare reference ("new quality highscore" moment, celebratory but instrument-toned). Minimal coverage always outranks clothed at equal quality; once a minimal-coverage reference exists, clothed captures never displace it (the soft lock).
- Copy must stay tasteful and opt-in in spirit: we explain *why* (accuracy), never demand.

**To discuss:** (a) confirm the vision service should classify clothing coverage (privacy posture is unchanged: private bucket, never trained on, analysis is opt-in consent already collected); (b) does the *baseline* photo swap too, or only the comparison default? Swapping the ghost reference changes what users align against mid-cycle.

### PH-2. Instant post-capture feedback
**Feedback:** "We need feedback after the photo logging is done. Anything that confirms things are working, not only confetti but maybe an initial analysis right out of the gate without having to click for it."

**Today:** save returns to the photos list; the analysis runs only when the user taps compare/analyze.

**Proposed:** on save, auto-fire a first-pass read and show it inline as a result card: comparability badge, one hedged sentence, retake hint if quality is off. Options ordered by cost: (a) reuse the already-computed capture metadata + `checkFit` (Haiku, cheap, instant), (b) full `analyze_photo` (Sonnet) auto-run per save.

**To discuss:** which tier auto-runs. Sonnet per capture is the best experience but the highest recurring cost; Haiku quick-read with a "full read" button may be the right default.

---

## Proposed sequencing (once decisions land)

1. **A-4 data facade** (enables everything; includes A-1 bug hunt + A-3 fix as proofs).
2. **P-4 keyboard** + **H-1 footer** + **H-2 mixed-verdict copy** (small, independent).
3. **P-1 AI fallback routing** then **P-3 photo context** then **P-2 chart messages** (chat brain, in dependency order).
4. **PH-2 instant feedback** then **PH-1 quality highscore** (photos; PH-1 needs a vision-service redeploy).
5. **A-5 copy pass** + **A-2 correlation surfacing** + **P-5 cleanup** (polish batch, after the above settle the surfaces).
