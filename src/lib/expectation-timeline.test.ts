import { describe, expect, it } from 'vitest';

import { resolveTimeline, resolveTimelineGroup } from './expectation-timeline';

describe('resolveTimelineGroup', () => {
  it('maps a GLP-1 to fat_loss', () => {
    expect(resolveTimelineGroup('semaglutide')).toBe('fat_loss');
  });

  it('maps a healing peptide to healing', () => {
    expect(resolveTimelineGroup('bpc-157')).toBe('healing');
  });

  it('maps a GH secretagogue to gh_recovery', () => {
    expect(resolveTimelineGroup('ipamorelin')).toBe('gh_recovery');
  });

  it('maps a copper peptide to skin', () => {
    expect(resolveTimelineGroup('ghk-cu')).toBe('skin');
  });

  it('returns null for controlled compounds (track-only, no pushed timeline)', () => {
    expect(resolveTimelineGroup('testosterone')).toBeNull();
    expect(resolveTimelineGroup('rad-140')).toBeNull(); // SARM, controlled in catalog
  });

  it('returns null for an unknown compound', () => {
    expect(resolveTimelineGroup('not-a-real-slug')).toBeNull();
  });
});

describe('resolveTimeline', () => {
  it('places week 1 in the onset phase for fat_loss', () => {
    const t = resolveTimeline('semaglutide', 1)!;
    expect(t.group).toBe('fat_loss');
    expect(t.phases[t.currentPhaseIndex].key).toBe('onset');
  });

  it('places a mid-cycle week in the correct phase', () => {
    // week 10 falls in fat_loss "continued" (8-16).
    const t = resolveTimeline('semaglutide', 10)!;
    expect(t.phases[t.currentPhaseIndex].key).toBe('continued');
  });

  it('lands a late week on the open-ended plateau phase', () => {
    const t = resolveTimeline('semaglutide', 40)!;
    expect(t.phases[t.currentPhaseIndex].key).toBe('plateau');
  });

  it('returns null for controlled compounds', () => {
    expect(resolveTimeline('testosterone', 4)).toBeNull();
  });

  it('handles the boundary week (phase ranges are inclusive)', () => {
    // week 2 is the end of onset (1-2) and start of early_loss (2-8);
    // findIndex picks the first matching phase.
    const t = resolveTimeline('semaglutide', 2)!;
    expect(t.phases[t.currentPhaseIndex].key).toBe('onset');
  });
});
