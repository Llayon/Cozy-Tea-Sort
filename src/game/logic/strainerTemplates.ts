/**
 * Catch-one strainer template bank (Gauntlet 6 production).
 *
 * Every template is STRONG: the production action-aware solver finds an
 * optimal minimum-pour solution that catches exactly one layer into the
 * external tool and later releases it, while the SAME tea topology solved
 * with the tool disabled is NON-TRUNCATED UNSOLVABLE. Rescue (not mere
 * shortening) is the production standard — the tool is necessary, never
 * decorative.
 *
 * Discovery: offline `scripts/dev/strainer-catch-search.ts` over tight
 * topologies (4c/5v/1e, 5c/6v/1e, teapot 4c/5v/1e), relativized to palette
 * roles c0..c4 (full color isomorphism preserves depth exactly). Curation
 * preferred sweet depth, low visitedStates, exactly one catch/release, and
 * early first use. Bank feasibility: A 305 / B 396 / C 38 distinct strong
 * candidates mined; best 18 per kind committed below.
 *
 * Pure domain data + instantiation helpers. No React/Pixi imports.
 * Runtime re-validates each instantiation through `finalizeCandidate`.
 */

import type { TeaId } from '../types';

/** Palette-relative tea role inside template cup patterns. */
export type StrainerTeaRole = 'c0' | 'c1' | 'c2' | 'c3' | 'c4';

export type StrainerTemplateKind = 'strainer-challenge' | 'strainer-mystery-peak' | 'teapot-strainer-challenge';

export interface StrainerTemplate {
  id: string;
  kind: StrainerTemplateKind;
  /** Discovered solver depth in pours (audit trail; runtime re-validates exactly). */
  depth: number;
  /** Final slot order (`[]` = empty vessel; exactly one empty per G6 tight topology). */
  cups: StrainerTeaRole[][];
  /** Teapot slot when present, else null. */
  teapot: number | null;
  /** Expected catches in the optimal solution (1 for every committed template). */
  expectedCatches: number;
  /** Discovered with-tool visitedStates (audit trail; prefer low-cost templates). */
  visitedStates?: number;
}

/** Generation contract each kind serves (tight G6 topologies). */
export interface StrainerTemplateSpec {
  numColors: number;
  emptyCups: number;
  hasMysteryLayer: boolean;
  sourceOnlyCount: number;
}

export const STRAINER_TEMPLATE_SPECS: Record<StrainerTemplateKind, StrainerTemplateSpec> = {
  'strainer-challenge': { numColors: 4, emptyCups: 1, hasMysteryLayer: false, sourceOnlyCount: 0 },
  'strainer-mystery-peak': { numColors: 5, emptyCups: 1, hasMysteryLayer: true, sourceOnlyCount: 0 },
  'teapot-strainer-challenge': { numColors: 4, emptyCups: 1, hasMysteryLayer: false, sourceOnlyCount: 1 },
};

/** Strainer-specific depth targets (measured; global bands untouched). */
export const STRAINER_DEPTH_SWEET: Record<StrainerTemplateKind, { min: number; max: number }> = {
  'strainer-challenge': { min: 12, max: 15 },
  'strainer-mystery-peak': { min: 14, max: 18 },
  'teapot-strainer-challenge': { min: 11, max: 14 },
};

export const STRAINER_DEPTH_ACCEPT: Record<StrainerTemplateKind, { min: number; max: number }> = {
  'strainer-challenge': { min: 10, max: 17 },
  'strainer-mystery-peak': { min: 12, max: 20 },
  'teapot-strainer-challenge': { min: 9, max: 16 },
};

/** Bounded runtime template attempts (never a 150-scan for strainer). */
export const STRAINER_TEMPLATE_ATTEMPTS = 4;

