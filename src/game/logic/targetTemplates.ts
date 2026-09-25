/**
 * Target puzzle template bank (Gauntlet 2.1).
 *
 * WHY: random-deal target generation needs dozens of BFS validations per
 * level (raw target deals center above the sweet spot), stalling the main
 * thread for seconds. These topologies were discovered OFFLINE by the
 * production generator + solver, then relativized to tea ROLES:
 *   t0/t1 = requested target teas (in request order tasks),
 *   o0/o1/o2 = remaining palette teas (in palette order).
 * Any bijective role→tea instantiation is a full puzzle isomorphism, so
 * the discovered solver depth holds EXACTLY for every palette — while the
 * runtime production solver still re-validates each instantiation through
 * the single `finalizeCandidate` gate (never trusted blindly).
 *
 * Pure domain data + instantiation helpers. No React/Pixi imports.
 * Every template: targets in stable slots (0,1 — or 1,2 behind the
 * teapot), teapot full+mixed at slot 0 when present, targets full and
 * never pre-solved, mystery assigned separately at runtime on an
 * untargeted normal cup (presentation-only, never affects the depth).
 */

import type { TeaId } from '../types';

/** Relative tea role used inside template cup patterns. */
export type TeaRole = 't0' | 't1' | 'o0' | 'o1' | 'o2';

export type TargetTemplateKind =
  | 'target-challenge'
  | 'target-mystery-peak'
  | 'teapot-target-challenge';

export interface TargetSlot {
  index: number;
  role: 't0' | 't1';
}

export interface TargetTemplate {
  id: string;
  kind: TargetTemplateKind;
  /** Discovered solver depth (audit trail; runtime re-validates exactly). */
  depth: number;
  /** Final slot order (`[]` = empty vessel). */
  cups: TeaRole[][];
  targets: [TargetSlot, TargetSlot];
  teapot: number | null;
}

/** Generation contract each kind serves (mirrors the canonical requests). */
export interface TargetTemplateSpec {
  numColors: number;
  emptyCups: number;
  hasMysteryLayer: boolean;
  sourceOnlyCount: number;
  targetCount: number;
}

export const TARGET_TEMPLATE_SPECS: Record<TargetTemplateKind, TargetTemplateSpec> = {
  'target-challenge': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 0, targetCount: 2 },
  'target-mystery-peak': { numColors: 5, emptyCups: 2, hasMysteryLayer: true, sourceOnlyCount: 0, targetCount: 2 },
  'teapot-target-challenge': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 1, targetCount: 2 },
};

/** Bounded runtime template attempts (never a 150-scan for targets). */
export const TARGET_TEMPLATE_ATTEMPTS = 4;

const T = (index: number, role: 't0' | 't1'): TargetSlot => ({ index, role });

