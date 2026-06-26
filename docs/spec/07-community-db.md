# 07 — Community Database

The long-term moat: anonymized, aggregated outcomes that answer "does this peptide actually do what people hope, for goals like mine?"

## What it aggregates
- Per compound / per goal / per cohort: reported side-effect frequencies, perceived-outcome trends, typical doses & lengths *people actually ran*, synergies people stacked.
- **Stratified by the full co-administered stack** — the cohort key includes other compounds (esp. TRT/anabolics, GLP-1) so we can answer "on-TRT vs off-TRT" type questions. Captured covariates (training, nutrition, sleep, bloodwork) are the whole edge over published studies.
- Outcome signal comes from structured logs (03): symptom events, weight/sleep/wellness trends, bloodwork (06), and (with consent) photo-derived change scores (04).
- Controlled compounds appear in observational aggregates but are never given dosing recommendations (05/11).

## Provenance & confidence (the credibility layer)
- Every community fact has `source = community`, a sample size `n`, and a `confidence`.
- This feeds the educational dosing cards (05): early facts are internet-sourced + cited; as `n` grows, community-weighted facts surface alongside or replace them.
- Never presented as advice — always "people reported," with n and confidence visible.

## Anonymization (hard problem, see 11)
- Aggregates only; k-anonymity threshold before any cohort is shown (min n).
- **Photos are NOT trivially anonymizable** — bodies/faces are identifying. Community use of photo data is limited to *derived numeric scores*, never raw images, and strictly opt-in.
- Strip/never-collect direct identifiers in the aggregate pipeline.

## Contribution model (locked)
- **Opt-in, off by default** — separate explicit consent, not a condition of using the tracker (required for health/biometric data, see 11).
- The core app is fully usable by someone who never opts in.

## Access model — how the gates compose (locked)
Three switches, composed:
- **Contribution (reciprocity) is the gate to ANY community insight.** Opt in to contribute → you can see community data. No contribution = no community insight, *regardless of plan*. Applies to free and paid alike.
- **Basic** community insights: free or paid users who contribute.
- **Deep / cohort** insights: paid plan *and* contributing. (Free + contributing = basic only.)
- So: contribution unlocks the door; payment unlocks depth (12).

## Phasing
- V1 of the DB: read-only seeded catalog (internet-sourced, cited).
- V2: live aggregates once enough opted-in users exist (k-anonymity gate).
- V3: community-weighted dosing/synergy surfaced in 05.

## Decisions
- **k-anonymity threshold:** no cohort surfaces below a minimum n (start at **n ≥ 20**, tunable as the dataset grows). *Engineering/policy default — flag for revisit before the DB goes live.*
- **Outcome weighting:** self-reported outcomes are noisy → every aggregate carries a `confidence` derived from sample size + variance; low-confidence facts are shown as such, never as recommendations.
- **Abuse/poisoning:** basic guards at launch (per-account rate of contribution, outlier filtering); revisit heavier moderation if/when abuse appears.
