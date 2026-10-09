/**
 * High-thermos template bank (Gauntlet 10 — «Высокий термос»).
 *
 * Selected profile: T3 (thermos is the length-3 vessel, mixed, top tea exactly
 * once inside). Feasibility (2500 T2 + 2500 T3, production solver):
 * - T2: 24 canonical-distinct L2 (FAIL <30), 0 L3, maxOcc5 39/2500.
 * - T3: 749 canonical-distinct L2 (PASS), 44 L3, maxOcc5 1235/2500,
 *   solver p95 149ms, 0 truncated, fifthOnMove1 0%, drainImmediate 0%,
 *   delayed unpacking 73%, single fifth use 100%.
 * T3 selected: higher L3 rate, natural fifth-slot reach (needs only 2 of 3
 * available top units vs T2 needing all 3), never forced on move 1, clearer
 * topology, same solver cost.
 *
 * Every template is L2-strong: the production solver finds an optimal
 * solution that RECEIVES into the thermos to 5/5 (FIFTH_SLOT_USE), later
 * SOURCES from it (THERMOS_DRAIN), empties it fully and wins. Bank is 17/18
 * L3 (cap4 control strictly longer); Strong L3 is informational only.
 *
 * Discovery: offline `scripts/dev/thermos-search.ts` + `thermos-curate.ts`
 * over the exact production topology (4c/6v/16u, layer counts 4,4,3,2,0 + T3
 * thermos 3; global multiset 4,4,3,3,2,0), relativized with c0..c3 fully
 * permutable (no semantic hot tea — full isomorphism, so discovered depth
 * holds exactly). Gate pool: 1500 shaped → 424 canonical-distinct L2;
 * best 18 committed below (measured depth spread 9–13).
 *
 * Pure domain data + instantiation helpers. No React/Pixi imports.
 * Runtime re-validates each instantiation through `finalizeCandidate`.
 */

import type { TeaId } from '../types';

/** Palette-relative tea role inside template cup patterns (all permutable). */
export type ThermosTeaRole = 'c0' | 'c1' | 'c2' | 'c3';

export type ThermosTemplateKind = 'thermos';

export interface ThermosTemplate {
  id: string;
  kind: ThermosTemplateKind;
  /** Discovered solver depth in pours (audit trail; runtime re-validates exactly). */
  depth: number;
  /** Final slot order (`[]` = empty vessel; layer counts are 4,4,3,2,0,3 with thermos last). */
  cups: ThermosTeaRole[][];
  /** Thermos slot (stable last vessel index, T3 profile). */
  thermosIndex: number;
}

/** Generation contract the kind serves (mirrors the canonical request). */
export interface ThermosTemplateSpec {
  numColors: number;
  emptyCups: number;
  hasMysteryLayer: boolean;
  sourceOnlyCount: number;
}

export const THERMOS_TEMPLATE_SPECS: Record<ThermosTemplateKind, ThermosTemplateSpec> = {
  'thermos': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 0 },
};

/** Measured depth bands from T3 L2 data (L2 hist 9:22/10:65/11:116/12:126/13:80). Sweet 10–12, accept 9–13. */
export const THERMOS_DEPTH_SWEET: { min: number; max: number } = { min: 10, max: 12 };
export const THERMOS_DEPTH_ACCEPT: { min: number; max: number } = { min: 9, max: 13 };

/** Bounded runtime template attempts (never a 150-scan for thermos). */
export const THERMOS_TEMPLATE_ATTEMPTS = 4;