export const STRAINER_TEMPLATE_BANK: Record<StrainerTemplateKind, StrainerTemplate[]> = {
  'strainer-challenge': [
    { id: 'strainer-challenge-12-9', kind: 'strainer-challenge', depth: 12, cups: [['c3', 'c0', 'c0', 'c2'], ['c2', 'c2', 'c2', 'c3'], ['c0', 'c1', 'c1', 'c3'], ['c3', 'c1', 'c0', 'c1'], []], teapot: null, expectedCatches: 1, visitedStates: 43 },
    { id: 'strainer-challenge-12-459', kind: 'strainer-challenge', depth: 12, cups: [['c3', 'c0', 'c0', 'c3'], [], ['c2', 'c2', 'c1', 'c3'], ['c0', 'c1', 'c1', 'c0'], ['c3', 'c2', 'c2', 'c1']], teapot: null, expectedCatches: 1, visitedStates: 40 },
    { id: 'strainer-challenge-12-650', kind: 'strainer-challenge', depth: 12, cups: [['c1', 'c3', 'c0', 'c0'], ['c0', 'c2', 'c3', 'c2'], ['c0', 'c2', 'c2', 'c1'], ['c3', 'c3', 'c1', 'c1'], []], teapot: null, expectedCatches: 1, visitedStates: 46 },
    { id: 'strainer-challenge-12-741', kind: 'strainer-challenge', depth: 12, cups: [['c1', 'c3', 'c0', 'c2'], ['c0', 'c2', 'c3', 'c2'], [], ['c3', 'c3', 'c2', 'c1'], ['c1', 'c1', 'c0', 'c0']], teapot: null, expectedCatches: 1, visitedStates: 51 },
    { id: 'strainer-challenge-12-838', kind: 'strainer-challenge', depth: 12, cups: [['c0', 'c0', 'c3', 'c0'], ['c1', 'c2', 'c2', 'c1'], ['c1', 'c2', 'c0', 'c2'], ['c1', 'c3', 'c3', 'c3'], []], teapot: null, expectedCatches: 1, visitedStates: 45 },
    { id: 'strainer-challenge-13-92', kind: 'strainer-challenge', depth: 13, cups: [['c1', 'c3', 'c3', 'c0'], ['c1', 'c2', 'c2', 'c0'], [], ['c0', 'c1', 'c2', 'c0'], ['c3', 'c3', 'c2', 'c1']], teapot: null, expectedCatches: 1, visitedStates: 46 },
    { id: 'strainer-challenge-13-214', kind: 'strainer-challenge', depth: 13, cups: [[], ['c0', 'c3', 'c0', 'c2'], ['c2', 'c2', 'c3', 'c0'], ['c1', 'c2', 'c1', 'c3'], ['c1', 'c1', 'c3', 'c0']], teapot: null, expectedCatches: 1, visitedStates: 43 },
    { id: 'strainer-challenge-13-519', kind: 'strainer-challenge', depth: 13, cups: [['c1', 'c3', 'c0', 'c1'], ['c2', 'c2', 'c0', 'c3'], ['c3', 'c2', 'c2', 'c3'], [], ['c1', 'c0', 'c0', 'c1']], teapot: null, expectedCatches: 1, visitedStates: 33 },
    { id: 'strainer-challenge-13-641', kind: 'strainer-challenge', depth: 13, cups: [['c0', 'c0', 'c2', 'c0'], ['c3', 'c3', 'c2', 'c1'], [], ['c1', 'c0', 'c3', 'c2'], ['c1', 'c2', 'c3', 'c1']], teapot: null, expectedCatches: 1, visitedStates: 36 },
    { id: 'strainer-challenge-13-771', kind: 'strainer-challenge', depth: 13, cups: [[], ['c0', 'c1', 'c3', 'c3'], ['c3', 'c2', 'c1', 'c0'], ['c0', 'c0', 'c1', 'c2'], ['c2', 'c2', 'c1', 'c3']], teapot: null, expectedCatches: 1, visitedStates: 44 },
    { id: 'strainer-challenge-14-420', kind: 'strainer-challenge', depth: 14, cups: [[], ['c3', 'c1', 'c2', 'c3'], ['c3', 'c1', 'c0', 'c0'], ['c0', 'c3', 'c2', 'c0'], ['c1', 'c2', 'c2', 'c1']], teapot: null, expectedCatches: 1, visitedStates: 65 },
    { id: 'strainer-challenge-14-507', kind: 'strainer-challenge', depth: 14, cups: [['c2', 'c0', 'c2', 'c1'], ['c3', 'c2', 'c3', 'c2'], ['c3', 'c3', 'c1', 'c0'], ['c0', 'c1', 'c1', 'c0'], []], teapot: null, expectedCatches: 1, visitedStates: 57 },
    { id: 'strainer-challenge-14-557', kind: 'strainer-challenge', depth: 14, cups: [['c1', 'c0', 'c1', 'c2'], ['c0', 'c1', 'c3', 'c1'], ['c0', 'c3', 'c3', 'c2'], [], ['c2', 'c2', 'c3', 'c0']], teapot: null, expectedCatches: 1, visitedStates: 63 },
    { id: 'strainer-challenge-14-859', kind: 'strainer-challenge', depth: 14, cups: [[], ['c1', 'c0', 'c0', 'c1'], ['c2', 'c1', 'c0', 'c2'], ['c2', 'c3', 'c3', 'c2'], ['c3', 'c0', 'c1', 'c3']], teapot: null, expectedCatches: 1, visitedStates: 57 },
    { id: 'strainer-challenge-15-57', kind: 'strainer-challenge', depth: 15, cups: [['c0', 'c2', 'c2', 'c3'], ['c0', 'c2', 'c1', 'c3'], ['c3', 'c1', 'c3', 'c0'], [], ['c1', 'c0', 'c1', 'c2']], teapot: null, expectedCatches: 1, visitedStates: 65 },
    { id: 'strainer-challenge-15-181', kind: 'strainer-challenge', depth: 15, cups: [['c3', 'c1', 'c0', 'c2'], [], ['c2', 'c0', 'c2', 'c3'], ['c3', 'c2', 'c0', 'c1'], ['c1', 'c0', 'c1', 'c3']], teapot: null, expectedCatches: 1, visitedStates: 73 },
    { id: 'strainer-challenge-15-305', kind: 'strainer-challenge', depth: 15, cups: [['c2', 'c3', 'c1', 'c3'], ['c2', 'c3', 'c1', 'c3'], ['c2', 'c1', 'c0', 'c2'], ['c0', 'c0', 'c1', 'c0'], []], teapot: null, expectedCatches: 1, visitedStates: 67 },
    { id: 'strainer-challenge-15-591', kind: 'strainer-challenge', depth: 15, cups: [['c3', 'c1', 'c0', 'c2'], ['c0', 'c3', 'c1', 'c3'], [], ['c2', 'c1', 'c1', 'c2'], ['c2', 'c0', 'c3', 'c0']], teapot: null, expectedCatches: 1, visitedStates: 67 },
  ],
  'strainer-mystery-peak': [
    { id: 'strainer-mystery-peak-14-107', kind: 'strainer-mystery-peak', depth: 14, cups: [['c4', 'c1', 'c2', 'c4'], ['c1', 'c0', 'c0', 'c0'], ['c1', 'c1', 'c4', 'c4'], ['c3', 'c0', 'c3', 'c3'], [], ['c2', 'c2', 'c3', 'c2']], teapot: null, expectedCatches: 1, visitedStates: 98 },
    { id: 'strainer-mystery-peak-14-420', kind: 'strainer-mystery-peak', depth: 14, cups: [['c2', 'c3', 'c0', 'c4'], ['c2', 'c0', 'c1', 'c1'], ['c4', 'c4', 'c1', 'c3'], ['c4', 'c0', 'c1', 'c0'], [], ['c3', 'c3', 'c2', 'c2']], teapot: null, expectedCatches: 1, visitedStates: 111 },
    { id: 'strainer-mystery-peak-14-583', kind: 'strainer-mystery-peak', depth: 14, cups: [['c3', 'c3', 'c3', 'c0'], [], ['c2', 'c2', 'c4', 'c3'], ['c2', 'c1', 'c4', 'c4'], ['c2', 'c1', 'c4', 'c0'], ['c0', 'c1', 'c1', 'c0']], teapot: null, expectedCatches: 1, visitedStates: 97 },
    { id: 'strainer-mystery-peak-14-795', kind: 'strainer-mystery-peak', depth: 14, cups: [['c1', 'c1', 'c1', 'c1'], [], ['c0', 'c3', 'c0', 'c4'], ['c4', 'c3', 'c3', 'c4'], ['c4', 'c2', 'c2', 'c3'], ['c2', 'c0', 'c2', 'c0']], teapot: null, expectedCatches: 1, visitedStates: 63 },
    { id: 'strainer-mystery-peak-15-440', kind: 'strainer-mystery-peak', depth: 15, cups: [['c1', 'c1', 'c3', 'c0'], ['c0', 'c4', 'c2', 'c4'], ['c1', 'c0', 'c4', 'c4'], ['c0', 'c3', 'c3', 'c2'], ['c2', 'c2', 'c3', 'c1'], []], teapot: null, expectedCatches: 1, visitedStates: 58 },
    { id: 'strainer-mystery-peak-15-539', kind: 'strainer-mystery-peak', depth: 15, cups: [['c1', 'c0', 'c0', 'c3'], ['c4', 'c4', 'c1', 'c2'], [], ['c3', 'c1', 'c2', 'c0'], ['c4', 'c3', 'c3', 'c4'], ['c1', 'c2', 'c2', 'c0']], teapot: null, expectedCatches: 1, visitedStates: 71 },
    { id: 'strainer-mystery-peak-15-791', kind: 'strainer-mystery-peak', depth: 15, cups: [[], ['c2', 'c3', 'c3', 'c4'], ['c4', 'c4', 'c1', 'c2'], ['c3', 'c1', 'c0', 'c2'], ['c2', 'c1', 'c0', 'c3'], ['c0', 'c0', 'c4', 'c1']], teapot: null, expectedCatches: 1, visitedStates: 66 },
    { id: 'strainer-mystery-peak-15-962', kind: 'strainer-mystery-peak', depth: 15, cups: [['c0', 'c3', 'c3', 'c2'], ['c3', 'c2', 'c2', 'c0'], [], ['c4', 'c4', 'c1', 'c0'], ['c0', 'c1', 'c1', 'c2'], ['c3', 'c1', 'c4', 'c4']], teapot: null, expectedCatches: 1, visitedStates: 66 },
    { id: 'strainer-mystery-peak-16-37', kind: 'strainer-mystery-peak', depth: 16, cups: [['c0', 'c2', 'c1', 'c3'], ['c4', 'c4', 'c3', 'c0'], ['c2', 'c0', 'c1', 'c2'], ['c2', 'c1', 'c1', 'c3'], ['c3', 'c4', 'c4', 'c0'], []], teapot: null, expectedCatches: 1, visitedStates: 70 },
    { id: 'strainer-mystery-peak-16-51', kind: 'strainer-mystery-peak', depth: 16, cups: [['c3', 'c0', 'c2', 'c4'], ['c1', 'c4', 'c3', 'c2'], ['c1', 'c0', 'c0', 'c4'], ['c3', 'c3', 'c2', 'c4'], [], ['c2', 'c1', 'c0', 'c1']], teapot: null, expectedCatches: 1, visitedStates: 61 },
    { id: 'strainer-mystery-peak-16-56', kind: 'strainer-mystery-peak', depth: 16, cups: [['c1', 'c3', 'c1', 'c0'], ['c0', 'c2', 'c2', 'c3'], [], ['c4', 'c1', 'c2', 'c0'], ['c4', 'c2', 'c3', 'c3'], ['c4', 'c0', 'c1', 'c4']], teapot: null, expectedCatches: 1, visitedStates: 73 },
    { id: 'strainer-mystery-peak-16-406', kind: 'strainer-mystery-peak', depth: 16, cups: [['c3', 'c3', 'c2', 'c1'], [], ['c1', 'c0', 'c0', 'c2'], ['c0', 'c4', 'c4', 'c1'], ['c2', 'c4', 'c2', 'c3'], ['c1', 'c0', 'c3', 'c4']], teapot: null, expectedCatches: 1, visitedStates: 54 },
    { id: 'strainer-mystery-peak-17-22', kind: 'strainer-mystery-peak', depth: 17, cups: [['c0', 'c1', 'c1', 'c4'], ['c3', 'c3', 'c2', 'c0'], ['c0', 'c1', 'c3', 'c2'], ['c2', 'c4', 'c4', 'c3'], [], ['c4', 'c2', 'c1', 'c0']], teapot: null, expectedCatches: 1, visitedStates: 84 },
    { id: 'strainer-mystery-peak-17-240', kind: 'strainer-mystery-peak', depth: 17, cups: [[], ['c2', 'c2', 'c3', 'c1'], ['c4', 'c0', 'c0', 'c1'], ['c4', 'c0', 'c3', 'c0'], ['c4', 'c2', 'c3', 'c4'], ['c3', 'c1', 'c2', 'c1']], teapot: null, expectedCatches: 1, visitedStates: 74 },
    { id: 'strainer-mystery-peak-17-743', kind: 'strainer-mystery-peak', depth: 17, cups: [['c1', 'c2', 'c1', 'c2'], ['c1', 'c3', 'c2', 'c0'], ['c0', 'c0', 'c0', 'c3'], ['c3', 'c4', 'c4', 'c3'], ['c1', 'c4', 'c4', 'c2'], []], teapot: null, expectedCatches: 1, visitedStates: 62 },
    { id: 'strainer-mystery-peak-18-55', kind: 'strainer-mystery-peak', depth: 18, cups: [['c4', 'c2', 'c0', 'c3'], ['c1', 'c3', 'c3', 'c4'], [], ['c0', 'c2', 'c2', 'c1'], ['c0', 'c1', 'c4', 'c2'], ['c4', 'c0', 'c3', 'c1']], teapot: null, expectedCatches: 1, visitedStates: 85 },
    { id: 'strainer-mystery-peak-18-250', kind: 'strainer-mystery-peak', depth: 18, cups: [['c3', 'c1', 'c1', 'c2'], ['c2', 'c1', 'c1', 'c4'], [], ['c4', 'c3', 'c4', 'c0'], ['c0', 'c2', 'c4', 'c2'], ['c0', 'c3', 'c3', 'c0']], teapot: null, expectedCatches: 1, visitedStates: 67 },
    { id: 'strainer-mystery-peak-18-345', kind: 'strainer-mystery-peak', depth: 18, cups: [[], ['c2', 'c1', 'c0', 'c0'], ['c1', 'c4', 'c0', 'c3'], ['c3', 'c4', 'c4', 'c3'], ['c2', 'c1', 'c3', 'c2'], ['c2', 'c1', 'c0', 'c4']], teapot: null, expectedCatches: 1, visitedStates: 71 },
  ],
  'teapot-strainer-challenge': [
    { id: 'teapot-strainer-challenge-11-203', kind: 'teapot-strainer-challenge', depth: 11, cups: [['c1', 'c1', 'c1', 'c0'], [], ['c1', 'c0', 'c3', 'c3'], ['c0', 'c3', 'c2', 'c0'], ['c2', 'c3', 'c2', 'c2']], teapot: 0, expectedCatches: 1, visitedStates: 161 },
    { id: 'teapot-strainer-challenge-11-1147', kind: 'teapot-strainer-challenge', depth: 11, cups: [['c3', 'c1', 'c1', 'c1'], [], ['c3', 'c0', 'c0', 'c0'], ['c1', 'c2', 'c0', 'c2'], ['c3', 'c2', 'c2', 'c3']], teapot: 0, expectedCatches: 1, visitedStates: 60 },
    { id: 'teapot-strainer-challenge-11-1586', kind: 'teapot-strainer-challenge', depth: 11, cups: [['c0', 'c0', 'c3', 'c0'], [], ['c0', 'c1', 'c3', 'c3'], ['c1', 'c1', 'c2', 'c1'], ['c2', 'c3', 'c2', 'c2']], teapot: 0, expectedCatches: 1, visitedStates: 73 },
    { id: 'teapot-strainer-challenge-11-1759', kind: 'teapot-strainer-challenge', depth: 11, cups: [['c0', 'c3', 'c2', 'c3'], ['c0', 'c1', 'c1', 'c1'], ['c2', 'c1', 'c2', 'c2'], [], ['c3', 'c3', 'c0', 'c0']], teapot: 0, expectedCatches: 1, visitedStates: 74 },
    { id: 'teapot-strainer-challenge-11-2795', kind: 'teapot-strainer-challenge', depth: 11, cups: [['c2', 'c3', 'c3', 'c0'], ['c3', 'c3', 'c2', 'c1'], ['c2', 'c1', 'c0', 'c0'], [], ['c2', 'c1', 'c1', 'c0']], teapot: 0, expectedCatches: 1, visitedStates: 83 },
    { id: 'teapot-strainer-challenge-12-19', kind: 'teapot-strainer-challenge', depth: 12, cups: [['c1', 'c1', 'c3', 'c1'], ['c1', 'c0', 'c2', 'c2'], ['c0', 'c0', 'c0', 'c2'], [], ['c3', 'c3', 'c2', 'c3']], teapot: 0, expectedCatches: 1, visitedStates: 49 },
    { id: 'teapot-strainer-challenge-12-299', kind: 'teapot-strainer-challenge', depth: 12, cups: [['c3', 'c2', 'c3', 'c3'], ['c2', 'c0', 'c0', 'c2'], [], ['c1', 'c1', 'c0', 'c2'], ['c3', 'c0', 'c1', 'c1']], teapot: 0, expectedCatches: 1, visitedStates: 59 },
    { id: 'teapot-strainer-challenge-12-416', kind: 'teapot-strainer-challenge', depth: 12, cups: [['c3', 'c3', 'c3', 'c1'], ['c2', 'c0', 'c0', 'c2'], ['c2', 'c0', 'c0', 'c2'], ['c1', 'c1', 'c1', 'c3'], []], teapot: 0, expectedCatches: 1, visitedStates: 46 },
    { id: 'teapot-strainer-challenge-12-2245', kind: 'teapot-strainer-challenge', depth: 12, cups: [['c2', 'c0', 'c2', 'c2'], ['c0', 'c1', 'c1', 'c0'], ['c2', 'c1', 'c3', 'c3'], [], ['c3', 'c3', 'c1', 'c0']], teapot: 0, expectedCatches: 1, visitedStates: 59 },
    { id: 'teapot-strainer-challenge-12-2648', kind: 'teapot-strainer-challenge', depth: 12, cups: [['c2', 'c1', 'c1', 'c1'], ['c0', 'c3', 'c0', 'c0'], ['c2', 'c3', 'c3', 'c2'], ['c1', 'c0', 'c3', 'c2'], []], teapot: 0, expectedCatches: 1, visitedStates: 63 },
    { id: 'teapot-strainer-challenge-13-186', kind: 'teapot-strainer-challenge', depth: 13, cups: [['c0', 'c0', 'c1', 'c0'], ['c0', 'c3', 'c2', 'c1'], ['c3', 'c2', 'c1', 'c2'], [], ['c3', 'c3', 'c2', 'c1']], teapot: 0, expectedCatches: 1, visitedStates: 99 },
    { id: 'teapot-strainer-challenge-13-887', kind: 'teapot-strainer-challenge', depth: 13, cups: [['c0', 'c0', 'c0', 'c3'], ['c0', 'c1', 'c3', 'c1'], ['c3', 'c2', 'c2', 'c1'], [], ['c1', 'c2', 'c2', 'c3']], teapot: 0, expectedCatches: 1, visitedStates: 82 },
    { id: 'teapot-strainer-challenge-13-1224', kind: 'teapot-strainer-challenge', depth: 13, cups: [['c3', 'c3', 'c0', 'c3'], [], ['c1', 'c2', 'c2', 'c0'], ['c1', 'c1', 'c2', 'c0'], ['c3', 'c1', 'c2', 'c0']], teapot: 0, expectedCatches: 1, visitedStates: 61 },
    { id: 'teapot-strainer-challenge-13-3980', kind: 'teapot-strainer-challenge', depth: 13, cups: [['c1', 'c1', 'c0', 'c2'], [], ['c2', 'c3', 'c0', 'c0'], ['c3', 'c2', 'c3', 'c2'], ['c1', 'c1', 'c0', 'c3']], teapot: 0, expectedCatches: 1, visitedStates: 95 },
    { id: 'teapot-strainer-challenge-14-162', kind: 'teapot-strainer-challenge', depth: 14, cups: [['c3', 'c2', 'c3', 'c2'], ['c1', 'c2', 'c1', 'c0'], [], ['c0', 'c0', 'c1', 'c0'], ['c3', 'c3', 'c1', 'c2']], teapot: 0, expectedCatches: 1, visitedStates: 95 },
    { id: 'teapot-strainer-challenge-14-1964', kind: 'teapot-strainer-challenge', depth: 14, cups: [['c2', 'c2', 'c0', 'c2'], ['c2', 'c1', 'c3', 'c3'], ['c3', 'c1', 'c3', 'c1'], [], ['c0', 'c1', 'c0', 'c0']], teapot: 0, expectedCatches: 1, visitedStates: 133 },
    { id: 'teapot-strainer-challenge-14-2309', kind: 'teapot-strainer-challenge', depth: 14, cups: [['c1', 'c1', 'c2', 'c1'], ['c1', 'c3', 'c3', 'c2'], ['c0', 'c2', 'c0', 'c3'], ['c2', 'c3', 'c0', 'c0'], []], teapot: 0, expectedCatches: 1, visitedStates: 70 },
    { id: 'teapot-strainer-challenge-14-3657', kind: 'teapot-strainer-challenge', depth: 14, cups: [['c1', 'c0', 'c0', 'c3'], ['c2', 'c2', 'c3', 'c1'], ['c2', 'c1', 'c3', 'c1'], ['c0', 'c0', 'c3', 'c2'], []], teapot: 0, expectedCatches: 1, visitedStates: 111 },
  ],
};

