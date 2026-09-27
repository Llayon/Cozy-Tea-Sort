/**
 * Floating-lemon template bank (Gauntlet 5).
 *
 * WHY: same reason as the target/sink/tasting banks — random-deal lemon
 * generation would need many state-aware BFS validations per level,
 * stalling the main thread. These topologies were discovered OFFLINE by
 * the production generator + state-aware solver, then relativized to
 * palette roles with ONE fixed point:
 *   c0 = LEMON TARGET TEA (always sea_buckthorn at runtime — NEVER
 *        permuted away, or the lemon goal would break);
 *   c1..c4 = remaining palette teas (seeded permutation allowed: a full
 *        color isomorphism fixing c0, so the discovered solver depth
 *        holds EXACTLY for every palette containing sea_buckthorn).
 *
 * Every template: filled standard vessels hold the full
 * TEA_UNITS_PER_COLOR pool, ordinary empties remain, the lemon starts on
 * a full mixed plain-standard vessel (never pre-solved, never Mystery),
 * and the teapot (where applicable) sits full + mixed at slot 0.
 * Constraint metadata is applied during instantiation; mystery is
 * assigned separately at runtime excluding the lemon host.
 *
 * Participation curation (Gauntlet 5 §46): every committed template's
 * optimal production solution relocates the lemon at least once
 * (tracked across the replay) and finishes it on full sea_buckthorn.
 * Bank fairness: fatal-first-move ratio ~0; wrong-final deadlocks ~0.
 *
 * Pure domain data + instantiation helpers. No React/Pixi imports.
 * Runtime re-validates each instantiation through `finalizeCandidate`.
 */

import { FLOATING_INGREDIENT_TYPES, type TeaId } from '../types';

/** Palette-relative tea role inside template cup patterns. */
export type LemonTeaRole = 'c0' | 'c1' | 'c2' | 'c3' | 'c4';

export type LemonTemplateKind = 'lemon-challenge' | 'lemon-mystery-peak' | 'teapot-lemon-challenge';

export interface LemonTemplate {
  id: string;
  kind: LemonTemplateKind;
  /** Discovered solver depth (audit trail; runtime re-validates exactly). */
  depth: number;
  /** Final slot order (`[]` = empty vessel). */
  cups: LemonTeaRole[][];
  /** Teapot slot when present, else null. */
  teapot: number | null;
  /** Initial lemon host slot (full mixed plain-standard vessel). */
  lemonHost: number;
}

/** Generation contract each kind serves (mirrors the canonical requests). */
export interface LemonTemplateSpec {
  numColors: number;
  emptyCups: number;
  hasMysteryLayer: boolean;
  sourceOnlyCount: number;
}

export const LEMON_TEMPLATE_SPECS: Record<LemonTemplateKind, LemonTemplateSpec> = {
  'lemon-challenge': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 0 },
  'lemon-mystery-peak': { numColors: 5, emptyCups: 2, hasMysteryLayer: true, sourceOnlyCount: 0 },
  'teapot-lemon-challenge': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 1 },
};

/** Bounded runtime template attempts (never a 150-scan for lemon). */
export const LEMON_TEMPLATE_ATTEMPTS = 4;

/** The lemon's target tea (single source; templates bind c0 to this). */
export const LEMON_TARGET_TEA: TeaId = FLOATING_INGREDIENT_TYPES.lemon.targetTeaId;