export const THERMOS_TEMPLATE_BANK: Record<ThermosTemplateKind, ThermosTemplate[]> = {
  'thermos': [
    { id: 'thermos-11-100124', kind: 'thermos', depth: 11, cups: [['c3','c3','c2','c2'],['c2','c0','c1','c0'],['c0','c2','c1'],['c3','c1'],[],['c1','c3','c0']], thermosIndex: 5 },
    { id: 'thermos-11-101057', kind: 'thermos', depth: 11, cups: [['c1','c0','c1','c0'],['c3','c2','c3','c1'],['c0','c3','c0'],['c2','c2'],[],['c2','c3','c1']], thermosIndex: 5 },
    { id: 'thermos-11-100248', kind: 'thermos', depth: 11, cups: [['c1','c0','c2','c1'],['c3','c3','c1','c2'],['c0','c3','c1'],['c2','c0'],[],['c2','c3','c0']], thermosIndex: 5 },
    { id: 'thermos-11-100608', kind: 'thermos', depth: 11, cups: [['c2','c0','c2','c1'],['c1','c3','c2','c1'],['c0','c0','c3'],['c3','c0'],[],['c3','c2','c1']], thermosIndex: 5 },
    { id: 'thermos-11-101412', kind: 'thermos', depth: 11, cups: [['c3','c2','c1','c0'],['c1','c3','c3','c1'],['c0','c2','c0'],['c2','c0'],[],['c2','c3','c1']], thermosIndex: 5 },
    { id: 'thermos-11-100517', kind: 'thermos', depth: 11, cups: [['c0','c3','c3','c2'],['c3','c1','c2','c0'],['c2','c3','c1'],['c1','c0'],[],['c0','c1','c2']], thermosIndex: 5 },
    { id: 'thermos-9-101289', kind: 'thermos', depth: 9, cups: [['c3','c1','c3','c2'],['c2','c1','c2','c3'],['c0','c0','c0'],['c1','c1'],[],['c0','c2','c3']], thermosIndex: 5 },
    { id: 'thermos-9-100489', kind: 'thermos', depth: 9, cups: [['c2','c0','c2','c0'],['c3','c1','c1','c2'],['c0','c3','c3'],['c1','c1'],[],['c3','c0','c2']], thermosIndex: 5 },
    { id: 'thermos-10-100171', kind: 'thermos', depth: 10, cups: [['c0','c2','c1','c0'],['c1','c3','c0','c1'],['c2','c2','c3'],['c3','c3'],[],['c2','c0','c1']], thermosIndex: 5 },
    { id: 'thermos-10-101143', kind: 'thermos', depth: 10, cups: [['c0','c0','c1','c3'],['c3','c0','c1','c2'],['c1','c0','c3'],['c2','c2'],[],['c2','c3','c1']], thermosIndex: 5 },
    { id: 'thermos-10-100921', kind: 'thermos', depth: 10, cups: [['c0','c0','c2','c1'],['c3','c0','c3','c1'],['c1','c1','c3'],['c0','c2'],[],['c2','c2','c3']], thermosIndex: 5 },
    { id: 'thermos-10-100686', kind: 'thermos', depth: 10, cups: [['c1','c1','c0','c0'],['c0','c2','c3','c2'],['c3','c1','c0'],['c2','c3'],[],['c3','c1','c2']], thermosIndex: 5 },
    { id: 'thermos-12-100236', kind: 'thermos', depth: 12, cups: [['c3','c2','c3','c0'],['c0','c3','c0','c2'],['c1','c2','c0'],['c1','c1'],[],['c2','c1','c3']], thermosIndex: 5 },
    { id: 'thermos-12-100471', kind: 'thermos', depth: 12, cups: [['c2','c3','c1','c2'],['c1','c3','c2','c1'],['c0','c3','c1'],['c0','c3'],[],['c0','c0','c2']], thermosIndex: 5 },
    { id: 'thermos-12-101228', kind: 'thermos', depth: 12, cups: [['c3','c2','c3','c0'],['c0','c1','c2','c0'],['c2','c1','c3'],['c1','c3'],[],['c1','c2','c0']], thermosIndex: 5 },
    { id: 'thermos-12-100009', kind: 'thermos', depth: 12, cups: [['c1','c2','c1','c0'],['c0','c3','c1','c2'],['c2','c3','c1'],['c3','c0'],[],['c0','c3','c2']], thermosIndex: 5 },
    { id: 'thermos-13-101142', kind: 'thermos', depth: 13, cups: [['c2','c1','c2','c0'],['c3','c0','c1','c0'],['c0','c3','c2'],['c3','c1'],[],['c3','c1','c2']], thermosIndex: 5 },
    { id: 'thermos-13-100529', kind: 'thermos', depth: 13, cups: [['c3','c0','c3','c2'],['c2','c3','c0','c2'],['c1','c0','c1'],['c1','c1'],[],['c2','c3','c0']], thermosIndex: 5 },
  ],
};

/** All bank templates flattened (bank validation tests iterate this). */
export const ALL_THERMOS_TEMPLATES: ThermosTemplate[] = [
  ...THERMOS_TEMPLATE_BANK['thermos'],
];

/**
 * Instantiate a template against a concrete palette + role bijection.
 * `order`: palette teas serving roles c0..c3 (seeded permutation). Any
 * bijection is a full puzzle isomorphism (thermos stays mixed-T3 cap5/E,
 * no target, tea counts preserved), so the discovered depth holds exactly.
 */
export function instantiateThermosTemplate(
  tpl: ThermosTemplate,
  palette: TeaId[],
  order: TeaId[] = [...palette],
): { cups: TeaId[][]; thermosSlot: number } {
  const roleToTea = new Map<ThermosTeaRole, TeaId>([
    ['c0', order[0] as TeaId],
    ['c1', order[1] as TeaId],
    ['c2', order[2] as TeaId],
    ['c3', order[3] as TeaId],
  ]);
  const cups = tpl.cups.map((cup) => cup.map((role) => roleToTea.get(role) as TeaId));
  return { cups, thermosSlot: tpl.thermosIndex };
}
