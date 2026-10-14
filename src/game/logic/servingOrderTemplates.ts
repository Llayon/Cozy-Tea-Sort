/**
 * Serving-order template bank (Gauntlet 14 — «Порядок подачи»).
 *
 * Curated ROBUST L2 production bank (6 standard normal vessels,
 * 4,4,4,4,0,0; all full mixed; exactly one O1 + one O2). Feasibility:
 * 5000 shaped → 5000 solvable, 1260 L2 (25.2%, canon 1260), depths 6–15
 * p50 12, visited p95 2249, ms p95 132, control delta p50 0/p95 1,
 * reverses 43%. Production curation: 3000 samples → 300 L2 pool →
 * 18 robust (6/6 role-perm L2 in 10–14, L3 13/18, pressure≤0.65 18/18,
 * serve gap≥2 16/18, 11 distinct host pairs, varied final teas).
 *
 * Roles c0..c3 permuted among eligible legacy teas (never reaction IDs).
 * Serve indices ride with their cups. Runtime re-validates via finalize.
 *
 * Pure domain data + instantiation helpers. No React/Pixi imports.
 */

import type { TeaId } from '../types';

/** Palette-relative role inside template cup patterns (all permutable). */
export type ServingOrderTeaRole = 'c0' | 'c1' | 'c2' | 'c3';

export type ServingOrderTemplateKind = 'serving-order';

export interface ServingOrderTemplate {
  id: string;
  kind: ServingOrderTemplateKind;
  /** Discovered solver depth in pours (audit trail; runtime re-validates exactly). */
  depth: number;
  /** Final slot order (`[]` = empty vessel; layer counts are 4,4,4,4,0,0 in some order). */
  cups: ServingOrderTeaRole[][];
  /** Initial serving-saucer hosts (O1 / O2). */
  serve1Index: number;
  serve2Index: number;
}

export interface ServingOrderTemplateSpec {
  numColors: number;
  emptyCups: number;
  hasMysteryLayer: boolean;
  sourceOnlyCount: number;
}

export const SERVING_ORDER_TEMPLATE_SPECS: Record<ServingOrderTemplateKind, ServingOrderTemplateSpec> = {
  'serving-order': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 0 },
};

/** Measured depth bands from robust L2 data. Sweet 11–13, accept 10–14. */
export const SERVING_ORDER_DEPTH_SWEET: { min: number; max: number } = { min: 11, max: 13 };
export const SERVING_ORDER_DEPTH_ACCEPT: { min: number; max: number } = { min: 10, max: 14 };

/** Bounded runtime template attempts (never a 150-scan for serving-order). */
export const SERVING_ORDER_TEMPLATE_ATTEMPTS = 4;

