# 12 — Monetization

## Model: freemium + trial (not free-only)
The app is **not** fully free at public launch — AI is the real per-user cost (vision for photos/labs/vials, insights), so the business has to cover COGS. Freemium with a trial, where **the thing people pay for is the thing that costs us money** (AI output), so cost scales with revenue, not against it.

**Timing (locked):** **MVP · Base ships as a free closed/beta** (no billing) to validate the loop; **freemium + trial turns on with MVP · Polish, the public-launch point** (see SPEC roadmap). Billing plumbing is deferred until the loop is proven.

## The gating principle (the rule for what's free)
> **Never gate data INPUT. Gate data OUTPUT and scale.**

Logging, connecting integrations, and contributing data are always free + unlimited — they feed the flywheel and the community DB (07). Gating input would kill the data asset. What's paid is **analysis and scale** — what the AI gives *back*.

## Free vs paid (draft)
| Free | Paid |
|------|------|
| **Chat + manual logging — unlimited** (the anti-friction hook; must never be gated) | — |
| Connect integrations (06) | — (free; enriches our data) |
| Track **3 compounds** | Unlimited compounds |
| **1 photo analysis / month** | Unlimited photo AI |
| Last **30 days** of history/trends | Full history + deep insights |
| Basic community view | Deep community / cohort insights |

- "3 compounds" is the ideal gate for *this* audience: fine for a beginner, cramped for the power user (who runs 5–8). The free tier should feel exactly that useful-but-tight.
- **Community insight (basic or deep) requires opting in to contribute** (reciprocity, 07). Free contributors see basic; paid contributors see deep. Non-contributors see no community data regardless of plan.

## Trial mechanic
- **10-day unlimited trial** — let users pile in their full stack, photos, history, and get hooked on the AI tools.
- **On expiry, lock excess read-only — never delete.** They keep *seeing* their 8 compounds but can't add/edit beyond the free limit until they upgrade (or trim). Seeing your own locked data converts far better than a feature you never tried. (Notion/Airtable playbook.)

## Cost control that makes free logging viable
- **Free chat logging runs on a cheap small model** (Haiku-tier) — quick-log is a tight structured parse, doesn't need a frontier model (specify in 05/10). Fractions of a cent per log → subsidizable by paying users.
- Expensive paths (vision, deep insights) sit behind the paywall. **Cheap input free, expensive output paid.**

## Sponsorship
Non-vendor brands (education/community, e.g. Peptaura-type) — brand exposure to a high-intent audience, clearly labeled, firewalled from catalog/community neutrality. A secondary line, not the pillar; needs scale to matter, so it's a later lever.

## Data as an asset + the acquisition thesis
The long game / intended exit: **acquisition** by a larger company, where the value is the user base + the consented, anonymized outcomes dataset (07) — the only real-world data on peptides-in-trained-people with confounders captured.

**Hard rules (these protect the exit, not just the user):**
- **"Consent by signing up" is NOT sufficient.** Health/biometric data is special-category under GDPR/BIPA — it requires *explicit, separate, opt-in* consent. This is exactly the opt-in already specced in 07/11; the data thesis runs on that, never on blanket signup ToS.
- **Clean consent = higher acquisition value.** In due diligence, opt-in-consented data is a usable asset; "signup = consent" data is a liability lawyers discount. Doing consent right is what makes the dataset worth buying.
- **Share aggregates, not per-user "anonymous" rows.** A full stack + symptoms + age + timeline can re-identify one person even without a name. K-anonymized aggregate trends only (07).
- **Never sell individual health/biometric data** (illegal + brand-suicide). The product is *anonymized aggregate insight*, not data brokerage.
- **Photos are out of any data deal entirely** — derived numeric scores only, never raw images (04/07/11).

## Decisions (locked)
- Freemium + 10-day unlimited trial, lock-excess-read-only on expiry.
- Gate output/scale, never input; logging (incl. chat) always free.
- Free chat logging on a cheap small model.
- No affiliate. Sponsorship as a later secondary line.
- Acquisition/data thesis runs on explicit opt-in consent (07/11), aggregates only, photos excluded.
