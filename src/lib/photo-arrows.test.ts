import { describe, expect, it } from 'vitest';

import { favourFor, glyphFor, layoutArrowMarkers } from '@/lib/photo-arrows';
import type { PhotoObservation } from '@/lib/photo-observations';

const obs = (o: Partial<PhotoObservation>): PhotoObservation => ({
  region: 'waist',
  note: 'appears tighter',
  direction: 'loss',
  confidence: 0.8,
  ...o,
});

describe('glyphFor', () => {
  it('maps direction to the grew/shrank glyph, independent of favour', () => {
    expect(glyphFor('gain')).toBe('▲');
    expect(glyphFor('loss')).toBe('▼');
    expect(glyphFor('stable')).toBe('—');
    expect(glyphFor('unclear')).toBe('—');
  });
});

describe('favourFor', () => {
  it('reads the favour axis, defaulting a pre-2a.3 record to neutral', () => {
    expect(favourFor(obs({ favour: 'good' }))).toBe('good');
    expect(favourFor(obs({ favour: undefined }))).toBe('none');
  });
});

describe('layoutArrowMarkers', () => {
  it('skips observations without coordinates', () => {
    const out = layoutArrowMarkers([obs({ x: undefined, y: undefined })], 300, 400);
    expect(out).toHaveLength(0);
  });

  it('returns nothing for a zero-size frame', () => {
    expect(layoutArrowMarkers([obs({ x: 0.5, y: 0.5 })], 0, 400)).toEqual([]);
  });

  it('anchors the marker on the region and pushes the glyph off the nearer edge', () => {
    // Left-half region → glyph pushed left; right-half → pushed right.
    const [left] = layoutArrowMarkers([obs({ x: 0.3, y: 0.5 })], 300, 400);
    expect(left.ax).toBe(90);
    expect(left.ay).toBe(200);
    expect(left.mx).toBeLessThan(left.ax);

    const [right] = layoutArrowMarkers([obs({ x: 0.7, y: 0.5 })], 300, 400);
    expect(right.mx).toBeGreaterThan(right.ax);
  });

  it('keeps glyphs off the frame edge', () => {
    const [m] = layoutArrowMarkers([obs({ x: 0.02, y: 0.5 })], 300, 400);
    expect(m.mx).toBeGreaterThanOrEqual(16);
  });

  it('de-overlaps markers stacked close together on the same side', () => {
    const out = layoutArrowMarkers(
      [
        obs({ region: 'a', x: 0.7, y: 0.5 }),
        obs({ region: 'b', x: 0.72, y: 0.5 }),
        obs({ region: 'c', x: 0.71, y: 0.51 }),
      ],
      300,
      400,
    );
    const ys = out.map((m) => m.my).sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(30);
    expect(ys[2] - ys[1]).toBeGreaterThanOrEqual(30);
  });

  it('carries the glyph, favour, and line geometry through', () => {
    const [m] = layoutArrowMarkers([obs({ direction: 'gain', favour: 'good', x: 0.5, y: 0.5 })], 300, 400);
    expect(m.glyph).toBe('▲');
    expect(m.favour).toBe('good');
    expect(m.length).toBeGreaterThan(0);
    expect(Number.isFinite(m.angleDeg)).toBe(true);
  });
});
