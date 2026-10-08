/**
 * Frozen-cup template bank (Gauntlet 9 — «Замёрзшая чашка»).
 *
 * Every template is L2-strong (and in practice L3): the production
 * action-aware solver finds an optimal solution that MELTS the frozen cup
 * via a legal sea_buckthorn inflow, later SOURCES from the formerly frozen
 * vessel, deep-unlocks its trapped tea, clears the ice and wins.
 *
 * Discovery: offline `scripts/dev/frozen-cup-search.ts` over the exact
 * production topology (4c/6v, layer counts 4,4,4,3,1,0; frozen host = the
 * 3-layer vessel with exactly one sea_buckthorn on top), relativized with
 * c0 fixed to sea_buckthorn (melt tea — never permuted away) and other
 * roles permuted (full isomorphism on non-target teas, so discovered depth
 * holds exactly). Gate pool: 5,000 seeds → 815 shaped → 815 solvable →
 * 815 canonical-distinct L2 (100% L3); best 18 committed below (measured
 * depth spread 9–13, mixed melt timing, spread frozen-host slots).
 *
 * Pure domain data + instantiation helpers. No React/Pixi imports.
 * Runtime re-validates each instantiation through `finalizeCandidate`.
 */

import type { TeaId } from '../types';

/** Palette-relative tea role inside template cup patterns (c0 = sea_buckthorn). */
export type FrozenCupTeaRole = 'c0' | 'c1' | 'c2' | 'c3';

export type FrozenCupTemplateKind = 'frozen-cup';

export interface FrozenCupTemplate {
  id: string;
  kind: FrozenCupTemplateKind;
  /** Discovered solver depth in pours (audit trail; runtime re-validates exactly). */
  depth: number;
  /** Final slot order (`[]` = empty vessel; layer counts are 4,4,4,3,1,0). */
  cups: FrozenCupTeaRole[][];
  /** Initial frozen host slot (3-layer vessel, exactly one c0 on top). */
  frozenHost: number;
}

/** Generation contract the kind serves (mirrors the canonical request). */
export interface FrozenCupTemplateSpec {
  numColors: number;
  emptyCups: number;
  hasMysteryLayer: boolean;
  sourceOnlyCount: number;
}

export const FROZEN_CUP_TEMPLATE_SPECS: Record<FrozenCupTemplateKind, FrozenCupTemplateSpec> = {
  'frozen-cup': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 0 },
};

/** Measured depth bands (global bands untouched). Sweet 10–12, accept 8–14. */
export const FROZEN_CUP_DEPTH_SWEET: { min: number; max: number } = { min: 10, max: 12 };
export const FROZEN_CUP_DEPTH_ACCEPT: { min: number; max: number } = { min: 8, max: 14 };

/** Bounded runtime template attempts (never a 150-scan for frozen cup). */
export const FROZEN_CUP_TEMPLATE_ATTEMPTS = 4;

/** Melt tea: template role c0 ALWAYS maps here, never permuted away. */
export const FROZEN_CUP_TARGET_TEA: TeaId = 'sea_buckthorn';