export const SERVING_ORDER_TEMPLATE_BANK: Record<ServingOrderTemplateKind, ServingOrderTemplate[]> = {
  'serving-order': [
    { id: 'serving-11-4003', kind: 'serving-order', depth: 11, cups: [[],["c1","c0","c3","c3"],["c2","c2","c0","c0"],[],["c3","c2","c1","c2"],["c0","c1","c3","c1"]], serve1Index: 1, serve2Index: 2 },
    { id: 'serving-11-18000', kind: 'serving-order', depth: 11, cups: [["c1","c2","c3","c2"],["c3","c3","c3","c0"],[],["c2","c0","c1","c1"],["c0","c1","c0","c2"],[]], serve1Index: 0, serve2Index: 1 },
    { id: 'serving-11-117002', kind: 'serving-order', depth: 11, cups: [["c3","c2","c0","c3"],["c1","c1","c2","c0"],[],[],["c2","c3","c1","c1"],["c0","c0","c2","c3"]], serve1Index: 4, serve2Index: 1 },
    { id: 'serving-11-265009', kind: 'serving-order', depth: 11, cups: [["c3","c2","c1","c1"],["c2","c1","c2","c1"],[],[],["c0","c0","c3","c0"],["c3","c3","c0","c2"]], serve1Index: 4, serve2Index: 1 },
    { id: 'serving-12-115005', kind: 'serving-order', depth: 12, cups: [["c2","c1","c3","c3"],["c0","c1","c0","c2"],[],["c3","c3","c1","c2"],["c1","c0","c2","c0"],[]], serve1Index: 0, serve2Index: 3 },
    { id: 'serving-12-143000', kind: 'serving-order', depth: 12, cups: [[],["c1","c3","c2","c1"],[],["c1","c0","c0","c1"],["c3","c2","c2","c3"],["c0","c2","c3","c0"]], serve1Index: 5, serve2Index: 4 },
    { id: 'serving-12-254008', kind: 'serving-order', depth: 12, cups: [[],["c2","c2","c0","c3"],[],["c0","c1","c0","c2"],["c1","c1","c3","c2"],["c3","c1","c3","c0"]], serve1Index: 4, serve2Index: 1 },
    { id: 'serving-13-70003', kind: 'serving-order', depth: 13, cups: [["c2","c2","c3","c1"],[],[],["c2","c3","c0","c3"],["c2","c0","c1","c1"],["c3","c0","c1","c0"]], serve1Index: 0, serve2Index: 3 },
    { id: 'serving-13-74005', kind: 'serving-order', depth: 13, cups: [["c3","c2","c1","c0"],[],["c3","c2","c3","c2"],["c0","c0","c1","c1"],[],["c3","c1","c2","c0"]], serve1Index: 5, serve2Index: 3 },
    { id: 'serving-13-140001', kind: 'serving-order', depth: 13, cups: [["c0","c2","c2","c3"],[],[],["c2","c1","c3","c0"],["c2","c0","c3","c1"],["c0","c3","c1","c1"]], serve1Index: 5, serve2Index: 0 },
    { id: 'serving-13-241010', kind: 'serving-order', depth: 13, cups: [["c2","c0","c1","c2"],["c1","c2","c1","c0"],["c0","c2","c1","c3"],[],["c3","c0","c3","c3"],[]], serve1Index: 0, serve2Index: 1 },
    { id: 'serving-11-260000', kind: 'serving-order', depth: 11, cups: [["c3","c1","c2","c2"],["c2","c0","c2","c0"],[],["c1","c0","c0","c1"],[],["c3","c1","c3","c3"]], serve1Index: 3, serve2Index: 1 },
    { id: 'serving-11-287002', kind: 'serving-order', depth: 11, cups: [["c0","c1","c1","c1"],["c3","c0","c3","c3"],["c2","c0","c3","c2"],[],[],["c2","c0","c2","c1"]], serve1Index: 0, serve2Index: 1 },
    { id: 'serving-12-77001', kind: 'serving-order', depth: 12, cups: [["c1","c0","c2","c0"],["c3","c1","c0","c3"],[],["c2","c2","c1","c2"],[],["c1","c0","c3","c3"]], serve1Index: 3, serve2Index: 1 },
    { id: 'serving-12-199004', kind: 'serving-order', depth: 12, cups: [["c2","c3","c3","c1"],[],["c3","c2","c1","c0"],["c0","c2","c1","c2"],[],["c3","c1","c0","c0"]], serve1Index: 0, serve2Index: 3 },
    { id: 'serving-13-180003', kind: 'serving-order', depth: 13, cups: [[],["c2","c1","c2","c1"],["c3","c0","c1","c0"],["c0","c3","c3","c2"],[],["c0","c1","c2","c3"]], serve1Index: 2, serve2Index: 1 },
    { id: 'serving-11-13003', kind: 'serving-order', depth: 11, cups: [["c0","c3","c2","c2"],["c1","c0","c1","c2"],[],[],["c1","c3","c3","c3"],["c0","c2","c0","c1"]], serve1Index: 0, serve2Index: 4 },
    { id: 'serving-11-17000', kind: 'serving-order', depth: 11, cups: [[],["c2","c1","c0","c3"],["c0","c1","c1","c2"],["c3","c2","c2","c0"],[],["c3","c3","c1","c0"]], serve1Index: 5, serve2Index: 1 },
  ],
};

/** All bank templates flattened (bank validation tests iterate this). */
export const ALL_SERVING_ORDER_TEMPLATES: ServingOrderTemplate[] = [
  ...SERVING_ORDER_TEMPLATE_BANK['serving-order'],
];

/**
 * Instantiate a template against a concrete palette + role bijection.
 * Any bijection among eligible legacy teas preserves counts and the
 * mixed-full structure; depth holds modulo solver tie-breaking among
 * filler permutations (robustness-tested 6/6 during curation; runtime
 * re-validates). Serve indices ride with their cups.
 */
export function instantiateServingOrderTemplate(
  tpl: ServingOrderTemplate,
  order: TeaId[],
): { cups: TeaId[][]; serve1Index: number; serve2Index: number } {
  const roleToTea = new Map<ServingOrderTeaRole, TeaId>([
    ['c0', order[0] as TeaId],
    ['c1', order[1] as TeaId],
    ['c2', order[2] as TeaId],
    ['c3', order[3] as TeaId],
  ]);
  const cups = tpl.cups.map((cup) => cup.map((role) => roleToTea.get(role) as TeaId));
  return { cups, serve1Index: tpl.serve1Index, serve2Index: tpl.serve2Index };
}
