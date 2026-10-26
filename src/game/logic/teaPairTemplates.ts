/**
 * Tea-pair template bank (Gauntlet 17 — TEA PAIR / «Чайная пара»).
 *
 * Curated robust L2 production bank for the winning V6 topology:
 * 4 colors × 4 layers = 16 tea units in 6 vessels, lengths 2,2,4,4,4,0,
 * exactly one `tea-pair` group on vessels [0,1] (both capacity 2, normal,
 * no stored target). Both pair members and every non-empty normal start are
 * mixed. The final matched tea is emergent — never stored here.
 *
 * Feasibility (V6, 5000 shaped): 98.64% solvable, 0 truncated, 2342 L2
 * (46.84%), 1591 L3, depths 8–14, solver p95 12ms. V7 rejected: higher
 * solver cost (~30×) without better L2/L3 density.
 *
 * Curation: 452 shaped → 200 robust (6 deterministic role permutations ×
 * both pair-member physical orders, L2 in-band), 18 selected canonical-
 * distinct. Selected: 18/18 L2, 10/18 L3A anchor switch, 18/18
 * commit/minMoves ≤0.65, 18/18 gap ≥2 (15/18 gap ≥4), all four final roles,
 * depths 10–13. Runtime re-validates every instantiation via finalize.
 *
 * Roles c0..c3 permute among eligible legacy teas (never reaction IDs).
 * Pure domain data + instantiation helpers. No React/Pixi imports.
 */

import type { TeaId } from '../types';

/** Palette-relative role inside template cup patterns (all permutable). */
export type TeaPairTeaRole = 'c0' | 'c1' | 'c2' | 'c3';

export type TeaPairTemplateKind = 'tea-pair';

export interface TeaPairTemplate {
  id: string;
  kind: TeaPairTemplateKind;
  /** Discovered solver depth in pours (audit trail; runtime re-validates exactly). */
  depth: number;
  /** Final slot order (lengths are 2,2,4,4,4,0 in some order). */
  cups: TeaPairTeaRole[][];
  /** Pair member hosts (production [0,1]; symmetric roles). */
  pairMembers: readonly [number, number];
  /** Curation metadata only — never used by runtime win logic. */
  expectedFinalPairRole?: TeaPairTeaRole;
}

export interface TeaPairTemplateSpec {
  numColors: number;
  emptyCups: number;
  hasMysteryLayer: boolean;
  sourceOnlyCount: number;
}

export const TEA_PAIR_TEMPLATE_SPECS: Record<TeaPairTemplateKind, TeaPairTemplateSpec> = {
  'tea-pair': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 0 },
};

/** Measured V6 depths: 8–14; production challenge accept 5–13 → 8–13. */
export const TEA_PAIR_DEPTH_SWEET: { min: number; max: number } = { min: 10, max: 12 };
export const TEA_PAIR_DEPTH_ACCEPT: { min: number; max: number } = { min: 8, max: 13 };

/** Bounded runtime template attempts (never a 150-scan for tea pair). */
export const TEA_PAIR_TEMPLATE_ATTEMPTS = 4;

