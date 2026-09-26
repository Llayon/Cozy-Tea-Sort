/**
 * Tasting-bowl template bank (Gauntlet 4).
 *
 * WHY: same reason as the target/sink banks — random-deal tasting
 * generation would need many BFS validations per level, stalling the
 * main thread. These topologies were discovered OFFLINE by the production
 * generator + solver, then relativized to palette roles:
 *   c0..c4 = palette teas in request-palette order (instantiation applies
 *   a seeded permutation — a full puzzle isomorphism, so the discovered
 *   solver depth holds EXACTLY for every palette).
 *
 * Every template: filled standard vessels hold the full
 * TEA_UNITS_PER_COLOR pool, exactly one ordinary standard empty remains,
 * the tasting bowl sits EMPTY (capacity 2, must-end-empty) at the stable
 * last slot, and the teapot (where applicable) sits full + mixed at slot
 * 0. Constraint metadata is applied during instantiation; mystery is
 * assigned separately at runtime on a standard normal cup.
 *
 * Participation curation (Gauntlet 4 §19): every committed template was
 * verified OFFLINE — its production solver solution ENTERS the tasting
 * bowl AND later EXITS it (bowl starts empty, must finish empty). Bank
 * fairness: fatal-first-move ratio ~0 across the bank; every legal
 * opening stays solvable.
 *
 * Pure domain data + instantiation helpers. No React/Pixi imports.
 * Runtime re-validates each instantiation through `finalizeCandidate`.
 */

import type { TeaId } from '../types';

/** Palette-relative tea role inside template cup patterns. */
export type TastingTeaRole = 'c0' | 'c1' | 'c2' | 'c3' | 'c4';

export type TastingTemplateKind = 'tasting-challenge' | 'tasting-mystery-peak' | 'teapot-tasting-challenge';

export interface TastingTemplate {
  id: string;
  kind: TastingTemplateKind;
  /** Discovered solver depth (audit trail; runtime re-validates exactly). */
  depth: number;
  /** Final slot order (`[]` = empty vessel; last slot = empty tasting bowl). */
  cups: TastingTeaRole[][];
  /** Teapot slot when present, else null. */
  teapot: number | null;
  /** Tasting-bowl slot (stable last vessel index). */
  tasting: number;
}

/** Generation contract each kind serves (mirrors the canonical requests). */
export interface TastingTemplateSpec {
  numColors: number;
  emptyCups: number;
  hasMysteryLayer: boolean;
  sourceOnlyCount: number;
  tastingCupCount: number;
}

export const TASTING_TEMPLATE_SPECS: Record<TastingTemplateKind, TastingTemplateSpec> = {
  'tasting-challenge': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 0, tastingCupCount: 1 },
  'tasting-mystery-peak': { numColors: 5, emptyCups: 2, hasMysteryLayer: true, sourceOnlyCount: 0, tastingCupCount: 1 },
  'teapot-tasting-challenge': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 1, tastingCupCount: 1 },
};

/** Bounded runtime template attempts (never a 150-scan for tasting). */
export const TASTING_TEMPLATE_ATTEMPTS = 4;

