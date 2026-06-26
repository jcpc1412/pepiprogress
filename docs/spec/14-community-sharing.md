# 14 — Community & Sharing

> **Post-MVP.** This is the heaviest area (moderation + verification + legal), so it ships after the core tracker proves out. It builds on the anonymized data layer (07), not instead of it.

Distinct from **07 (Community Database)**, which is anonymized aggregate *data*. This area is **user-facing social sharing**: people choosing to publish their protocols (and results) for others to see and copy.

## Features
1. **Protocol sharing** — a user publishes a *stack* (compounds, doses, ester, timing, length) for others to view. Built directly on the compound model (08).
2. **Copy-protocol** — one tap to clone a shared protocol into your own (as a draft to edit). The discovery + social-proof engine, à la lifting-app communities.
3. **Before/after photos on a shared protocol** — an initial pic + end-of-protocol pic, so results are visible *regardless of influencer status*. This is the proof and the pull. Also the highest-risk surface → see moderation.
4. **Influencer protocols** — same mechanism, amplified for reach/growth. Subject to the same neutrality rule: presented as *"what this person ran,"* never *"what you should run"* (non-prescriptive, 05/11). No dosing endorsement.

## Hard rule: no vendor/source surfacing (locked)
- Vendor/brand is logged **privately, per-vial** for the user's own quality/batch tracking (03/08) — **never shown on shared protocols.**
- Surfacing a named source on shared content = facilitating sourcing of unapproved/controlled substances. It's the single riskiest thing the app could do (worse than affiliate, which is already off — 12), an app-store removal magnet, and a direct contradiction of the neutrality that *is* the product.
- Only safe community signal: **anonymized, aggregate batch-safety flags** ("a batch from an unnamed source was flagged for X") — never a named, buyable vendor.

## Photo sharing — moderation scales with volume (not all-at-once)
Public before/after photos are the high-risk surface. The stack grows with usage rather than landing fully-built (11, "weight tracks the public surface"):
- **Gate before any photo goes public:** hard **third-party age verification** (Yoti/Veriff/Persona) — escalated from the DOB gate (11). Public sharing is the trigger.
- **Early stage — founder manual review:** at launch volume, the founder eyeballs **every** shared photo before it's public. More reliable than automation when volume is low, and effectively free.
- **As volume outgrows manual:** add an **AI pre-publish screen (05)** (flag likely nudity / manipulation / apparent-minor — a filter, not a verdict), **CSAM hash-matching (PhotoDNA/equiv)** + NCMEC reporting on knowledge (the legally required layer AI can't replace), and a **human review queue** for flags.
- **Blur tool** for faces/identifying features on shared photos (04) — optional for the user, since shared ≠ their private analysis copy.
- Physique pics are app-store-OK if **non-sexualized + moderated** (fitness-community precedent); sexual content + minors are the lines the stack guards.

## Neutrality & safety
- Non-prescriptive everywhere (05/11): protocols are descriptive, never recommendations. Controlled substances: shown as tracked, never with dosing guidance.
- Persistent "not medical advice" framing on shared protocols.

## Why it's worth the weight
- Copy-protocol + visible results is a genuine growth/engagement engine and a reason to choose Pepi over dose-loggers.
- It also deepens the data flywheel (07) — public protocols are a strong contribution incentive.

## Decisions (locked)
- New area, **post-MVP**.
- Protocol sharing + copy-protocol + before/after photos + influencer protocols.
- **No vendor surfacing** — private per-vial only; anonymized batch-safety signals at most.
- Public photos gated behind hard age verification; moderation scales with volume — **founder manual review first**, AI screen + PhotoDNA + human queue added as it outgrows manual; optional blur.
- Non-prescriptive; controlled substances never get dosing guidance.
