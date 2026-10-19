/**
 * Shared-tray template bank (Gauntlet 16 — «Общий поднос» / TEA TRAY).
 *
 * Curated ROBUST L2 production bank (6 standard normal vessels,
 * 3,3,4,4,2,0; tray 3+3 mixed at [0,1]; all non-empty mixed; exactly one
 * tea-tray group limit 6). Feasibility (P33): 5000 shaped → 5000 solvable,
 * 4543 L2 (90.9%, canon 4542), depths 7–15 p50 11, visited p95 2353,
 * ms p95 139, control delta p50 0/p95 1, overload 52.9%, cross-member 93.5%.
 * Production curation: 21 samples → 18 robust (6/6 role-perm L2 in 9–13,
 * pressure≤0.65 18/18, gap≥2 16/18, 18/18 cross-member L3A).
 *
 * Roles c0..c3 permuted among eligible legacy teas (never reaction IDs).
 * Tray indices ride with their cups. Runtime re-validates via finalize.
 *
 * Pure domain data + instantiation helpers. No React/Pixi imports.
 */

import type { TeaId } from '../types';

/** Palette-relative role inside template cup patterns (all permutable). */
export type SharedTrayTeaRole = 'c0' | 'c1' | 'c2' | 'c3';

export type SharedTrayTemplateKind = 'shared-tray';

export interface SharedTrayTemplate {
  id: string;
  kind: SharedTrayTemplateKind;
  /** Discovered solver depth in pours (audit trail; runtime re-validates exactly). */
  depth: number;
  /** Final slot order (lengths are 3,3,4,4,2,0 in some order). */
  cups: SharedTrayTeaRole[][];
  /** Initial tray member hosts (production [0,1]). */
  trayMembers: readonly [number, number];
}

export interface SharedTrayTemplateSpec {
  numColors: number;
  emptyCups: number;
  hasMysteryLayer: boolean;
  sourceOnlyCount: number;
}

export const SHARED_TRAY_TEMPLATE_SPECS: Record<SharedTrayTemplateKind, SharedTrayTemplateSpec> = {
  'shared-tray': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 0 },
};

/** Measured depth bands from robust L2 data. Sweet 10–12, accept 9–13. */
export const SHARED_TRAY_DEPTH_SWEET: { min: number; max: number } = { min: 10, max: 12 };
export const SHARED_TRAY_DEPTH_ACCEPT: { min: number; max: number } = { min: 9, max: 13 };

/** Bounded runtime template attempts (never a 150-scan for shared-tray). */
export const SHARED_TRAY_TEMPLATE_ATTEMPTS = 4;

