import { describe, expect, it } from 'vitest';

import {
  buildMirrorRows,
  carryEntity,
  diffEntity,
  stableHash,
  type SlugMap,
} from '@/lib/normalized-mirror';
import type { LocalProfile, PersistedState } from '@/lib/store';

const profile = (over: Partial<LocalProfile> = {}): LocalProfile => ({
  units: 'metric',
  goals: [],
  compoundSlugs: [],
  onboardingComplete: true,
  addedFields: [],
  removedFields: [],
  ...over,
});

const state = (over: Partial<PersistedState> = {}): PersistedState => ({
  version: 1,
  profile: profile(over.profile),
  entries: {},
  contextNotes: [],
  symptomEvents: [],
  protocolItems: [],
  doseEvents: [],
  inventory: [],
  photos: [],
  metricReadings: [],
  integrations: {},
  customCompounds: [],
  quickLogJobs: [],
  pepiMessages: [],
  strengthSessions: [],
  benchmarks: [],
  ...over,
});

const SLUGS: SlugMap = new Map([
  ['retatrutide', 'uuid-reta'],
  ['bpc-157', 'uuid-bpc'],
]);

describe('stableHash', () => {
  it('is deterministic and key-order independent', () => {
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }));
  });

  it('changes when a value changes', () => {
    expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: 2 }));
  });
});

describe('buildMirrorRows', () => {
  it('maps the full check-in field set including nutrition + measurements', () => {
    const s = state({
      entries: {
        '2026-07-01': {
          date: '2026-07-01',
          weight: 82,
          protein: 180,
          calories: 2400,
          waist: 86,
          extraMeasurementKey: 'arms',
          extraMeasurementValue: 38,
          updatedAt: '2026-07-01T10:00:00Z',
        },
      },
    });
    const build = buildMirrorRows(s, SLUGS, 'en');
    expect(build.logEntries).toHaveLength(1);
    const p = build.logEntries[0].payload;
    expect(p.date).toBe('2026-07-01');
    expect(p.protein).toBe(180);
    expect(p.calories).toBe(2400);
    expect(p.waist).toBe(86);
    expect(p.extra_measurement_key).toBe('arms');
    expect(p.extra_measurement_value).toBe(38);
    expect(build.logEntries[0].key).toBe('2026-07-01');
  });

  it('carries client_id and resolves the compound id for protocol items', () => {
    const s = state({
      protocolItems: [
        { id: 'pi-1', compoundSlug: 'retatrutide', dose: 4, doseUnit: 'mg' },
      ],
    });
    const build = buildMirrorRows(s, SLUGS, 'en');
    expect(build.protocolItems).toHaveLength(1);
    expect(build.protocolItems[0].payload.client_id).toBe('pi-1');
    expect(build.protocolItems[0].payload.compound_id).toBe('uuid-reta');
    expect(build.compoundsResolvable).toBe(true);
  });

  it('skips protocol items whose compound is unknown (NOT NULL compound_id)', () => {
    const s = state({
      protocolItems: [{ id: 'pi-x', compoundSlug: 'mystery-peptide', dose: 1 }],
    });
    expect(buildMirrorRows(s, SLUGS, 'en').protocolItems).toHaveLength(0);
  });

  it('flags compoundsResolvable false when the slug map is empty', () => {
    const s = state({ protocolItems: [{ id: 'pi-1', compoundSlug: 'retatrutide' }] });
    const build = buildMirrorRows(s, new Map(), 'en');
    expect(build.compoundsResolvable).toBe(false);
    expect(build.protocolItems).toHaveLength(0);
  });

  it('resolves a dose compound via its linked protocol item when the dose has no slug', () => {
    const s = state({
      protocolItems: [{ id: 'pi-1', compoundSlug: 'bpc-157' }],
      doseEvents: [{ id: 'd-1', protocolItemId: 'pi-1', takenAt: '2026-07-01T08:00:00Z' }],
    });
    const build = buildMirrorRows(s, SLUGS, 'en');
    expect(build.doseEvents[0].payload.compound_id).toBe('uuid-bpc');
  });

  it('formats symptom duration as a Postgres interval string', () => {
    const s = state({
      symptomEvents: [
        { id: 's-1', type: 'nausea', onsetAt: '2026-07-01T08:00:00Z', durationMinutes: 90, severity: 2 },
      ],
    });
    const build = buildMirrorRows(s, SLUGS, 'en');
    expect(build.symptomEvents[0].payload.duration).toBe('90 minutes');
    expect(build.symptomEvents[0].payload.client_id).toBe('s-1');
  });

  it('mirrors inventory including amount_initial for the depletion bar', () => {
    const s = state({
      inventory: [
        { id: 'inv-1', kind: 'vial', compoundSlug: 'retatrutide', amountRemaining: 8, amountInitial: 10 },
      ],
    });
    const build = buildMirrorRows(s, SLUGS, 'en');
    const p = build.inventoryItems[0].payload;
    expect(p.compound_id).toBe('uuid-reta');
    expect(p.amount_remaining).toBe(8);
    expect(p.amount_initial).toBe(10);
  });
});

