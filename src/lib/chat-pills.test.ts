import { describe, expect, it } from 'vitest';

import { msUntilPillsReturn, PILL_IDLE_MS, shouldShowPills } from '@/lib/chat-pills';

const state = (over: Partial<Parameters<typeof shouldShowPills>[0]> = {}) => ({
  draftLength: 0,
  msSinceActivity: 0,
  hasConversation: false,
  ...over,
});

describe('shouldShowPills', () => {
  it('shows on a cold screen, which is what the pills are for', () => {
    expect(shouldShowPills(state())).toBe(true);
  });

  it('hides once the user starts typing, even on a cold screen', () => {
    expect(shouldShowPills(state({ draftLength: 1 }))).toBe(false);
  });

  it('hides during active back-and-forth', () => {
    expect(shouldShowPills(state({ hasConversation: true, msSinceActivity: 1_000 }))).toBe(false);
  });

  it('returns once the exchange goes quiet with an empty composer', () => {
    expect(
      shouldShowPills(state({ hasConversation: true, msSinceActivity: PILL_IDLE_MS })),
    ).toBe(true);
  });

  it('stays hidden just before the idle threshold', () => {
    expect(
      shouldShowPills(state({ hasConversation: true, msSinceActivity: PILL_IDLE_MS - 1 })),
    ).toBe(false);
  });

  it('keeps hiding while a draft sits unsent, however long the silence', () => {
    // Silence with text in the box is someone composing, not someone stuck.
    expect(
      shouldShowPills(state({ hasConversation: true, msSinceActivity: 10 * PILL_IDLE_MS, draftLength: 5 })),
    ).toBe(false);
  });

  it('lets a draft cleared mid-conversation bring the pills back when idle', () => {
    const base = { hasConversation: true, msSinceActivity: PILL_IDLE_MS + 500 };
    expect(shouldShowPills(state({ ...base, draftLength: 3 }))).toBe(false);
    expect(shouldShowPills(state({ ...base, draftLength: 0 }))).toBe(true);
  });
});

describe('msUntilPillsReturn', () => {
  it('is null when the pills already show', () => {
    expect(msUntilPillsReturn(state())).toBeNull();
  });

  it('is null while a draft is pending: only typing resolves that', () => {
    expect(msUntilPillsReturn(state({ draftLength: 2, hasConversation: true }))).toBeNull();
  });

  it('counts down the remaining idle window', () => {
    expect(
      msUntilPillsReturn(state({ hasConversation: true, msSinceActivity: 4_000 })),
    ).toBe(PILL_IDLE_MS - 4_000);
  });

  it('never returns a negative delay', () => {
    const ms = msUntilPillsReturn(state({ hasConversation: true, msSinceActivity: 99_999 }));
    expect(ms === null || ms >= 0).toBe(true);
  });
});
