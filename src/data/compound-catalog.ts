import type { Enums } from '@/types/database';

export type CompoundType = Enums<'compound_type'>;

/**
 * On-device copy of the compound catalog (mirrors supabase/seed.sql).
 *
 * Why bundled: onboarding + the field-surfacing engine run local-first and
 * pre-account (spec 02/10), but the `compound` table's RLS is authenticated-only,
 * so an anonymous user can't fetch it. Bundling also keeps onboarding fully
 * offline. When auth + sync land, the hosted catalog becomes the source of truth
 * and this seed is reconciled by `slug` → catalog row.
 *
 * `slug` is the stable local id; it maps to the DB uuid on sync.
 */
export type CatalogCompound = {
  slug: string;
  canonicalName: string;
  aliases: string[];
  type: CompoundType;
  /** controlled=true => track-only, no AI dosing (spec 05/11). */
  controlled: boolean;
  effectTags: string[];
  monitoringTags: string[];
  commonUses: string[];
};

export const COMPOUND_CATALOG: readonly CatalogCompound[] = [
  {
    slug: 'bpc-157',
    canonicalName: 'BPC-157',
    aliases: ['bpc', 'bpc157'],
    type: 'peptide',
    controlled: false,
    effectTags: ['healing', 'recovery', 'gut'],
    monitoringTags: [],
    commonUses: ['injury recovery', 'gut health'],
  },
  {
    slug: 'tb-500',
    canonicalName: 'TB-500',
    aliases: ['tb500', 'thymosin beta-4'],
    type: 'peptide',
    controlled: false,
    effectTags: ['healing', 'recovery'],
    monitoringTags: [],
    commonUses: ['soft-tissue recovery'],
  },
  {
    slug: 'ghk-cu',
    canonicalName: 'GHK-Cu',
    aliases: ['ghk', 'copper peptide'],
    type: 'peptide',
    controlled: false,
    effectTags: ['skin', 'healing'],
    monitoringTags: [],
    commonUses: ['skin', 'hair'],
  },
  {
    slug: 'ipamorelin',
    canonicalName: 'Ipamorelin',
    aliases: ['ipa'],
    type: 'peptide',
    controlled: false,
    effectTags: ['recovery', 'sleep', 'muscle'],
    monitoringTags: [],
    commonUses: ['gh secretagogue'],
  },
  {
    slug: 'cjc-1295',
    canonicalName: 'CJC-1295',
    aliases: ['cjc', 'cjc1295'],
    type: 'peptide',
    controlled: false,
    effectTags: ['recovery', 'muscle'],
    monitoringTags: [],
    commonUses: ['gh secretagogue'],
  },
  {
    slug: 'semaglutide',
    canonicalName: 'Semaglutide',
    aliases: ['sema', 'ozempic', 'wegovy'],
    type: 'glp1',
    controlled: false,
    effectTags: ['fat_loss'],
    monitoringTags: ['appetite', 'nausea'],
    commonUses: ['weight loss'],
  },
  {
    slug: 'tirzepatide',
    canonicalName: 'Tirzepatide',
    aliases: ['tirz', 'mounjaro', 'zepbound'],
    type: 'glp1',
    controlled: false,
    effectTags: ['fat_loss'],
    monitoringTags: ['appetite', 'nausea', 'glucose'],
    commonUses: ['weight loss'],
  },
  {
    slug: 'testosterone',
    canonicalName: 'Testosterone',
    aliases: ['test', 'trt'],
    type: 'hormone',
    controlled: true,
    effectTags: ['muscle', 'libido', 'mood', 'recovery'],
    monitoringTags: ['hematocrit', 'estradiol', 'lipids'],
    commonUses: ['TRT', 'hormone optimization'],
  },
  {
    slug: 'anastrozole',
    canonicalName: 'Anastrozole',
    aliases: ['arimidex', 'ai', 'adex'],
    type: 'ancillary',
    controlled: false,
    effectTags: ['hormonal'],
    monitoringTags: ['estradiol'],
    commonUses: ['aromatase inhibitor'],
  },
  {
    slug: 'enclomiphene',
    canonicalName: 'Enclomiphene',
    aliases: ['enclo'],
    type: 'ancillary',
    controlled: false,
    effectTags: ['hormonal', 'libido'],
    monitoringTags: ['testosterone_total', 'estradiol'],
    commonUses: ['HPTA support'],
  },
  {
    slug: 'mk-677',
    canonicalName: 'MK-677',
    aliases: ['ibutamoren', 'mk677'],
    type: 'other',
    controlled: false,
    effectTags: ['muscle', 'sleep', 'appetite'],
    monitoringTags: ['glucose'],
    commonUses: ['gh secretagogue'],
  },
  {
    slug: 'creatine',
    canonicalName: 'Creatine',
    aliases: ['creatine monohydrate'],
    type: 'supplement',
    controlled: false,
    effectTags: ['muscle', 'cognition'],
    monitoringTags: [],
    commonUses: ['strength', 'performance'],
  },
];

const BY_SLUG = new Map(COMPOUND_CATALOG.map((c) => [c.slug, c]));

export function compoundBySlug(slug: string): CatalogCompound | undefined {
  return BY_SLUG.get(slug);
}
