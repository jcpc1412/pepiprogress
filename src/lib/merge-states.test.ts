import { describe, expect, it } from 'vitest';

import { mergeStates } from '@/lib/merge-states';
import type { LocalProfile, PersistedState } from '@/lib/store';

/**
 * Verification of the cloud-save merge (the core of restore-on-sign-in). These
 * are pure-function checks on mergeStates: the account-creation flow itself
 * (migrateToCloud + pushSnapshot) hits Supabase and is traced separately.
 */

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

describe('mergeStates — cloud-save restore/merge', () => {
  it('keeps the newer check-in per date (last-write-wins on updatedAt)', () => {
    const local = state({
      entries: { '2026-07-01': { date: '2026-07-01', weight: 80, updatedAt: '2026-07-01T10:00:00Z' } },
    });
    const cloud = state({
      entries: { '2026-07-01': { date: '2026-07-01', weight: 79, updatedAt: '2026-07-01T08:00:00Z' } },
    });
    expect(mergeStates(local, cloud).entries['2026-07-01'].weight).toBe(80); // local is newer
    expect(mergeStates(cloud, local).entries['2026-07-01'].weight).toBe(80); // still the newer one
  });

  it('unions id-keyed arrays and takes the newer by updatedAt', () => {
    const local = state({
      doseEvents: [
        { id: 'a', takenAt: '2026-07-01T09:00:00Z', updatedAt: '2026-07-01T09:00:00Z' },
        { id: 'b', takenAt: '2026-07-02T09:00:00Z', updatedAt: '2026-07-02T09:00:00Z' },
      ],
    });
    const cloud = state({
      doseEvents: [{ id: 'a', takenAt: '2026-07-01T09:00:00Z', dose: 99, updatedAt: '2026-07-01T07:00:00Z' }],
    });
    const merged = mergeStates(local, cloud).doseEvents;
    expect(merged).toHaveLength(2); // union of a + b
    expect(merged.find((d) => d.id === 'a')?.dose).toBeUndefined(); // local 'a' is newer, no dose
  });

  it('unions photos by capture time without duplicating', () => {
    const p = (takenAt: string, id: string) => ({ id, session: 'body' as const, uri: `f://${id}`, takenAt });
    const local = state({ photos: [p('2026-07-01T09:00:00Z', 'l1')] });
    const cloud = state({ photos: [p('2026-07-01T09:00:00Z', 'c1'), p('2026-07-02T09:00:00Z', 'c2')] });
    const photos = mergeStates(local, cloud).photos;
    expect(photos).toHaveLength(2); // same takenAt de-duped, plus the extra
  });

  it('deduplicates metric readings by provider|metric|ts', () => {
    const r = { id: 'x', metric: 'body.weight', value: 80, ts: '2026-07-01T00:00:00Z', sourceProvider: 'apple_health' };
    const merged = mergeStates(state({ metricReadings: [r] }), state({ metricReadings: [{ ...r, id: 'y' }] }));
    expect(merged.metricReadings).toHaveLength(1);
  });

  it('lets this-device state win for native health, but cloud win for others', () => {
    const local = state({
      integrations: {
        apple_health: { connectedAt: '2026-07-01T00:00:00Z' },
      },
    });
    const cloud = state({
      integrations: {
        apple_health: { connectedAt: '2026-06-01T00:00:00Z' }, // stale cloud auth
        terra: { connectedAt: '2026-06-15T00:00:00Z' },
      },
    });
    const merged = mergeStates(local, cloud).integrations;
    expect(merged.apple_health.connectedAt).toBe('2026-07-01T00:00:00Z'); // device truth
    expect(merged.terra.connectedAt).toBe('2026-06-15T00:00:00Z'); // cloud carried over
  });

  it('keeps device-local notification prefs and derives compoundSlugs from merged protocol', () => {
    const local = state({
      profile: profile({ notifyCheckinTime: '21:30', notifyCheckinEnabled: true }),
      protocolItems: [{ id: 'p1', compoundSlug: 'bpc-157' }],
    });
    const cloud = state({
      profile: profile({ notifyCheckinTime: '08:00', displayName: 'Alex' }),
      protocolItems: [{ id: 'p2', compoundSlug: 'tb-500' }],
    });
    const merged = mergeStates(local, cloud).profile;
    expect(merged.notifyCheckinTime).toBe('21:30'); // device-local pref preserved
    expect(merged.displayName).toBe('Alex'); // cloud authoritative for identity
    expect([...merged.compoundSlugs].sort()).toEqual(['bpc-157', 'tb-500']); // from merged items
  });
});
