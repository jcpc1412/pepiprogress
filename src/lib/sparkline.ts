/**
 * Text sparkline: map a numeric series to Unicode block bars (redesign R2-C, the
 * mockup frame-2 signal row). Pure + deterministic. Long series are evenly
 * downsampled so the glyph string stays row-sized.
 */

const BARS = '▁▂▃▄▅▆▇█';

/** Evenly sample `values` down to at most `max` points (keeps first + last). */
function sample(values: number[], max: number): number[] {
  if (values.length <= max) return values;
  const out: number[] = [];
  for (let i = 0; i < max; i++) {
    out.push(values[Math.round((i * (values.length - 1)) / (max - 1))]);
  }
  return out;
}

/** Render values as a bar string. Flat series render as a mid bar. */
export function sparkline(values: number[], maxPoints = 10): string {
  if (values.length === 0) return '';
  const pts = sample(values, maxPoints);
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  if (max === min) return BARS[3].repeat(pts.length);
  return pts
    .map((v) => {
      const idx = Math.round(((v - min) / (max - min)) * (BARS.length - 1));
      return BARS[Math.max(0, Math.min(BARS.length - 1, idx))];
    })
    .join('');
}
