/**
 * Tea Bloom template bank (Gauntlet 12 — «Чайный бутон»).
 *
 * Selected story: route objective on a full mixed normal cup. Feasibility
 * (5000 shaped 4c/6v 4,4,4,4,0,0, random full-mixed bud host, production
 * solver): 5000 solvable, 0 truncated, L1 5000, L2 136 (2.7%), L3A 38,
 * L3B 98, canonL2 136, solver p95 61ms, delta(bud-plain) p50 0 p95 1 max 1,
 * CONTROL_EMPTY 42.4% / AVOIDS 57.6%, bloomDiv p50 0.89 (late overall) but
 * L2 blooms early-mid (p50 0.33, never final-quarter), reuse gaps delayed
 * in curated bank (all >=3).
 *
 * Every template is L2-strong AND permutation-robust: the production solver
 * finds an optimal solution that BLOOMS the host (complete emptying clears
 * tea_bud), later refills it to >=2 (MEANINGFUL_REUSE), clears the bud and
 * wins — under the identity role mapping AND under random c0..c3
 * bijections (8/8 trials each; depth holds exactly as a full isomorphism
 * and the returned optimal retains L2). Bank is 18/18 L3 (8 WORKSPACE_CYCLE
 * + 10 FINAL_REPURPOSE, with overlap possible), 15/18 route-influenced
 * (plain-control optimal never empties the host), depths 10-14 (sweet
 * 11-13).
 *
 * Discovery: offline `scripts/dev/tea-bloom-search.ts` +
 * `scripts/dev/tea-bloom-curate-robust.ts` over the exact production
 * topology, relativized with c0..c3 fully permutable (bud is tea-color
 * agnostic) and host index permuted across 0..5 (all constraints normal —
 * exact vessel-permutation isomorphism, depth preserved). Curation pool:
 * 2215 shaped → 60 robust canonical-distinct L2 (inBand 10-14: 60);
 * best 18 committed below (blooms at moves 1-7, reuse gaps 1-7 with 17/18
 * >=2, bloomDiv <=0.50).
 *
 * Pure domain data + instantiation helpers. No React/Pixi imports.
 * Runtime re-validates each instantiation through `finalizeCandidate`.
 */

import type { TeaId } from '../types';

/** Palette-relative tea role inside template cup patterns (all permutable). */
export type TeaBloomTeaRole = 'c0' | 'c1' | 'c2' | 'c3';

export type TeaBloomTemplateKind = 'tea-bloom';

export interface TeaBloomTemplate {
  id: string;
  kind: TeaBloomTemplateKind;
  /** Discovered solver depth in pours (audit trail; runtime re-validates exactly). */
  depth: number;
  /** Final slot order (`[]` = empty vessel; layer counts are 4,4,4,4,0,0 in some order). */
  cups: TeaBloomTeaRole[][];
  /** Initial tea-bud host slot (full mixed vessel). */
  teaBudHost: number;
}

/** Generation contract the kind serves (mirrors the canonical request). */
export interface TeaBloomTemplateSpec {
  numColors: number;
  emptyCups: number;
  hasMysteryLayer: boolean;
  sourceOnlyCount: number;
}

export const TEA_BLOOM_TEMPLATE_SPECS: Record<TeaBloomTemplateKind, TeaBloomTemplateSpec> = {
  'tea-bloom': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 0 },
};

/** Measured depth bands from robust L2 data (robust L2 hist 10:6/11:16/12:16/13:14/14:8 over curation pool). Sweet 11–13, accept 10–14. */
export const TEA_BLOOM_DEPTH_SWEET: { min: number; max: number } = { min: 11, max: 13 };
export const TEA_BLOOM_DEPTH_ACCEPT: { min: number; max: number } = { min: 10, max: 14 };

/** Bounded runtime template attempts (never a 150-scan for tea-bloom). */
export const TEA_BLOOM_TEMPLATE_ATTEMPTS = 4;

