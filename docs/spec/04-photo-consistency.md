# 04 — Photo Consistency (the USP)

The differentiator. Two layers; **both ship in MVP (V1)** — the wedge is "AI analyzes your pics," so the AI analysis can't wait for V2.

## The problem
People take progress photos in a "set spot," but lighting, distance, angle, and pose drift day to day — so before/afters are misleading. We make them genuinely comparable.

## Layer 1 — Capture-time guidance (MVP, on-device, no AI)
When taking a photo, overlay live aids using the device + the user's prior photo:
- **Ghost overlay** — semi-transparent previous photo aligned on screen; user matches their position to it.
- **Level / angle indicator** — from the accelerometer/gyro; warn if tilt differs from baseline.
- **Distance hint** — face/body bounding box size vs. baseline (on-device detection), "step closer/back".
- **Brightness reading** — average luma; "too dark / too bright vs. your usual."
- Photo "session" types: **face** and **body**, each with its own baseline.

Output: every photo stores capture metadata (lighting, distance proxy, tilt, timestamp, session type). Clean inputs make Layer 2 trustworthy.

## Layer 2 — AI analysis (MVP/V1, server-side, Claude vision)
- **Drift score** — compare new photo to baseline for lighting/distance/angle; flag "retake" when off.
- **Visual-change estimation** — qualitative progress between two comparable photos (skin clarity, rough body-comp change). Always hedged, never a medical claim.
- **Auto-align / normalize** — optional crop/level/white-balance to a canonical frame for the timeline.
- Runs async via edge function (10); image never leaves our infra to 3rd parties beyond the model call.

## Timeline / compare UI
- Side-by-side and slider compare, restricted to *comparable* photos (similar drift score) so the comparison is honest.
- "Comparability badge" on each photo.

## Storage & privacy (locked)
Photos must be **stored** (process-and-discard is incompatible with ghost-overlay + face/skin-over-time tracking — both need the prior image persisted). So storage is hardened instead:
- **Private by default, always.** No photo is ever shown to anyone but the user unless they explicitly make it public per-photo (and only if community sharing ships — see 14; gated behind hard age verification, 11).
- Separate **hardened encrypted bucket**, strict per-user RLS, short-lived signed URLs, server-side encryption at rest (10).
- **We store, but we don't train.** Photos are used for *inference* (extract measurements/scores) + the user's own timeline/ghost overlay — **never** for model training. The model provider (Anthropic API) must also not train on them (contractually true by default). User-facing message: *"stored privately, just for you; we measure changes from them but never use them to train AI."* (Do not claim "we don't store your face" — we do, for the user.)
- **No blurring at MVP** (private photos don't need it); **blur is the tool reserved for any future public sharing**, applied to faces/identifying features then.
- Biometric PII under GDPR/BIPA — explicit, separate consent for storage + AI processing + any community use (11). Hard rules unchanged: no diagnosis; visual-change language is observational.

## Age gate (locked — see 11)
**Tiered:** DOB gate + 18+ store rating for private app use; escalate to third-party age verification only before a user can make a photo public.

## Adaptive capture (locked)
Capture mode adapts to confidence + hardware:
- **Auto-capture** fires the shutter automatically when framing/lighting/alignment confidence is high *and* the device camera is capable.
- **Manual fallback** — if confidence is low (poor alignment/lighting) or the camera hardware is weak, drop to manual shutter with the ghost overlay still guiding. Never block the user from capturing; just stop auto-firing when we can't trust it.
- User can always force manual.

## Decisions (locked)
- **Capture: adaptive auto + manual fallback** (above).
- **On-device detection:** `react-native-vision-camera` frame processors (MLKit/equiv) for face/body bounding box + alignment. *(Engineering choice — revisit if a better RN/Expo lib fits.)*
- **Comparability threshold:** start lenient and tunable — warn rather than hard-block a compare; surface the comparability badge so the user judges. Tighten as we gather real drift data.
