/**
 * Display-time auto-crop (W6-28, beta-notes §1.2). `analyze_photo` returns a
 * normalized torso bounding box alongside its read; we store it and apply it as
 * a DISPLAY crop only.
 *
 * DECIDED (§1.2): never destructive. The original file is never modified or
 * re-encoded, so a better box later can re-crop from the full frame. A bad
 * auto-crop baked into storage would be unrecoverable.
 *
 * The model's boxes are decent but not pixel-perfect, so this module is
 * deliberately conservative: generous padding, a confidence floor, and a
 * fall-back-to-uncropped on anything degenerate. Pure + deterministic.
 */

/** A normalized (0..1) box in image space, as returned by the vision model. */
export type CropBox = { x: number; y: number; w: number; h: number; confidence: number };

/** Below this confidence the box is ignored and the photo renders uncropped. */
export const MIN_CROP_CONFIDENCE = 0.6;

/** Outward padding applied to the model box, as a fraction of the frame. */
export const CROP_PADDING = 0.08;

/** A padded box covering at least this much of the frame is not worth cropping. */
const NO_OP_AREA = 0.98;

export type Rect = { x: number; y: number; w: number; h: number };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Normalize -0 to 0. Negation yields -0 at the origin, which serializes into
 *  style strings as "-0%" and trips equality checks for no reason. */
const nz = (n: number) => (n === 0 ? 0 : n);

/**
 * Turn a model box into a display rect, or null to render the full frame.
 * Null is returned for: no box, low confidence, degenerate/out-of-range boxes,
 * and boxes that after padding cover essentially the whole frame.
 */
export function displayCrop(box: CropBox | undefined, pad: number = CROP_PADDING): Rect | null {
  if (!box) return null;
  if (!Number.isFinite(box.confidence) || box.confidence < MIN_CROP_CONFIDENCE) return null;
  if (!Number.isFinite(box.x) || !Number.isFinite(box.y)) return null;
  if (!(box.w > 0) || !(box.h > 0)) return null;

  const x0 = clamp01(box.x - pad);
  const y0 = clamp01(box.y - pad);
  const x1 = clamp01(box.x + box.w + pad);
  const y1 = clamp01(box.y + box.h + pad);

  const w = x1 - x0;
  const h = y1 - y0;
  if (!(w > 0) || !(h > 0)) return null;
  if (w * h >= NO_OP_AREA) return null;

  return { x: x0, y: y0, w, h };
}

/**
 * Percentage styling that maps `crop` onto a fixed-size, overflow-hidden
 * container: blow the image up to 1/w by 1/h of the container and shift the
 * crop origin to zero. Values are percentages, ready for RN style strings.
 *
 * An identity crop yields 100/100/0/0, so the same code path renders uncropped
 * images without a special case.
 */
export function cropToImageStyle(crop: Rect): {
  width: number;
  height: number;
  left: number;
  top: number;
} {
  const width = 100 / crop.w;
  const height = 100 / crop.h;
  return {
    width,
    height,
    left: nz(-(crop.x / crop.w) * 100),
    top: nz(-(crop.y / crop.h) * 100),
  };
}

/**
 * How much of the frame the subject fills, from the same box (§1.2 tie-in with
 * the quality score's framing component). Returns undefined without a usable
 * box so callers can leave the component out rather than score a guess.
 */
export function framingFill(box: CropBox | undefined): number | undefined {
  if (!box) return undefined;
  if (!Number.isFinite(box.confidence) || box.confidence < MIN_CROP_CONFIDENCE) return undefined;
  if (!(box.w > 0) || !(box.h > 0)) return undefined;
  return Math.min(1, box.w * box.h);
}