describe('diffEntity', () => {
  const s = state({
    symptomEvents: [
      { id: 's-1', type: 'nausea', onsetAt: '2026-07-01T08:00:00Z' },
      { id: 's-2', type: 'headache', onsetAt: '2026-07-02T08:00:00Z' },
    ],
  });
  const rows = buildMirrorRows(s, SLUGS, 'en').symptomEvents;

  it('treats every row as an upsert against empty prior hashes', () => {
    const diff = diffEntity('symptom_event', rows, {});
    expect(diff.upserts).toHaveLength(2);
    expect(diff.deleteKeys).toHaveLength(0);
    expect(Object.keys(diff.next)).toEqual(['symptom_event:s-1', 'symptom_event:s-2']);
  });

  it('skips unchanged rows and only re-upserts a changed one', () => {
    const prev = diffEntity('symptom_event', rows, {}).next;
    // Same rows again → nothing to write.
    expect(diffEntity('symptom_event', rows, prev).upserts).toHaveLength(0);

    // Change s-2's severity → only s-2 re-upserts.
    const s2 = state({
      symptomEvents: [
        { id: 's-1', type: 'nausea', onsetAt: '2026-07-01T08:00:00Z' },
        { id: 's-2', type: 'headache', onsetAt: '2026-07-02T08:00:00Z', severity: 4 },
      ],
    });
    const rows2 = buildMirrorRows(s2, SLUGS, 'en').symptomEvents;
    const diff = diffEntity('symptom_event', rows2, prev);
    expect(diff.upserts.map((r) => r.key)).toEqual(['s-2']);
  });

  it('returns delete keys for rows removed since the last mirror', () => {
    const prev = diffEntity('symptom_event', rows, {}).next;
    // Only s-1 remains locally now.
    const s1 = state({ symptomEvents: [{ id: 's-1', type: 'nausea', onsetAt: '2026-07-01T08:00:00Z' }] });
    const rows1 = buildMirrorRows(s1, SLUGS, 'en').symptomEvents;
    const diff = diffEntity('symptom_event', rows1, prev);
    expect(diff.deleteKeys).toEqual(['s-2']);
    expect(diff.upserts).toHaveLength(0);
  });

  it('namespaces keys so unrelated entities never cross-delete', () => {
    const prev = { 'dose_event:d-1': 'abc', 'symptom_event:s-1': 'def' };
    const diff = diffEntity('symptom_event', rows, prev);
    // The dose_event key is not in this entity's prefix, so it is never a delete.
    expect(diff.deleteKeys).not.toContain('d-1');
  });
});

describe('carryEntity', () => {
  it('carries only the requested entity prefix forward unchanged', () => {
    const prev = { 'protocol_item:pi-1': 'h1', 'dose_event:d-1': 'h2' };
    expect(carryEntity('protocol_item', prev)).toEqual({ 'protocol_item:pi-1': 'h1' });
  });
});
