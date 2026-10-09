/**
 * Cinnamon template bank (Gauntlet 11 — «Палочка корицы»).
 *
 * Selected story: dynamic capacity 2→4. Feasibility (5000 shaped 4c/6v
 * 4,4,3,3,2,0, mixed len-2 cinnamon host, production solver): 5000
 * solvable, 0 truncated, L1 5000, L2 393 (7.9%), L3A 0, L3B 393,
 * canonL2 393, solver p95 43ms, delta(dynamic-plain) p50 1 p95 1 max 2,
 * move-1 unlock 0%. Every L2 repurposes the unlocked vessel as a 4/4
 * final cup (L3B); buffer-cycle L3A never occurs in optimal play, so the
 * bank is L3B by nature (§105 targets apply only if available naturally).
 *
 * Every template is L2-strong: the production solver finds an optimal
 * solution that UNLOCKS the host (complete emptying removes cinnamon),
 * later refills it to >=3 (EXPANDED_USE, always reaching 4/4 final
 * repurpose here), clears the obstacle and wins.
 *
 * Discovery: offline `scripts/dev/cinnamon-search.ts` +
 * `scripts/dev/cinnamon-curate.ts` over the exact production topology,
 * relativized with c0..c3 fully permutable (cinnamon is tea-color
 * agnostic — full isomorphism, so discovered depth holds exactly) and
 * host index permuted across 0..5 (all constraints normal — exact
 * vessel-permutation isomorphism, depth preserved). Curation pool: 1500
 * shaped → 108 canonical-distinct L2; best 18 committed below (measured
 * depth spread 9–13, unlocks at moves 3–7, expansion gaps >=3).
 *
 * Pure domain data + instantiation helpers. No React/Pixi imports.
 * Runtime re-validates each instantiation through `finalizeCandidate`.
 */

import type { TeaId } from '../types';

/** Palette-relative tea role inside template cup patterns (all permutable). */
export type CinnamonTeaRole = 'c0' | 'c1' | 'c2' | 'c3';

export type CinnamonTemplateKind = 'cinnamon';

export interface CinnamonTemplate {
  id: string;
  kind: CinnamonTemplateKind;
  /** Discovered solver depth in pours (audit trail; runtime re-validates exactly). */
  depth: number;
  /** Final slot order (`[]` = empty vessel; layer counts are 4,4,3,3,2,0 in some order). */
  cups: CinnamonTeaRole[][];
  /** Initial cinnamon host slot (length-2 mixed vessel). */
  cinnamonHost: number;
}

/** Generation contract the kind serves (mirrors the canonical request). */
export interface CinnamonTemplateSpec {
  numColors: number;
  emptyCups: number;
  hasMysteryLayer: boolean;
  sourceOnlyCount: number;
}

export const CINNAMON_TEMPLATE_SPECS: Record<CinnamonTemplateKind, CinnamonTemplateSpec> = {
  'cinnamon': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 0 },
};

/** Measured depth bands from L2 data (L2 hist 9:3/10:6/11:18/12:33/13:35/14:13 over curation pool). Sweet 10–12, accept 9–13. */
export const CINNAMON_DEPTH_SWEET: { min: number; max: number } = { min: 10, max: 12 };
export const CINNAMON_DEPTH_ACCEPT: { min: number; max: number } = { min: 9, max: 13 };

/** Bounded runtime template attempts (never a 150-scan for cinnamon). */
export const CINNAMON_TEMPLATE_ATTEMPTS = 4;