export const TASTING_TEMPLATE_BANK: Record<TastingTemplateKind, TastingTemplate[]> = {
  'tasting-challenge': [
    { id: 'tasting-challenge-7-11237', kind: 'tasting-challenge', depth: 7, cups: [['c0', 'c0', 'c0', 'c3'], ['c3', 'c3', 'c1', 'c1'], [], ['c1', 'c1', 'c3', 'c2'], ['c0', 'c2', 'c2', 'c2'], []], teapot: null, tasting: 5 }, // seed 11237 fair L8/S8/O4/F0/TD4/4
    { id: 'tasting-challenge-7-12050', kind: 'tasting-challenge', depth: 7, cups: [['c0', 'c0', 'c3', 'c3'], [], ['c3', 'c0', 'c0', 'c1'], ['c2', 'c2', 'c2', 'c3'], ['c2', 'c1', 'c1', 'c1'], []], teapot: null, tasting: 5 }, // seed 12050 fair L8/S8/O3/F0/TD4/4
    { id: 'tasting-challenge-8-10164', kind: 'tasting-challenge', depth: 8, cups: [[], ['c1', 'c1', 'c0', 'c1'], ['c3', 'c0', 'c0', 'c0'], ['c2', 'c2', 'c3', 'c1'], ['c3', 'c3', 'c2', 'c2'], []], teapot: null, tasting: 5 }, // seed 10164 fair L8/S8/O3/F0/TD4/4
    { id: 'tasting-challenge-8-10868', kind: 'tasting-challenge', depth: 8, cups: [[], ['c3', 'c0', 'c2', 'c1'], ['c2', 'c2', 'c1', 'c1'], ['c1', 'c3', 'c3', 'c3'], ['c2', 'c0', 'c0', 'c0'], []], teapot: null, tasting: 5 }, // seed 10868 fair L8/S8/O2/F0/TD4/4
    { id: 'tasting-challenge-8-12412', kind: 'tasting-challenge', depth: 8, cups: [['c2', 'c1', 'c1', 'c1'], [], ['c0', 'c0', 'c0', 'c3'], ['c2', 'c2', 'c0', 'c1'], ['c2', 'c3', 'c3', 'c3'], []], teapot: null, tasting: 5 }, // seed 12412 fair L8/S8/O6/F0/TD4/4
    { id: 'tasting-challenge-8-12499', kind: 'tasting-challenge', depth: 8, cups: [['c0', 'c0', 'c0', 'c2'], [], ['c1', 'c3', 'c3', 'c2'], ['c2', 'c1', 'c1', 'c1'], ['c2', 'c3', 'c3', 'c0'], []], teapot: null, tasting: 5 }, // seed 12499 fair L8/S8/O3/F0/TD4/4
    { id: 'tasting-challenge-9-10002', kind: 'tasting-challenge', depth: 9, cups: [['c2', 'c0', 'c1', 'c1'], ['c0', 'c0', 'c2', 'c2'], [], ['c3', 'c3', 'c3', 'c2'], ['c1', 'c0', 'c1', 'c3'], []], teapot: null, tasting: 5 }, // seed 10002 fair L8/S8/O6/F0/TD4/4
    { id: 'tasting-challenge-9-10039', kind: 'tasting-challenge', depth: 9, cups: [['c1', 'c2', 'c2', 'c3'], ['c3', 'c3', 'c1', 'c0'], ['c3', 'c0', 'c1', 'c1'], ['c2', 'c2', 'c0', 'c0'], [], []], teapot: null, tasting: 5 }, // seed 10039 fair L8/S8/O4/F0/TD4/4
    { id: 'tasting-challenge-9-10320', kind: 'tasting-challenge', depth: 9, cups: [['c1', 'c1', 'c0', 'c0'], ['c1', 'c1', 'c2', 'c3'], ['c3', 'c3', 'c2', 'c2'], ['c0', 'c2', 'c0', 'c3'], [], []], teapot: null, tasting: 5 }, // seed 10320 fair L8/S8/O1/F0/TD4/4
    { id: 'tasting-challenge-9-10329', kind: 'tasting-challenge', depth: 9, cups: [['c1', 'c1', 'c0', 'c0'], [], ['c2', 'c2', 'c0', 'c0'], ['c2', 'c3', 'c3', 'c2'], ['c1', 'c3', 'c3', 'c1'], []], teapot: null, tasting: 5 }, // seed 10329 fair L8/S8/O6/F0/TD4/4
    { id: 'tasting-challenge-9-10333', kind: 'tasting-challenge', depth: 9, cups: [['c3', 'c1', 'c3', 'c3'], [], ['c1', 'c1', 'c3', 'c0'], ['c2', 'c2', 'c2', 'c1'], ['c0', 'c0', 'c2', 'c0'], []], teapot: null, tasting: 5 }, // seed 10333 fair L8/S8/O3/F0/TD4/4
    { id: 'tasting-challenge-9-10354', kind: 'tasting-challenge', depth: 9, cups: [[], ['c0', 'c0', 'c3', 'c2'], ['c3', 'c2', 'c0', 'c0'], ['c3', 'c3', 'c1', 'c1'], ['c1', 'c2', 'c2', 'c1'], []], teapot: null, tasting: 5 }, // seed 10354 fair L8/S8/O2/F0/TD4/4
    { id: 'tasting-challenge-10-10015', kind: 'tasting-challenge', depth: 10, cups: [['c0', 'c3', 'c0', 'c0'], ['c1', 'c1', 'c2', 'c3'], ['c2', 'c3', 'c1', 'c1'], [], ['c0', 'c3', 'c2', 'c2'], []], teapot: null, tasting: 5 }, // seed 10015 fair L8/S8/O3/F0/TD4/4
    { id: 'tasting-challenge-10-10030', kind: 'tasting-challenge', depth: 10, cups: [['c3', 'c0', 'c0', 'c0'], ['c1', 'c1', 'c2', 'c0'], ['c1', 'c3', 'c1', 'c3'], [], ['c2', 'c3', 'c2', 'c2'], []], teapot: null, tasting: 5 }, // seed 10030 fair L8/S8/O3/F0/TD4/4
    { id: 'tasting-challenge-10-10080', kind: 'tasting-challenge', depth: 10, cups: [['c0', 'c2', 'c0', 'c3'], [], ['c2', 'c2', 'c1', 'c0'], ['c1', 'c1', 'c0', 'c2'], ['c1', 'c3', 'c3', 'c3'], []], teapot: null, tasting: 5 }, // seed 10080 fair L8/S8/O4/F0/TD4/4
    { id: 'tasting-challenge-10-10084', kind: 'tasting-challenge', depth: 10, cups: [['c2', 'c3', 'c1', 'c0'], ['c3', 'c1', 'c1', 'c1'], [], ['c3', 'c0', 'c0', 'c0'], ['c2', 'c3', 'c2', 'c2'], []], teapot: null, tasting: 5 }, // seed 10084 fair L8/S8/O5/F0/TD4/4
    { id: 'tasting-challenge-10-10103', kind: 'tasting-challenge', depth: 10, cups: [[], ['c2', 'c1', 'c0', 'c0'], ['c3', 'c1', 'c1', 'c3'], ['c1', 'c3', 'c2', 'c2'], ['c3', 'c0', 'c0', 'c2'], []], teapot: null, tasting: 5 }, // seed 10103 fair L8/S8/O4/F0/TD4/4
    { id: 'tasting-challenge-10-10114', kind: 'tasting-challenge', depth: 10, cups: [['c3', 'c3', 'c1', 'c0'], [], ['c1', 'c0', 'c0', 'c0'], ['c3', 'c1', 'c2', 'c2'], ['c3', 'c1', 'c2', 'c2'], []], teapot: null, tasting: 5 }, // seed 10114 fair L8/S8/O7/F0/TD4/4
  ],
  'tasting-mystery-peak': [
    { id: 'tasting-mystery-peak-10-499', kind: 'tasting-mystery-peak', depth: 10, cups: [['c2', 'c2', 'c0', 'c0'], [], ['c1', 'c1', 'c3', 'c3'], ['c4', 'c4', 'c3', 'c3'], ['c4', 'c1', 'c2', 'c2'], ['c0', 'c4', 'c0', 'c1'], []], teapot: null, tasting: 6 }, // seed 499 fair L10/S10/O2/F0/TD5/5
    { id: 'tasting-mystery-peak-11-375', kind: 'tasting-mystery-peak', depth: 11, cups: [['c1', 'c2', 'c2', 'c3'], ['c2', 'c1', 'c1', 'c4'], ['c4', 'c4', 'c0', 'c0'], ['c2', 'c4', 'c0', 'c0'], ['c1', 'c3', 'c3', 'c3'], [], []], teapot: null, tasting: 6 }, // seed 375 fair L10/S10/O8/F0/TD5/5
    { id: 'tasting-mystery-peak-11-637', kind: 'tasting-mystery-peak', depth: 11, cups: [['c1', 'c1', 'c1', 'c3'], ['c4', 'c4', 'c4', 'c0'], ['c4', 'c2', 'c2', 'c3'], ['c0', 'c2', 'c3', 'c1'], [], ['c3', 'c2', 'c0', 'c0'], []], teapot: null, tasting: 6 }, // seed 637 fair L10/S10/O2/F0/TD5/5
    { id: 'tasting-mystery-peak-11-689', kind: 'tasting-mystery-peak', depth: 11, cups: [['c2', 'c2', 'c1', 'c1'], ['c3', 'c3', 'c3', 'c1'], [], ['c2', 'c2', 'c1', 'c0'], ['c0', 'c4', 'c4', 'c0'], ['c4', 'c0', 'c3', 'c4'], []], teapot: null, tasting: 6 }, // seed 689 fair L10/S10/O5/F0/TD5/5
    { id: 'tasting-mystery-peak-11-815', kind: 'tasting-mystery-peak', depth: 11, cups: [['c0', 'c4', 'c2', 'c3'], ['c3', 'c1', 'c1', 'c1'], ['c2', 'c4', 'c1', 'c0'], ['c2', 'c2', 'c0', 'c0'], ['c4', 'c4', 'c3', 'c3'], [], []], teapot: null, tasting: 6 }, // seed 815 fair L10/S10/O3/F0/TD5/5
    { id: 'tasting-mystery-peak-12-2', kind: 'tasting-mystery-peak', depth: 12, cups: [['c3', 'c0', 'c0', 'c2'], ['c4', 'c1', 'c4', 'c0'], ['c0', 'c2', 'c3', 'c1'], ['c2', 'c2', 'c4', 'c4'], [], ['c1', 'c1', 'c3', 'c3'], []], teapot: null, tasting: 6 }, // seed 2 fair L10/S10/O2/F0/TD5/5
    { id: 'tasting-mystery-peak-12-35', kind: 'tasting-mystery-peak', depth: 12, cups: [[], ['c3', 'c3', 'c0', 'c1'], ['c1', 'c3', 'c2', 'c1'], ['c2', 'c4', 'c4', 'c4'], ['c0', 'c0', 'c0', 'c2'], ['c1', 'c4', 'c2', 'c3'], []], teapot: null, tasting: 6 }, // seed 35 fair L10/S10/O4/F0/TD5/5
    { id: 'tasting-mystery-peak-12-214', kind: 'tasting-mystery-peak', depth: 12, cups: [['c3', 'c3', 'c4', 'c1'], ['c4', 'c4', 'c2', 'c0'], ['c2', 'c2', 'c0', 'c3'], ['c1', 'c1', 'c1', 'c4'], ['c0', 'c2', 'c0', 'c3'], [], []], teapot: null, tasting: 6 }, // seed 214 fair L10/S10/O8/F0/TD5/5
    { id: 'tasting-mystery-peak-12-249', kind: 'tasting-mystery-peak', depth: 12, cups: [['c2', 'c2', 'c0', 'c1'], ['c3', 'c1', 'c3', 'c1'], ['c0', 'c2', 'c2', 'c4'], ['c1', 'c3', 'c3', 'c4'], [], ['c4', 'c4', 'c0', 'c0'], []], teapot: null, tasting: 6 }, // seed 249 fair L10/S10/O2/F0/TD5/5
    { id: 'tasting-mystery-peak-13-20', kind: 'tasting-mystery-peak', depth: 13, cups: [['c1', 'c4', 'c2', 'c0'], [], ['c4', 'c2', 'c3', 'c3'], ['c2', 'c2', 'c0', 'c0'], ['c1', 'c1', 'c4', 'c1'], ['c3', 'c0', 'c4', 'c3'], []], teapot: null, tasting: 6 }, // seed 20 fair L10/S10/O3/F0/TD5/5
    { id: 'tasting-mystery-peak-13-43', kind: 'tasting-mystery-peak', depth: 13, cups: [['c1', 'c1', 'c3', 'c2'], ['c1', 'c1', 'c2', 'c3'], [], ['c2', 'c0', 'c2', 'c4'], ['c4', 'c4', 'c3', 'c0'], ['c3', 'c0', 'c0', 'c4'], []], teapot: null, tasting: 6 }, // seed 43 fair L10/S10/O5/F0/TD5/5
    { id: 'tasting-mystery-peak-13-49', kind: 'tasting-mystery-peak', depth: 13, cups: [['c3', 'c4', 'c4', 'c3'], ['c1', 'c2', 'c3', 'c1'], ['c0', 'c0', 'c0', 'c2'], ['c0', 'c1', 'c2', 'c3'], [], ['c4', 'c4', 'c2', 'c1'], []], teapot: null, tasting: 6 }, // seed 49 fair L10/S10/O5/F0/TD5/5
    { id: 'tasting-mystery-peak-13-67', kind: 'tasting-mystery-peak', depth: 13, cups: [['c4', 'c4', 'c2', 'c3'], ['c3', 'c2', 'c3', 'c2'], [], ['c3', 'c0', 'c0', 'c0'], ['c4', 'c1', 'c1', 'c1'], ['c0', 'c4', 'c1', 'c2'], []], teapot: null, tasting: 6 }, // seed 67 fair L10/S10/O6/F0/TD5/5
    { id: 'tasting-mystery-peak-13-70', kind: 'tasting-mystery-peak', depth: 13, cups: [['c0', 'c2', 'c2', 'c4'], ['c4', 'c0', 'c3', 'c1'], ['c4', 'c1', 'c1', 'c1'], [], ['c0', 'c4', 'c3', 'c0'], ['c2', 'c2', 'c3', 'c3'], []], teapot: null, tasting: 6 }, // seed 70 fair L10/S10/O7/F0/TD5/5
    { id: 'tasting-mystery-peak-14-9', kind: 'tasting-mystery-peak', depth: 14, cups: [['c3', 'c1', 'c2', 'c1'], ['c2', 'c4', 'c1', 'c0'], ['c0', 'c3', 'c3', 'c1'], ['c4', 'c0', 'c2', 'c2'], [], ['c3', 'c4', 'c4', 'c0'], []], teapot: null, tasting: 6 }, // seed 9 fair L10/S10/O6/F0/TD5/5
    { id: 'tasting-mystery-peak-14-22', kind: 'tasting-mystery-peak', depth: 14, cups: [[], ['c2', 'c0', 'c4', 'c3'], ['c1', 'c4', 'c1', 'c3'], ['c2', 'c2', 'c2', 'c4'], ['c4', 'c1', 'c0', 'c0'], ['c3', 'c0', 'c1', 'c3'], []], teapot: null, tasting: 6 }, // seed 22 fair L10/S10/O4/F0/TD5/5
    { id: 'tasting-mystery-peak-14-24', kind: 'tasting-mystery-peak', depth: 14, cups: [['c0', 'c2', 'c2', 'c0'], ['c1', 'c4', 'c4', 'c2'], [], ['c4', 'c1', 'c1', 'c3'], ['c0', 'c3', 'c1', 'c2'], ['c0', 'c4', 'c3', 'c3'], []], teapot: null, tasting: 6 }, // seed 24 fair L10/S10/O9/F0/TD5/5
    { id: 'tasting-mystery-peak-14-34', kind: 'tasting-mystery-peak', depth: 14, cups: [['c1', 'c4', 'c0', 'c4'], ['c0', 'c1', 'c3', 'c2'], ['c3', 'c2', 'c2', 'c2'], [], ['c1', 'c3', 'c1', 'c4'], ['c4', 'c3', 'c0', 'c0'], []], teapot: null, tasting: 6 }, // seed 34 fair L10/S10/O5/F0/TD5/5
  ],
  'teapot-tasting-challenge': [
    { id: 'teapot-tasting-challenge-7-354', kind: 'teapot-tasting-challenge', depth: 7, cups: [['c1', 'c2', 'c2', 'c3'], ['c1', 'c1', 'c1', 'c3'], ['c0', 'c0', 'c0', 'c0'], [], ['c3', 'c2', 'c2', 'c3'], []], teapot: 0, tasting: 5 }, // seed 354 fair L7/S7/O3/F0/TD4/4
    { id: 'teapot-tasting-challenge-7-993', kind: 'teapot-tasting-challenge', depth: 7, cups: [['c2', 'c2', 'c2', 'c0'], ['c0', 'c1', 'c0', 'c0'], [], ['c2', 'c3', 'c3', 'c3'], ['c1', 'c1', 'c1', 'c3'], []], teapot: 0, tasting: 5 }, // seed 993 fair L8/S8/O3/F0/TD4/4
    { id: 'teapot-tasting-challenge-7-1221', kind: 'teapot-tasting-challenge', depth: 7, cups: [['c1', 'c1', 'c3', 'c3'], [], ['c2', 'c2', 'c2', 'c3'], ['c0', 'c0', 'c0', 'c0'], ['c1', 'c3', 'c1', 'c2'], []], teapot: 0, tasting: 5 }, // seed 1221 fair L7/S7/O2/F0/TD4/4
    { id: 'teapot-tasting-challenge-8-143', kind: 'teapot-tasting-challenge', depth: 8, cups: [['c0', 'c2', 'c2', 'c0'], ['c1', 'c1', 'c1', 'c1'], [], ['c2', 'c2', 'c3', 'c0'], ['c3', 'c0', 'c3', 'c3'], []], teapot: 0, tasting: 5 }, // seed 143 fair L7/S7/O3/F0/TD4/4
    { id: 'teapot-tasting-challenge-8-194', kind: 'teapot-tasting-challenge', depth: 8, cups: [['c1', 'c2', 'c2', 'c0'], [], ['c3', 'c2', 'c1', 'c1'], ['c0', 'c0', 'c0', 'c2'], ['c1', 'c3', 'c3', 'c3'], []], teapot: 0, tasting: 5 }, // seed 194 fair L8/S8/O2/F0/TD4/4
    { id: 'teapot-tasting-challenge-8-256', kind: 'teapot-tasting-challenge', depth: 8, cups: [['c3', 'c0', 'c0', 'c1'], [], ['c0', 'c2', 'c2', 'c0'], ['c2', 'c2', 'c1', 'c1'], ['c1', 'c3', 'c3', 'c3'], []], teapot: 0, tasting: 5 }, // seed 256 fair L8/S8/O2/F0/TD4/4
    { id: 'teapot-tasting-challenge-8-347', kind: 'teapot-tasting-challenge', depth: 8, cups: [['c2', 'c2', 'c2', 'c1'], ['c3', 'c3', 'c3', 'c1'], [], ['c0', 'c0', 'c2', 'c1'], ['c1', 'c3', 'c0', 'c0'], []], teapot: 0, tasting: 5 }, // seed 347 fair L8/S8/O2/F0/TD4/4
    { id: 'teapot-tasting-challenge-8-612', kind: 'teapot-tasting-challenge', depth: 8, cups: [['c1', 'c1', 'c3', 'c3'], ['c2', 'c0', 'c1', 'c3'], ['c3', 'c2', 'c2', 'c2'], [], ['c0', 'c0', 'c0', 'c1'], []], teapot: 0, tasting: 5 }, // seed 612 fair L8/S8/O2/F0/TD4/4
    { id: 'teapot-tasting-challenge-9-31', kind: 'teapot-tasting-challenge', depth: 9, cups: [['c0', 'c1', 'c2', 'c2'], ['c0', 'c3', 'c1', 'c1'], [], ['c1', 'c3', 'c3', 'c3'], ['c2', 'c0', 'c0', 'c2'], []], teapot: 0, tasting: 5 }, // seed 31 fair L8/S8/O2/F0/TD4/4
    { id: 'teapot-tasting-challenge-9-45', kind: 'teapot-tasting-challenge', depth: 9, cups: [['c0', 'c2', 'c1', 'c1'], ['c3', 'c3', 'c3', 'c3'], [], ['c0', 'c0', 'c1', 'c2'], ['c2', 'c0', 'c1', 'c2'], []], teapot: 0, tasting: 5 }, // seed 45 fair L7/S7/O3/F0/TD4/4
    { id: 'teapot-tasting-challenge-9-65', kind: 'teapot-tasting-challenge', depth: 9, cups: [['c2', 'c2', 'c3', 'c0'], ['c2', 'c0', 'c3', 'c3'], ['c0', 'c0', 'c2', 'c1'], ['c1', 'c1', 'c1', 'c3'], [], []], teapot: 0, tasting: 5 }, // seed 65 fair L8/S8/O3/F0/TD4/4
    { id: 'teapot-tasting-challenge-9-190', kind: 'teapot-tasting-challenge', depth: 9, cups: [['c2', 'c2', 'c0', 'c3'], [], ['c3', 'c0', 'c2', 'c3'], ['c0', 'c0', 'c2', 'c3'], ['c1', 'c1', 'c1', 'c1'], []], teapot: 0, tasting: 5 }, // seed 190 fair L7/S7/O2/F0/TD4/4
    { id: 'teapot-tasting-challenge-9-203', kind: 'teapot-tasting-challenge', depth: 9, cups: [['c0', 'c2', 'c1', 'c1'], ['c2', 'c2', 'c3', 'c1'], [], ['c3', 'c3', 'c3', 'c0'], ['c0', 'c0', 'c2', 'c1'], []], teapot: 0, tasting: 5 }, // seed 203 fair L8/S8/O4/F0/TD4/4
    { id: 'teapot-tasting-challenge-10-11', kind: 'teapot-tasting-challenge', depth: 10, cups: [['c0', 'c3', 'c3', 'c0'], ['c1', 'c2', 'c2', 'c1'], ['c2', 'c2', 'c0', 'c3'], ['c0', 'c1', 'c1', 'c3'], [], []], teapot: 0, tasting: 5 }, // seed 11 fair L8/S8/O3/F0/TD4/4
    { id: 'teapot-tasting-challenge-10-12', kind: 'teapot-tasting-challenge', depth: 10, cups: [['c3', 'c3', 'c1', 'c2'], ['c0', 'c2', 'c0', 'c1'], [], ['c3', 'c0', 'c0', 'c3'], ['c1', 'c1', 'c2', 'c2'], []], teapot: 0, tasting: 5 }, // seed 12 fair L8/S8/O3/F0/TD4/4
    { id: 'teapot-tasting-challenge-10-24', kind: 'teapot-tasting-challenge', depth: 10, cups: [['c0', 'c0', 'c3', 'c1'], ['c2', 'c0', 'c1', 'c1'], [], ['c3', 'c0', 'c3', 'c3'], ['c1', 'c2', 'c2', 'c2'], []], teapot: 0, tasting: 5 }, // seed 24 fair L8/S8/O6/F0/TD4/4
    { id: 'teapot-tasting-challenge-10-28', kind: 'teapot-tasting-challenge', depth: 10, cups: [['c1', 'c0', 'c3', 'c2'], ['c0', 'c0', 'c0', 'c2'], ['c1', 'c3', 'c2', 'c2'], ['c3', 'c1', 'c1', 'c3'], [], []], teapot: 0, tasting: 5 }, // seed 28 fair L8/S8/O4/F0/TD4/4
    { id: 'teapot-tasting-challenge-10-32', kind: 'teapot-tasting-challenge', depth: 10, cups: [['c2', 'c3', 'c0', 'c3'], ['c0', 'c0', 'c0', 'c2'], ['c2', 'c3', 'c1', 'c2'], ['c3', 'c1', 'c1', 'c1'], [], []], teapot: 0, tasting: 5 }, // seed 32 fair L8/S8/O3/F0/TD4/4
  ],
};

