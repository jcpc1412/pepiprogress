import { describe, expect, it } from 'vitest';

import {
  CROP_PADDING,
  MIN_CROP_CONFIDENCE,
  cropToImageStyle,
  displayCrop,
  framingFill,
  type CropBox,
} from './photo-crop';

const box = (over: Partial<CropBox> = {}): CropBox => ({
  x: 0.3,
  y: 0.2,
  w: 0.4,
  h: 0.5,
  confidence: 0.9,
  ...over,
});

describe('displayCrop', () => {
  it('renders full frame with no box', () => {
    expect(displayCrop(undefined)).toBeNull();
  });

  it('ignores a box below the confidence floor', () => {
    expect(displayCrop(box({ confidence: MIN_CROP_CONFIDENCE - 0.01 }))).toBeNull();
  });

  it('accepts a box at the confidence floor', () => {
    expect(displayCrop(box({ confidence: MIN_CROP_CONFIDENCE }))).not.toBeNull();
  });

  it('pads the box outward by the configured fraction', () => {
    const r = displayCrop(box(), 0.1)!;
    expect(r.x).toBeCloseTo(0.2, 5);
    expect(r.y).toBeCloseTo(0.1, 5);
    expect(r.w).toBeCloseTo(0.6, 5); // 0.4 + 2*0.1
    expect(r.h).toBeCloseTo(0.7, 5); // 0.5 + 2*0.1
  });

  it('clamps padding at the frame edges', () => {
    const r = displayCrop(box({ x: 0, y: 0, w: 0.4, h: 0.4 }), 0.1)!;
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.w).toBeCloseTo(0.5, 5);
  });

  it('rejects degenerate boxes', () => {
    expect(displayCrop(box({ w: 0 }))).toBeNull();
    expect(displayCrop(box({ h: -0.2 }))).toBeNull();
    expect(displayCrop(box({ x: NaN }))).toBeNull();
    expect(displayCrop(box({ confidence: NaN }))).toBeNull();
  });

  it('declines to crop when the padded box is basically the whole frame', () => {
    expect(displayCrop(box({ x: 0, y: 0, w: 1, h: 1 }))).toBeNull();
    expect(displayCrop(box({ x: 0.01, y: 0.01, w: 0.98, h: 0.98 }))).toBeNull();
  });

  it('uses a generous default padding', () => {
    expect(CROP_PADDING).toBeGreaterThan(0);
    const r = displayCrop(box())!;
    expect(r.w).toBeCloseTo(0.4 + 2 * CROP_PADDING, 5);
  });
});

describe('cropToImageStyle', () => {
  it('is the identity for a full-frame rect', () => {
    expect(cropToImageStyle({ x: 0, y: 0, w: 1, h: 1 })).toEqual({
      width: 100,
      height: 100,
      left: 0,
      top: 0,
    });
  });

  it('scales and offsets a centered half-frame crop', () => {
    const s = cropToImageStyle({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    expect(s.width).toBeCloseTo(200, 5);
    expect(s.height).toBeCloseTo(200, 5);
    expect(s.left).toBeCloseTo(-50, 5);
    expect(s.top).toBeCloseTo(-50, 5);
  });

  it('keeps the crop origin at the container origin', () => {
    // The crop's top-left must land at 0,0: left + x*width === 0.
    const crop = { x: 0.3, y: 0.1, w: 0.4, h: 0.6 };
    const s = cropToImageStyle(crop);
    expect(s.left + crop.x * s.width).toBeCloseTo(0, 5);
    expect(s.top + crop.y * s.height).toBeCloseTo(0, 5);
  });
});

describe('framingFill', () => {
  it('is undefined without a usable box', () => {
    expect(framingFill(undefined)).toBeUndefined();
    expect(framingFill(box({ confidence: 0.1 }))).toBeUndefined();
    expect(framingFill(box({ w: 0 }))).toBeUndefined();
  });

  it('is the box area', () => {
    expect(framingFill(box({ w: 0.5, h: 0.5 }))).toBeCloseTo(0.25, 5);
  });

  it('never exceeds 1', () => {
    expect(framingFill(box({ w: 1.2, h: 1.2 }))).toBe(1);
  });
});
