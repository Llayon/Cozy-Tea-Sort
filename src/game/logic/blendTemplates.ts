/**
 * Milk-tea blend template bank (Gauntlet 13 — «Молочный купаж»).
 *
 * Curated ROBUST L2 production bank (6 standard normal vessels,
 * 4,4,4,4,0,0; a=black_tea×4, b=milk×4, c0/c1=legacy fillers×4, P0;
 * all full mixed). Feasibility: 5000 abstract shaped → 5000 L2
 * (canon 4998), depths 10–17 p50 13, visited p95 8k, ms p95 441,
 * delta chem-ordinary p50 +2, batchFirst4 0/5000 (integrated, not terminal).
 * Production curation: 3000 prod samples → 400 L2 pool →
 * 18 robust (6/6 filler perms L2 in 10–16).
 *
 * Roles a/b fixed (recipe identities); c0/c1 seeded-permuted among eligible
 * legacy teas (never black_tea/milk/milk_tea; milk_oolong excluded to avoid
 * milk confusion). Product never initial. Runtime re-validates via finalize.
 *
 * Pure domain data + instantiation helpers. No React/Pixi imports.
 */

import type { TeaId } from '../types';

/** Palette-relative role inside template cup patterns (a/b fixed, c0/c1 permutable). */
export type BlendTeaRole = 'a' | 'b' | 'c0' | 'c1';

export type BlendTemplateKind = 'milk-tea-blend';

export interface BlendTemplate {
  id: string;
  kind: BlendTemplateKind;
  /** Discovered solver depth in pours (audit trail; runtime re-validates exactly). */
  depth: number;
  /** Final slot order (`[]` = empty vessel; layer counts are 4,4,4,4,0,0 in some order). */
  cups: BlendTeaRole[][];
}

export interface BlendTemplateSpec {
  numColors: number;
  emptyCups: number;
  hasMysteryLayer: boolean;
  sourceOnlyCount: number;
}

export const BLEND_TEMPLATE_SPECS: Record<BlendTemplateKind, BlendTemplateSpec> = {
  'milk-tea-blend': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 0 },
};

/** Measured depth bands from L2 data (abstract 10–17 p50 13; prod accept 10–16). Sweet 12–14, accept 10–16. */
export const BLEND_DEPTH_SWEET: { min: number; max: number } = { min: 12, max: 14 };
export const BLEND_DEPTH_ACCEPT: { min: number; max: number } = { min: 10, max: 16 };

/** Bounded runtime template attempts (never a 150-scan for blend). */
export const BLEND_TEMPLATE_ATTEMPTS = 4;

