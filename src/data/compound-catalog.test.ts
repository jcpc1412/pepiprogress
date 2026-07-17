import { describe, expect, it } from 'vitest';

import { COMPOUND_CATALOG, compoundBySlug, marketCategoryOf } from './compound-catalog';

describe('marketCategoryOf (W4-12 posture derivation)', () => {
  it('controlled flag always wins', () => {
    const testosterone = compoundBySlug('testosterone')!;
    expect(marketCategoryOf(testosterone)).toBe('controlled');
    // even against an explicit override
    expect(marketCategoryOf({ slug: 'x', controlled: true, marketCategory: 'otc' })).toBe(
      'controlled',
    );
  });

  it('every controlled catalog row resolves to controlled', () => {
    for (const c of COMPOUND_CATALOG.filter((c) => c.controlled)) {
      expect(marketCategoryOf(c)).toBe('controlled');
    }
  });

  it('explicit marketCategory wins over slug sets for non-controlled rows', () => {
    expect(marketCategoryOf({ slug: 'creatine', controlled: false, marketCategory: 'otc' })).toBe(
      'otc',
    );
  });

  it('inoffensive and otc slug sets resolve', () => {
    expect(marketCategoryOf(compoundBySlug('creatine')!)).toBe('inoffensive');
    expect(marketCategoryOf(compoundBySlug('nmn')!)).toBe('otc');
    expect(marketCategoryOf(compoundBySlug('berberine')!)).toBe('otc');
  });

  it('everything else defaults to grey (strict-for-lenient), including customs', () => {
    expect(marketCategoryOf(compoundBySlug('bpc-157')!)).toBe('grey');
    expect(marketCategoryOf(compoundBySlug('semaglutide')!)).toBe('grey');
    expect(marketCategoryOf(compoundBySlug('tamoxifen')!)).toBe('grey');
    expect(marketCategoryOf(compoundBySlug('metformin')!)).toBe('grey');
    // custom compound with no catalog identity
    expect(marketCategoryOf({ slug: 'my-custom-blend', controlled: false })).toBe('grey');
  });

  it('SARMs are controlled in the catalog (spec 05 examples put them at grey, catalog flags win)', () => {
    // rad-140 etc. carry controlled: true in our catalog, the stricter posture.
    expect(marketCategoryOf(compoundBySlug('rad-140')!)).toBe('controlled');
  });
});
