/**
 * Sinking-honey template bank (Gauntlet 7 — «Мёд на дне»).
 *
 * Every template is STRONG: the production action-aware solver finds an
 * optimal solution demonstrating HONEY-STAY (a successful outflow from the
 * honey host that leaves tea behind, honey stays) AND HONEY-MOVE (a later
 * outflow that empties the host, honey relocates), finishing with honey
 * under full homogeneous buckwheat — while the SAME tea topology solved
 * with honey absent is irrelevant to necessity (honey is an additional
 * goal; necessity = initial goal unsatisfied + stay + move + final goal).
 *
 * Discovery: offline `scripts/dev/honey-search.ts` over 2-empty topologies
 * (4c/6v, 5c/7v, teapot 4c/6v), relativized with c0 fixed to buckwheat
 * (honey target) and other roles permuted (full isomorphism on non-target
 * teas, so discovered depth holds exactly). Gate pools: A 316 / B 298 /
 * C 429 canonical-distinct participating candidates; best 18 per kind
 * committed below (sweet depth, low visited, 1–2 moves, early first move).
 *
 * Pure domain data + instantiation helpers. No React/Pixi imports.
 * Runtime re-validates each instantiation through `finalizeCandidate`.
 */

import type { TeaId } from '../types';

/** Palette-relative tea role inside template cup patterns (c0 = buckwheat). */
export type HoneyTeaRole = 'c0' | 'c1' | 'c2' | 'c3' | 'c4';

export type HoneyTemplateKind = 'honey-challenge' | 'honey-mystery-peak' | 'teapot-honey-challenge';

export interface HoneyTemplate {
  id: string;
  kind: HoneyTemplateKind;
  /** Discovered solver depth in pours (audit trail; runtime re-validates exactly). */
  depth: number;
  /** Final slot order (`[]` = empty vessel; 2 empties per G7 loose topology). */
  cups: HoneyTeaRole[][];
  /** Initial honey host slot (full mixed vessel; 0 = teapot for teapot kind). */
  honeyHost: number;
  /** Teapot slot when present, else null. */
  teapot: number | null;
}

/** Generation contract each kind serves (mirrors the canonical requests). */
export interface HoneyTemplateSpec {
  numColors: number;
  emptyCups: number;
  hasMysteryLayer: boolean;
  sourceOnlyCount: number;
}

export const HONEY_TEMPLATE_SPECS: Record<HoneyTemplateKind, HoneyTemplateSpec> = {
  'honey-challenge': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 0 },
  'honey-mystery-peak': { numColors: 5, emptyCups: 2, hasMysteryLayer: true, sourceOnlyCount: 0 },
  'teapot-honey-challenge': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 1 },
};

/** Strainer-style measured depth bands for honey (global bands untouched). */
export const HONEY_DEPTH_SWEET: Record<HoneyTemplateKind, { min: number; max: number }> = {
  'honey-challenge': { min: 10, max: 13 },
  'honey-mystery-peak': { min: 14, max: 17 },
  'teapot-honey-challenge': { min: 10, max: 13 },
};

export const HONEY_DEPTH_ACCEPT: Record<HoneyTemplateKind, { min: number; max: number }> = {
  'honey-challenge': { min: 8, max: 15 },
  'honey-mystery-peak': { min: 12, max: 19 },
  'teapot-honey-challenge': { min: 8, max: 15 },
};

/** Bounded runtime template attempts (never a 150-scan for honey). */
export const HONEY_TEMPLATE_ATTEMPTS = 4;

/** Honey target tea: template role c0 ALWAYS maps here, never permuted away. */
export const HONEY_TARGET_TEA: TeaId = 'buckwheat';

