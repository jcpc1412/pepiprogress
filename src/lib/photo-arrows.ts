/**
 * On-photo arrow geometry (2a.4). Pure, deterministic layout for the region
 * markers the vision model returns (2a.3): each observation carries a normalized
 * `x`/`y` on the new photo, a `direction` (grew/shrank), and a `favour` (good/bad).
 *
 * This module turns those into pixel-space markers + leader lines: the glyph
 * sits OFF the body (pushed toward the nearer frame edge) so it never obscures
 * the subject, a straight line connects it back to the region, and clustered
 * markers are de-overlapped vertically (the collision case the mockup flagged,
 * esp. on the face). Direction and favour stay independent — the glyph encodes
 * grew/shrank, the colour (resolved by the component) encodes whether that is
 * good. No React here so the math is unit-testable with no render.
 */

import type { PhotoObservation } from '@/lib/photo-observations';

export type ArrowGlyph = '▲' | '▼' | '—';
export type ArrowFavour = 'good' | 'bad' | 'none' | 'watch';

export type ArrowMarker = {
  key: string;
  obs: PhotoObservation;
  glyph: ArrowGlyph;
  favour: ArrowFavour;
  /** Region anchor point on the photo, in px (where the change is). */
  ax: number;
  ay: number;
  /** Marker (glyph) point in px, offset off the body toward the nearer edge. */
  mx: number;
  my: number;
  /** Leader line from the anchor to the marker. */
  length: number;
  angleDeg: number;
};

/** Body measurements that can render as their own arrows (2a.5). */
export type MeasureKey = 'neck' | 'chest' | 'arms' | 'waist' | 'hips' | 'thighs';

/** Approximate anatomical positions on a front body photo, normalized 0..1 from
 *  the top-left. V1 is a fixed map (measurement arrows are a small, objective
 *  layer); landmark-anchored placement rides 2c tier 2, same as the 2a.7 overlay. */
export const MEASURE_POS: Record<MeasureKey, { x: number; y: number }> = {
  neck: { x: 0.5, y: 0.16 },
  chest: { x: 0.5, y: 0.34 },
  arms: { x: 0.8, y: 0.42 },
  waist: { x: 0.5, y: 0.52 },
  hips: { x: 0.5, y: 0.63 },
  thighs: { x: 0.44, y: 0.78 },
};

/** Stable iteration order over the measurement keys. */
export const MEASURE_KEYS = Object.keys(MEASURE_POS) as MeasureKey[];

const MEASURE_EPS = 0.1; // ignore sub-0.1 measurement noise (either unit)

export type MeasureMarker = { key: MeasureKey; delta: number; x: number; y: number };

/**
 * Objective measurement deltas between two check-ins, as positioned markers
 * (2a.5). Unlike the vision arrows these carry a MEASURED magnitude (the caller
 * shows it confidently), so direction is just the sign of the delta and valence
 * is left neutral — the AI arrows own the good/bad story.
 */
export function measurementDeltas(
  curr: Partial<Record<MeasureKey, number>>,
  prev: Partial<Record<MeasureKey, number>>,
): MeasureMarker[] {
  const out: MeasureMarker[] = [];
  for (const key of Object.keys(MEASURE_POS) as MeasureKey[]) {
    const c = curr[key];
    const p = prev[key];
    if (typeof c === 'number' && typeof p === 'number') {
      const delta = c - p;
      if (Math.abs(delta) >= MEASURE_EPS) out.push({ key, delta, ...MEASURE_POS[key] });
    }
  }
  return out;
}

const MARKER_OFFSET = 0.14; // glyph sits this fraction of the width off its region
const EDGE_PAD = 16; // keep glyphs this many px off the frame edge
const MIN_GAP = 30; // min vertical spacing between glyphs stacked on one side (px)

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** ▲ grew / ▼ shrank / — held-or-unclear. The direction axis only. */
export function glyphFor(direction: PhotoObservation['direction']): ArrowGlyph {
  return direction === 'gain' ? '▲' : direction === 'loss' ? '▼' : '—';
}

/** The valence axis; a pre-2a.3 observation with no favour reads as neutral. */
export function favourFor(o: PhotoObservation): ArrowFavour {
  return o.favour ?? 'none';
}

/**
 * Place every positionable observation as a marker + leader line over a photo of
 * size `w`×`h`. Observations without coords (pre-2a.3 records) are skipped.
 */
export function layoutArrowMarkers(observations: PhotoObservation[], w: number, h: number): ArrowMarker[] {
  if (w <= 0 || h <= 0) return [];

  type Raw = {
    obs: PhotoObservation;
    idx: number;
    ax: number;
    ay: number;
    side: -1 | 1;
    mx: number;
    my: number;
  };
  const raws: Raw[] = [];
  observations.forEach((obs, idx) => {
    if (typeof obs.x !== 'number' || typeof obs.y !== 'number') return;
    const ax = clamp(obs.x, 0, 1) * w;
    const ay = clamp(obs.y, 0, 1) * h;
    // Push the glyph toward the nearer horizontal edge (over background, not body).
    const side: -1 | 1 = obs.x < 0.5 ? -1 : 1;
    const mx = clamp(ax + side * MARKER_OFFSET * w, EDGE_PAD, w - EDGE_PAD);
    raws.push({ obs, idx, ax, ay, side, mx, my: ay });
  });

  // De-overlap vertically within each side so clustered markers fan out.
  for (const side of [-1, 1] as const) {
    const group = raws.filter((r) => r.side === side).sort((a, b) => a.my - b.my);
    for (let i = 1; i < group.length; i++) {
      if (group[i].my - group[i - 1].my < MIN_GAP) group[i].my = group[i - 1].my + MIN_GAP;
    }
    for (const r of group) r.my = clamp(r.my, EDGE_PAD, h - EDGE_PAD);
  }

  return raws.map((r) => {
    const dx = r.mx - r.ax;
    const dy = r.my - r.ay;
    return {
      key: `${r.idx}-${r.obs.region}`,
      obs: r.obs,
      glyph: glyphFor(r.obs.direction),
      favour: favourFor(r.obs),
      ax: r.ax,
      ay: r.ay,
      mx: r.mx,
      my: r.my,
      length: Math.hypot(dx, dy),
      angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
    };
  });
}
