/**
 * Deterministic quick-log pre-parse (F3).
 *
 * Most quick-logs are not natural language at all: "weight 120", "energy 4",
 * "sema". Sending those to Haiku costs money, costs a round-trip, and fails
 * offline. This module recognises them locally so the common case is free,
 * instant, and works on a plane.
 *
 * The safety property this is built around: **all-or-nothing**. Every segment of
 * the message must be understood, or the whole message escalates to the AI
 * untouched. A message is never partially claimed. That is what makes a
 * deterministic miss harmless — "weight felt heavy today" has words left over,
 * so it never matches, and Haiku sees it exactly as it always did.
 *
 * Doses get the strictest treatment on purpose. A wrong weight writes one
 * visible number; a wrong dose writes a dose event, decrements the wrong vial,
 * and anchors the wrong protocol item's schedule. So a dose only matches when
 * the name resolves to exactly one candidate; two candidates, an unknown word,
 * or an unrecognised unit all escalate.
 *
 * Pure by design: the vocabulary (localized field labels, the user's protocol)
 * is passed in, so this is testable without i18n or a store.
 */

import type { ParsedItem } from '@/lib/ai';

/** Confidence stamped on deterministic items. A literal keyword match is not a
 *  guess, so it sits above `AUTO_APPLY_CONFIDENCE` and applies without review. */
const CERTAIN = 1;

/** Check-in fields logged on a 1-5 scale. */
const SCALE_FIELDS = [
  'sleep_quality',
  'wellness',
  'appetite',
  'energy',
  'soreness',
  'workout_effort',
  'libido',
] as const;

export type ScaleField = (typeof SCALE_FIELDS)[number];

const SCALE_SET = new Set<string>(SCALE_FIELDS);

/**
 * Units accepted after a number. Deliberately a closed list: an unrecognised
 * trailing token means the message said something we did not understand, which
 * escalates. Abbreviations are near-universal across our six locales; a locale
 * that spells a unit out simply escalates to the AI, which is the safe outcome.
 */
const KNOWN_UNITS = new Set([
  // mass / body
  'kg', 'kgs', 'kilo', 'kilos', 'lb', 'lbs', 'pound', 'pounds',
  // macros
  'g', 'gr', 'gram', 'grams', 'kcal', 'cal', 'cals', 'calories',
  // tape
  'cm', 'in', 'inch', 'inches',
  // dose
  'mg', 'mcg', 'ug', 'iu', 'ml', 'u', 'unit', 'units',
]);

/** Dose units, kept separate so a dose cannot be recorded in centimetres. */
const DOSE_UNITS = new Set(['mg', 'mcg', 'ug', 'iu', 'ml', 'u', 'unit', 'units']);

/** One thing the user could be logging a dose of: a protocol item, or a catalog
 *  compound they have on file. `names` are all the ways it can be written. */
export type DoseCandidate = {
  compoundSlug: string;
  names: string[];
  /** The protocol's dose, used when the user names the compound without a number. */
  dose?: number;
  doseUnit?: string;
};

/** Everything locale- or user-specific this parser needs. Built by the caller
 *  (see `buildVocab` in the runner) so the matcher itself stays pure. */
export type DeterministicVocab = {
  /** Field key -> the localized phrases that name it, longest-first. */
  fields: Record<string, string[]>;
  /** Dose targets, most-specific names first. */
  compounds: DoseCandidate[];
};

/** Lowercase, strip accents-insensitive noise, collapse whitespace. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split a message into independently-loggable segments.
 *
 * Newlines and semicolons always separate. Commas separate too, except between
 * digits, where a comma is a decimal separator in five of our six locales
 * ("weight 80,5" is one segment, "weight 80, energy 3" is two).
 */
