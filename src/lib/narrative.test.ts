import { describe, expect, it } from 'vitest';

import { buildNarrative, type NarrativeInput } from './narrative';
import type { Benchmark, CheckinEntry, PhotoEntry, ProtocolItem, StrengthSession, SymptomEvent } from './store';

function base(over: Partial<NarrativeInput> = {}): NarrativeInput {
  return {
    protocolItems: [],
    symptomEvents: [],
    entries: {},
    photos: [],
    benchmarks: [],
    strengthSessions: [],
    ...over,
  };
}

const checkin = (date: string, labValues: Record<string, number>): CheckinEntry =>
  ({ date, labValues, updatedAt: `${date}T00:00:00.000Z` }) as CheckinEntry;

describe('buildNarrative', () => {
  it('is empty with no events', () => {
    expect(buildNarrative(base())).toEqual([]);
  });

  it('emits a protocol-start moment with the compound canonical name', () => {
    const items = [{ id: 'p1', compoundSlug: 'testosterone', startedAt: '2026-06-01T00:00:00.000Z' } as ProtocolItem];
    const m = buildNarrative(base({ protocolItems: items }));
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ kind: 'protocol_start', date: '2026-06-01' });
    expect(typeof (m[0] as { compound: string }).compound).toBe('string');
  });

  it('orders moments oldest → newest as a story', () => {
    const m = buildNarrative(
      base({
        protocolItems: [{ id: 'p1', compoundSlug: 'testosterone', startedAt: '2026-06-01T00:00:00.000Z' } as ProtocolItem],
        entries: { '2026-07-01': checkin('2026-07-01', { hematocrit: 52 }) },
      }),
    );
    expect(m.map((x) => x.date)).toEqual(['2026-06-01', '2026-07-01']);
  });

  it('keeps only the first onset per symptom type', () => {
    const symptoms: SymptomEvent[] = [
      { id: 's1', type: 'acne', onsetAt: '2026-06-10T00:00:00.000Z' } as SymptomEvent,
      { id: 's2', type: 'acne', onsetAt: '2026-06-20T00:00:00.000Z' } as SymptomEvent,
      { id: 's3', type: 'headache', onsetAt: '2026-06-15T00:00:00.000Z' } as SymptomEvent,
    ];
    const m = buildNarrative(base({ symptomEvents: symptoms }));
    const acne = m.filter((x) => x.kind === 'symptom' && x.symptomType === 'acne');
    expect(acne).toHaveLength(1);
    expect(acne[0].date).toBe('2026-06-10'); // the earliest
    expect(m.filter((x) => x.kind === 'symptom')).toHaveLength(2);
  });

  it('records only the first reading per lab marker', () => {
    const entries = {
      '2026-06-01': checkin('2026-06-01', { hematocrit: 45 }),
      '2026-07-01': checkin('2026-07-01', { hematocrit: 52, estradiol: 30 }),
    };
    const m = buildNarrative(base({ entries }));
    const hct = m.filter((x) => x.kind === 'lab' && x.marker === 'hematocrit');
    expect(hct).toHaveLength(1);
    expect(hct[0]).toMatchObject({ date: '2026-06-01', value: 45 });
    expect(m.some((x) => x.kind === 'lab' && x.marker === 'estradiol')).toBe(true);
  });

  it('emits a strength PR only on a strict improvement, not the first session', () => {
    const sessions: StrengthSession[] = [
      { id: 'a', date: '2026-06-01', exercise: 'Squat', sets: [{ weight: 100, reps: 5 }] } as StrengthSession,
      { id: 'b', date: '2026-06-15', exercise: 'Squat', sets: [{ weight: 110, reps: 5 }] } as StrengthSession,
      { id: 'c', date: '2026-06-22', exercise: 'Squat', sets: [{ weight: 90, reps: 5 }] } as StrengthSession, // regress, no PR
    ];
    const prs = buildNarrative(base({ strengthSessions: sessions })).filter((x) => x.kind === 'strength_pr');
    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({ date: '2026-06-15', exercise: 'Squat' });
  });

  it('includes benchmarks and comparable photos with a note', () => {
    const m = buildNarrative(
      base({
        benchmarks: [{ id: 'bm', date: '2026-06-05', name: '5k', value: '25:30' } as Benchmark],
        photos: [
          { id: 'ph1', session: 'body', uri: 'x', takenAt: '2026-06-10T00:00:00.000Z', comparable: true, changeNote: 'appears leaner' } as PhotoEntry,
          { id: 'ph2', session: 'body', uri: 'y', takenAt: '2026-06-11T00:00:00.000Z', comparable: false } as PhotoEntry,
        ],
      }),
    );
    expect(m.some((x) => x.kind === 'benchmark')).toBe(true);
    const photos = m.filter((x) => x.kind === 'photo');
    expect(photos).toHaveLength(1); // only the comparable one with a note
    expect((photos[0] as { note: string }).note).toBe('appears leaner');
  });

  it('caps to the most recent `limit` moments', () => {
    const symptoms: SymptomEvent[] = Array.from({ length: 30 }, (_, i) => ({
      id: `s${i}`,
      type: `sym_${i}`,
      onsetAt: `2026-06-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
    })) as SymptomEvent[];
    const m = buildNarrative(base({ symptomEvents: symptoms, limit: 10 }));
    expect(m).toHaveLength(10);
  });
});