export const HONEY_TEMPLATE_BANK: Record<HoneyTemplateKind, HoneyTemplate[]> = {
  'honey-challenge': [
    { id: 'honey-challenge-10-90', kind: 'honey-challenge', depth: 10, cups: [['c0', 'c0', 'c1', 'c1'], ['c2', 'c1', 'c2', 'c1'], [], [], ['c0', 'c2', 'c2', 'c3'], ['c3', 'c3', 'c0', 'c3']], honeyHost: 0, teapot: null },
    { id: 'honey-challenge-10-135', kind: 'honey-challenge', depth: 10, cups: [[], ['c2', 'c3', 'c3', 'c3'], ['c0', 'c1', 'c1', 'c2'], ['c0', 'c1', 'c1', 'c2'], [], ['c0', 'c3', 'c2', 'c0']], honeyHost: 3, teapot: null },
    { id: 'honey-challenge-10-455', kind: 'honey-challenge', depth: 10, cups: [[], ['c3', 'c1', 'c3', 'c0'], ['c2', 'c2', 'c2', 'c0'], ['c1', 'c1', 'c2', 'c3'], [], ['c0', 'c0', 'c3', 'c1']], honeyHost: 1, teapot: null },
    { id: 'honey-challenge-10-833', kind: 'honey-challenge', depth: 10, cups: [[], ['c0', 'c2', 'c3', 'c1'], [], ['c0', 'c0', 'c1', 'c1'], ['c2', 'c2', 'c3', 'c3'], ['c3', 'c0', 'c2', 'c1']], honeyHost: 5, teapot: null },
    { id: 'honey-challenge-10-984', kind: 'honey-challenge', depth: 10, cups: [['c2', 'c1', 'c0', 'c0'], [], ['c1', 'c2', 'c1', 'c2'], [], ['c3', 'c3', 'c3', 'c3'], ['c0', 'c0', 'c1', 'c2']], honeyHost: 0, teapot: null },
    { id: 'honey-challenge-11-120', kind: 'honey-challenge', depth: 11, cups: [[], ['c0', 'c2', 'c2', 'c3'], ['c1', 'c1', 'c1', 'c3'], ['c3', 'c3', 'c0', 'c1'], ['c2', 'c0', 'c2', 'c0'], []], honeyHost: 4, teapot: null },
    { id: 'honey-challenge-11-463', kind: 'honey-challenge', depth: 11, cups: [['c0', 'c1', 'c3', 'c0'], [], ['c0', 'c1', 'c2', 'c2'], ['c1', 'c0', 'c3', 'c1'], ['c3', 'c3', 'c2', 'c2'], []], honeyHost: 3, teapot: null },
    { id: 'honey-challenge-11-589', kind: 'honey-challenge', depth: 11, cups: [[], ['c0', 'c2', 'c2', 'c3'], ['c2', 'c3', 'c3', 'c1'], [], ['c0', 'c0', 'c3', 'c1'], ['c1', 'c1', 'c2', 'c0']], honeyHost: 2, teapot: null },
    { id: 'honey-challenge-11-876', kind: 'honey-challenge', depth: 11, cups: [['c3', 'c2', 'c1', 'c2'], ['c1', 'c1', 'c2', 'c2'], ['c1', 'c3', 'c0', 'c0'], ['c0', 'c3', 'c3', 'c0'], [], []], honeyHost: 0, teapot: null },
    { id: 'honey-challenge-11-914', kind: 'honey-challenge', depth: 11, cups: [['c1', 'c3', 'c0', 'c2'], ['c1', 'c3', 'c3', 'c3'], ['c0', 'c0', 'c2', 'c1'], [], ['c2', 'c0', 'c2', 'c1'], []], honeyHost: 4, teapot: null },
    { id: 'honey-challenge-12-27', kind: 'honey-challenge', depth: 12, cups: [[], ['c1', 'c0', 'c3', 'c1'], ['c1', 'c0', 'c3', 'c3'], [], ['c2', 'c1', 'c2', 'c3'], ['c0', 'c0', 'c2', 'c2']], honeyHost: 4, teapot: null },
    { id: 'honey-challenge-12-88', kind: 'honey-challenge', depth: 12, cups: [[], ['c3', 'c2', 'c2', 'c0'], [], ['c0', 'c1', 'c1', 'c3'], ['c3', 'c2', 'c2', 'c1'], ['c0', 'c1', 'c3', 'c0']], honeyHost: 4, teapot: null },
    { id: 'honey-challenge-12-126', kind: 'honey-challenge', depth: 12, cups: [[], ['c2', 'c1', 'c1', 'c2'], ['c0', 'c1', 'c0', 'c3'], [], ['c3', 'c3', 'c0', 'c1'], ['c0', 'c2', 'c2', 'c3']], honeyHost: 1, teapot: null },
    { id: 'honey-challenge-12-329', kind: 'honey-challenge', depth: 12, cups: [[], ['c1', 'c2', 'c2', 'c2'], [], ['c3', 'c3', 'c0', 'c2'], ['c0', 'c3', 'c1', 'c0'], ['c1', 'c3', 'c0', 'c1']], honeyHost: 3, teapot: null },
    { id: 'honey-challenge-13-339', kind: 'honey-challenge', depth: 13, cups: [['c0', 'c1', 'c1', 'c0'], [], ['c2', 'c3', 'c2', 'c3'], [], ['c0', 'c1', 'c2', 'c3'], ['c0', 'c1', 'c2', 'c3']], honeyHost: 0, teapot: null },
    { id: 'honey-challenge-13-392', kind: 'honey-challenge', depth: 13, cups: [['c0', 'c2', 'c3', 'c0'], ['c0', 'c3', 'c1', 'c2'], ['c0', 'c3', 'c2', 'c2'], ['c1', 'c3', 'c1', 'c1'], [], []], honeyHost: 0, teapot: null },
    { id: 'honey-challenge-13-470', kind: 'honey-challenge', depth: 13, cups: [['c0', 'c1', 'c2', 'c0'], ['c1', 'c3', 'c3', 'c2'], ['c0', 'c1', 'c3', 'c0'], [], ['c1', 'c3', 'c2', 'c2'], []], honeyHost: 0, teapot: null },
    { id: 'honey-challenge-13-613', kind: 'honey-challenge', depth: 13, cups: [[], ['c2', 'c3', 'c1', 'c2'], [], ['c0', 'c2', 'c3', 'c0'], ['c0', 'c2', 'c1', 'c0'], ['c1', 'c1', 'c3', 'c3']], honeyHost: 1, teapot: null },
  ],
  'honey-mystery-peak': [
    { id: 'honey-mystery-peak-14-198', kind: 'honey-mystery-peak', depth: 14, cups: [[], ['c0', 'c3', 'c1', 'c3'], [], ['c3', 'c1', 'c1', 'c4'], ['c0', 'c4', 'c4', 'c0'], ['c0', 'c4', 'c2', 'c2'], ['c3', 'c1', 'c2', 'c2']], honeyHost: 1, teapot: null },
    { id: 'honey-mystery-peak-14-204', kind: 'honey-mystery-peak', depth: 14, cups: [[], ['c0', 'c3', 'c1', 'c2'], ['c1', 'c4', 'c3', 'c0'], [], ['c3', 'c0', 'c1', 'c0'], ['c4', 'c4', 'c4', 'c3'], ['c1', 'c2', 'c2', 'c2']], honeyHost: 4, teapot: null },
    { id: 'honey-mystery-peak-14-288', kind: 'honey-mystery-peak', depth: 14, cups: [['c3', 'c4', 'c3', 'c1'], ['c1', 'c0', 'c3', 'c3'], ['c0', 'c2', 'c4', 'c0'], ['c2', 'c2', 'c4', 'c4'], ['c0', 'c2', 'c1', 'c1'], [], []], honeyHost: 3, teapot: null },
    { id: 'honey-mystery-peak-14-349', kind: 'honey-mystery-peak', depth: 14, cups: [['c1', 'c0', 'c0', 'c4'], ['c3', 'c4', 'c1', 'c3'], [], ['c2', 'c2', 'c1', 'c1'], [], ['c0', 'c2', 'c3', 'c4'], ['c4', 'c2', 'c0', 'c3']], honeyHost: 1, teapot: null },
    { id: 'honey-mystery-peak-14-474', kind: 'honey-mystery-peak', depth: 14, cups: [['c0', 'c3', 'c4', 'c1'], [], ['c4', 'c2', 'c2', 'c3'], [], ['c3', 'c1', 'c0', 'c3'], ['c1', 'c1', 'c0', 'c0'], ['c4', 'c2', 'c2', 'c4']], honeyHost: 6, teapot: null },
    { id: 'honey-mystery-peak-15-490', kind: 'honey-mystery-peak', depth: 15, cups: [['c3', 'c3', 'c4', 'c3'], ['c0', 'c2', 'c4', 'c1'], [], [], ['c0', 'c2', 'c2', 'c3'], ['c4', 'c1', 'c4', 'c2'], ['c0', 'c1', 'c1', 'c0']], honeyHost: 1, teapot: null },
    { id: 'honey-mystery-peak-15-526', kind: 'honey-mystery-peak', depth: 15, cups: [[], [], ['c4', 'c4', 'c0', 'c3'], ['c2', 'c1', 'c2', 'c2'], ['c3', 'c4', 'c2', 'c1'], ['c0', 'c4', 'c1', 'c3'], ['c0', 'c0', 'c1', 'c3']], honeyHost: 5, teapot: null },
    { id: 'honey-mystery-peak-15-743', kind: 'honey-mystery-peak', depth: 15, cups: [['c2', 'c3', 'c2', 'c1'], [], ['c1', 'c0', 'c1', 'c0'], ['c4', 'c4', 'c3', 'c3'], ['c0', 'c4', 'c2', 'c2'], ['c0', 'c3', 'c4', 'c1'], []], honeyHost: 4, teapot: null },
    { id: 'honey-mystery-peak-15-763', kind: 'honey-mystery-peak', depth: 15, cups: [['c0', 'c0', 'c4', 'c2'], ['c3', 'c4', 'c3', 'c3'], ['c1', 'c4', 'c1', 'c2'], ['c0', 'c0', 'c1', 'c1'], [], [], ['c2', 'c4', 'c2', 'c3']], honeyHost: 0, teapot: null },
    { id: 'honey-mystery-peak-15-791', kind: 'honey-mystery-peak', depth: 15, cups: [['c4', 'c3', 'c2', 'c2'], [], ['c3', 'c1', 'c3', 'c4'], ['c0', 'c2', 'c0', 'c1'], [], ['c2', 'c0', 'c0', 'c4'], ['c4', 'c3', 'c1', 'c1']], honeyHost: 5, teapot: null },
    { id: 'honey-mystery-peak-16-292', kind: 'honey-mystery-peak', depth: 16, cups: [['c0', 'c4', 'c2', 'c4'], [], [], ['c2', 'c4', 'c3', 'c0'], ['c2', 'c0', 'c3', 'c1'], ['c2', 'c1', 'c1', 'c1'], ['c0', 'c3', 'c4', 'c3']], honeyHost: 3, teapot: null },
    { id: 'honey-mystery-peak-16-315', kind: 'honey-mystery-peak', depth: 16, cups: [[], ['c4', 'c3', 'c0', 'c2'], [], ['c3', 'c2', 'c3', 'c4'], ['c4', 'c3', 'c0', 'c2'], ['c0', 'c1', 'c1', 'c4'], ['c0', 'c1', 'c2', 'c1']], honeyHost: 5, teapot: null },
    { id: 'honey-mystery-peak-16-770', kind: 'honey-mystery-peak', depth: 16, cups: [['c0', 'c0', 'c1', 'c3'], ['c0', 'c3', 'c4', 'c1'], [], [], ['c4', 'c2', 'c1', 'c2'], ['c4', 'c2', 'c1', 'c0'], ['c4', 'c3', 'c3', 'c2']], honeyHost: 0, teapot: null },
    { id: 'honey-mystery-peak-16-889', kind: 'honey-mystery-peak', depth: 16, cups: [['c0', 'c2', 'c3', 'c3'], ['c2', 'c4', 'c1', 'c1'], ['c2', 'c3', 'c0', 'c1'], [], ['c2', 'c3', 'c0', 'c1'], ['c4', 'c0', 'c4', 'c4'], []], honeyHost: 5, teapot: null },
    { id: 'honey-mystery-peak-17-71', kind: 'honey-mystery-peak', depth: 17, cups: [[], [], ['c3', 'c1', 'c4', 'c3'], ['c3', 'c2', 'c1', 'c2'], ['c2', 'c4', 'c1', 'c3'], ['c0', 'c0', 'c4', 'c2'], ['c0', 'c1', 'c0', 'c4']], honeyHost: 5, teapot: null },
    { id: 'honey-mystery-peak-17-110', kind: 'honey-mystery-peak', depth: 17, cups: [[], ['c4', 'c3', 'c1', 'c1'], ['c0', 'c2', 'c2', 'c3'], [], ['c4', 'c3', 'c1', 'c0'], ['c4', 'c1', 'c0', 'c3'], ['c2', 'c0', 'c4', 'c2']], honeyHost: 6, teapot: null },
    { id: 'honey-mystery-peak-17-156', kind: 'honey-mystery-peak', depth: 17, cups: [['c4', 'c3', 'c1', 'c0'], ['c0', 'c2', 'c1', 'c2'], ['c0', 'c2', 'c2', 'c4'], [], ['c4', 'c3', 'c1', 'c4'], [], ['c0', 'c3', 'c1', 'c3']], honeyHost: 2, teapot: null },
    { id: 'honey-mystery-peak-17-563', kind: 'honey-mystery-peak', depth: 17, cups: [['c2', 'c4', 'c3', 'c0'], ['c0', 'c1', 'c0', 'c4'], ['c0', 'c3', 'c1', 'c1'], ['c4', 'c3', 'c4', 'c2'], ['c2', 'c3', 'c1', 'c2'], [], []], honeyHost: 1, teapot: null },
  ],
  'teapot-honey-challenge': [
    { id: 'teapot-honey-challenge-10-31', kind: 'teapot-honey-challenge', depth: 10, cups: [['c2', 'c0', 'c3', 'c1'], [], ['c1', 'c1', 'c3', 'c0'], ['c0', 'c0', 'c2', 'c1'], [], ['c2', 'c2', 'c3', 'c3']], honeyHost: 0, teapot: 0 },
    { id: 'teapot-honey-challenge-10-57', kind: 'teapot-honey-challenge', depth: 10, cups: [['c3', 'c0', 'c2', 'c3'], [], ['c0', 'c3', 'c2', 'c0'], ['c2', 'c2', 'c3', 'c0'], [], ['c1', 'c1', 'c1', 'c1']], honeyHost: 0, teapot: 0 },
    { id: 'teapot-honey-challenge-10-207', kind: 'teapot-honey-challenge', depth: 10, cups: [['c0', 'c2', 'c0', 'c3'], ['c0', 'c3', 'c3', 'c1'], [], ['c3', 'c1', 'c1', 'c1'], [], ['c2', 'c2', 'c0', 'c2']], honeyHost: 0, teapot: 0 },
    { id: 'teapot-honey-challenge-10-397', kind: 'teapot-honey-challenge', depth: 10, cups: [['c0', 'c1', 'c2', 'c2'], ['c3', 'c3', 'c1', 'c1'], [], [], ['c2', 'c1', 'c0', 'c2'], ['c0', 'c3', 'c3', 'c0']], honeyHost: 0, teapot: 0 },
    { id: 'teapot-honey-challenge-10-701', kind: 'teapot-honey-challenge', depth: 10, cups: [['c0', 'c1', 'c0', 'c0'], [], ['c1', 'c3', 'c3', 'c3'], [], ['c1', 'c2', 'c2', 'c0'], ['c1', 'c2', 'c2', 'c3']], honeyHost: 0, teapot: 0 },
    { id: 'teapot-honey-challenge-11-98', kind: 'teapot-honey-challenge', depth: 11, cups: [['c0', 'c1', 'c2', 'c0'], ['c3', 'c1', 'c0', 'c0'], ['c1', 'c1', 'c3', 'c3'], [], [], ['c2', 'c2', 'c3', 'c2']], honeyHost: 0, teapot: 0 },
    { id: 'teapot-honey-challenge-11-126', kind: 'teapot-honey-challenge', depth: 11, cups: [['c3', 'c2', 'c1', 'c3'], ['c0', 'c3', 'c1', 'c2'], [], ['c2', 'c2', 'c0', 'c0'], [], ['c0', 'c3', 'c1', 'c1']], honeyHost: 0, teapot: 0 },
    { id: 'teapot-honey-challenge-11-289', kind: 'teapot-honey-challenge', depth: 11, cups: [['c0', 'c0', 'c1', 'c3'], ['c2', 'c3', 'c3', 'c1'], ['c1', 'c1', 'c2', 'c2'], [], [], ['c0', 'c3', 'c2', 'c0']], honeyHost: 0, teapot: 0 },
    { id: 'teapot-honey-challenge-11-814', kind: 'teapot-honey-challenge', depth: 11, cups: [['c0', 'c0', 'c3', 'c2'], ['c2', 'c2', 'c1', 'c3'], ['c3', 'c1', 'c1', 'c0'], [], [], ['c3', 'c1', 'c2', 'c0']], honeyHost: 0, teapot: 0 },
    { id: 'teapot-honey-challenge-11-982', kind: 'teapot-honey-challenge', depth: 11, cups: [['c0', 'c0', 'c1', 'c2'], [], [], ['c1', 'c0', 'c3', 'c1'], ['c3', 'c3', 'c2', 'c2'], ['c1', 'c3', 'c2', 'c0']], honeyHost: 0, teapot: 0 },
    { id: 'teapot-honey-challenge-12-178', kind: 'teapot-honey-challenge', depth: 12, cups: [['c0', 'c3', 'c1', 'c3'], [], [], ['c0', 'c2', 'c2', 'c3'], ['c0', 'c1', 'c1', 'c3'], ['c0', 'c1', 'c2', 'c2']], honeyHost: 0, teapot: 0 },
    { id: 'teapot-honey-challenge-12-190', kind: 'teapot-honey-challenge', depth: 12, cups: [['c0', 'c0', 'c2', 'c0'], [], [], ['c3', 'c1', 'c3', 'c2'], ['c2', 'c3', 'c1', 'c0'], ['c2', 'c3', 'c1', 'c1']], honeyHost: 0, teapot: 0 },
    { id: 'teapot-honey-challenge-12-332', kind: 'teapot-honey-challenge', depth: 12, cups: [['c0', 'c3', 'c1', 'c3'], ['c0', 'c2', 'c1', 'c3'], ['c0', 'c2', 'c1', 'c1'], [], ['c2', 'c2', 'c0', 'c3'], []], honeyHost: 0, teapot: 0 },
    { id: 'teapot-honey-challenge-12-732', kind: 'teapot-honey-challenge', depth: 12, cups: [['c1', 'c0', 'c3', 'c1'], [], ['c0', 'c1', 'c3', 'c0'], ['c2', 'c2', 'c2', 'c3'], ['c0', 'c1', 'c3', 'c2'], []], honeyHost: 0, teapot: 0 },
    { id: 'teapot-honey-challenge-13-364', kind: 'teapot-honey-challenge', depth: 13, cups: [['c0', 'c1', 'c3', 'c2'], ['c0', 'c3', 'c1', 'c3'], ['c0', 'c1', 'c3', 'c1'], ['c0', 'c2', 'c2', 'c2'], [], []], honeyHost: 0, teapot: 0 },
    { id: 'teapot-honey-challenge-13-635', kind: 'teapot-honey-challenge', depth: 13, cups: [['c3', 'c0', 'c3', 'c0'], ['c0', 'c3', 'c0', 'c1'], ['c2', 'c1', 'c2', 'c3'], [], [], ['c2', 'c2', 'c1', 'c1']], honeyHost: 0, teapot: 0 },
    { id: 'teapot-honey-challenge-13-828', kind: 'teapot-honey-challenge', depth: 13, cups: [['c0', 'c0', 'c3', 'c1'], ['c0', 'c2', 'c3', 'c0'], ['c3', 'c2', 'c2', 'c1'], ['c1', 'c3', 'c2', 'c1'], [], []], honeyHost: 0, teapot: 0 },
    { id: 'teapot-honey-challenge-13-886', kind: 'teapot-honey-challenge', depth: 13, cups: [['c0', 'c0', 'c1', 'c1'], ['c2', 'c0', 'c3', 'c2'], [], ['c2', 'c0', 'c1', 'c2'], ['c3', 'c1', 'c3', 'c3'], []], honeyHost: 0, teapot: 0 },
  ],
};