export const LEMON_TEMPLATE_BANK: Record<LemonTemplateKind, LemonTemplate[]> = {
  'lemon-challenge': [
{ id: 'lemon-challenge-7-1009', kind: 'lemon-challenge', depth: 7, cups: [['c1', 'c0', 'c0', 'c2'], ['c3', 'c3', 'c3', 'c3'], [], ['c0', 'c2', 'c1', 'c1'], ['c1', 'c2', 'c2', 'c0'], []], teapot: null, lemonHost: 4 }, // seed 1009 reloc 2 fair L6/S6/O2/F0/LD2/2/WF0
{ id: 'lemon-challenge-7-435', kind: 'lemon-challenge', depth: 7, cups: [['c3', 'c3', 'c3', 'c0'], ['c0', 'c1', 'c1', 'c1'], [], ['c2', 'c0', 'c0', 'c2'], [], ['c2', 'c2', 'c3', 'c1']], teapot: null, lemonHost: 0 }, // seed 435 reloc 1 fair L8/S8/O4/F0/LD2/2/WF0
{ id: 'lemon-challenge-7-714', kind: 'lemon-challenge', depth: 7, cups: [['c3', 'c3', 'c3', 'c3'], [], ['c1', 'c1', 'c2', 'c0'], ['c2', 'c2', 'c0', 'c0'], ['c1', 'c0', 'c1', 'c2'], []], teapot: null, lemonHost: 3 }, // seed 714 reloc 1 fair L6/S6/O4/F0/LD2/2/WF0
{ id: 'lemon-challenge-8-888', kind: 'lemon-challenge', depth: 8, cups: [[], ['c2', 'c2', 'c3', 'c3'], ['c0', 'c1', 'c0', 'c0'], [], ['c3', 'c3', 'c2', 'c1'], ['c2', 'c0', 'c1', 'c1']], teapot: null, lemonHost: 2 }, // seed 888 reloc 2 fair L8/S8/O4/F0/LD2/2/WF0
{ id: 'lemon-challenge-8-105', kind: 'lemon-challenge', depth: 8, cups: [['c2', 'c2', 'c1', 'c1'], [], ['c0', 'c0', 'c2', 'c3'], ['c1', 'c3', 'c3', 'c1'], [], ['c3', 'c2', 'c0', 'c0']], teapot: null, lemonHost: 5 }, // seed 105 reloc 1 fair L8/S8/O4/F0/LD2/2/WF0
{ id: 'lemon-challenge-8-782', kind: 'lemon-challenge', depth: 8, cups: [['c1', 'c1', 'c2', 'c2'], [], ['c3', 'c3', 'c1', 'c2'], [], ['c2', 'c0', 'c0', 'c0'], ['c3', 'c1', 'c3', 'c0']], teapot: null, lemonHost: 5 }, // seed 782 reloc 1 fair L8/S8/O4/F0/LD2/2/WF0
{ id: 'lemon-challenge-8-2031', kind: 'lemon-challenge', depth: 8, cups: [[], [], ['c1', 'c1', 'c1', 'c2'], ['c3', 'c3', 'c2', 'c2'], ['c0', 'c3', 'c2', 'c0'], ['c0', 'c0', 'c1', 'c3']], teapot: null, lemonHost: 4 }, // seed 2031 reloc 1 fair L8/S8/O4/F0/LD2/2/WF0
{ id: 'lemon-challenge-9-1642', kind: 'lemon-challenge', depth: 9, cups: [['c0', 'c1', 'c1', 'c1'], [], ['c0', 'c3', 'c0', 'c2'], [], ['c1', 'c2', 'c2', 'c0'], ['c3', 'c3', 'c2', 'c3']], teapot: null, lemonHost: 4 }, // seed 1642 reloc 3 fair L8/S8/O2/F0/LD2/2/WF0
{ id: 'lemon-challenge-9-1023', kind: 'lemon-challenge', depth: 9, cups: [[], ['c0', 'c2', 'c0', 'c3'], ['c3', 'c3', 'c3', 'c0'], ['c1', 'c0', 'c1', 'c1'], ['c2', 'c1', 'c2', 'c2'], []], teapot: null, lemonHost: 2 }, // seed 1023 reloc 2 fair L8/S8/O6/F0/LD2/2/WF0
{ id: 'lemon-challenge-9-57', kind: 'lemon-challenge', depth: 9, cups: [['c2', 'c1', 'c1', 'c0'], ['c2', 'c3', 'c0', 'c0'], [], ['c1', 'c2', 'c1', 'c2'], ['c3', 'c3', 'c3', 'c0'], []], teapot: null, lemonHost: 4 }, // seed 57 reloc 1 fair L8/S8/O6/F0/LD2/2/WF0
{ id: 'lemon-challenge-9-1025', kind: 'lemon-challenge', depth: 9, cups: [['c3', 'c0', 'c0', 'c0'], ['c2', 'c3', 'c3', 'c2'], ['c1', 'c1', 'c2', 'c2'], [], ['c3', 'c1', 'c0', 'c1'], []], teapot: null, lemonHost: 0 }, // seed 1025 reloc 1 fair L8/S8/O6/F0/LD2/2/WF0
{ id: 'lemon-challenge-9-1704', kind: 'lemon-challenge', depth: 9, cups: [[], ['c0', 'c1', 'c3', 'c3'], ['c2', 'c2', 'c0', 'c0'], ['c3', 'c1', 'c3', 'c0'], [], ['c1', 'c1', 'c2', 'c2']], teapot: null, lemonHost: 2 }, // seed 1704 reloc 1 fair L8/S8/O8/F0/LD2/2/WF0
{ id: 'lemon-challenge-10-764', kind: 'lemon-challenge', depth: 10, cups: [['c3', 'c1', 'c1', 'c2'], [], ['c2', 'c1', 'c1', 'c3'], ['c0', 'c3', 'c3', 'c0'], ['c0', 'c2', 'c2', 'c0'], []], teapot: null, lemonHost: 3 }, // seed 764 reloc 3 fair L8/S8/O4/F0/LD2/2/WF0
{ id: 'lemon-challenge-10-1198', kind: 'lemon-challenge', depth: 10, cups: [['c3', 'c3', 'c0', 'c0'], ['c2', 'c2', 'c1', 'c2'], [], [], ['c1', 'c0', 'c2', 'c1'], ['c0', 'c3', 'c1', 'c3']], teapot: null, lemonHost: 0 }, // seed 1198 reloc 2 fair L8/S8/O2/F0/LD2/2/WF0
{ id: 'lemon-challenge-10-97', kind: 'lemon-challenge', depth: 10, cups: [['c1', 'c2', 'c1', 'c0'], ['c2', 'c3', 'c2', 'c2'], ['c3', 'c1', 'c3', 'c1'], [], [], ['c0', 'c0', 'c0', 'c3']], teapot: null, lemonHost: 0 }, // seed 97 reloc 1 fair L8/S8/O6/F0/LD2/2/WF0
{ id: 'lemon-challenge-10-542', kind: 'lemon-challenge', depth: 10, cups: [['c1', 'c3', 'c3', 'c1'], [], ['c3', 'c2', 'c0', 'c0'], ['c3', 'c2', 'c2', 'c2'], ['c1', 'c0', 'c1', 'c0'], []], teapot: null, lemonHost: 4 }, // seed 542 reloc 1 fair L8/S8/O6/F0/LD2/2/WF0
{ id: 'lemon-challenge-10-1141', kind: 'lemon-challenge', depth: 10, cups: [[], ['c1', 'c3', 'c2', 'c2'], [], ['c3', 'c3', 'c2', 'c0'], ['c3', 'c1', 'c0', 'c0'], ['c1', 'c1', 'c0', 'c2']], teapot: null, lemonHost: 4 }, // seed 1141 reloc 1 fair L8/S8/O8/F0/LD2/2/WF0
{ id: 'lemon-challenge-10-1681', kind: 'lemon-challenge', depth: 10, cups: [[], ['c2', 'c1', 'c1', 'c0'], [], ['c1', 'c2', 'c2', 'c0'], ['c3', 'c3', 'c0', 'c2'], ['c1', 'c3', 'c0', 'c3']], teapot: null, lemonHost: 3 }, // seed 1681 reloc 1 fair L8/S8/O4/F0/LD2/2/WF0
  ],
  'lemon-mystery-peak': [
{ id: 'lemon-mystery-peak-11-246', kind: 'lemon-mystery-peak', depth: 11, cups: [[], ['c1', 'c1', 'c2', 'c3'], ['c4', 'c4', 'c1', 'c3'], ['c3', 'c1', 'c4', 'c4'], ['c0', 'c3', 'c2', 'c0'], [], ['c2', 'c2', 'c0', 'c0']], teapot: null, lemonHost: 4 }, // seed 246 reloc 2 fair L10/S10/O4/F0/LD2/2/WF0
{ id: 'lemon-mystery-peak-11-271', kind: 'lemon-mystery-peak', depth: 11, cups: [['c4', 'c4', 'c0', 'c0'], ['c0', 'c2', 'c4', 'c1'], [], ['c0', 'c3', 'c3', 'c2'], [], ['c2', 'c4', 'c2', 'c1'], ['c1', 'c1', 'c3', 'c3']], teapot: null, lemonHost: 0 }, // seed 271 reloc 1 fair L10/S10/O2/F0/LD2/2/WF0
{ id: 'lemon-mystery-peak-11-569', kind: 'lemon-mystery-peak', depth: 11, cups: [['c2', 'c4', 'c4', 'c0'], ['c3', 'c0', 'c0', 'c2'], ['c0', 'c3', 'c3', 'c4'], ['c1', 'c1', 'c1', 'c4'], [], ['c1', 'c3', 'c2', 'c2'], []], teapot: null, lemonHost: 0 }, // seed 569 reloc 1 fair L10/S10/O10/F0/LD2/2/WF0
{ id: 'lemon-mystery-peak-11-956', kind: 'lemon-mystery-peak', depth: 11, cups: [['c0', 'c3', 'c4', 'c3'], [], ['c2', 'c2', 'c3', 'c1'], [], ['c3', 'c2', 'c0', 'c2'], ['c0', 'c1', 'c1', 'c1'], ['c4', 'c4', 'c4', 'c0']], teapot: null, lemonHost: 6 }, // seed 956 reloc 1 fair L10/S10/O4/F0/LD2/2/WF0
{ id: 'lemon-mystery-peak-12-48', kind: 'lemon-mystery-peak', depth: 12, cups: [['c3', 'c3', 'c0', 'c0'], [], ['c3', 'c2', 'c2', 'c4'], [], ['c4', 'c2', 'c1', 'c1'], ['c1', 'c1', 'c4', 'c3'], ['c0', 'c2', 'c4', 'c0']], teapot: null, lemonHost: 6 }, // seed 48 reloc 2 fair L10/S10/O4/F0/LD2/2/WF0
{ id: 'lemon-mystery-peak-12-89', kind: 'lemon-mystery-peak', depth: 12, cups: [['c0', 'c3', 'c2', 'c1'], [], ['c3', 'c3', 'c1', 'c0'], ['c4', 'c1', 'c1', 'c4'], ['c2', 'c3', 'c2', 'c2'], [], ['c4', 'c4', 'c0', 'c0']], teapot: null, lemonHost: 6 }, // seed 89 reloc 1 fair L10/S10/O4/F0/LD2/2/WF0
{ id: 'lemon-mystery-peak-12-175', kind: 'lemon-mystery-peak', depth: 12, cups: [['c0', 'c4', 'c2', 'c3'], ['c0', 'c3', 'c4', 'c3'], [], ['c1', 'c1', 'c0', 'c0'], ['c2', 'c2', 'c4', 'c4'], ['c2', 'c3', 'c1', 'c1'], []], teapot: null, lemonHost: 3 }, // seed 175 reloc 1 fair L10/S10/O6/F0/LD2/2/WF0
{ id: 'lemon-mystery-peak-12-189', kind: 'lemon-mystery-peak', depth: 12, cups: [['c0', 'c4', 'c2', 'c0'], ['c4', 'c4', 'c3', 'c3'], ['c1', 'c0', 'c1', 'c1'], [], ['c3', 'c1', 'c2', 'c0'], ['c2', 'c2', 'c4', 'c3'], []], teapot: null, lemonHost: 4 }, // seed 189 reloc 1 fair L10/S10/O6/F0/LD2/2/WF0
{ id: 'lemon-mystery-peak-12-219', kind: 'lemon-mystery-peak', depth: 12, cups: [['c1', 'c3', 'c0', 'c4'], ['c2', 'c3', 'c0', 'c0'], [], ['c1', 'c1', 'c2', 'c2'], [], ['c0', 'c3', 'c3', 'c4'], ['c4', 'c4', 'c1', 'c2']], teapot: null, lemonHost: 1 }, // seed 219 reloc 1 fair L10/S10/O10/F0/LD2/2/WF0
{ id: 'lemon-mystery-peak-13-3', kind: 'lemon-mystery-peak', depth: 13, cups: [['c4', 'c0', 'c3', 'c3'], [], ['c2', 'c1', 'c1', 'c1'], [], ['c4', 'c1', 'c2', 'c0'], ['c2', 'c0', 'c3', 'c2'], ['c0', 'c3', 'c4', 'c4']], teapot: null, lemonHost: 4 }, // seed 3 reloc 3 fair L10/S10/O4/F0/LD2/2/WF0
{ id: 'lemon-mystery-peak-13-8', kind: 'lemon-mystery-peak', depth: 13, cups: [['c2', 'c4', 'c2', 'c0'], ['c0', 'c2', 'c4', 'c2'], ['c1', 'c4', 'c3', 'c3'], [], ['c0', 'c3', 'c3', 'c4'], ['c0', 'c1', 'c1', 'c1'], []], teapot: null, lemonHost: 0 }, // seed 8 reloc 2 fair L10/S10/O4/F0/LD2/2/WF0
{ id: 'lemon-mystery-peak-13-15', kind: 'lemon-mystery-peak', depth: 13, cups: [[], ['c4', 'c1', 'c0', 'c2'], ['c2', 'c2', 'c0', 'c4'], ['c3', 'c1', 'c1', 'c3'], [], ['c1', 'c2', 'c3', 'c0'], ['c3', 'c4', 'c4', 'c0']], teapot: null, lemonHost: 5 }, // seed 15 reloc 1 fair L10/S10/O4/F0/LD2/2/WF0
{ id: 'lemon-mystery-peak-13-23', kind: 'lemon-mystery-peak', depth: 13, cups: [['c1', 'c1', 'c2', 'c3'], [], [], ['c1', 'c3', 'c0', 'c4'], ['c4', 'c4', 'c3', 'c0'], ['c2', 'c2', 'c2', 'c0'], ['c4', 'c1', 'c3', 'c0']], teapot: null, lemonHost: 4 }, // seed 23 reloc 1 fair L10/S10/O8/F0/LD2/2/WF0
{ id: 'lemon-mystery-peak-13-113', kind: 'lemon-mystery-peak', depth: 13, cups: [['c2', 'c0', 'c1', 'c2'], ['c1', 'c4', 'c4', 'c0'], ['c1', 'c2', 'c0', 'c0'], [], ['c4', 'c3', 'c2', 'c3'], ['c3', 'c3', 'c4', 'c1'], []], teapot: null, lemonHost: 1 }, // seed 113 reloc 1 fair L10/S10/O4/F0/LD2/2/WF0
{ id: 'lemon-mystery-peak-14-83', kind: 'lemon-mystery-peak', depth: 14, cups: [['c1', 'c4', 'c3', 'c0'], ['c2', 'c3', 'c0', 'c0'], [], ['c0', 'c2', 'c1', 'c2'], [], ['c3', 'c3', 'c4', 'c1'], ['c1', 'c2', 'c4', 'c4']], teapot: null, lemonHost: 0 }, // seed 83 reloc 2 fair L10/S10/O10/F0/LD2/2/WF0
{ id: 'lemon-mystery-peak-14-104', kind: 'lemon-mystery-peak', depth: 14, cups: [['c1', 'c1', 'c1', 'c4'], ['c3', 'c0', 'c3', 'c2'], ['c4', 'c1', 'c0', 'c0'], [], [], ['c4', 'c2', 'c3', 'c2'], ['c0', 'c3', 'c2', 'c4']], teapot: null, lemonHost: 2 }, // seed 104 reloc 2 fair L10/S10/O6/F0/LD2/2/WF0
{ id: 'lemon-mystery-peak-14-106', kind: 'lemon-mystery-peak', depth: 14, cups: [['c1', 'c4', 'c3', 'c0'], ['c2', 'c1', 'c1', 'c2'], [], ['c1', 'c3', 'c4', 'c0'], [], ['c0', 'c2', 'c2', 'c3'], ['c4', 'c4', 'c0', 'c3']], teapot: null, lemonHost: 0 }, // seed 106 reloc 2 fair L10/S10/O10/F0/LD2/2/WF0
{ id: 'lemon-mystery-peak-14-17', kind: 'lemon-mystery-peak', depth: 14, cups: [[], ['c3', 'c0', 'c2', 'c3'], [], ['c1', 'c0', 'c1', 'c3'], ['c3', 'c4', 'c4', 'c0'], ['c4', 'c1', 'c1', 'c2'], ['c4', 'c0', 'c2', 'c2']], teapot: null, lemonHost: 4 }, // seed 17 reloc 1 fair L10/S10/O6/F0/LD2/2/WF0
  ],
  'teapot-lemon-challenge': [
{ id: 'teapot-lemon-challenge-7-2614', kind: 'teapot-lemon-challenge', depth: 7, cups: [['c2', 'c2', 'c3', 'c3'], ['c1', 'c1', 'c1', 'c1'], [], [], ['c2', 'c2', 'c3', 'c0'], ['c0', 'c0', 'c3', 'c0']], teapot: 0, lemonHost: 4 }, // seed 2614 reloc 2 fair L6/S6/O6/F0/LD2/2/WF0
{ id: 'teapot-lemon-challenge-7-630', kind: 'teapot-lemon-challenge', depth: 7, cups: [['c3', 'c1', 'c2', 'c2'], [], ['c1', 'c1', 'c0', 'c0'], [], ['c2', 'c2', 'c3', 'c3'], ['c3', 'c1', 'c0', 'c0']], teapot: 0, lemonHost: 2 }, // seed 630 reloc 1 fair L8/S8/O4/F0/LD2/2/WF0
{ id: 'teapot-lemon-challenge-7-2329', kind: 'teapot-lemon-challenge', depth: 7, cups: [['c0', 'c0', 'c3', 'c1'], ['c1', 'c1', 'c1', 'c0'], ['c3', 'c3', 'c0', 'c3'], [], [], ['c2', 'c2', 'c2', 'c2']], teapot: 0, lemonHost: 1 }, // seed 2329 reloc 1 fair L6/S6/O4/F0/LD2/2/WF0
{ id: 'teapot-lemon-challenge-8-65', kind: 'teapot-lemon-challenge', depth: 8, cups: [['c2', 'c0', 'c1', 'c1'], [], ['c0', 'c1', 'c2', 'c2'], [], ['c1', 'c2', 'c0', 'c0'], ['c3', 'c3', 'c3', 'c3']], teapot: 0, lemonHost: 4 }, // seed 65 reloc 1 fair L6/S6/O6/F0/LD2/2/WF0
{ id: 'teapot-lemon-challenge-8-144', kind: 'teapot-lemon-challenge', depth: 8, cups: [['c0', 'c3', 'c0', 'c0'], ['c1', 'c1', 'c1', 'c3'], ['c1', 'c2', 'c2', 'c0'], [], ['c2', 'c2', 'c3', 'c3'], []], teapot: 0, lemonHost: 2 }, // seed 144 reloc 1 fair L8/S8/O8/F0/LD2/2/WF0
{ id: 'teapot-lemon-challenge-8-155', kind: 'teapot-lemon-challenge', depth: 8, cups: [['c2', 'c2', 'c2', 'c3'], ['c3', 'c1', 'c3', 'c1'], ['c0', 'c3', 'c1', 'c1'], ['c2', 'c0', 'c0', 'c0'], [], []], teapot: 0, lemonHost: 3 }, // seed 155 reloc 1 fair L8/S8/O4/F0/LD2/2/WF0
{ id: 'teapot-lemon-challenge-8-429', kind: 'teapot-lemon-challenge', depth: 8, cups: [['c3', 'c3', 'c3', 'c1'], [], ['c2', 'c2', 'c2', 'c0'], [], ['c2', 'c1', 'c0', 'c0'], ['c1', 'c1', 'c3', 'c0']], teapot: 0, lemonHost: 5 }, // seed 429 reloc 1 fair L8/S8/O6/F0/LD2/2/WF0
{ id: 'teapot-lemon-challenge-8-610', kind: 'teapot-lemon-challenge', depth: 8, cups: [['c0', 'c2', 'c1', 'c3'], ['c3', 'c3', 'c2', 'c2'], [], ['c3', 'c1', 'c1', 'c1'], [], ['c2', 'c0', 'c0', 'c0']], teapot: 0, lemonHost: 5 }, // seed 610 reloc 1 fair L8/S8/O4/F0/LD2/2/WF0
{ id: 'teapot-lemon-challenge-9-1', kind: 'teapot-lemon-challenge', depth: 9, cups: [['c3', 'c0', 'c1', 'c1'], ['c2', 'c2', 'c0', 'c0'], ['c1', 'c0', 'c3', 'c3'], [], [], ['c1', 'c2', 'c2', 'c3']], teapot: 0, lemonHost: 1 }, // seed 1 reloc 1 fair L8/S8/O6/F0/LD2/2/WF0
{ id: 'teapot-lemon-challenge-9-27', kind: 'teapot-lemon-challenge', depth: 9, cups: [['c3', 'c1', 'c1', 'c0'], [], ['c2', 'c2', 'c2', 'c0'], ['c3', 'c2', 'c0', 'c3'], [], ['c1', 'c1', 'c3', 'c0']], teapot: 0, lemonHost: 2 }, // seed 27 reloc 1 fair L8/S8/O6/F0/LD2/2/WF0
{ id: 'teapot-lemon-challenge-9-88', kind: 'teapot-lemon-challenge', depth: 9, cups: [['c1', 'c2', 'c2', 'c3'], [], [], ['c0', 'c3', 'c1', 'c1'], ['c2', 'c1', 'c3', 'c3'], ['c2', 'c0', 'c0', 'c0']], teapot: 0, lemonHost: 5 }, // seed 88 reloc 1 fair L8/S8/O6/F0/LD2/2/WF0
{ id: 'teapot-lemon-challenge-9-165', kind: 'teapot-lemon-challenge', depth: 9, cups: [['c2', 'c3', 'c3', 'c0'], ['c2', 'c2', 'c2', 'c0'], ['c3', 'c0', 'c1', 'c1'], [], ['c1', 'c1', 'c3', 'c0'], []], teapot: 0, lemonHost: 1 }, // seed 165 reloc 1 fair L8/S8/O8/F0/LD2/2/WF0
{ id: 'teapot-lemon-challenge-9-249', kind: 'teapot-lemon-challenge', depth: 9, cups: [['c3', 'c1', 'c2', 'c0'], ['c0', 'c1', 'c1', 'c3'], [], ['c3', 'c3', 'c0', 'c0'], ['c2', 'c2', 'c2', 'c1'], []], teapot: 0, lemonHost: 3 }, // seed 249 reloc 1 fair L8/S8/O8/F0/LD2/2/WF0
{ id: 'teapot-lemon-challenge-10-22', kind: 'teapot-lemon-challenge', depth: 10, cups: [['c3', 'c2', 'c2', 'c2'], ['c3', 'c0', 'c3', 'c1'], ['c0', 'c1', 'c0', 'c0'], [], ['c3', 'c1', 'c1', 'c2'], []], teapot: 0, lemonHost: 2 }, // seed 22 reloc 2 fair L8/S8/O6/F0/LD2/2/WF0
{ id: 'teapot-lemon-challenge-10-237', kind: 'teapot-lemon-challenge', depth: 10, cups: [['c2', 'c1', 'c1', 'c1'], [], [], ['c2', 'c2', 'c3', 'c0'], ['c1', 'c0', 'c3', 'c2'], ['c0', 'c3', 'c3', 'c0']], teapot: 0, lemonHost: 5 }, // seed 237 reloc 2 fair L8/S6/O6/F2/LD2/2/WF0
{ id: 'teapot-lemon-challenge-10-408', kind: 'teapot-lemon-challenge', depth: 10, cups: [['c0', 'c3', 'c2', 'c1'], [], ['c0', 'c1', 'c1', 'c0'], ['c3', 'c0', 'c3', 'c3'], ['c2', 'c2', 'c2', 'c1'], []], teapot: 0, lemonHost: 2 }, // seed 408 reloc 2 fair L8/S8/O6/F0/LD2/2/WF0
{ id: 'teapot-lemon-challenge-10-53', kind: 'teapot-lemon-challenge', depth: 10, cups: [['c2', 'c0', 'c1', 'c1'], ['c2', 'c1', 'c1', 'c3'], [], ['c3', 'c3', 'c0', 'c0'], [], ['c2', 'c3', 'c0', 'c2']], teapot: 0, lemonHost: 3 }, // seed 53 reloc 1 fair L8/S8/O4/F0/LD2/2/WF0
{ id: 'teapot-lemon-challenge-10-137', kind: 'teapot-lemon-challenge', depth: 10, cups: [['c3', 'c1', 'c2', 'c0'], [], ['c2', 'c2', 'c0', 'c0'], ['c1', 'c2', 'c0', 'c1'], [], ['c1', 'c3', 'c3', 'c3']], teapot: 0, lemonHost: 2 }, // seed 137 reloc 1 fair L8/S8/O6/F0/LD2/2/WF0
  ],
};