export function splitSegments(text: string): string[] {
  return text
    .split(/[\n;]+|,(?!\d)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Parse a positive decimal, accepting the comma form. Rejects anything with
 *  extra characters so "1e5" or "12mg" never slip through as a bare number. */
function parseNumber(token: string): number | null {
  const t = token.replace(',', '.');
  if (!/^\d*\.?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Longest-first so "sleep quality" wins over a bare "sleep" alias. */
function byLengthDesc(a: string, b: string): number {
  return b.length - a.length;
}

type Match = { key: string; rest: string };

/** Find the vocabulary entry a segment opens with, preferring the longest name. */
function matchPrefix(segment: string, entries: { key: string; names: string[] }[]): Match | null {
  const candidates: { key: string; name: string }[] = [];
  for (const entry of entries) {
    for (const name of entry.names) {
      const n = normalize(name);
      if (!n) continue;
      // Must match on a word boundary: "arm" should not eat "armodafinil".
      if (segment === n || segment.startsWith(`${n} `) || segment.startsWith(`${n}:`)) {
        candidates.push({ key: entry.key, name: n });
      }
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => byLengthDesc(a.name, b.name));
  const best = candidates[0];
  // Ambiguity between two *different* targets of the same length is unresolvable
  // locally — escalate rather than guess which compound the user meant.
  const tied = candidates.filter((c) => c.name.length === best.name.length);
  if (tied.some((c) => c.key !== best.key)) return null;
  return { key: best.key, rest: segment.slice(best.name.length).trim() };
}

/** The value part of a segment: a number and an optional recognised unit. */
type Value = { n: number; unit?: string };

function parseValue(rest: string): Value | null | 'empty' {
  // A leading dash is a label separator ("weight - 80") unless it is glued to a
  // digit, where it is a sign and the value is not a positive number at all.
  const cleaned = rest.replace(/^(?:[:=–]+|-(?!\d))\s*/, '').trim();
  if (!cleaned) return 'empty';

  // "4/5" — the scale form the templates use.
  const scale = cleaned.match(/^(\d+)\s*\/\s*5$/);
  if (scale) {
    const n = parseNumber(scale[1]);
    return n === null ? null : { n };
  }

  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length > 2) return null;
  const n = parseNumber(parts[0]);
  if (n === null) return null;
  if (parts.length === 1) return { n };
  const unit = parts[1].replace(/[.]$/, '');
  if (!KNOWN_UNITS.has(unit)) return null;
  return { n, unit };
}

/** Outcome for one segment: an item to write, nothing to write, or "give up". */
type SegmentResult = { ok: true; item?: ParsedItem } | { ok: false };

function parseSegment(raw: string, vocab: DeterministicVocab): SegmentResult {
  const segment = normalize(raw);
  if (!segment) return { ok: true };

  const fieldEntries = Object.entries(vocab.fields).map(([key, names]) => ({ key, names }));
  const field = matchPrefix(segment, fieldEntries);

  if (field) {
    const value = parseValue(field.rest);
    // A label the user left blank (an untouched template line) logs nothing —
    // it is not a failure to understand, it is an explicit absence of data.
    if (value === 'empty') return { ok: true };
    if (value === null) return { ok: false };

    if (SCALE_SET.has(field.key)) {
      // Scales are 1-5 integers. Anything else means we misread the segment.
      if (!Number.isInteger(value.n) || value.n < 1 || value.n > 5) return { ok: false };
      if (value.unit) return { ok: false };
      return { ok: true, item: { kind: 'checkin', confidence: CERTAIN, field: field.key, value: value.n } };
    }

    if (field.key === 'weight') {
      return { ok: true, item: { kind: 'weight', confidence: CERTAIN, weight: value.n } };
    }
    return { ok: true, item: { kind: 'checkin', confidence: CERTAIN, field: field.key, value: value.n } };
  }

  // Not a field: the remaining possibility is a dose.
  const doseEntries = vocab.compounds.map((c) => ({ key: c.compoundSlug, names: c.names }));
  const dose = matchPrefix(segment, doseEntries);
  if (!dose) return { ok: false };

  const candidate = vocab.compounds.find((c) => c.compoundSlug === dose.key);
  if (!candidate) return { ok: false };

  const value = parseValue(dose.rest);
  if (value === null) return { ok: false };

  // Naming the compound alone means "I took my usual" — only unambiguous when
  // the protocol actually says what the usual is.
  if (value === 'empty') {
    if (candidate.dose === undefined) return { ok: false };
    return {
      ok: true,
      item: {
        kind: 'dose',
        confidence: CERTAIN,
        compoundSlug: candidate.compoundSlug,
        dose: candidate.dose,
        doseUnit: candidate.doseUnit,
      },
    };
  }

  // An explicit amount needs an explicit dose unit, unless the protocol already
  // fixes the unit for this compound.
  const unit = value.unit ?? candidate.doseUnit;
  if (!unit || !DOSE_UNITS.has(unit)) return { ok: false };
  return {
    ok: true,
    item: {
      kind: 'dose',
      confidence: CERTAIN,
      compoundSlug: candidate.compoundSlug,
      dose: value.n,
      doseUnit: unit,
    },
  };
}

/**
 * Try to understand a quick-log entry without the AI.
 *
 * Returns the items to write, or `null` when anything at all was not
 * understood — in which case the caller must send the original text to
 * `parseQuickLog` unchanged. Never returns a partial reading.
 */
export function parseDeterministic(text: string, vocab: DeterministicVocab): ParsedItem[] | null {
  const segments = splitSegments(text);
  if (segments.length === 0) return null;

  const items: ParsedItem[] = [];
  for (const segment of segments) {
    const result = parseSegment(segment, vocab);
    if (!result.ok) return null;
    if (result.item) items.push(result.item);
  }

  // Understood, but there was nothing to log (e.g. an untouched template).
  // Hand it to the AI rather than silently reporting success on an empty write.
  if (items.length === 0) return null;
  return items;
}
