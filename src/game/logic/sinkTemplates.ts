/**
 * Sink-only guest-cup template bank (Gauntlet 3).
 *
 * WHY: same reason as the target bank (Gauntlet 2.1) — random-deal sink
 * generation would need many BFS validations per level, stalling the main
 * thread. These topologies were discovered OFFLINE by the production
 * generator + solver, then relativized to palette roles:
 *   c0..c4 = palette teas in request-palette order (instantiation applies
 *   a seeded permutation — a full puzzle isomorphism, so the discovered
 *   solver depth holds EXACTLY for every palette).
 * The sink carries no named tea, so there is no t0/t1 role requirement.
 *
 * Every template: filled tea vessels hold the full 4-units-per-color pool,
 * exactly one ordinary empty remains, the sink sits EMPTY at the stable
 * last slot, and the teapot (where applicable) sits full + mixed at slot
 * 0. Constraint metadata is applied during instantiation; mystery is
 * assigned separately at runtime on an untargeted normal cup.
 *
 * Fairness curation (Gauntlet 3 §26–27): every committed template was
 * analyzed OFFLINE for root branching (legal / solvable / optimal /
 * fatal / sink-directed first moves). Result: fatal-first-move ratio 0
 * across the bank — all legal openings stay solvable, all sink-directed
 * openings stay solvable. Sink-only creates planning, not traps.
 *
 * Pure domain data + instantiation helpers. No React/Pixi imports.
 * Runtime re-validates each instantiation through `finalizeCandidate`.
 */

import type { TeaId } from '../types';

/** Palette-relative tea role inside template cup patterns. */
export type SinkTeaRole = 'c0' | 'c1' | 'c2' | 'c3' | 'c4';

export type SinkTemplateKind = 'sink-challenge' | 'sink-mystery-peak' | 'teapot-sink-challenge';

export interface SinkTemplate {
  id: string;
  kind: SinkTemplateKind;
  /** Discovered solver depth (audit trail; runtime re-validates exactly). */
  depth: number;
  /** Final slot order (`[]` = empty vessel; last slot = empty sink). */
  cups: SinkTeaRole[][];
  /** Teapot slot when present, else null. */
  teapot: number | null;
  /** Sink slot (stable last vessel index). */
  sink: number;
}

/** Generation contract each kind serves (mirrors the canonical requests). */
export interface SinkTemplateSpec {
  numColors: number;
  emptyCups: number;
  hasMysteryLayer: boolean;
  sourceOnlyCount: number;
  sinkOnlyCount: number;
}

export const SINK_TEMPLATE_SPECS: Record<SinkTemplateKind, SinkTemplateSpec> = {
  'sink-challenge': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 0, sinkOnlyCount: 1 },
  'sink-mystery-peak': { numColors: 5, emptyCups: 2, hasMysteryLayer: true, sourceOnlyCount: 0, sinkOnlyCount: 1 },
  'teapot-sink-challenge': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 1, sinkOnlyCount: 1 },
};

/** Bounded runtime template attempts (never a 150-scan for sink). */
export const SINK_TEMPLATE_ATTEMPTS = 4;