export const BLEND_TEMPLATE_BANK: Record<BlendTemplateKind, BlendTemplate[]> = {
  'milk-tea-blend': [
    { id: 'blend-12-28000', kind: 'milk-tea-blend', depth: 12, cups: [["c0","c0","c1","a"],["b","b","a","b"],[],[],["c0","c1","a","a"],["c1","c1","b","c0"]] },
    { id: 'blend-12-37000', kind: 'milk-tea-blend', depth: 12, cups: [["a","b","c1","c1"],["c0","b","b","a"],[],["c1","a","a","c0"],["b","c1","c0","c0"],[]] },
    { id: 'blend-12-65000', kind: 'milk-tea-blend', depth: 12, cups: [["c0","a","b","b"],["c1","c1","b","c0"],["c0","a","a","c0"],["c1","c1","a","b"],[],[]] },
    { id: 'blend-12-68000', kind: 'milk-tea-blend', depth: 12, cups: [["b","b","a","a"],["c0","a","c0","a"],[],["c0","b","b","c1"],["c1","c1","c1","c0"],[]] },
    { id: 'blend-12-73000', kind: 'milk-tea-blend', depth: 12, cups: [[],["b","a","c0","a"],["c1","c1","a","c0"],[],["b","b","b","a"],["c1","c1","c0","c0"]] },
    { id: 'blend-12-133000', kind: 'milk-tea-blend', depth: 12, cups: [["c1","a","a","b"],[],["a","c0","b","a"],["c0","c1","c1","b"],[],["c1","c0","c0","b"]] },
    { id: 'blend-12-196000', kind: 'milk-tea-blend', depth: 12, cups: [["b","b","c0","b"],["c1","c1","a","a"],["c0","a","c1","b"],[],["c1","a","c0","c0"],[]] },
    { id: 'blend-12-207000', kind: 'milk-tea-blend', depth: 12, cups: [["b","a","a","c0"],[],["c1","c1","a","c1"],["a","c1","c0","c0"],["b","b","c0","b"],[]] },
    { id: 'blend-12-223000', kind: 'milk-tea-blend', depth: 12, cups: [[],["a","a","a","c0"],["b","c1","c0","c0"],["c1","b","b","b"],[],["a","c0","c1","c1"]] },
    { id: 'blend-12-246000', kind: 'milk-tea-blend', depth: 12, cups: [["a","b","c1","b"],["c1","a","a","b"],[],["a","c0","c0","c0"],[],["c1","c1","b","c0"]] },
    { id: 'blend-12-275000', kind: 'milk-tea-blend', depth: 12, cups: [[],[],["a","a","c0","c0"],["b","a","c0","c1"],["b","c0","c1","b"],["c1","c1","a","b"]] },
    { id: 'blend-12-308000', kind: 'milk-tea-blend', depth: 12, cups: [["c0","c1","c1","a"],[],["a","c1","c0","a"],["b","a","b","b"],[],["c1","b","c0","c0"]] },
    { id: 'blend-12-311000', kind: 'milk-tea-blend', depth: 12, cups: [["c1","c0","b","a"],["a","c1","c1","b"],["a","c0","c0","b"],[],[],["c0","a","c1","b"]] },
    { id: 'blend-12-332000', kind: 'milk-tea-blend', depth: 12, cups: [["c1","b","a","b"],[],["c1","c0","c0","c0"],[],["b","b","a","a"],["a","c0","c1","c1"]] },
    { id: 'blend-12-341000', kind: 'milk-tea-blend', depth: 12, cups: [["c0","c0","a","b"],["b","a","c0","c1"],["c1","c1","c1","b"],[],["b","a","a","c0"],[]] },
    { id: 'blend-13-4000', kind: 'milk-tea-blend', depth: 13, cups: [["b","c1","a","c1"],["a","b","c0","c1"],[],[],["a","c1","b","a"],["c0","c0","b","c0"]] },
    { id: 'blend-13-27000', kind: 'milk-tea-blend', depth: 13, cups: [["c0","b","c0","a"],[],["c1","c1","a","c0"],[],["c0","b","c1","a"],["c1","b","a","b"]] },
    { id: 'blend-13-60000', kind: 'milk-tea-blend', depth: 13, cups: [["c0","c1","b","b"],[],["a","b","c0","a"],["c0","a","a","c0"],[],["c1","b","c1","c1"]] },
  ],
};

/** All bank templates flattened (bank validation tests iterate this). */
export const ALL_BLEND_TEMPLATES: BlendTemplate[] = [
  ...BLEND_TEMPLATE_BANK['milk-tea-blend'],
];

/**
 * Instantiate a template: a→black_tea, b→milk fixed; c0/c1→concrete fillers.
 * Any (c0,c1) bijection among eligible legacy teas preserves counts and the
 * mixed-full structure; depth holds modulo solver tie-breaking among filler
 * permutations (robustness-tested 6/6 during curation; runtime re-validates).
 */
export function instantiateBlendTemplate(
  tpl: BlendTemplate,
  c0: TeaId,
  c1: TeaId,
): { cups: TeaId[][] } {
  const map = new Map<BlendTeaRole, TeaId>([
    ['a', 'black_tea'],
    ['b', 'milk'],
    ['c0', c0],
    ['c1', c1],
  ]);
  return { cups: tpl.cups.map((cup) => cup.map((role) => map.get(role) as TeaId)) };
}
