# 03 — Tracking & Daily Log

## Three things this area owns
1. **Protocols** — what the user is taking.
2. **Inventory** — what they have on hand ("stock", pins/needles, vials).
3. **Daily log** — the morning check-in.

## Protocols
- peptide (from catalog), dose, unit, route (sub-q, IM, oral, nasal…), frequency (daily, EOD, 5-on-2-off, custom), start/end.
- Syringe/reconstitution math (table-stakes — competitors all have it). Dose → volume given vial concentration.
- A protocol can stack multiple peptides; synergies surfaced from 05/07.

## Inventory ("stock", pins)
- Vials with concentration + remaining amount; auto-decrement as doses are logged.
- Optional **vendor/brand per vial** (one-time setup) — **private to the user** for quality/batch tracking only; never shown on shared protocols (14).
- Consumables: needles/pins, alcohol swabs — simple counts.
- **Low-stock + expiry reminders.**
- Injection-site rotation tracker (competitor table-stakes).

## Daily log — hybrid model (locked)
Two distinct shapes, because they have different rhythms:

**1. Rolling daily check-in** (one per day, updated through the morning)
- Goal-driven fields (see 02). Only show what's relevant.
- Core: weight, sleep quality, wellness/mood, free note.
- **Auto-fill from integrations (06):** weight from smart scale, sleep from Health, workout effort from fitness app. User confirms, doesn't retype.
- Photo capture entry points (04) for face/body when those goals are active.

**2. Symptom / side-effect events** (logged whenever they happen, not tied to the daily entry)
- Discrete timestamped events: type + onset time + **duration** + severity + free text. E.g. "nausea, 2pm, lasted ~1h, mild."
- Logged in-the-moment from anywhere in the app (quick-add), including **natural-language / voice quick-log** (13). A day can have zero or many.
- Structured (typed taxonomy) because it feeds the community DB (07) — duration + severity + timing are exactly the signal studies lack.

## Offline
Daily logging must work offline (mornings, bad signal). Local-first write, sync later (10).

## Decisions (locked)
- **Log structure: hybrid** — one rolling daily check-in + discrete timestamped symptom events with duration (above).
- **Missed days: backfill allowed**, no shame mechanics. Gentle streaks/consistency nudges, never guilt; a missed day is editable after the fact.
- **Dose logging: both** — tap-to-confirm from the schedule *and* manual entry.
