import { describe, expect, it } from 'vitest';

import {
  clampToNow,
  combineDateTime,
  isDoseInputValid,
  isFuture,
  parseDoseInput,
  protocolChangePrompt,
} from '@/lib/dose-draft';

describe('parseDoseInput', () => {
  it('parses plain and decimal amounts', () => {
    expect(parseDoseInput('250')).toBe(250);
    expect(parseDoseInput('2.5')).toBe(2.5);
    expect(parseDoseInput('0.25')).toBe(0.25);
    expect(parseDoseInput('.5')).toBe(0.5);
  });

  it('accepts a comma decimal separator', () => {
    // Most of our locales type "2,5" without thinking about it.
    expect(parseDoseInput('2,5')).toBe(2.5);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseDoseInput('  250  ')).toBe(250);
  });

  it('rejects empty, junk, and units glued to the number', () => {
    expect(parseDoseInput('')).toBeNull();
    expect(parseDoseInput('   ')).toBeNull();
    expect(parseDoseInput('abc')).toBeNull();
    expect(parseDoseInput('12mg')).toBeNull();
  });

  it('rejects zero and negatives: a logged dose is something taken', () => {
    expect(parseDoseInput('0')).toBeNull();
    expect(parseDoseInput('-5')).toBeNull();
  });

  it('rejects exponent notation rather than silently accepting it', () => {
    // Number('1e5') is 100000; a typo must not become a 100,000 unit dose.
    expect(parseDoseInput('1e5')).toBeNull();
  });
});

describe('isDoseInputValid', () => {
  it('treats empty as valid: some protocol items carry no dose', () => {
    expect(isDoseInputValid('')).toBe(true);
    expect(isDoseInputValid('  ')).toBe(true);
  });

  it('rejects junk', () => {
    expect(isDoseInputValid('abc')).toBe(false);
    expect(isDoseInputValid('0')).toBe(false);
  });

  it('accepts a good amount', () => {
    expect(isDoseInputValid('250')).toBe(true);
  });
});

describe('combineDateTime', () => {
  it('anchors to the local calendar day, not UTC', () => {
    const iso = combineDateTime('2026-07-19', 14, 30);
    const d = new Date(iso);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6); // July
    expect(d.getDate()).toBe(19);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });

  it('zeroes seconds so repeated logs compare cleanly', () => {
    expect(new Date(combineDateTime('2026-07-19', 9, 5)).getSeconds()).toBe(0);
  });

  it('handles midnight', () => {
    const d = new Date(combineDateTime('2026-01-01', 0, 0));
    expect(d.getHours()).toBe(0);
    expect(d.getDate()).toBe(1);
  });
});

describe('isFuture / clampToNow', () => {
  const now = new Date('2026-07-19T12:00:00.000Z');

  it('detects a future timestamp', () => {
    expect(isFuture('2026-07-19T12:00:01.000Z', now)).toBe(true);
    expect(isFuture('2026-07-19T11:59:59.000Z', now)).toBe(false);
  });

  it('leaves a past timestamp untouched', () => {
    const past = '2026-07-19T08:00:00.000Z';
    expect(clampToNow(past, now)).toBe(past);
  });

  it('pulls a future timestamp back to now', () => {
    expect(clampToNow('2026-12-25T00:00:00.000Z', now)).toBe(now.toISOString());
  });
});

describe('protocolChangePrompt', () => {
  it('does not ask when the dose is unchanged', () => {
    expect(protocolChangePrompt('250', 250)).toEqual({ ask: false });
  });

  it('asks when the user typed a different amount', () => {
    expect(protocolChangePrompt('300', 250)).toEqual({ ask: true, newDose: 300 });
  });

  it('does not ask when the protocol has no dose to update', () => {
    expect(protocolChangePrompt('300', undefined)).toEqual({ ask: false });
  });

  it('does not ask when the input is empty or junk', () => {
    expect(protocolChangePrompt('', 250)).toEqual({ ask: false });
    expect(protocolChangePrompt('abc', 250)).toEqual({ ask: false });
  });

  it('treats a comma decimal as the same number, not a change', () => {
    // "2,5" vs a stored 2.5 must not read as an edit.
    expect(protocolChangePrompt('2,5', 2.5)).toEqual({ ask: false });
  });
});
