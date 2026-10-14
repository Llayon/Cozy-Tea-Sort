/**
 * Serving-order composition template bank (Gauntlet 15 — «Смешанные чаепития»).
 *
 * SHIPPED: serving-order-tasting (Order + Tasting bowl, separate vessels).
 * DEFERRED (evidence in docs/composition-feasibility.md): Order+Mystery
 * (C3 zero — coexistence only), Order+Honey (solv 48% — HOLD), Order+Strainer
 * (research-only topology mismatch). FORBIDDEN: Order+Blend (chemistry
 * standalone).
 *
 * Bank: 12 robust C2 templates (6 standard vessels 4,4,4,4,0,0; four full
 * mixed; O1+O2 on two full mixed among indices 0-3; tasting bowl cap2/
 * mustEndEmpty empty on index 5; ordinary empty on index 4). Curation:
 * 3000 samples → 200 C2 pool → 12 robust (6/6 role-perm C2 in 10-14,
 * pressure≤0.65 12/12, serve gap≥2 12/12, C3 4/12, 7 host pairs, varied
 * final teas). Feasibility: 5000 shaped → 5000 solvable, C2 21.48%
 * (canon 1074), C3 5.84% (canon 292), depths 6-15 p50 12, visited p95 2899,
 * ms p95 207.
 *
 * Roles c0..c3 permuted among eligible legacy teas (never reaction IDs).
 * Serve/tasting indices ride with their cups. Runtime re-validates via finalize.
 *
 * Pure domain data + instantiation helpers. No React/Pixi imports.
 */

import type { TeaId } from '../types';

/** Palette-relative role inside template cup patterns (all permutable). */
export type CompositionTeaRole = 'c0' | 'c1' | 'c2' | 'c3';

export type ServingOrderCompositionKind = 'serving-order-tasting';

export interface ServingOrderCompositionTemplate {
  id: string;
  kind: ServingOrderCompositionKind;
  /** Discovered solver depth in pours (audit trail; runtime re-validates exactly). */
  depth: number;
  /** Final slot order (`[]` = empty vessel; layer counts are 4,4,4,4,0,0 in some order). */
  cups: CompositionTeaRole[][];
  /** Initial serving-saucer hosts (O1 / O2, among indices 0-3). */
  serve1Index: number;
  serve2Index: number;
  /** Tasting-bowl vessel (always 5 in this bank: stable last slot, starts empty). */
  tastingIndex: number;
}

export interface ServingOrderCompositionSpec {
  numColors: number;
  emptyCups: number;
  hasMysteryLayer: boolean;
  sourceOnlyCount: number;
  tastingCupCount: number;
}

export const SERVING_ORDER_COMPOSITION_SPECS: Record<ServingOrderCompositionKind, ServingOrderCompositionSpec> = {
  'serving-order-tasting': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 0, tastingCupCount: 1 },
};

/** Measured depth bands from robust C2 data. Sweet 11-13, accept 10-14. */
export const SERVING_ORDER_TASTING_DEPTH_SWEET: { min: number; max: number } = { min: 11, max: 13 };
export const SERVING_ORDER_TASTING_DEPTH_ACCEPT: { min: number; max: number } = { min: 10, max: 14 };

/** Bounded runtime template attempts (never a 150-scan for compositions). */
export const SERVING_ORDER_TASTING_TEMPLATE_ATTEMPTS = 4;