export const SINK_TEMPLATE_BANK: Record<SinkTemplateKind, SinkTemplate[]> = {
  'sink-challenge': [
    { id: 'sc-7-8', kind: 'sink-challenge', depth: 7, cups: [['c0', 'c0', 'c0', 'c1'], ['c2', 'c2', 'c1', 'c1'], ['c3', 'c3', 'c1', 'c2'], ['c2', 'c3', 'c3', 'c0'], [], []], teapot: null, sink: 5 }, // fair L8/S8/O2/F0/SD4/4
    { id: 'sc-7-962', kind: 'sink-challenge', depth: 7, cups: [['c1', 'c1', 'c2', 'c2'], [], ['c0', 'c0', 'c0', 'c3'], ['c3', 'c3', 'c0', 'c2'], ['c3', 'c1', 'c1', 'c2'], []], teapot: null, sink: 5 }, // fair L8/S8/O3/F0/SD4/4
    { id: 'sc-7-1614', kind: 'sink-challenge', depth: 7, cups: [['c0', 'c1', 'c1', 'c1'], ['c0', 'c0', 'c3', 'c0'], [], ['c1', 'c3', 'c2', 'c2'], ['c3', 'c3', 'c2', 'c2'], []], teapot: null, sink: 5 }, // fair L8/S8/O2/F0/SD4/4
    { id: 'sc-7-2203', kind: 'sink-challenge', depth: 7, cups: [['c2', 'c3', 'c1', 'c0'], ['c3', 'c2', 'c2', 'c2'], ['c0', 'c0', 'c3', 'c3'], ['c1', 'c1', 'c1', 'c0'], [], []], teapot: null, sink: 5 }, // fair L8/S8/O2/F0/SD4/4
    { id: 'sc-8-16', kind: 'sink-challenge', depth: 8, cups: [['c3', 'c1', 'c3', 'c2'], ['c1', 'c1', 'c0', 'c0'], ['c1', 'c3', 'c3', 'c2'], [], ['c0', 'c0', 'c2', 'c2'], []], teapot: null, sink: 5 }, // fair L8/S8/O3/F0/SD4/4
    { id: 'sc-8-507', kind: 'sink-challenge', depth: 8, cups: [['c0', 'c3', 'c1', 'c3'], [], ['c3', 'c3', 'c0', 'c0'], ['c2', 'c2', 'c1', 'c1'], ['c0', 'c2', 'c2', 'c1'], []], teapot: null, sink: 5 }, // fair L8/S8/O2/F0/SD4/4
    { id: 'sc-8-1222', kind: 'sink-challenge', depth: 8, cups: [['c0', 'c0', 'c3', 'c3'], [], ['c2', 'c1', 'c1', 'c2'], ['c1', 'c0', 'c3', 'c3'], ['c0', 'c2', 'c2', 'c1'], []], teapot: null, sink: 5 }, // fair L8/S8/O2/F0/SD4/4
    { id: 'sc-8-1889', kind: 'sink-challenge', depth: 8, cups: [['c3', 'c2', 'c1', 'c1'], ['c0', 'c3', 'c3', 'c3'], [], ['c2', 'c2', 'c0', 'c0'], ['c1', 'c0', 'c1', 'c2'], []], teapot: null, sink: 5 }, // fair L8/S8/O1/F0/SD4/4
    { id: 'sc-8-2518', kind: 'sink-challenge', depth: 8, cups: [['c3', 'c1', 'c3', 'c1'], ['c2', 'c2', 'c2', 'c2'], [], ['c1', 'c0', 'c3', 'c3'], ['c0', 'c1', 'c0', 'c0'], []], teapot: null, sink: 5 }, // fair L7/S7/O1/F0/SD4/4
    { id: 'sc-9-0', kind: 'sink-challenge', depth: 9, cups: [['c2', 'c2', 'c0', 'c0'], [], ['c2', 'c3', 'c0', 'c0'], ['c1', 'c1', 'c1', 'c3'], ['c2', 'c3', 'c1', 'c3'], []], teapot: null, sink: 5 }, // fair L8/S8/O8/F0/SD4/4
    { id: 'sc-9-726', kind: 'sink-challenge', depth: 9, cups: [['c1', 'c1', 'c1', 'c3'], ['c0', 'c2', 'c2', 'c0'], [], ['c2', 'c3', 'c0', 'c2'], ['c0', 'c3', 'c3', 'c1'], []], teapot: null, sink: 5 }, // fair L8/S8/O1/F0/SD4/4
    { id: 'sc-9-1224', kind: 'sink-challenge', depth: 9, cups: [['c3', 'c3', 'c3', 'c2'], ['c2', 'c0', 'c2', 'c2'], [], ['c0', 'c1', 'c3', 'c0'], ['c1', 'c1', 'c0', 'c1'], []], teapot: null, sink: 5 }, // fair L8/S8/O2/F0/SD4/4
    { id: 'sc-9-1802', kind: 'sink-challenge', depth: 9, cups: [['c3', 'c3', 'c0', 'c1'], [], ['c2', 'c2', 'c2', 'c0'], ['c0', 'c1', 'c1', 'c3'], ['c2', 'c3', 'c0', 'c1'], []], teapot: null, sink: 5 }, // fair L8/S8/O2/F0/SD4/4
    { id: 'sc-9-2507', kind: 'sink-challenge', depth: 9, cups: [[], ['c0', 'c3', 'c0', 'c2'], ['c2', 'c3', 'c3', 'c0'], ['c1', 'c1', 'c1', 'c0'], ['c3', 'c2', 'c2', 'c1'], []], teapot: null, sink: 5 }, // fair L8/S8/O2/F0/SD4/4
    { id: 'sc-10-6', kind: 'sink-challenge', depth: 10, cups: [['c1', 'c2', 'c1', 'c2'], ['c0', 'c3', 'c3', 'c0'], ['c2', 'c2', 'c3', 'c0'], [], ['c1', 'c1', 'c0', 'c3'], []], teapot: null, sink: 5 }, // fair L8/S8/O1/F0/SD4/4
    { id: 'sc-10-721', kind: 'sink-challenge', depth: 10, cups: [[], ['c2', 'c0', 'c1', 'c0'], ['c3', 'c1', 'c3', 'c2'], ['c2', 'c2', 'c0', 'c0'], ['c1', 'c1', 'c3', 'c3'], []], teapot: null, sink: 5 }, // fair L8/S8/O6/F0/SD4/4
    { id: 'sc-10-1447', kind: 'sink-challenge', depth: 10, cups: [['c2', 'c3', 'c3', 'c1'], ['c3', 'c2', 'c3', 'c0'], ['c1', 'c2', 'c1', 'c1'], [], ['c2', 'c0', 'c0', 'c0'], []], teapot: null, sink: 5 }, // fair L8/S8/O8/F0/SD4/4
    { id: 'sc-10-2249', kind: 'sink-challenge', depth: 10, cups: [['c2', 'c3', 'c0', 'c0'], [], ['c0', 'c2', 'c1', 'c1'], ['c3', 'c2', 'c2', 'c3'], ['c0', 'c1', 'c3', 'c1'], []], teapot: null, sink: 5 }, // fair L8/S8/O2/F0/SD4/4
  ],
  'sink-mystery-peak': [
    { id: 'sink-mystery-peak-10-106', kind: 'sink-mystery-peak', depth: 10, cups: [['c2', 'c2', 'c0', 'c0'], ['c4', 'c2', 'c4', 'c3'], ['c4', 'c3', 'c0', 'c0'], ['c1', 'c1', 'c1', 'c4'], [], ['c3', 'c3', 'c2', 'c1'], []], teapot: null, sink: 6 }, // seed 106 fair L10/S10/O2/F0/SD5/5
    { id: 'sink-mystery-peak-10-732', kind: 'sink-mystery-peak', depth: 10, cups: [['c4', 'c2', 'c4', 'c1'], ['c2', 'c1', 'c2', 'c2'], [], ['c0', 'c0', 'c3', 'c4'], ['c4', 'c3', 'c3', 'c3'], ['c1', 'c1', 'c0', 'c0'], []], teapot: null, sink: 6 }, // seed 732 fair L10/S10/O1/F0/SD5/5
    { id: 'sink-mystery-peak-10-757', kind: 'sink-mystery-peak', depth: 10, cups: [['c1', 'c1', 'c1', 'c0'], ['c1', 'c2', 'c3', 'c3'], [], ['c2', 'c0', 'c3', 'c3'], ['c4', 'c2', 'c0', 'c2'], ['c0', 'c4', 'c4', 'c4'], []], teapot: null, sink: 6 }, // seed 757 fair L10/S10/O2/F0/SD5/5
    { id: 'sink-mystery-peak-11-41', kind: 'sink-mystery-peak', depth: 11, cups: [['c4', 'c4', 'c4', 'c2'], ['c2', 'c1', 'c3', 'c3'], ['c1', 'c1', 'c4', 'c3'], ['c0', 'c0', 'c0', 'c2'], [], ['c0', 'c1', 'c3', 'c2'], []], teapot: null, sink: 6 }, // seed 41 fair L10/S10/O10/F0/SD5/5
    { id: 'sink-mystery-peak-11-137', kind: 'sink-mystery-peak', depth: 11, cups: [['c1', 'c3', 'c4', 'c4'], ['c3', 'c2', 'c0', 'c0'], ['c3', 'c3', 'c4', 'c4'], ['c2', 'c2', 'c2', 'c1'], ['c1', 'c0', 'c1', 'c0'], [], []], teapot: null, sink: 6 }, // seed 137 fair L10/S10/O8/F0/SD5/5
    { id: 'sink-mystery-peak-11-145', kind: 'sink-mystery-peak', depth: 11, cups: [[], ['c1', 'c4', 'c4', 'c0'], ['c4', 'c2', 'c1', 'c1'], ['c2', 'c1', 'c3', 'c3'], ['c0', 'c3', 'c3', 'c4'], ['c2', 'c0', 'c0', 'c2'], []], teapot: null, sink: 6 }, // seed 145 fair L10/S10/O1/F0/SD5/5
    { id: 'sink-mystery-peak-11-170', kind: 'sink-mystery-peak', depth: 11, cups: [['c0', 'c0', 'c3', 'c3'], ['c4', 'c0', 'c4', 'c0'], ['c3', 'c2', 'c2', 'c2'], ['c4', 'c1', 'c1', 'c3'], [], ['c1', 'c2', 'c4', 'c1'], []], teapot: null, sink: 6 }, // seed 170 fair L10/S10/O1/F0/SD5/5
    { id: 'sink-mystery-peak-12-24', kind: 'sink-mystery-peak', depth: 12, cups: [['c2', 'c4', 'c0', 'c0'], ['c1', 'c0', 'c4', 'c4'], ['c2', 'c3', 'c3', 'c1'], ['c2', 'c4', 'c1', 'c1'], ['c0', 'c3', 'c3', 'c2'], [], []], teapot: null, sink: 6 }, // seed 24 fair L10/S10/O2/F0/SD5/5
    { id: 'sink-mystery-peak-12-90', kind: 'sink-mystery-peak', depth: 12, cups: [[], ['c3', 'c0', 'c3', 'c4'], ['c1', 'c4', 'c4', 'c1'], ['c0', 'c1', 'c2', 'c3'], ['c4', 'c0', 'c0', 'c1'], ['c2', 'c2', 'c2', 'c3'], []], teapot: null, sink: 6 }, // seed 90 fair L10/S10/O2/F0/SD5/5
    { id: 'sink-mystery-peak-12-92', kind: 'sink-mystery-peak', depth: 12, cups: [['c2', 'c0', 'c3', 'c3'], [], ['c2', 'c1', 'c1', 'c1'], ['c0', 'c4', 'c0', 'c0'], ['c4', 'c1', 'c3', 'c3'], ['c2', 'c4', 'c2', 'c4'], []], teapot: null, sink: 6 }, // seed 92 fair L10/S10/O6/F0/SD5/5
    { id: 'sink-mystery-peak-12-111', kind: 'sink-mystery-peak', depth: 12, cups: [['c0', 'c1', 'c3', 'c2'], ['c2', 'c2', 'c4', 'c4'], ['c0', 'c0', 'c1', 'c3'], ['c3', 'c1', 'c4', 'c4'], ['c1', 'c3', 'c2', 'c0'], [], []], teapot: null, sink: 6 }, // seed 111 fair L10/S10/O2/F0/SD5/5
    { id: 'sink-mystery-peak-13-0', kind: 'sink-mystery-peak', depth: 13, cups: [['c2', 'c2', 'c0', 'c4'], ['c0', 'c2', 'c1', 'c1'], ['c4', 'c4', 'c2', 'c4'], ['c1', 'c3', 'c1', 'c0'], [], ['c0', 'c3', 'c3', 'c3'], []], teapot: null, sink: 6 }, // seed 0 fair L10/S10/O8/F0/SD5/5
    { id: 'sink-mystery-peak-13-2', kind: 'sink-mystery-peak', depth: 13, cups: [['c1', 'c1', 'c2', 'c4'], ['c2', 'c0', 'c1', 'c0'], ['c3', 'c4', 'c4', 'c4'], ['c2', 'c0', 'c3', 'c3'], ['c1', 'c3', 'c0', 'c2'], [], []], teapot: null, sink: 6 }, // seed 2 fair L10/S10/O6/F0/SD5/5
    { id: 'sink-mystery-peak-13-6', kind: 'sink-mystery-peak', depth: 13, cups: [['c3', 'c3', 'c0', 'c3'], ['c4', 'c1', 'c0', 'c1'], [], ['c4', 'c4', 'c0', 'c1'], ['c2', 'c2', 'c2', 'c0'], ['c1', 'c4', 'c3', 'c2'], []], teapot: null, sink: 6 }, // seed 6 fair L10/S10/O6/F0/SD5/5
    { id: 'sink-mystery-peak-13-51', kind: 'sink-mystery-peak', depth: 13, cups: [['c0', 'c2', 'c2', 'c2'], ['c1', 'c1', 'c4', 'c1'], [], ['c3', 'c3', 'c0', 'c1'], ['c4', 'c3', 'c4', 'c4'], ['c2', 'c0', 'c3', 'c0'], []], teapot: null, sink: 6 }, // seed 51 fair L10/S10/O10/F0/SD5/5
    { id: 'sink-mystery-peak-14-7', kind: 'sink-mystery-peak', depth: 14, cups: [['c4', 'c0', 'c1', 'c2'], ['c0', 'c3', 'c3', 'c1'], ['c1', 'c4', 'c4', 'c3'], ['c0', 'c4', 'c1', 'c2'], [], ['c3', 'c2', 'c2', 'c0'], []], teapot: null, sink: 6 }, // seed 7 fair L10/S10/O10/F0/SD5/5
    { id: 'sink-mystery-peak-14-18', kind: 'sink-mystery-peak', depth: 14, cups: [['c0', 'c0', 'c1', 'c4'], ['c1', 'c2', 'c3', 'c4'], [], ['c2', 'c2', 'c0', 'c1'], ['c4', 'c0', 'c3', 'c3'], ['c1', 'c3', 'c4', 'c2'], []], teapot: null, sink: 6 }, // seed 18 fair L10/S10/O10/F0/SD5/5
    { id: 'sink-mystery-peak-14-23', kind: 'sink-mystery-peak', depth: 14, cups: [['c1', 'c3', 'c0', 'c0'], ['c3', 'c3', 'c1', 'c2'], ['c1', 'c4', 'c2', 'c4'], [], ['c2', 'c2', 'c4', 'c0'], ['c3', 'c0', 'c1', 'c4'], []], teapot: null, sink: 6 }, // seed 23 fair L10/S10/O8/F0/SD5/5
  ],
  'teapot-sink-challenge': [
    { id: 'teapot-sink-challenge-7-121', kind: 'teapot-sink-challenge', depth: 7, cups: [['c2', 'c1', 'c1', 'c3'], ['c1', 'c1', 'c3', 'c2'], [], ['c3', 'c3', 'c0', 'c0'], ['c0', 'c0', 'c2', 'c2'], []], teapot: 0, sink: 5 }, // seed 121 fair L8/S8/O2/F0/SD4/4
    { id: 'teapot-sink-challenge-7-606', kind: 'teapot-sink-challenge', depth: 7, cups: [['c3', 'c0', 'c3', 'c3'], ['c2', 'c2', 'c2', 'c2'], ['c1', 'c1', 'c1', 'c0'], [], ['c0', 'c0', 'c3', 'c1'], []], teapot: 0, sink: 5 }, // seed 606 fair L7/S7/O6/F0/SD4/4
    { id: 'teapot-sink-challenge-7-1074', kind: 'teapot-sink-challenge', depth: 7, cups: [['c1', 'c3', 'c2', 'c2'], ['c0', 'c0', 'c0', 'c0'], ['c1', 'c2', 'c2', 'c3'], ['c1', 'c1', 'c3', 'c3'], [], []], teapot: 0, sink: 5 }, // seed 1074 fair L7/S7/O6/F0/SD4/4
    { id: 'teapot-sink-challenge-7-1170', kind: 'teapot-sink-challenge', depth: 7, cups: [['c0', 'c2', 'c2', 'c3'], ['c1', 'c1', 'c3', 'c3'], [], ['c0', 'c0', 'c1', 'c1'], ['c2', 'c2', 'c3', 'c0'], []], teapot: 0, sink: 5 }, // seed 1170 fair L8/S8/O2/F0/SD4/4
    { id: 'teapot-sink-challenge-8-12', kind: 'teapot-sink-challenge', depth: 8, cups: [['c2', 'c1', 'c2', 'c2'], ['c2', 'c1', 'c1', 'c0'], [], ['c0', 'c3', 'c3', 'c3'], ['c1', 'c3', 'c0', 'c0'], []], teapot: 0, sink: 5 }, // seed 12 fair L8/S8/O1/F0/SD4/4
    { id: 'teapot-sink-challenge-8-21', kind: 'teapot-sink-challenge', depth: 8, cups: [['c3', 'c3', 'c2', 'c0'], ['c1', 'c1', 'c2', 'c2'], [], ['c1', 'c1', 'c2', 'c3'], ['c0', 'c0', 'c0', 'c3'], []], teapot: 0, sink: 5 }, // seed 21 fair L8/S8/O6/F0/SD4/4
    { id: 'teapot-sink-challenge-8-152', kind: 'teapot-sink-challenge', depth: 8, cups: [['c1', 'c1', 'c0', 'c0'], [], ['c1', 'c3', 'c2', 'c2'], ['c3', 'c1', 'c3', 'c3'], ['c0', 'c0', 'c2', 'c2'], []], teapot: 0, sink: 5 }, // seed 152 fair L8/S8/O6/F0/SD4/4
    { id: 'teapot-sink-challenge-8-156', kind: 'teapot-sink-challenge', depth: 8, cups: [['c1', 'c1', 'c0', 'c1'], ['c0', 'c0', 'c1', 'c2'], ['c0', 'c3', 'c3', 'c3'], ['c2', 'c2', 'c2', 'c3'], [], []], teapot: 0, sink: 5 }, // seed 156 fair L8/S8/O6/F0/SD4/4
    { id: 'teapot-sink-challenge-8-165', kind: 'teapot-sink-challenge', depth: 8, cups: [['c0', 'c0', 'c1', 'c1'], [], ['c3', 'c2', 'c1', 'c2'], ['c0', 'c0', 'c2', 'c2'], ['c3', 'c3', 'c3', 'c1'], []], teapot: 0, sink: 5 }, // seed 165 fair L8/S8/O8/F0/SD4/4
    { id: 'teapot-sink-challenge-9-66', kind: 'teapot-sink-challenge', depth: 9, cups: [['c3', 'c3', 'c0', 'c0'], ['c1', 'c2', 'c3', 'c3'], ['c2', 'c0', 'c1', 'c0'], [], ['c1', 'c1', 'c2', 'c2'], []], teapot: 0, sink: 5 }, // seed 66 fair L8/S8/O6/F0/SD4/4
    { id: 'teapot-sink-challenge-9-74', kind: 'teapot-sink-challenge', depth: 9, cups: [['c3', 'c3', 'c0', 'c0'], ['c2', 'c1', 'c2', 'c3'], [], ['c1', 'c1', 'c3', 'c1'], ['c2', 'c2', 'c0', 'c0'], []], teapot: 0, sink: 5 }, // seed 74 fair L8/S8/O6/F0/SD4/4
    { id: 'teapot-sink-challenge-9-90', kind: 'teapot-sink-challenge', depth: 9, cups: [['c0', 'c0', 'c0', 'c3'], ['c2', 'c0', 'c1', 'c1'], ['c3', 'c2', 'c1', 'c1'], ['c3', 'c2', 'c2', 'c3'], [], []], teapot: 0, sink: 5 }, // seed 90 fair L8/S8/O4/F0/SD4/4
    { id: 'teapot-sink-challenge-9-94', kind: 'teapot-sink-challenge', depth: 9, cups: [['c0', 'c1', 'c2', 'c2'], ['c0', 'c3', 'c3', 'c3'], ['c0', 'c0', 'c1', 'c2'], ['c3', 'c2', 'c1', 'c1'], [], []], teapot: 0, sink: 5 }, // seed 94 fair L8/S8/O6/F0/SD4/4
    { id: 'teapot-sink-challenge-9-102', kind: 'teapot-sink-challenge', depth: 9, cups: [['c0', 'c3', 'c3', 'c1'], [], ['c1', 'c0', 'c0', 'c3'], ['c1', 'c3', 'c1', 'c0'], ['c2', 'c2', 'c2', 'c2'], []], teapot: 0, sink: 5 }, // seed 102 fair L7/S7/O4/F0/SD4/4
    { id: 'teapot-sink-challenge-10-14', kind: 'teapot-sink-challenge', depth: 10, cups: [['c2', 'c2', 'c2', 'c3'], ['c0', 'c0', 'c1', 'c2'], ['c1', 'c0', 'c1', 'c0'], [], ['c3', 'c1', 'c3', 'c3'], []], teapot: 0, sink: 5 }, // seed 14 fair L8/S8/O6/F0/SD4/4
    { id: 'teapot-sink-challenge-10-24', kind: 'teapot-sink-challenge', depth: 10, cups: [['c3', 'c3', 'c1', 'c2'], ['c0', 'c1', 'c3', 'c3'], ['c1', 'c2', 'c0', 'c0'], ['c2', 'c2', 'c0', 'c1'], [], []], teapot: 0, sink: 5 }, // seed 24 fair L8/S8/O6/F0/SD4/4
    { id: 'teapot-sink-challenge-10-37', kind: 'teapot-sink-challenge', depth: 10, cups: [['c2', 'c2', 'c0', 'c3'], ['c3', 'c1', 'c1', 'c1'], ['c0', 'c0', 'c3', 'c2'], ['c0', 'c3', 'c2', 'c1'], [], []], teapot: 0, sink: 5 }, // seed 37 fair L8/S8/O6/F0/SD4/4
    { id: 'teapot-sink-challenge-10-63', kind: 'teapot-sink-challenge', depth: 10, cups: [['c1', 'c2', 'c2', 'c1'], [], ['c2', 'c3', 'c3', 'c0'], ['c1', 'c1', 'c3', 'c0'], ['c3', 'c0', 'c0', 'c2'], []], teapot: 0, sink: 5 }, // seed 63 fair L8/S8/O6/F0/SD4/4
  ],
};