export const TEA_PAIR_TEMPLATE_BANK: Record<TeaPairTemplateKind, TeaPairTemplate[]> = {
  'tea-pair': [
    { id: 'pair-10-259', kind: 'tea-pair', depth: 10, cups: [["c2","c0"],["c3","c1"],["c3","c1","c1","c3"],["c0","c2","c2","c2"],["c3","c0","c0","c1"],[]], pairMembers: [0, 1], expectedFinalPairRole: 'c2' },
    { id: 'pair-11-45', kind: 'tea-pair', depth: 11, cups: [["c0","c1"],["c1","c2"],["c1","c2","c1","c3"],["c3","c0","c3","c3"],["c2","c2","c0","c0"],[]], pairMembers: [0, 1], expectedFinalPairRole: 'c1' },
    { id: 'pair-11-118', kind: 'tea-pair', depth: 11, cups: [["c2","c3"],["c0","c2"],["c0","c1","c1","c3"],["c1","c0","c1","c2"],["c2","c0","c3","c3"],[]], pairMembers: [0, 1], expectedFinalPairRole: 'c2' },
    { id: 'pair-11-33', kind: 'tea-pair', depth: 11, cups: [["c0","c2"],["c3","c0"],["c2","c2","c0","c1"],["c3","c1","c0","c3"],["c2","c3","c1","c1"],[]], pairMembers: [0, 1], expectedFinalPairRole: 'c0' },
    { id: 'pair-12-329', kind: 'tea-pair', depth: 12, cups: [["c3","c1"],["c1","c0"],["c2","c1","c0","c2"],["c1","c3","c0","c0"],["c2","c3","c3","c2"],[]], pairMembers: [0, 1], expectedFinalPairRole: 'c3' },
    { id: 'pair-12-30', kind: 'tea-pair', depth: 12, cups: [["c1","c0"],["c3","c1"],["c3","c3","c2","c0"],["c2","c1","c2","c0"],["c1","c2","c3","c0"],[]], pairMembers: [0, 1], expectedFinalPairRole: 'c1' },
    { id: 'pair-12-60', kind: 'tea-pair', depth: 12, cups: [["c0","c2"],["c2","c3"],["c1","c1","c0","c2"],["c3","c1","c3","c0"],["c0","c3","c2","c1"],[]], pairMembers: [0, 1], expectedFinalPairRole: 'c0' },
    { id: 'pair-12-97', kind: 'tea-pair', depth: 12, cups: [["c0","c1"],["c0","c3"],["c1","c2","c1","c2"],["c2","c3","c0","c1"],["c0","c2","c3","c3"],[]], pairMembers: [0, 1], expectedFinalPairRole: 'c0' },
    { id: 'pair-12-163', kind: 'tea-pair', depth: 12, cups: [["c0","c1"],["c3","c1"],["c2","c1","c2","c3"],["c3","c0","c0","c2"],["c0","c3","c2","c1"],[]], pairMembers: [0, 1], expectedFinalPairRole: 'c3' },
    { id: 'pair-12-294', kind: 'tea-pair', depth: 12, cups: [["c2","c3"],["c2","c1"],["c3","c0","c3","c2"],["c0","c1","c3","c1"],["c2","c1","c0","c0"],[]], pairMembers: [0, 1], expectedFinalPairRole: 'c2' },
    { id: 'pair-12-305', kind: 'tea-pair', depth: 12, cups: [["c3","c0"],["c1","c2"],["c2","c1","c2","c3"],["c1","c0","c3","c1"],["c0","c0","c3","c2"],[]], pairMembers: [0, 1], expectedFinalPairRole: 'c3' },
    { id: 'pair-12-313', kind: 'tea-pair', depth: 12, cups: [["c0","c3"],["c2","c0"],["c1","c3","c0","c3"],["c0","c2","c2","c1"],["c3","c1","c1","c2"],[]], pairMembers: [0, 1], expectedFinalPairRole: 'c0' },
    { id: 'pair-12-395', kind: 'tea-pair', depth: 12, cups: [["c3","c2"],["c1","c0"],["c1","c1","c0","c1"],["c3","c2","c0","c2"],["c2","c3","c0","c3"],[]], pairMembers: [0, 1], expectedFinalPairRole: 'c3' },
    { id: 'pair-12-440', kind: 'tea-pair', depth: 12, cups: [["c2","c1"],["c3","c2"],["c3","c0","c3","c1"],["c2","c3","c2","c1"],["c0","c1","c0","c0"],[]], pairMembers: [0, 1], expectedFinalPairRole: 'c2' },
    { id: 'pair-13-129', kind: 'tea-pair', depth: 13, cups: [["c1","c3"],["c0","c2"],["c1","c3","c0","c1"],["c2","c3","c0","c3"],["c0","c2","c1","c2"],[]], pairMembers: [0, 1], expectedFinalPairRole: 'c0' },
    { id: 'pair-13-184', kind: 'tea-pair', depth: 13, cups: [["c3","c1"],["c1","c0"],["c0","c3","c0","c2"],["c2","c2","c1","c2"],["c1","c3","c0","c3"],[]], pairMembers: [0, 1], expectedFinalPairRole: 'c1' },
    { id: 'pair-13-316', kind: 'tea-pair', depth: 13, cups: [["c2","c1"],["c3","c0"],["c3","c0","c2","c3"],["c1","c3","c0","c1"],["c2","c1","c2","c0"],[]], pairMembers: [0, 1], expectedFinalPairRole: 'c2' },
    { id: 'pair-13-37', kind: 'tea-pair', depth: 13, cups: [["c2","c1"],["c0","c3"],["c3","c2","c0","c3"],["c1","c0","c3","c2"],["c2","c1","c0","c1"],[]], pairMembers: [0, 1], expectedFinalPairRole: 'c0' },
  ],
};

/** All bank templates flattened (bank validation tests iterate this). */
export const ALL_TEA_PAIR_TEMPLATES: TeaPairTemplate[] = [
  ...TEA_PAIR_TEMPLATE_BANK['tea-pair'],
];

/**
 * Instantiate a template against a concrete palette + role bijection.
 * A full color bijection preserves counts, mixed structure and pair
 * symmetry; depth holds modulo deterministic solver tie-breaking (verified
 * across 6 permutations × both pair orders at curation; runtime re-validates).
 */
export function instantiateTeaPairTemplate(
  tpl: TeaPairTemplate,
  order: TeaId[],
): { cups: TeaId[][]; pairMembers: readonly [number, number] } {
  const roleToTea = new Map<TeaPairTeaRole, TeaId>([
    ['c0', order[0] as TeaId],
    ['c1', order[1] as TeaId],
    ['c2', order[2] as TeaId],
    ['c3', order[3] as TeaId],
  ]);
  const cups = tpl.cups.map((cup) => cup.map((role) => roleToTea.get(role) as TeaId));
  return { cups, pairMembers: tpl.pairMembers };
}