/** All bank templates flattened (bank validation tests iterate this). */
export const ALL_TASTING_TEMPLATES: TastingTemplate[] = [
  ...TASTING_TEMPLATE_BANK['tasting-challenge'],
  ...TASTING_TEMPLATE_BANK['tasting-mystery-peak'],
  ...TASTING_TEMPLATE_BANK['teapot-tasting-challenge'],
];

/**
 * Instantiate a template against a concrete palette + role bijection.
 * `order`: palette teas serving roles c0..c4 (seeded permutation). Any
 * bijection is a full puzzle isomorphism (tasting stays empty C2/E,
 * teapot stays mixed-full, color counts preserved), so the discovered
 * depth is preserved exactly.
 */
export function instantiateTastingTemplate(
  tpl: TastingTemplate,
  palette: TeaId[],
  order: TeaId[] = [...palette],
): { cups: TeaId[][]; teapotSlot: number | null; tastingSlot: number } {
  const roleToTea = new Map<TastingTeaRole, TeaId>([
    ['c0', order[0] as TeaId],
    ['c1', order[1] as TeaId],
    ['c2', order[2] as TeaId],
    ['c3', order[3] as TeaId],
    ['c4', order[4] as TeaId],
  ]);
  const cups = tpl.cups.map((cup) => cup.map((role) => roleToTea.get(role) as TeaId));
  return { cups, teapotSlot: tpl.teapot, tastingSlot: tpl.tasting };
}