/** All bank templates flattened (bank validation tests iterate this). */
export const ALL_LEMON_TEMPLATES: LemonTemplate[] = [
  ...LEMON_TEMPLATE_BANK['lemon-challenge'],
  ...LEMON_TEMPLATE_BANK['lemon-mystery-peak'],
  ...LEMON_TEMPLATE_BANK['teapot-lemon-challenge'],
];

/**
 * Resolve role → tea for a concrete palette. `otherOrder`: palette teas
 * (excluding the lemon target) serving roles c1..c4, in order. c0 ALWAYS
 * maps to sea_buckthorn — callers must never permute it away.
 */
export function resolveLemonRoleTeas(
  palette: TeaId[],
  otherOrder: TeaId[],
): Map<LemonTeaRole, TeaId> {
  const map = new Map<LemonTeaRole, TeaId>([['c0', LEMON_TARGET_TEA]]);
  const roles: LemonTeaRole[] = ['c1', 'c2', 'c3', 'c4'];
  const others = palette.filter((t) => t !== LEMON_TARGET_TEA);
  roles.forEach((role, i) => {
    const tea = otherOrder[i] ?? others[i];
    if (tea !== undefined) map.set(role, tea);
  });
  return map;
}

/**
 * Instantiate a template against a concrete palette + role bijection.
 * Any bijection fixing c0 is a full puzzle isomorphism (lemon host stays
 * a full mixed plain vessel, color counts preserved), so the discovered
 * depth is preserved exactly.
 */
export function instantiateLemonTemplate(
  tpl: LemonTemplate,
  palette: TeaId[],
  otherOrder: TeaId[] = palette.filter((t) => t !== LEMON_TARGET_TEA),
): { cups: TeaId[][]; teapotSlot: number | null; lemonHost: number } {
  const roleToTea = resolveLemonRoleTeas(palette, otherOrder);
  const cups = tpl.cups.map((cup) => cup.map((role) => roleToTea.get(role) as TeaId));
  return { cups, teapotSlot: tpl.teapot, lemonHost: tpl.lemonHost };
}
