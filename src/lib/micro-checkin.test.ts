import { describe, expect, it } from 'vitest';

import { activeMicroSlot, matchChatControl, microFieldsFor } from '@/lib/micro-checkin';
import type { CheckinEntry } from '@/lib/store';

describe('activeMicroSlot', () => {
  it('maps hours to slots', () => {
    expect(activeMicroSlot(7)).toBe('morning');
    expect(activeMicroSlot(11)).toBe('morning');
    expect(activeMicroSlot(12)).toBeNull();
    expect(activeMicroSlot(16)).toBeNull();
    expect(activeMicroSlot(19)).toBe('evening');
    expect(activeMicroSlot(23)).toBe('evening');
    expect(activeMicroSlot(2)).toBeNull();
  });
});

describe('microFieldsFor', () => {
  const entry = (patch: Partial<CheckinEntry>): CheckinEntry => ({
    date: '2026-07-16',
    updatedAt: '2026-07-16T08:00:00Z',
    ...patch,
  });

  it('asks only surfaced, unlogged fields', () => {
    expect(microFieldsFor('morning', ['sleep_quality', 'energy', 'wellness'], undefined)).toEqual([
      'sleep_quality',
      'energy',
    ]);
    expect(microFieldsFor('morning', ['sleep_quality', 'energy'], entry({ sleep_quality: 4 }))).toEqual(['energy']);
    expect(microFieldsFor('morning', ['wellness'], undefined)).toEqual([]);
  });

  it('caps the evening set at three', () => {
    expect(
      microFieldsFor('evening', ['wellness', 'soreness', 'workout_effort', 'libido'], undefined),
    ).toEqual(['wellness', 'soreness', 'workout_effort']);
  });
});

describe('matchChatControl', () => {
  it('matches snooze on short messages only', () => {
    expect(matchChatControl('snooze')).toEqual({ kind: 'snooze' });
    expect(matchChatControl('ask me later')).toEqual({ kind: 'snooze' });
    expect(matchChatControl('más tarde')).toEqual({ kind: 'snooze' });
    expect(matchChatControl('I went to the gym and I will log the rest of my day later tonight')).toBeNull();
  });

  it('matches tone-down in several languages', () => {
    expect(matchChatControl('can you tone down the notifications')).toEqual({ kind: 'toneDown' });
    expect(matchChatControl('too many pings lately')).toEqual({ kind: 'toneDown' });
    expect(matchChatControl('menos notificaciones por favor')).toEqual({ kind: 'toneDown' });
  });

  it('matches per-check-in disable/enable', () => {
    expect(matchChatControl('turn off the morning check-in')).toEqual({
      kind: 'toggleCheckin',
      slot: 'morning',
      enable: false,
    });
    expect(matchChatControl('can you disable the evening checkin please')).toEqual({
      kind: 'toggleCheckin',
      slot: 'evening',
      enable: false,
    });
    expect(matchChatControl('enable the morning check-in again')).toEqual({
      kind: 'toggleCheckin',
      slot: 'morning',
      enable: true,
    });
  });

  it('matches move-with-time, including pm', () => {
    expect(matchChatControl('move my night check-in to 10pm')).toEqual({
      kind: 'moveCheckin',
      slot: 'evening',
      time: '22:00',
    });
    expect(matchChatControl('change the morning check-in to 7:15')).toEqual({
      kind: 'moveCheckin',
      slot: 'morning',
      time: '07:15',
    });
  });

  it('does not fire on ordinary log messages', () => {
    expect(matchChatControl('slept 7h, energy 4')).toBeNull();
    expect(matchChatControl('took 2mg of tirzepatide this morning')).toBeNull();
    expect(matchChatControl('feeling off tonight')).toBeNull();
  });
});