/** All bank templates flattened (bank validation tests iterate this). */
export const ALL_STRAINER_TEMPLATES: StrainerTemplate[] = [
  ...STRAINER_TEMPLATE_BANK['strainer-challenge'],
  ...STRAINER_TEMPLATE_BANK['strainer-mystery-peak'],
  ...STRAINER_TEMPLATE_BANK['teapot-strainer-challenge'],
];

/**
 * Resolve role → tea for a concrete palette. Any bijection is a full puzzle
 * isomorphism (color counts preserved; the tool has no target tea), so the
 * discovered depth holds exactly.
 */
export function resolveStrainerRoleTeas(palette: TeaId[], order: TeaId[]): Map<StrainerTeaRole, TeaId> {
  const map = new Map<StrainerTeaRole, TeaId>();
  const roles: StrainerTeaRole[] = ['c0', 'c1', 'c2', 'c3', 'c4'];
  roles.forEach((role, i) => {
    const tea = order[i] ?? palette[i];
    if (tea !== undefined) map.set(role, tea);
  });
  return map;
}

/** Instantiate a template against a concrete palette + role bijection. */
export function instantiateStrainerTemplate(
  tpl: StrainerTemplate,
  palette: TeaId[],
  order: TeaId[] = [...palette],
): { cups: TeaId[][]; teapotSlot: number | null } {
  const roleToTea = resolveStrainerRoleTeas(palette, order);
  const cups = tpl.cups.map((cup) => cup.map((role) => roleToTea.get(role) as TeaId));
  return { cups, teapotSlot: tpl.teapot };
}