export const SERVING_ORDER_COMPOSITION_BANK: Record<ServingOrderCompositionKind, ServingOrderCompositionTemplate[]> = {
  'serving-order-tasting': [
    { id: 'serve-taste-11-36016', kind: 'serving-order-tasting', depth: 11, cups: [["c3","c3","c0","c3"],["c2","c1","c0","c1"],["c1","c0","c0","c1"],["c2","c2","c3","c2"],[],[]], serve1Index: 0, serve2Index: 2, tastingIndex: 5 },
    { id: 'serve-taste-11-114017', kind: 'serving-order-tasting', depth: 11, cups: [["c2","c1","c1","c0"],["c1","c3","c3","c1"],["c0","c2","c0","c3"],["c0","c3","c2","c2"],[],[]], serve1Index: 0, serve2Index: 1, tastingIndex: 5 },
    { id: 'serve-taste-12-142014', kind: 'serving-order-tasting', depth: 12, cups: [["c3","c3","c1","c2"],["c0","c3","c1","c1"],["c2","c0","c2","c3"],["c0","c2","c0","c1"],[],[]], serve1Index: 2, serve2Index: 0, tastingIndex: 5 },
    { id: 'serve-taste-12-182003', kind: 'serving-order-tasting', depth: 12, cups: [["c1","c0","c3","c2"],["c3","c1","c3","c0"],["c2","c2","c0","c0"],["c3","c1","c2","c1"],[],[]], serve1Index: 0, serve2Index: 2, tastingIndex: 5 },
    { id: 'serve-taste-11-136005', kind: 'serving-order-tasting', depth: 11, cups: [["c2","c3","c0","c1"],["c1","c0","c0","c1"],["c2","c2","c2","c3"],["c3","c0","c3","c1"],[],[]], serve1Index: 3, serve2Index: 1, tastingIndex: 5 },
    { id: 'serve-taste-11-169002', kind: 'serving-order-tasting', depth: 11, cups: [["c1","c3","c1","c0"],["c0","c2","c2","c1"],["c3","c1","c0","c0"],["c2","c3","c3","c2"],[],[]], serve1Index: 3, serve2Index: 0, tastingIndex: 5 },
    { id: 'serve-taste-12-37005', kind: 'serving-order-tasting', depth: 12, cups: [["c1","c1","c3","c2"],["c1","c3","c0","c1"],["c2","c0","c2","c2"],["c0","c3","c0","c3"],[],[]], serve1Index: 3, serve2Index: 2, tastingIndex: 5 },
    { id: 'serve-taste-12-102006', kind: 'serving-order-tasting', depth: 12, cups: [["c2","c0","c2","c3"],["c1","c0","c1","c1"],["c0","c3","c3","c2"],["c3","c0","c2","c1"],[],[]], serve1Index: 3, serve2Index: 0, tastingIndex: 5 },
    { id: 'serve-taste-12-113007', kind: 'serving-order-tasting', depth: 12, cups: [["c0","c3","c0","c2"],["c0","c0","c2","c3"],["c1","c3","c2","c1"],["c2","c3","c1","c1"],[],[]], serve1Index: 3, serve2Index: 2, tastingIndex: 5 },
    { id: 'serve-taste-12-127002', kind: 'serving-order-tasting', depth: 12, cups: [["c1","c1","c2","c3"],["c2","c0","c1","c2"],["c3","c0","c3","c1"],["c0","c0","c2","c3"],[],[]], serve1Index: 1, serve2Index: 0, tastingIndex: 5 },
    { id: 'serve-taste-12-130003', kind: 'serving-order-tasting', depth: 12, cups: [["c2","c2","c3","c3"],["c0","c1","c2","c2"],["c1","c0","c1","c0"],["c3","c1","c3","c0"],[],[]], serve1Index: 1, serve2Index: 0, tastingIndex: 5 },
    { id: 'serve-taste-12-137003', kind: 'serving-order-tasting', depth: 12, cups: [["c0","c3","c3","c1"],["c2","c1","c2","c2"],["c0","c1","c0","c1"],["c3","c0","c2","c3"],[],[]], serve1Index: 3, serve2Index: 1, tastingIndex: 5 },
  ],
};

/** All composition bank templates flattened (bank validation tests iterate this). */
export const ALL_SERVING_ORDER_COMPOSITION_TEMPLATES: ServingOrderCompositionTemplate[] = [
  ...SERVING_ORDER_COMPOSITION_BANK['serving-order-tasting'],
];

/**
 * Instantiate a composition template against a concrete palette + role bijection.
 * Any bijection among eligible legacy teas preserves counts and the mixed-full
 * structure; depth holds modulo solver tie-breaking (robustness-tested 6/6
 * during curation; runtime re-validates). Serve/tasting indices ride with cups.
 */
export function instantiateServingOrderCompositionTemplate(
  tpl: ServingOrderCompositionTemplate,
  order: TeaId[],
): { cups: TeaId[][]; serve1Index: number; serve2Index: number; tastingIndex: number } {
  const roleToTea = new Map<CompositionTeaRole, TeaId>([
    ['c0', order[0] as TeaId],
    ['c1', order[1] as TeaId],
    ['c2', order[2] as TeaId],
    ['c3', order[3] as TeaId],
  ]);
  const cups = tpl.cups.map((cup) => cup.map((role) => roleToTea.get(role) as TeaId));
  return { cups, serve1Index: tpl.serve1Index, serve2Index: tpl.serve2Index, tastingIndex: tpl.tastingIndex };
}