export const SHARED_TRAY_TEMPLATE_BANK: Record<SharedTrayTemplateKind, SharedTrayTemplate[]> = {
  'shared-tray': [
    { id: 'tray-10-0', kind: 'shared-tray', depth: 10, cups: [["c1","c3","c1"],["c2","c0","c0"],["c3","c3","c2","c2"],["c2","c0","c1","c0"],["c3","c1"],[]], trayMembers: [0, 1] },
    { id: 'tray-9-1', kind: 'shared-tray', depth: 9, cups: [["c0","c0","c3"],["c3","c1","c1"],["c2","c1","c2","c2"],["c0","c0","c1","c3"],["c2","c3"],[]], trayMembers: [0, 1] },
    { id: 'tray-11-2', kind: 'shared-tray', depth: 11, cups: [["c3","c2","c3"],["c1","c2","c1"],["c2","c1","c2","c3"],["c0","c0","c0","c1"],["c0","c3"],[]], trayMembers: [0, 1] },
    { id: 'tray-12-3', kind: 'shared-tray', depth: 12, cups: [["c0","c3","c1"],["c3","c1","c3"],["c1","c0","c2","c3"],["c1","c2","c2","c0"],["c0","c2"],[]], trayMembers: [0, 1] },
    { id: 'tray-13-5', kind: 'shared-tray', depth: 13, cups: [["c0","c1","c0"],["c1","c3","c2"],["c2","c1","c3","c2"],["c1","c2","c0","c3"],["c3","c0"],[]], trayMembers: [0, 1] },
    { id: 'tray-12-6', kind: 'shared-tray', depth: 12, cups: [["c1","c2","c1"],["c3","c0","c2"],["c0","c2","c1","c1"],["c3","c0","c3","c0"],["c2","c3"],[]], trayMembers: [0, 1] },
    { id: 'tray-11-7', kind: 'shared-tray', depth: 11, cups: [["c0","c1","c1"],["c2","c2","c3"],["c0","c2","c3","c1"],["c0","c3","c3","c0"],["c2","c1"],[]], trayMembers: [0, 1] },
    { id: 'tray-11-10', kind: 'shared-tray', depth: 11, cups: [["c0","c0","c1"],["c3","c3","c1"],["c0","c3","c0","c2"],["c2","c1","c3","c2"],["c2","c1"],[]], trayMembers: [0, 1] },
    { id: 'tray-11-11', kind: 'shared-tray', depth: 11, cups: [["c2","c0","c1"],["c3","c3","c2"],["c0","c1","c1","c0"],["c3","c2","c0","c3"],["c2","c1"],[]], trayMembers: [0, 1] },
    { id: 'tray-11-12', kind: 'shared-tray', depth: 11, cups: [["c2","c2","c3"],["c1","c0","c0"],["c1","c1","c3","c0"],["c2","c0","c2","c3"],["c1","c3"],[]], trayMembers: [0, 1] },
    { id: 'tray-11-13', kind: 'shared-tray', depth: 11, cups: [["c2","c3","c0"],["c3","c3","c2"],["c0","c0","c3","c1"],["c1","c2","c1","c0"],["c1","c2"],[]], trayMembers: [0, 1] },
    { id: 'tray-13-14', kind: 'shared-tray', depth: 13, cups: [["c2","c0","c3"],["c0","c1","c3"],["c3","c1","c3","c2"],["c1","c0","c2","c0"],["c2","c1"],[]], trayMembers: [0, 1] },
    { id: 'tray-11-15', kind: 'shared-tray', depth: 11, cups: [["c0","c2","c2"],["c3","c0","c2"],["c3","c1","c3","c0"],["c2","c1","c1","c3"],["c1","c0"],[]], trayMembers: [0, 1] },
    { id: 'tray-13-16', kind: 'shared-tray', depth: 13, cups: [["c1","c2","c3"],["c0","c2","c0"],["c0","c3","c1","c2"],["c3","c2","c1","c0"],["c1","c3"],[]], trayMembers: [0, 1] },
    { id: 'tray-13-17', kind: 'shared-tray', depth: 13, cups: [["c2","c0","c2"],["c1","c3","c0"],["c1","c0","c2","c3"],["c2","c1","c3","c1"],["c0","c3"],[]], trayMembers: [0, 1] },
    { id: 'tray-10-18', kind: 'shared-tray', depth: 10, cups: [["c0","c0","c3"],["c1","c2","c3"],["c1","c2","c1","c1"],["c3","c0","c0","c2"],["c3","c2"],[]], trayMembers: [0, 1] },
    { id: 'tray-12-19', kind: 'shared-tray', depth: 12, cups: [["c1","c0","c2"],["c2","c0","c3"],["c3","c2","c1","c1"],["c3","c2","c3","c0"],["c1","c0"],[]], trayMembers: [0, 1] },
    { id: 'tray-11-20', kind: 'shared-tray', depth: 11, cups: [["c3","c2","c1"],["c2","c1","c0"],["c0","c0","c1","c3"],["c3","c1","c2","c2"],["c3","c0"],[]], trayMembers: [0, 1] },
  ],
};

/** All bank templates flattened (bank validation tests iterate this). */
export const ALL_SHARED_TRAY_TEMPLATES: SharedTrayTemplate[] = [
  ...SHARED_TRAY_TEMPLATE_BANK['shared-tray'],
];

/**
 * Instantiate a template against a concrete palette + role bijection.
 * Any bijection among eligible legacy teas preserves counts and the
 * mixed structure; depth holds modulo solver tie-breaking among filler
 * permutations (robustness-tested 6/6 during curation; runtime re-validates).
 * Tray indices ride with their cups.
 */
export function instantiateSharedTrayTemplate(
  tpl: SharedTrayTemplate,
  order: TeaId[],
): { cups: TeaId[][]; trayMembers: readonly [number, number] } {
  const roleToTea = new Map<SharedTrayTeaRole, TeaId>([
    ['c0', order[0] as TeaId],
    ['c1', order[1] as TeaId],
    ['c2', order[2] as TeaId],
    ['c3', order[3] as TeaId],
  ]);
  const cups = tpl.cups.map((cup) => cup.map((role) => roleToTea.get(role) as TeaId));
  return { cups, trayMembers: tpl.trayMembers };
}
