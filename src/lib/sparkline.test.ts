import { describe, expect, it } from 'vitest';

import { sparkline } from '@/lib/sparkline';

describe('sparkline', () => {
  it('returns empty for no data', () => {
    expect(sparkline([])).toBe('');
  });

  it('renders a flat series as a single repeated mid bar', () => {
    const s = sparkline([5, 5, 5]);
    expect(s).toBe('▄▄▄');
  });

  it('maps min to the lowest bar and max to the highest', () => {
    const s = sparkline([0, 10]);
    expect(s[0]).toBe('▁');
    expect(s[s.length - 1]).toBe('█');
  });

  it('downsamples long series to the cap, keeping first and last', () => {
    const values = Array.from({ length: 40 }, (_, i) => i);
    const s = sparkline(values, 8);
    expect(s.length).toBe(8);
    expect(s[0]).toBe('▁');
    expect(s[s.length - 1]).toBe('█');
  });
});