export const FROZEN_CUP_TEMPLATE_BANK: Record<FrozenCupTemplateKind, FrozenCupTemplate[]> = {
  'frozen-cup': [
    { id: 'frozen-cup-9-3408', kind: 'frozen-cup', depth: 9, cups: [['c3', 'c1', 'c1', 'c0'], ['c2', 'c2', 'c2', 'c2'], [], ['c3'], ['c3', 'c0', 'c0', 'c1'], ['c3', 'c1', 'c0']], frozenHost: 5 },
    { id: 'frozen-cup-9-4999', kind: 'frozen-cup', depth: 9, cups: [['c3', 'c0', 'c0', 'c0'], [], ['c3', 'c1', 'c0'], ['c3'], ['c1', 'c1', 'c1', 'c2'], ['c3', 'c2', 'c2', 'c2']], frozenHost: 2 },
    { id: 'frozen-cup-10-916', kind: 'frozen-cup', depth: 10, cups: [['c3', 'c3', 'c0'], ['c0', 'c1', 'c3', 'c0'], ['c2'], [], ['c2', 'c3', 'c1', 'c0'], ['c1', 'c1', 'c2', 'c2']], frozenHost: 0 },
    { id: 'frozen-cup-10-1215', kind: 'frozen-cup', depth: 10, cups: [['c2', 'c2', 'c0'], ['c3', 'c3', 'c3', 'c1'], ['c1', 'c0', 'c2', 'c1'], ['c2'], [], ['c1', 'c0', 'c0', 'c3']], frozenHost: 0 },
    { id: 'frozen-cup-10-3059', kind: 'frozen-cup', depth: 10, cups: [['c0', 'c1', 'c3', 'c1'], [], ['c3', 'c0', 'c0', 'c1'], ['c2'], ['c2', 'c2', 'c2', 'c1'], ['c3', 'c3', 'c0']], frozenHost: 5 },
    { id: 'frozen-cup-10-2866', kind: 'frozen-cup', depth: 10, cups: [['c1'], ['c3', 'c2', 'c0'], ['c0', 'c3', 'c2', 'c3'], ['c0', 'c3', 'c2', 'c2'], ['c0', 'c1', 'c1', 'c1'], []], frozenHost: 1 },
    { id: 'frozen-cup-11-881', kind: 'frozen-cup', depth: 11, cups: [['c0'], ['c2', 'c1', 'c1', 'c1'], ['c2', 'c3', 'c0'], [], ['c0', 'c2', 'c3', 'c1'], ['c0', 'c3', 'c3', 'c2']], frozenHost: 2 },
    { id: 'frozen-cup-11-3546', kind: 'frozen-cup', depth: 11, cups: [['c2'], ['c2', 'c3', 'c0', 'c3'], ['c3', 'c1', 'c1', 'c0'], ['c2', 'c2', 'c0'], ['c3', 'c0', 'c1', 'c1'], []], frozenHost: 3 },
    { id: 'frozen-cup-11-1466', kind: 'frozen-cup', depth: 11, cups: [['c3'], ['c0', 'c0', 'c0', 'c1'], ['c2', 'c3', 'c2', 'c1'], ['c1', 'c2', 'c1', 'c2'], [], ['c3', 'c3', 'c0']], frozenHost: 5 },
    { id: 'frozen-cup-11-2879', kind: 'frozen-cup', depth: 11, cups: [['c2', 'c3', 'c0'], ['c0', 'c0', 'c0', 'c1'], ['c2', 'c1', 'c3', 'c1'], ['c2', 'c3', 'c3', 'c2'], ['c1'], []], frozenHost: 0 },
    { id: 'frozen-cup-11-2165', kind: 'frozen-cup', depth: 11, cups: [['c1'], ['c1', 'c3', 'c2', 'c3'], ['c1', 'c2', 'c2', 'c3'], ['c3', 'c2', 'c0'], ['c0', 'c0', 'c0', 'c1'], []], frozenHost: 3 },
    { id: 'frozen-cup-11-3359', kind: 'frozen-cup', depth: 11, cups: [['c0', 'c0', 'c3', 'c2'], ['c3', 'c3', 'c0'], ['c1', 'c0', 'c3', 'c1'], ['c1', 'c2', 'c2', 'c1'], ['c2'], []], frozenHost: 1 },
    { id: 'frozen-cup-12-708', kind: 'frozen-cup', depth: 12, cups: [['c2', 'c0', 'c3', 'c0'], ['c2', 'c1', 'c3', 'c3'], ['c2'], ['c0', 'c3', 'c1', 'c1'], [], ['c2', 'c1', 'c0']], frozenHost: 5 },
    { id: 'frozen-cup-12-4714', kind: 'frozen-cup', depth: 12, cups: [[], ['c1'], ['c1', 'c2', 'c3', 'c2'], ['c1', 'c1', 'c0'], ['c3', 'c0', 'c2', 'c3'], ['c3', 'c0', 'c0', 'c2']], frozenHost: 3 },
    { id: 'frozen-cup-12-4180', kind: 'frozen-cup', depth: 12, cups: [['c3', 'c2', 'c2', 'c1'], ['c1', 'c3', 'c0'], ['c3'], ['c0', 'c2', 'c2', 'c1'], ['c3', 'c0', 'c0', 'c1'], []], frozenHost: 1 },
    { id: 'frozen-cup-12-4862', kind: 'frozen-cup', depth: 12, cups: [['c3', 'c0', 'c2', 'c1'], ['c1'], ['c1', 'c0', 'c2', 'c3'], ['c3', 'c3', 'c0'], ['c1', 'c0', 'c2', 'c2'], []], frozenHost: 3 },
    { id: 'frozen-cup-13-4941', kind: 'frozen-cup', depth: 13, cups: [['c1'], ['c1', 'c2', 'c0'], [], ['c3', 'c0', 'c1', 'c2'], ['c3', 'c0', 'c1', 'c2'], ['c3', 'c3', 'c0', 'c2']], frozenHost: 1 },
    { id: 'frozen-cup-13-3402', kind: 'frozen-cup', depth: 13, cups: [['c1', 'c0', 'c2', 'c1'], ['c3', 'c2', 'c1', 'c1'], ['c3'], ['c3', 'c2', 'c0'], ['c3', 'c0', 'c0', 'c2'], []], frozenHost: 3 },
  ],
};

/** All bank templates flattened (bank validation tests iterate this). */
export const ALL_FROZEN_CUP_TEMPLATES: FrozenCupTemplate[] = [
  ...FROZEN_CUP_TEMPLATE_BANK['frozen-cup'],
];

/**
 * Resolve role → tea for a concrete palette. c0 ALWAYS maps to
 * sea_buckthorn (melt tea — callers must never permute it away); other
 * roles map in order. Any bijection of the remaining roles is a full
 * puzzle isomorphism (ice follows the frozen host; no tea is a named
 * target), so the discovered depth holds exactly.
 */
export function resolveFrozenCupRoleTeas(palette: TeaId[], otherOrder: TeaId[]): Map<FrozenCupTeaRole, TeaId> {
  const map = new Map<FrozenCupTeaRole, TeaId>([['c0', FROZEN_CUP_TARGET_TEA]]);
  const roles: FrozenCupTeaRole[] = ['c1', 'c2', 'c3'];
  const others = palette.filter((t) => t !== FROZEN_CUP_TARGET_TEA);
  roles.forEach((role, i) => {
    const tea = otherOrder[i] ?? others[i];
    if (tea !== undefined) map.set(role, tea);
  });
  return map;
}

/** Instantiate a template against a concrete palette + role bijection. */
export function instantiateFrozenCupTemplate(
  tpl: FrozenCupTemplate,
  palette: TeaId[],
  otherOrder: TeaId[] = palette.filter((t) => t !== FROZEN_CUP_TARGET_TEA),
): { cups: TeaId[][]; frozenHost: number } {
  const roleToTea = resolveFrozenCupRoleTeas(palette, otherOrder);
  const cups = tpl.cups.map((cup) => cup.map((role) => roleToTea.get(role) as TeaId));
  return { cups, frozenHost: tpl.frozenHost };
}