export const CINNAMON_TEMPLATE_BANK: Record<CinnamonTemplateKind, CinnamonTemplate[]> = {
  'cinnamon': [
    { id: 'cinnamon-9-200794', kind: 'cinnamon', depth: 9, cups: [['c2','c1','c1','c1'],['c2','c0','c0','c2'],['c2','c3','c3'],['c0','c3','c3'],[],['c0','c1']], cinnamonHost: 5 },
    { id: 'cinnamon-9-200267', kind: 'cinnamon', depth: 9, cups: [['c0','c3'],['c1','c0','c0','c0'],['c3','c3','c2'],['c1','c1','c2'],['c1','c2','c2','c3'],[]], cinnamonHost: 0 },
    { id: 'cinnamon-10-200706', kind: 'cinnamon', depth: 10, cups: [['c3','c2','c2','c2'],['c0','c2','c0','c1'],['c0','c3'],['c0','c1','c1'],['c3','c3','c1'],[]], cinnamonHost: 2 },
    { id: 'cinnamon-10-201124', kind: 'cinnamon', depth: 10, cups: [['c3','c1','c1','c0'],['c3','c2','c1','c2'],['c3','c2','c2'],['c0','c0','c0'],['c1','c3'],[]], cinnamonHost: 4 },
    { id: 'cinnamon-10-200176', kind: 'cinnamon', depth: 10, cups: [['c0','c0','c3','c3'],['c3','c0'],['c2','c1','c1'],['c2','c2','c3'],['c2','c1','c0','c1'],[]], cinnamonHost: 1 },
    { id: 'cinnamon-10-201383', kind: 'cinnamon', depth: 10, cups: [['c2','c2','c3','c0'],['c1','c2','c1','c1'],['c3','c3','c0'],['c1','c2'],['c3','c0','c0'],[]], cinnamonHost: 3 },
    { id: 'cinnamon-11-200263', kind: 'cinnamon', depth: 11, cups: [['c3','c3','c0','c2'],['c2','c1','c3','c0'],['c2','c1','c1'],['c3','c0','c0'],[],['c2','c1']], cinnamonHost: 5 },
    { id: 'cinnamon-11-200024', kind: 'cinnamon', depth: 11, cups: [['c3','c1'],['c3','c0','c0','c1'],['c3','c3','c2'],['c2','c1','c0'],['c2','c2','c1','c0'],[]], cinnamonHost: 0 },
    { id: 'cinnamon-11-200895', kind: 'cinnamon', depth: 11, cups: [['c2','c2','c0','c1'],['c0','c1','c3','c3'],['c2','c3'],['c0','c1','c1'],['c2','c0','c3'],[]], cinnamonHost: 2 },
    { id: 'cinnamon-11-201098', kind: 'cinnamon', depth: 11, cups: [['c1','c1','c3','c2'],['c3','c2','c0','c0'],['c1','c3','c0'],['c3','c2','c2'],['c1','c0'],[]], cinnamonHost: 4 },
    { id: 'cinnamon-11-200988', kind: 'cinnamon', depth: 11, cups: [['c0','c3','c3','c2'],['c0','c1'],['c0','c1','c3'],['c2','c2','c3'],['c2','c1','c1','c0'],[]], cinnamonHost: 1 },
    { id: 'cinnamon-11-200058', kind: 'cinnamon', depth: 11, cups: [['c3','c1','c0','c0'],['c2','c1','c1','c1'],['c3','c2','c3'],['c2','c0'],['c2','c0','c3'],[]], cinnamonHost: 3 },
    { id: 'cinnamon-12-200554', kind: 'cinnamon', depth: 12, cups: [['c1','c2','c0','c3'],['c3','c2','c2','c3'],['c1','c0','c0'],['c1','c2','c0'],[],['c3','c1']], cinnamonHost: 5 },
    { id: 'cinnamon-12-200055', kind: 'cinnamon', depth: 12, cups: [['c2','c3'],['c3','c1','c0','c0'],['c3','c1','c0'],['c3','c2','c1'],['c2','c2','c1','c0'],[]], cinnamonHost: 0 },
    { id: 'cinnamon-12-200691', kind: 'cinnamon', depth: 12, cups: [['c2','c3','c0','c1'],['c1','c0','c3','c2'],['c2','c1'],['c2','c0','c0'],['c1','c3','c3'],[]], cinnamonHost: 2 },
    { id: 'cinnamon-12-200462', kind: 'cinnamon', depth: 12, cups: [['c1','c1','c3','c0'],['c3','c2','c2','c0'],['c3','c2','c0'],['c1','c3','c0'],['c1','c2'],[]], cinnamonHost: 4 },
    { id: 'cinnamon-13-201030', kind: 'cinnamon', depth: 13, cups: [['c3','c0','c3','c0'],['c0','c1'],['c3','c2','c1'],['c3','c2','c2'],['c0','c1','c2','c1'],[]], cinnamonHost: 1 },
    { id: 'cinnamon-13-200733', kind: 'cinnamon', depth: 13, cups: [['c3','c2','c0','c2'],['c2','c3','c1','c2'],['c3','c1','c1'],['c0','c3'],['c0','c1','c0'],[]], cinnamonHost: 3 },
  ],
};

/** All bank templates flattened (bank validation tests iterate this). */
export const ALL_CINNAMON_TEMPLATES: CinnamonTemplate[] = [
  ...CINNAMON_TEMPLATE_BANK['cinnamon'],
];

/**
 * Instantiate a template against a concrete palette + role bijection.
 * `order`: palette teas serving roles c0..c3 (seeded permutation). Any
 * bijection is a full puzzle isomorphism (cinnamon is tea-color agnostic,
 * host stays mixed len-2, tea counts preserved), so the discovered depth
 * holds exactly.
 */
export function instantiateCinnamonTemplate(
  tpl: CinnamonTemplate,
  palette: TeaId[],
  order: TeaId[] = [...palette],
): { cups: TeaId[][]; cinnamonHost: number } {
  const roleToTea = new Map<CinnamonTeaRole, TeaId>([
    ['c0', order[0] as TeaId],
    ['c1', order[1] as TeaId],
    ['c2', order[2] as TeaId],
    ['c3', order[3] as TeaId],
  ]);
  const cups = tpl.cups.map((cup) => cup.map((role) => roleToTea.get(role) as TeaId));
  return { cups, cinnamonHost: tpl.cinnamonHost };
}