/** All bank templates flattened (bank validation tests iterate this). */
export const ALL_SINK_TEMPLATES: SinkTemplate[] = [
  ...SINK_TEMPLATE_BANK['sink-challenge'],
  ...SINK_TEMPLATE_BANK['sink-mystery-peak'],
  ...SINK_TEMPLATE_BANK['teapot-sink-challenge'],
];

/**
 * Instantiate a template against a concrete palette + role bijection.
 * `order`: palette teas serving roles c0..c4 (seeded permutation). Any
 * bijection is a full puzzle isomorphism (sink stays empty, teapot stays
 * mixed-full, color counts preserved), so the discovered depth is
 * preserved exactly.
 */
export function instantiateSinkTemplate(
  tpl: SinkTemplate,
  palette: TeaId[],
  order: TeaId[] = [...palette],
): { cups: TeaId[][]; teapotSlot: number | null; sinkSlot: number } {
  const roleToTea = new Map<SinkTeaRole, TeaId>([
    ['c0', order[0] as TeaId],
    ['c1', order[1] as TeaId],
    ['c2', order[2] as TeaId],
    ['c3', order[3] as TeaId],
    ['c4', order[4] as TeaId],
  ]);
  const cups = tpl.cups.map((cup) => cup.map((role) => roleToTea.get(role) as TeaId));
  return { cups, teapotSlot: tpl.teapot, sinkSlot: tpl.sink };
}
