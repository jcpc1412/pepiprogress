import { describe, expect, it } from 'vitest';

import { MAX_SHARE_STATS, buildShareCard, loggingStreak, type ShareStatKey } from './share-card';

const TODAY = '2026-07-18';

describe('loggingStreak', () => {
  it('is 0 with no logs', () => {
    expect(loggingStreak([], TODAY)).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    expect(loggingStreak(['2026-07-16', '2026-07-17', '2026-07-18'], TODAY)).toBe(3);
  });

  it('gives a one-day grace when today is not logged yet', () => {
    // Morning share: yesterday and before still counts.
    expect(loggingStreak(['2026-07-16', '2026-07-17'], TODAY)).toBe(2);
  });

  it('is 0 when neither today nor yesterday is logged', () => {
    expect(loggingStreak(['2026-07-14', '2026-07-15', '2026-07-16'], TODAY)).toBe(0);
  });

  it('stops at the first gap', () => {
    expect(loggingStreak(['2026-07-14', '2026-07-17', '2026-07-18'], TODAY)).toBe(2);
  });

  it('ignores order and duplicates', () => {
    expect(loggingStreak(['2026-07-18', '2026-07-17', '2026-07-18'], TODAY)).toBe(2);
  });
});

describe('buildShareCard', () => {
  const base = {
    loggedDateKeys: ['2026-07-17', '2026-07-18'],
    photoCount: 3,
    units: 'metric' as const,
    todayKey: TODAY,
    watermark: true,
  };

  it('carries streak, days and photos', () => {
    const card = buildShareCard(base);
    expect(card.stats.map((s) => s.labelKey)).toEqual([
      'share.statStreak',
      'share.statDays',
      'share.statPhotos',
    ]);
    expect(card.stats[0].value).toBe('2');
    expect(card.stats[2].value).toBe('3');
    expect(card.watermark).toBe(true);
  });

  it('omits zero signals rather than showing a zero', () => {
    const card = buildShareCard({ ...base, loggedDateKeys: [], photoCount: 0 });
    expect(card.stats).toEqual([]);
  });

  it('formats a signed weight delta with the metric unit', () => {
    const card = buildShareCard({ ...base, weightDelta: -2.44 });
    expect(card.stats.at(-1)).toEqual({ labelKey: 'share.statWeight', value: '-2.4 kg' });
  });

  it('formats a gain in imperial with an explicit plus', () => {
    const card = buildShareCard({ ...base, units: 'imperial', weightDelta: 1.52 });
    expect(card.stats.at(-1)).toEqual({ labelKey: 'share.statWeight', value: '+1.5 lb' });
  });

  it('drops a weight delta that rounds to zero', () => {
    const card = buildShareCard({ ...base, weightDelta: 0.04 });
    expect(card.stats.some((s) => s.labelKey === 'share.statWeight')).toBe(false);
  });

  it('never exceeds the layout cap', () => {
    const card = buildShareCard({ ...base, weightDelta: -3 });
    expect(card.stats.length).toBeLessThanOrEqual(MAX_SHARE_STATS);
  });

  it('only ever emits consistency labels (privacy invariant)', () => {
    const allowed: ShareStatKey[] = [
      'share.statStreak',
      'share.statDays',
      'share.statPhotos',
      'share.statWeight',
    ];
    const card = buildShareCard({ ...base, weightDelta: -3 });
    for (const s of card.stats) expect(allowed).toContain(s.labelKey);
  });

  it('passes the watermark flag through', () => {
    expect(buildShareCard({ ...base, watermark: false }).watermark).toBe(false);
  });
});
