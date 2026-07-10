import { describe, expect, it } from 'vitest';

import { matchQuery } from '@/lib/ask/intent';

describe('matchQuery (P-1 deterministic answers)', () => {
  it('"have I exercised less lately?" → recent-vs-prior workout comparison', () => {
    const q = matchQuery('Have I exercised less lately?');
    expect(q).not.toBeNull();
    expect(q!.metric).toEqual({ kind: 'checkin', field: 'workout_effort' });
    expect(q!.timeframe).toBe('last_7');
    expect(q!.compareTo).toBe('prior_7');
    expect(q!.agg).toBe('average');
  });

  it('recognizes exercise synonyms (gym / worked out / training)', () => {
    expect(matchQuery('how was my gym effort')?.metric).toEqual({ kind: 'checkin', field: 'workout_effort' });
    expect(matchQuery('have I worked out much')?.metric).toEqual({ kind: 'checkin', field: 'workout_effort' });
    expect(matchQuery('my training recently')?.compareTo).toBe('prior_7');
  });

  it('trend words trigger a comparison; a doses trend counts', () => {
    const q = matchQuery('am I dosing less these days');
    expect(q?.metric.kind).toBe('dose');
    expect(q?.compareTo).toBe('prior_7');
    expect(q?.agg).toBe('count');
  });

  it('a plain latest query is not forced into a comparison', () => {
    const q = matchQuery('what is my weight');
    expect(q?.compareTo).toBeUndefined();
  });

  it('unrecognized metric still returns null (routes to the AI fallback)', () => {
    expect(matchQuery('what should I eat for dinner')).toBeNull();
  });
});
