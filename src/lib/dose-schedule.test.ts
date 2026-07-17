import { describe, expect, it } from 'vitest';

import {
  anchorFor,
  classifyDose,
  completedSlots,
  dueSlot,
  intervalFor,
  missedSlotStreak,
  missedWeekdayStreak,
  nearestSlot,
} from '@/lib/dose-schedule';

describe('intervalFor', () => {
  it('maps interval frequencies and rejects the rest', () => {
    expect(intervalFor('daily')).toBe(1);
    expect(intervalFor('eod')).toBe(2);
    expect(intervalFor('twice_weekly')).toBe(3);
    expect(intervalFor('weekly')).toBe(7);
    expect(intervalFor('as_needed')).toBeNull();
    expect(intervalFor('custom')).toBeNull();
    expect(intervalFor(undefined)).toBeNull();
  });
});

describe('anchorFor', () => {
  it('prefers scheduleAnchor, then startedAt, then latest dose', () => {
    expect(
      anchorFor({ scheduleAnchor: '2026-07-01', startedAt: '2026-06-01' }, ['2026-07-10'], '2026-07-16'),
    ).toBe('2026-07-01');
    expect(anchorFor({ startedAt: '2026-06-01' }, ['2026-07-10'], '2026-07-16')).toBe('2026-06-01');
    expect(anchorFor({}, ['2026-07-08', '2026-07-10'], '2026-07-16')).toBe('2026-07-10');
  });

  it('ignores future doses and returns null with no reference', () => {
    expect(anchorFor({}, ['2026-08-01'], '2026-07-16')).toBeNull();
    expect(anchorFor({}, [], '2026-07-16')).toBeNull();
  });
});

describe('nearestSlot', () => {
  // Anchor Monday 2026-07-13, every 3 days: slots 13th, 16th, 19th...
  const anchor = '2026-07-13';

  it('lands on exact slot days with zero offset', () => {
    expect(nearestSlot(anchor, 3, '2026-07-16')).toEqual({ index: 1, slotKey: '2026-07-16', offsetDays: 0 });
  });

  it('picks the closest slot, breaking ties toward the earlier one', () => {
    // 14th: 1 day after slot 0, 2 days before slot 1 → slot 0.
    expect(nearestSlot(anchor, 3, '2026-07-14').index).toBe(0);
    // eod anchor 13th: the 14th is equidistant between 13th and 15th → earlier (0).
    expect(nearestSlot(anchor, 2, '2026-07-14').index).toBe(0);
  });

  it('never returns a slot before the anchor', () => {
    expect(nearestSlot(anchor, 3, '2026-07-10')).toEqual({ index: 0, slotKey: anchor, offsetDays: -3 });
  });
});

describe('completedSlots + dueSlot', () => {
  const anchor = '2026-07-13'; // slots (interval 3): 13, 16, 19

  it('an on-slot dose completes its slot; the item stops being due', () => {
    const doses = [{ dateKey: '2026-07-16' }];
    expect(completedSlots(anchor, 3, doses).has(1)).toBe(true);
    expect(dueSlot(anchor, 3, doses, '2026-07-16')).toBeNull();
  });

  it('a missed slot stays due (overdue) until logged', () => {
    expect(dueSlot(anchor, 3, [], '2026-07-17')).toEqual({ index: 1, slotKey: '2026-07-16' });
  });

  it('an early dose does NOT slide the grid (the P-04 bug)', () => {
    // Slot-0 dose on the 13th, then slot-1's dose taken a day early on the 15th
    // with an explicit keep-schedule assignment: slot 1 is complete, and the next
    // due day is still the 19th — not the 18th (which the old sliding calc gave).
    const doses = [{ dateKey: '2026-07-13' }, { dateKey: '2026-07-15', slotKey: '2026-07-16' }];
    expect(dueSlot(anchor, 3, doses, '2026-07-16')).toBeNull();
    expect(dueSlot(anchor, 3, doses, '2026-07-18')).toBeNull();
    expect(dueSlot(anchor, 3, doses, '2026-07-19')).toEqual({ index: 2, slotKey: '2026-07-19' });
  });

  it('extra doses complete nothing', () => {
    const doses = [{ dateKey: '2026-07-16', extra: true }];
    expect(dueSlot(anchor, 3, doses, '2026-07-16')).toEqual({ index: 1, slotKey: '2026-07-16' });
  });

  it('a late dose without an explicit slot completes the nearest (missed) slot', () => {
    // Taken the 17th, one day after the missed 16th slot → completes slot 1.
    const doses = [{ dateKey: '2026-07-17' }];
    expect(dueSlot(anchor, 3, doses, '2026-07-17')).toBeNull();
    expect(dueSlot(anchor, 3, doses, '2026-07-19')).toEqual({ index: 2, slotKey: '2026-07-19' });
  });

  it('is not due before the anchor', () => {
    expect(dueSlot('2026-08-01', 3, [], '2026-07-16')).toBeNull();
  });

  it('daily grid reduces to due-unless-logged-today', () => {
    expect(dueSlot(anchor, 1, [{ dateKey: '2026-07-15' }], '2026-07-16')).toEqual({
      index: 3,
      slotKey: '2026-07-16',
    });
    expect(dueSlot(anchor, 1, [{ dateKey: '2026-07-16' }], '2026-07-16')).toBeNull();
  });
});

describe('missedSlotStreak', () => {
  const anchor = '2026-07-01'; // interval 3: slots 1, 4, 7, 10, 13, 16...

  it('counts consecutive uncompleted past slots, ignoring today', () => {
    // Doses on the 1st and 4th; the 7th, 10th, 13th missed; today the 16th (pending).
    const doses = [{ dateKey: '2026-07-01' }, { dateKey: '2026-07-04' }];
    expect(missedSlotStreak(anchor, 3, doses, '2026-07-16')).toBe(3);
  });

  it('resets at the most recent completed slot', () => {
    const doses = [{ dateKey: '2026-07-13' }];
    expect(missedSlotStreak(anchor, 3, doses, '2026-07-16')).toBe(0);
  });

  it('is zero before any past slot exists', () => {
    expect(missedSlotStreak('2026-07-16', 3, [], '2026-07-16')).toBe(0);
    expect(missedSlotStreak('2026-07-16', 3, [], '2026-07-17')).toBe(1);
  });
});

describe('missedWeekdayStreak', () => {
  // 2026-07-16 is a Thursday. Schedule: Mon (1) + Thu (4).
  it('counts consecutive missed due days back from yesterday', () => {
    // Missed Mon 13th and Thu 9th; last logged Mon 6th.
    expect(missedWeekdayStreak([1, 4], ['2026-07-06'], '2026-07-16')).toBe(2);
  });

  it('stops at the last logged due day', () => {
    expect(missedWeekdayStreak([1, 4], ['2026-07-13'], '2026-07-16')).toBe(0);
  });

  it('handles empty schedules', () => {
    expect(missedWeekdayStreak([], [], '2026-07-16')).toBe(0);
  });
});

describe('classifyDose', () => {
  it('flags off-slot doses with their signed offset', () => {
    const anchor = '2026-07-13';
    expect(classifyDose(anchor, 3, '2026-07-16')).toEqual({ onSlot: true, slotKey: '2026-07-16', offsetDays: 0 });
    expect(classifyDose(anchor, 3, '2026-07-17')).toEqual({ onSlot: false, slotKey: '2026-07-16', offsetDays: 1 });
    expect(classifyDose(anchor, 3, '2026-07-15')).toEqual({ onSlot: false, slotKey: '2026-07-16', offsetDays: -1 });
  });
});