export const TARGET_TEMPLATE_BANK: Record<TargetTemplateKind, TargetTemplate[]> = {
  'target-challenge': [
    { id: 'tc-07-a', kind: 'target-challenge', depth: 7, cups: [['t0', 't0', 't1', 't1'], ['t1', 'o0', 'o0', 'o0'], ['o1', 'o1', 'o1', 't0'], [], ['o1', 't1', 't0', 'o0'], []], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
    { id: 'tc-08-a', kind: 'target-challenge', depth: 8, cups: [['o0', 'o0', 'o1', 't0'], ['t0', 'o1', 'o1', 'o1'], [], ['t0', 't0', 'o0', 'o0'], ['t1', 't1', 't1', 't1'], []], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
    { id: 'tc-08-b', kind: 'target-challenge', depth: 8, cups: [['t0', 't0', 'o0', 'o0'], ['t1', 'o0', 't0', 't1'], ['t0', 'o1', 'o1', 'o1'], [], ['o1', 't1', 't1', 'o0'], []], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
    { id: 'tc-08-c', kind: 'target-challenge', depth: 8, cups: [['t0', 'o0', 'o0', 'o0'], ['t1', 't0', 't0', 'o1'], ['o0', 'o1', 't1', 't1'], ['t1', 't0', 'o1', 'o1'], [], []], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
    { id: 'tc-08-d', kind: 'target-challenge', depth: 8, cups: [['t0', 't1', 't1', 't1'], ['t0', 't0', 'o1', 't0'], ['o0', 'o0', 'o1', 't1'], [], [], ['o1', 'o1', 'o0', 'o0']], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
    { id: 'tc-08-e', kind: 'target-challenge', depth: 8, cups: [['t1', 't1', 't0', 't0'], ['t0', 't0', 'o0', 'o1'], ['o1', 'o1', 'o1', 'o0'], ['o0', 'o0', 't1', 't1'], [], []], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
    { id: 'tc-09-a', kind: 'target-challenge', depth: 9, cups: [['o0', 'o1', 't1', 'o1'], ['o1', 'o0', 'o0', 'o0'], ['t0', 't0', 't0', 't0'], ['o1', 't1', 't1', 't1'], [], []], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
    { id: 'tc-09-b', kind: 'target-challenge', depth: 9, cups: [['t0', 't0', 't0', 'o1'], ['t1', 't0', 'o1', 't1'], [], ['t1', 'o0', 'o1', 'o1'], ['t1', 'o0', 'o0', 'o0'], []], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
    { id: 'tc-09-c', kind: 'target-challenge', depth: 9, cups: [['t0', 't1', 'o1', 'o1'], ['t0', 'o0', 'o1', 't0'], ['o0', 'o0', 'o0', 't0'], ['t1', 't1', 't1', 'o1'], [], []], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
    { id: 'tc-09-d', kind: 'target-challenge', depth: 9, cups: [['o1', 't1', 't1', 't1'], ['o1', 'o1', 't0', 't1'], ['t0', 'o1', 't0', 't0'], [], ['o0', 'o0', 'o0', 'o0'], []], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
    { id: 'tc-10-a', kind: 'target-challenge', depth: 10, cups: [['o1', 'o1', 'o0', 't1'], ['o0', 'o0', 'o1', 't1'], ['o0', 't1', 't1', 'o1'], ['t0', 't0', 't0', 't0'], [], []], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
    { id: 'tc-10-b', kind: 'target-challenge', depth: 10, cups: [['t1', 'o1', 't0', 't0'], ['o1', 'o1', 't1', 't0'], ['t1', 't1', 't0', 'o1'], [], ['o0', 'o0', 'o0', 'o0'], []], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
    { id: 'tc-10-c', kind: 'target-challenge', depth: 10, cups: [['t0', 't0', 't0', 't1'], ['o0', 't1', 'o1', 'o0'], [], [], ['t1', 't0', 'o0', 'o0'], ['t1', 'o1', 'o1', 'o1']], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
    { id: 'tc-10-d', kind: 'target-challenge', depth: 10, cups: [['t0', 'o1', 't0', 'o1'], ['o0', 't1', 'o1', 'o1'], ['o0', 't1', 't1', 't1'], [], ['t0', 't0', 'o0', 'o0'], []], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
  ],
  'teapot-target-challenge': [
    { id: 'tt-07-a', kind: 'teapot-target-challenge', depth: 7, cups: [['t1', 't1', 't1', 'o1'], ['t0', 't0', 't0', 'o0'], ['t1', 'o0', 't0', 'o0'], ['o1', 'o1', 'o1', 'o0'], [], []], targets: [T(1, 't0'), T(2, 't1')], teapot: 0 },
    { id: 'tt-08-a', kind: 'teapot-target-challenge', depth: 8, cups: [['t0', 'o0', 'o0', 't1'], ['t0', 't1', 'o1', 'o1'], ['t1', 'o1', 'o1', 't1'], ['o0', 'o0', 't0', 't0'], [], []], targets: [T(1, 't0'), T(2, 't1')], teapot: 0 },
    { id: 'tt-09-a', kind: 'teapot-target-challenge', depth: 9, cups: [['t1', 'o0', 'o1', 'o1'], ['t0', 't0', 'o0', 'o1'], ['t1', 'o1', 'o0', 'o0'], [], [], ['t1', 't1', 't0', 't0']], targets: [T(1, 't0'), T(2, 't1')], teapot: 0 },
    { id: 'tt-09-b', kind: 'teapot-target-challenge', depth: 9, cups: [['t1', 'o0', 'o0', 'o0'], ['t0', 'o0', 'o1', 't1'], ['o1', 'o1', 't1', 't1'], [], [], ['o1', 't0', 't0', 't0']], targets: [T(1, 't0'), T(2, 't1')], teapot: 0 },
    { id: 'tt-09-c', kind: 'teapot-target-challenge', depth: 9, cups: [['t0', 't0', 'o1', 'o1'], ['o0', 'o0', 'o1', 'o1'], ['t1', 't0', 't0', 'o0'], [], [], ['t1', 'o0', 't1', 't1']], targets: [T(1, 't0'), T(2, 't1')], teapot: 0 },
    { id: 'tt-09-d', kind: 'teapot-target-challenge', depth: 9, cups: [['o1', 'o1', 'o0', 'o0'], ['o1', 't0', 't0', 't0'], ['t1', 't1', 't1', 'o0'], [], ['o1', 't0', 'o0', 't1'], []], targets: [T(1, 't0'), T(2, 't1')], teapot: 0 },
    { id: 'tt-09-e', kind: 'teapot-target-challenge', depth: 9, cups: [['o0', 'o0', 't0', 't0'], ['t0', 't0', 'o0', 't1'], ['t1', 'o1', 'o1', 't1'], [], ['t1', 'o0', 'o1', 'o1'], []], targets: [T(1, 't0'), T(2, 't1')], teapot: 0 },
    { id: 'tt-09-f', kind: 'teapot-target-challenge', depth: 9, cups: [['t1', 't1', 'o0', 'o0'], ['t0', 'o0', 't0', 't0'], ['t1', 'o1', 'o1', 'o1'], ['o0', 'o1', 't0', 't1'], [], []], targets: [T(1, 't0'), T(2, 't1')], teapot: 0 },
    { id: 'tt-10-a', kind: 'teapot-target-challenge', depth: 10, cups: [['o0', 'o0', 'o1', 't1'], ['t0', 't0', 'o1', 'o0'], ['t1', 't0', 't0', 't1'], [], ['o1', 'o1', 't1', 'o0'], []], targets: [T(1, 't0'), T(2, 't1')], teapot: 0 },
    { id: 'tt-10-b', kind: 'teapot-target-challenge', depth: 10, cups: [['o1', 'o0', 'o1', 'o1'], ['o1', 't1', 't1', 'o0'], ['t1', 't1', 't0', 'o0'], ['o0', 't0', 't0', 't0'], [], []], targets: [T(1, 't0'), T(2, 't1')], teapot: 0 },
    { id: 'tt-10-c', kind: 'teapot-target-challenge', depth: 10, cups: [['o0', 'o0', 't1', 't1'], ['t0', 't1', 't0', 't1'], ['o0', 't0', 'o0', 't0'], [], ['o1', 'o1', 'o1', 'o1'], []], targets: [T(1, 't0'), T(2, 't1')], teapot: 0 },
    { id: 'tt-10-d', kind: 'teapot-target-challenge', depth: 10, cups: [['t1', 'o0', 't0', 't0'], ['t0', 't1', 'o0', 'o0'], ['o1', 'o1', 'o1', 'o0'], [], [], ['t1', 't1', 'o1', 't0']], targets: [T(1, 't0'), T(2, 't1')], teapot: 0 },
    { id: 'tt-10-e', kind: 'teapot-target-challenge', depth: 10, cups: [['t0', 'o1', 'o1', 't0'], ['o0', 'o0', 'o1', 'o1'], ['t1', 'o0', 't0', 'o0'], [], [], ['t1', 't1', 't1', 't0']], targets: [T(1, 't0'), T(2, 't1')], teapot: 0 },
    { id: 'tt-10-f', kind: 'teapot-target-challenge', depth: 10, cups: [['o1', 'o1', 't0', 't0'], ['t1', 'o1', 't0', 'o0'], ['t1', 'o1', 't1', 't1'], ['t0', 'o0', 'o0', 'o0'], [], []], targets: [T(1, 't0'), T(2, 't1')], teapot: 0 },
  ],
  'target-mystery-peak': [
    { id: 'tp-11-a', kind: 'target-mystery-peak', depth: 11, cups: [['o0', 'o0', 'o0', 'o2'], ['t0', 't0', 'o1', 'o2'], ['o1', 'o1', 'o1', 't0'], [], ['o2', 'o2', 't1', 'o0'], [], ['t0', 't1', 't1', 't1']], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
    { id: 'tp-11-b', kind: 'target-mystery-peak', depth: 11, cups: [['o1', 'o1', 't0', 'o1'], ['t1', 't1', 'o0', 'o0'], [], [], ['o1', 't1', 't1', 'o2'], ['o2', 't0', 'o0', 'o0'], ['t0', 't0', 'o2', 'o2']], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
    { id: 'tp-11-c', kind: 'target-mystery-peak', depth: 11, cups: [['t0', 't0', 'o0', 'o0'], ['t0', 't1', 't1', 't0'], [], ['t1', 'o1', 'o1', 'o1'], ['o2', 't1', 'o0', 'o0'], [], ['o2', 'o2', 'o1', 'o2']], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
    { id: 'tp-11-d', kind: 'target-mystery-peak', depth: 11, cups: [['t0', 't0', 'o1', 'o2'], ['t1', 't1', 't0', 'o2'], [], ['o1', 't0', 'o0', 'o0'], [], ['o2', 'o1', 'o2', 'o1'], ['o0', 'o0', 't1', 't1']], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
    { id: 'tp-12-a', kind: 'target-mystery-peak', depth: 12, cups: [['o0', 't0', 'o2', 't1'], ['t0', 't0', 'o2', 'o1'], [], [], ['o0', 'o0', 'o0', 'o2'], ['t0', 'o1', 'o1', 'o1'], ['t1', 't1', 't1', 'o2']], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
    { id: 'tp-12-b', kind: 'target-mystery-peak', depth: 12, cups: [['o2', 'o0', 't1', 't0'], ['t0', 't0', 'o1', 'o1'], [], ['t1', 't1', 'o1', 'o1'], [], ['o0', 'o2', 'o2', 'o2'], ['o0', 'o0', 't0', 't1']], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
    { id: 'tp-12-c', kind: 'target-mystery-peak', depth: 12, cups: [['t0', 'o2', 'o1', 'o2'], ['o1', 'o1', 'o1', 'o0'], [], ['t0', 't0', 'o0', 'o0'], ['t1', 't1', 't1', 't1'], ['o2', 'o0', 't0', 'o2'], []], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
    { id: 'tp-12-d', kind: 'target-mystery-peak', depth: 12, cups: [['o2', 'o2', 'o2', 't0'], ['t0', 'o1', 'o0', 'o0'], [], ['o1', 'o1', 'o0', 'o0'], ['t1', 't1', 't1', 'o2'], ['t0', 'o1', 't1', 't0'], []], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
    { id: 'tp-13-a', kind: 'target-mystery-peak', depth: 13, cups: [['o0', 'o0', 'o2', 'o1'], ['t0', 't1', 'o0', 'o2'], ['o2', 'o0', 'o1', 'o1'], ['t1', 't1', 't1', 'o1'], ['o2', 't0', 't0', 't0'], [], []], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
    { id: 'tp-13-b', kind: 'target-mystery-peak', depth: 13, cups: [['t0', 'o1', 'o0', 't1'], ['o0', 'o1', 't1', 'o2'], ['o0', 'o0', 'o2', 'o2'], ['o1', 'o1', 't1', 't1'], [], [], ['t0', 'o2', 't0', 't0']], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
    { id: 'tp-13-c', kind: 'target-mystery-peak', depth: 13, cups: [['t0', 't1', 'o1', 't0'], ['t1', 'o0', 't0', 'o0'], ['o2', 'o2', 'o2', 'o1'], ['o1', 'o1', 'o0', 't0'], [], [], ['o2', 't1', 't1', 'o0']], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
    { id: 'tp-14-a', kind: 'target-mystery-peak', depth: 14, cups: [['o1', 'o1', 't1', 'o2'], ['t0', 't1', 'o0', 'o1'], [], ['o2', 'o2', 'o1', 'o2'], ['o0', 't0', 't0', 't0'], [], ['t1', 't1', 'o0', 'o0']], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
    { id: 'tp-14-b', kind: 'target-mystery-peak', depth: 14, cups: [['o0', 'o0', 'o2', 't1'], ['o1', 'o0', 't0', 't1'], ['t0', 't0', 't1', 't1'], ['t0', 'o2', 'o2', 'o0'], [], ['o1', 'o1', 'o1', 'o2'], []], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
    { id: 'tp-14-c', kind: 'target-mystery-peak', depth: 14, cups: [['o1', 'o0', 'o1', 't1'], ['o2', 't1', 'o2', 't0'], [], ['t1', 't0', 't0', 't0'], ['o1', 'o1', 't1', 'o0'], [], ['o0', 'o0', 'o2', 'o2']], targets: [T(0, 't0'), T(1, 't1')], teapot: null },
  ],
};

/** All bank templates flattened (bank validation tests iterate this). */
export const ALL_TARGET_TEMPLATES: TargetTemplate[] = [
  ...TARGET_TEMPLATE_BANK['target-challenge'],
  ...TARGET_TEMPLATE_BANK['teapot-target-challenge'],
  ...TARGET_TEMPLATE_BANK['target-mystery-peak'],
];

/**
 * Instantiate a template against a concrete request + role bijection.
 * `targetOrder`: which requested target tea serves role t0/t1 (seeded
 * t-swap); `otherOrder`: requested other teas serving o0/o1/o2 (seeded
 * permutation). Any bijection is a full puzzle isomorphism, so the
 * discovered depth is preserved exactly.
 */
export function instantiateTargetTemplate(
  tpl: TargetTemplate,
  targetTeas: [TeaId, TeaId],
  otherTeas: TeaId[],
  targetOrder: [TeaId, TeaId] = [targetTeas[0] as TeaId, targetTeas[1] as TeaId],
  otherOrder: TeaId[] = [...otherTeas],
): { cups: TeaId[][]; targetTeaBySlot: Map<number, TeaId>; teapotSlot: number | null } {
  const roleToTea = new Map<TeaRole, TeaId>([
    ['t0', targetOrder[0] as TeaId],
    ['t1', targetOrder[1] as TeaId],
  ]);
  const oRoles: TeaRole[] = ['o0', 'o1', 'o2'];
  oRoles.forEach((role, i) => {
    if (otherOrder[i] !== undefined) roleToTea.set(role, otherOrder[i] as TeaId);
  });
  const cups = tpl.cups.map((cup) => cup.map((role) => roleToTea.get(role) as TeaId));
  const targetTeaBySlot = new Map<number, TeaId>();
  for (const t of tpl.targets) {
    targetTeaBySlot.set(t.index, roleToTea.get(t.role) as TeaId);
  }
  return { cups, targetTeaBySlot, teapotSlot: tpl.teapot };
}
