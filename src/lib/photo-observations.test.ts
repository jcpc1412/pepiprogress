import { describe, expect, it } from 'vitest';

import {
  appendToLedger,
  LEDGER_CAP,
  recentDiscoveries,
  recentForTrack,
  sanitizeObservations,
  toPriorPayload,
  type AnalysisRecord,
} from '@/lib/photo-observations';

const rec = (over: Partial<AnalysisRecord> = {}): AnalysisRecord => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  session: 'body',
  photoId: 'p1',
  at: '2026-07-01T10:00:00Z',
  observations: [],
  ...over,
});

describe('appendToLedger', () => {
  it('appends and keeps everything under the cap', () => {
    const ledger = appendToLedger([rec({ id: 'a' })], rec({ id: 'b' }));
    expect(ledger.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('drops the oldest once the cap is exceeded', () => {
    let ledger: AnalysisRecord[] = [];
    for (let i = 0; i < LEDGER_CAP + 5; i++) {
      ledger = appendToLedger(ledger, rec({ id: `r${i}` }));
    }
    expect(ledger).toHaveLength(LEDGER_CAP);
    expect(ledger[0].id).toBe('r5');
    expect(ledger.at(-1)?.id).toBe(`r${LEDGER_CAP + 4}`);
  });
});

describe('recentForTrack', () => {
  const ledger = [
    rec({ id: 'body-old', session: 'body', at: '2026-06-01T00:00:00Z' }),
    rec({ id: 'face-1', session: 'face', at: '2026-06-10T00:00:00Z' }),
    rec({ id: 'body-new', session: 'body', at: '2026-07-01T00:00:00Z' }),
    rec({ id: 'belly-1', session: 'body', part: 'belly', at: '2026-07-02T00:00:00Z' }),
  ];

  it('filters to the exact track and sorts newest first', () => {
    expect(recentForTrack(ledger, 'body', undefined).map((r) => r.id)).toEqual([
      'body-new',
      'body-old',
    ]);
  });

  it('keeps a custom part track separate from the whole-session track', () => {
    expect(recentForTrack(ledger, 'body', 'belly').map((r) => r.id)).toEqual(['belly-1']);
  });

  it('limits to n', () => {
    expect(recentForTrack(ledger, 'body', undefined, 1)).toHaveLength(1);
  });
});

describe('toPriorPayload', () => {
  it('keeps what the model needs and drops bookkeeping', () => {
    const payload = toPriorPayload([
      rec({
        observations: [{ region: 'waist', note: 'appears tighter', direction: 'loss', confidence: 0.8 }],
        hypothesis: 'consistent with water loss',
        watchNext: 'lower-ab definition',
      }),
    ]);
    expect(payload[0]).toEqual({
      at: '2026-07-01T10:00:00Z',
      observations: [{ region: 'waist', direction: 'loss', note: 'appears tighter' }],
      hypothesis: 'consistent with water loss',
      watchNext: 'lower-ab definition',
    });
    expect('id' in payload[0]).toBe(false);
  });
});

describe('recentDiscoveries', () => {
  it('prefers the hypothesis when one exists', () => {
    const ledger = [
      rec({
        hypothesis: 'delts fuller despite stable weight',
        observations: [{ region: 'delts', note: 'fuller', direction: 'gain', confidence: 0.9 }],
      }),
    ];
    expect(recentDiscoveries(ledger)).toEqual(['delts fuller despite stable weight']);
  });

  it('falls back to the strongest confident observation, then to the summary', () => {
    const ledger = [
      rec({
        at: '2026-07-02T00:00:00Z',
        observations: [
          { region: 'waist', note: 'weak read', direction: 'loss', confidence: 0.3 },
          { region: 'chest', note: 'appears broader', direction: 'gain', confidence: 0.8 },
        ],
      }),
      rec({ at: '2026-07-01T00:00:00Z', change: 'summary only' }),
    ];
    expect(recentDiscoveries(ledger)).toEqual(['appears broader', 'summary only']);
  });

  it('skips unclear observations: an unclear read is not a discovery', () => {
    const ledger = [
      rec({ observations: [{ region: 'arms', note: 'hard to tell', direction: 'unclear', confidence: 0.9 }] }),
    ];
    expect(recentDiscoveries(ledger)).toEqual([]);
  });

  it('returns newest first and caps at n', () => {
    const ledger = [
      rec({ at: '2026-07-01T00:00:00Z', hypothesis: 'one' }),
      rec({ at: '2026-07-03T00:00:00Z', hypothesis: 'three' }),
      rec({ at: '2026-07-02T00:00:00Z', hypothesis: 'two' }),
    ];
    expect(recentDiscoveries(ledger, 2)).toEqual(['three', 'two']);
  });
});

describe('sanitizeObservations', () => {
  it('passes well-formed observations through', () => {
    const out = sanitizeObservations([
      { region: 'waist', note: 'appears tighter', direction: 'loss', confidence: 0.7 },
    ]);
    expect(out).toEqual([
      { region: 'waist', note: 'appears tighter', direction: 'loss', confidence: 0.7 },
    ]);
  });

  it('drops malformed entries instead of storing garbage', () => {
    const out = sanitizeObservations([
      null,
      42,
      { note: 'no region', direction: 'gain', confidence: 1 },
      { region: '  ', note: 'blank region', direction: 'gain', confidence: 1 },
      { region: 'ok', note: 'valid', direction: 'gain', confidence: 1 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].region).toBe('ok');
  });

  it('coerces unknown directions to unclear and clamps confidence', () => {
    const out = sanitizeObservations([
      { region: 'arms', note: 'x', direction: 'shredded', confidence: 9 },
      { region: 'legs', note: 'y', direction: 'loss', confidence: -1 },
    ]);
    expect(out[0]).toMatchObject({ direction: 'unclear', confidence: 1 });
    expect(out[1]).toMatchObject({ direction: 'loss', confidence: 0 });
  });

  it('defaults a missing confidence to 0.5 and caps the count', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      region: `r${i}`,
      note: 'n',
      direction: 'stable',
    }));
    const out = sanitizeObservations(many);
    expect(out).toHaveLength(5);
    expect(out[0].confidence).toBe(0.5);
  });

  it('returns empty for non-arrays', () => {
    expect(sanitizeObservations(undefined)).toEqual([]);
    expect(sanitizeObservations('nope')).toEqual([]);
  });

  it('keeps valid arrow geometry (favour, x, y, pct) — 2a.3', () => {
    const out = sanitizeObservations([
      { region: 'waist', note: 't', direction: 'loss', confidence: 0.8, favour: 'good', x: 0.5, y: 0.6, pct: 4 },
    ]);
    expect(out[0]).toMatchObject({ favour: 'good', x: 0.5, y: 0.6, pct: 4 });
  });

  it('drops malformed geometry fields but keeps the observation', () => {
    const out = sanitizeObservations([
      { region: 'waist', note: 't', direction: 'loss', confidence: 0.8, favour: 'sideways', x: 2, y: 'no', pct: -3 },
    ]);
    // Bad favour + out-of-range/non-numeric coords drop to undefined; the note
    // survives. x is clamped to 1; pct is stored as its magnitude.
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ region: 'waist', favour: undefined, x: 1, y: undefined, pct: 3 });
  });
});
