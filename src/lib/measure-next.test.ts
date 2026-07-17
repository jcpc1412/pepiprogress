import { describe, expect, it } from 'vitest';

import { computeEvidenceGaps, topEvidenceGap } from './measure-next';
import type { CheckinEntry, PhotoEntry, ProtocolItem } from './store';

const TODAY = '2026-07-17';

function item(compoundSlug: string): ProtocolItem {
  return { id: `p-${compoundSlug}`, compoundSlug, frequency: 'weekly' } as ProtocolItem;
}
function checkin(date: string, labValues: Record<string, number>): CheckinEntry {
  return { date, labValues, updatedAt: `${date}T00:00:00.000Z` } as CheckinEntry;
}
function photo(takenAt: string): PhotoEntry {
  return { id: `ph-${takenAt}`, session: 'body', uri: 'file://x', takenAt } as PhotoEntry;
}

describe('computeEvidenceGaps', () => {
  it('returns nothing without a protocol', () => {
    expect(computeEvidenceGaps({ protocolItems: [], entries: {}, photos: [], today: TODAY })).toEqual([]);
  });

  it('surfaces a never-checked bloodwork marker as the top gap', () => {
    const gap = topEvidenceGap({
      protocolItems: [item('testosterone')],
      entries: {},
      // a fresh photo so the only gap is bloodwork
      photos: [photo('2026-07-16T12:00:00.000Z')],
      today: TODAY,
    });
    expect(gap?.kind).toBe('bloodwork');
    expect(gap?.message.key).toBe('measureNext.bloodworkNever');
    expect(gap?.target).toBe('labs');
  });

  it('never-checked bloodwork outranks an overdue photo', () => {
    const gaps = computeEvidenceGaps({
      protocolItems: [item('testosterone')],
      entries: {},
      photos: [photo('2026-01-01T12:00:00.000Z')], // long overdue
      today: TODAY,
    });
    expect(gaps[0].kind).toBe('bloodwork');
    expect(gaps.some((g) => g.kind === 'photo')).toBe(true);
  });

  it('flags a stale marker with the weeks-ago count, not "never"', () => {
    const entries = { '2026-01-01': checkin('2026-01-01', { hematocrit: 44, estradiol: 30, lipids: 180 }) };
    const gaps = computeEvidenceGaps({
      protocolItems: [item('testosterone')],
      entries,
      photos: [photo('2026-07-16T12:00:00.000Z')],
      today: TODAY,
    });
    const hct = gaps.find((g) => g.message.params?.marker === 'markers.hematocrit');
    expect(hct?.message.key).toBe('measureNext.bloodworkStale');
    expect(Number(hct?.message.params?.count)).toBeGreaterThan(20);
  });

  it('emits no gap when every marker is recent and photos are current', () => {
    const entries = { '2026-07-01': checkin('2026-07-01', { hematocrit: 48, estradiol: 30, lipids: 180 }) };
    const gaps = computeEvidenceGaps({
      protocolItems: [item('testosterone')],
      entries,
      photos: [photo('2026-07-16T12:00:00.000Z')],
      today: TODAY,
    });
    expect(gaps).toEqual([]);
  });

  it('asks for a baseline photo when none exist', () => {
    const gaps = computeEvidenceGaps({
      protocolItems: [item('semaglutide')],
      entries: { '2026-07-15': checkin('2026-07-15', {}) },
      photos: [],
      today: TODAY,
    });
    const photoGap = gaps.find((g) => g.kind === 'photo');
    expect(photoGap?.message.key).toBe('measureNext.photoBaseline');
    expect(photoGap?.target).toBe('photos');
  });

  it('surfaces a photo gap once the last shot predates the scientific cadence', () => {
    // semaglutide -> fat_loss group, scientificDays 21; last photo 40 days ago.
    const gap = topEvidenceGap({
      protocolItems: [item('semaglutide')],
      entries: {},
      photos: [photo('2026-06-07T12:00:00.000Z')],
      today: TODAY,
    });
    expect(gap?.kind).toBe('photo');
    expect(gap?.message.key).toBe('measureNext.photoDue');
  });

  it('does not ask for a photo when a recent one exists', () => {
    const gaps = computeEvidenceGaps({
      protocolItems: [item('semaglutide')],
      entries: {},
      photos: [photo('2026-07-15T12:00:00.000Z')],
      today: TODAY,
    });
    expect(gaps.some((g) => g.kind === 'photo')).toBe(false);
  });

  it('has no photo cadence for an ancillary-only stack', () => {
    // anastrozole -> ancillaries group, scientificDays 0.
    const gaps = computeEvidenceGaps({
      protocolItems: [item('anastrozole')],
      entries: { '2026-07-15': checkin('2026-07-15', {}) },
      photos: [],
      today: TODAY,
    });
    expect(gaps.some((g) => g.kind === 'photo')).toBe(false);
  });
});