/** All bank templates flattened (bank validation tests iterate this). */
export const ALL_HONEY_TEMPLATES: HoneyTemplate[] = [
  ...HONEY_TEMPLATE_BANK['honey-challenge'],
  ...HONEY_TEMPLATE_BANK['honey-mystery-peak'],
  ...HONEY_TEMPLATE_BANK['teapot-honey-challenge'],
];

/**
 * Resolve role → tea for a concrete palette. c0 ALWAYS maps to buckwheat
 * (honey target — callers must never permute it away); other roles map in
 * order. Any bijection of the remaining roles is a full puzzle isomorphism
 * (honey goal follows buckwheat), so the discovered depth holds exactly.
 */
export function resolveHoneyRoleTeas(palette: TeaId[], otherOrder: TeaId[]): Map<HoneyTeaRole, TeaId> {
  const map = new Map<HoneyTeaRole, TeaId>([['c0', HONEY_TARGET_TEA]]);
  const roles: HoneyTeaRole[] = ['c1', 'c2', 'c3', 'c4'];
  const others = palette.filter((t) => t !== HONEY_TARGET_TEA);
  roles.forEach((role, i) => {
    const tea = otherOrder[i] ?? others[i];
    if (tea !== undefined) map.set(role, tea);
  });
  return map;
}

/** Instantiate a template against a concrete palette + role bijection. */
export function instantiateHoneyTemplate(
  tpl: HoneyTemplate,
  palette: TeaId[],
  otherOrder: TeaId[] = palette.filter((t) => t !== HONEY_TARGET_TEA),
): { cups: TeaId[][]; teapotSlot: number | null; honeyHost: number } {
  const roleToTea = resolveHoneyRoleTeas(palette, otherOrder);
  const cups = tpl.cups.map((cup) => cup.map((role) => roleToTea.get(role) as TeaId));
  return { cups, teapotSlot: tpl.teapot, honeyHost: tpl.honeyHost };
}