export const TEA_BLOOM_TEMPLATE_BANK: Record<TeaBloomTemplateKind, TeaBloomTemplate[]> = {
  'tea-bloom': [
    { id: 'tea-bloom-12-502665', kind: 'tea-bloom', depth: 12, cups: [['c2','c3','c2','c2'],['c3','c2','c3','c0'],['c0','c0','c1','c0'],['c1','c3','c1','c1'],[],[]], teaBudHost: 1 },
    { id: 'tea-bloom-12-500476', kind: 'tea-bloom', depth: 12, cups: [['c3','c0','c0','c3'],['c0','c3','c1','c2'],['c2','c2','c0','c3'],['c1','c2','c1','c1'],[],[]], teaBudHost: 2 },
    { id: 'tea-bloom-12-502154', kind: 'tea-bloom', depth: 12, cups: [['c0','c0','c2','c2'],['c3','c0','c1','c3'],['c3','c0','c1','c3'],['c1','c2','c2','c1'],[],[]], teaBudHost: 0 },
    { id: 'tea-bloom-11-502478', kind: 'tea-bloom', depth: 11, cups: [['c1','c1','c1','c2'],['c2','c0','c2','c1'],['c2','c0','c0','c3'],['c3','c0','c3','c3'],[],[]], teaBudHost: 0 },
    { id: 'tea-bloom-13-502448', kind: 'tea-bloom', depth: 13, cups: [['c3','c3','c1','c1'],['c2','c0','c2','c0'],['c2','c1','c3','c0'],['c0','c2','c3','c1'],[],[]], teaBudHost: 0 },
    { id: 'tea-bloom-11-502496', kind: 'tea-bloom', depth: 11, cups: [['c1','c3','c1','c1'],['c2','c2','c3','c1'],['c2','c2','c0','c3'],['c0','c3','c0','c0'],[],[]], teaBudHost: 0 },
    { id: 'tea-bloom-10-501374', kind: 'tea-bloom', depth: 10, cups: [['c0','c1','c1','c0'],['c2','c3','c3','c2'],['c0','c1','c1','c0'],['c3','c3','c2','c2'],[],[]], teaBudHost: 0 },
    { id: 'tea-bloom-10-500443', kind: 'tea-bloom', depth: 10, cups: [['c3','c3','c2','c0'],['c0','c3','c1','c1'],['c3','c1','c1','c0'],[],[],['c2','c2','c2','c0']], teaBudHost: 5 },
    { id: 'tea-bloom-11-500567', kind: 'tea-bloom', depth: 11, cups: [['c3','c3','c1','c0'],['c3','c1','c1','c2'],['c2','c2','c0','c2'],['c0','c0','c1','c3'],[],[]], teaBudHost: 3 },
    { id: 'tea-bloom-11-500349', kind: 'tea-bloom', depth: 11, cups: [['c0','c2','c3','c1'],['c3','c3','c1','c1'],['c0','c0','c2','c2'],['c0','c1','c2','c3'],[],[]], teaBudHost: 1 },
    { id: 'tea-bloom-11-500919', kind: 'tea-bloom', depth: 11, cups: [['c0','c1','c0','c3'],['c3','c3','c2','c3'],['c2','c1','c2','c2'],['c0','c0','c1','c1'],[],[]], teaBudHost: 1 },
    { id: 'tea-bloom-12-503081', kind: 'tea-bloom', depth: 12, cups: [['c0','c3','c3','c2'],['c1','c3','c2','c1'],['c1','c3','c2','c1'],['c0','c0','c0','c2'],[],[]], teaBudHost: 3 },
    { id: 'tea-bloom-12-502370', kind: 'tea-bloom', depth: 12, cups: [['c0','c0','c0','c3'],['c1','c2','c0','c3'],['c3','c1','c2','c2'],['c1','c2','c1','c3'],[],[]], teaBudHost: 0 },
    { id: 'tea-bloom-13-501491', kind: 'tea-bloom', depth: 13, cups: [['c3','c0','c2','c2'],['c1','c3','c2','c1'],['c3','c0','c1','c1'],['c0','c2','c0','c3'],[],[]], teaBudHost: 3 },
    { id: 'tea-bloom-13-501992', kind: 'tea-bloom', depth: 13, cups: [['c0','c1','c3','c3'],['c1','c0','c0','c3'],['c1','c2','c0','c2'],['c1','c2','c3','c2'],[],[]], teaBudHost: 0 },
    { id: 'tea-bloom-13-503030', kind: 'tea-bloom', depth: 13, cups: [['c1','c0','c3','c3'],['c1','c0','c3','c0'],['c2','c1','c0','c2'],['c1','c3','c2','c2'],[],[]], teaBudHost: 0 },
    { id: 'tea-bloom-14-501837', kind: 'tea-bloom', depth: 14, cups: [['c2','c1','c3','c2'],['c0','c3','c0','c3'],['c2','c3','c0','c1'],['c2','c0','c1','c1'],[],[]], teaBudHost: 1 },
    { id: 'tea-bloom-14-500663', kind: 'tea-bloom', depth: 14, cups: [['c3','c1','c0','c1'],['c3','c0','c2','c3'],['c2','c3','c2','c2'],['c1','c0','c1','c0'],[],[]], teaBudHost: 3 },
  ],
};

/** All bank templates flattened (bank validation tests iterate this). */
export const ALL_TEA_BLOOM_TEMPLATES: TeaBloomTemplate[] = [
  ...TEA_BLOOM_TEMPLATE_BANK['tea-bloom'],
];

/**
 * Instantiate a template against a concrete palette + role bijection.
 * `order`: palette teas serving roles c0..c3 (seeded permutation). Any
 * bijection is a full puzzle isomorphism (bud is tea-color agnostic,
 * host stays mixed len-4, tea counts preserved), so the discovered depth
 * holds exactly.
 */
export function instantiateTeaBloomTemplate(
  tpl: TeaBloomTemplate,
  palette: TeaId[],
  order: TeaId[] = [...palette],
): { cups: TeaId[][]; teaBudHost: number } {
  const roleToTea = new Map<TeaBloomTeaRole, TeaId>([
    ['c0', order[0] as TeaId],
    ['c1', order[1] as TeaId],
    ['c2', order[2] as TeaId],
    ['c3', order[3] as TeaId],
  ]);
  const cups = tpl.cups.map((cup) => cup.map((role) => roleToTea.get(role) as TeaId));
  return { cups, teaBudHost: tpl.teaBudHost };
}
