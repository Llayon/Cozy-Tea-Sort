/**
 * G30-C — BREW SEQUENCE direct history witnesses (research-only).
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import {
  applyPourState,
  canonicalPuzzleKey,
  canPourState,
  isPuzzleWonState,
  pourCountState,
} from '../src/game/logic/rules';
import { solvePuzzle, applySolutionState } from '../src/game/logic/solver';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import {
  advanceBrewMilestoneState,
  brewContractSignature,
  isValidBrewMilestoneContract,
  type BrewMilestoneContract,
} from '../src/game/logic/brewMilestone';
import { G30_MILESTONE_INDEX, g30Constraints } from '../scripts/dev/g30-milestone-lib';

const A: TeaId = 'matcha';
const B: TeaId = 'sea_buckthorn';
const C: TeaId = 'karkade';

function cons(): CupConstraint[] {
  return g30Constraints();
}
function contract(): BrewMilestoneContract {
  return { kind: 'brew-sequence', vesselIndex: G30_MILESTONE_INDEX, firstTea: A, secondTea: B };
}
function stateOf(cups: TeaId[][], stage?: number) {
  const n = cups.length;
  return {
    cups: cups.map((c) => [...c]),
    floatingIngredients: Array.from({ length: n }, () => null),
    sinkingIngredients: Array.from({ length: n }, () => null),
    strainer: { present: false, attachedCupIndex: null, heldTea: null },
    iceSlots: Array.from({ length: n }, () => null),
    capacityObstacles: Array.from({ length: n }, () => null),
    teaBudSlots: Array.from({ length: n }, () => null),
    ...(stage !== undefined ? { brewMilestone: { stage } } : {}),
  };
}

describe('G30-C brew-sequence direct witnesses', () => {
  it('01 AAAA at stage0 advances to 1', () => {
    const cc = cons();
    const k = contract();
    expect(isValidBrewMilestoneContract(k, cc)).toBe(true);
    const cups: TeaId[][] = [[A, A, A, A], [B, B, B, B], [C, C, C, C], [C, C, C, C], [A, A, A, A], []];
    expect(advanceBrewMilestoneState({ stage: 0 }, cups, k, cc)?.stage).toBe(1);
  });
  it('02 BBBB at stage0 stays 0 (wrong order)', () => {
    const cc = cons();
    const k = contract();
    const cups: TeaId[][] = [[A, A, A, A], [B, B, B, B], [C, C, C, C], [C, C, C, C], [B, B, B, B], []];
    expect(advanceBrewMilestoneState({ stage: 0 }, cups, k, cc)?.stage).toBe(0);
  });
  it('03 drain A persists stage1', () => {
    const cc = cons();
    const k = contract();
    const cups: TeaId[][] = [[A, A, A, A], [A, A, A, A], [C, C, C, C], [C, C, C, C], [A, A, A, A], []];
    const st = stateOf(cups, 1);
    expect(canPourState(st, 4, 5, cc)).toBe(true);
    const res = applyPourState(st, 4, 5, cc, undefined, k);
    expect(res?.state.brewMilestone?.stage).toBe(1);
  });
  it('04 BBBB at stage1 advances to 2', () => {
    const cc = cons();
    const k = contract();
    const cups: TeaId[][] = [[A, A, A, A], [A, A, A, A], [C, C, C, C], [C, C, C, C], [B, B, B, B], []];
    expect(advanceBrewMilestoneState({ stage: 1 }, cups, k, cc)?.stage).toBe(2);
  });
  it('05 AAAA at stage1 stays 1 (no retrigger)', () => {
    const cc = cons();
    const k = contract();
    const cups: TeaId[][] = [[B, B, B, B], [B, B, B, B], [C, C, C, C], [C, C, C, C], [A, A, A, A], []];
    expect(advanceBrewMilestoneState({ stage: 1 }, cups, k, cc)?.stage).toBe(1);
  });
  it('06 stage2 persists when empty', () => {
    const cc = cons();
    const k = contract();
    const cups: TeaId[][] = [[A, A, A, A], [A, A, A, A], [C, C, C, C], [C, C, C, C], [], []];
    // Advance helper on empty special at stage2 stays 2.
    expect(advanceBrewMilestoneState({ stage: 2 }, cups, k, cc)?.stage).toBe(2);
  });
  it('07 final stage1 is not win', () => {
    const cc = cons();
    const k = contract();
    const solved: TeaId[][] = [[A, A, A, A], [A, A, A, A], [C, C, C, C], [C, C, C, C], [], []];
    expect(isPuzzleWonState(stateOf(solved, 1), cc, undefined, k)).toBe(false);
  });
  it('08 final stage2 is win', () => {
    const cc = cons();
    const k = contract();
    const solved: TeaId[][] = [[A, A, A, A], [A, A, A, A], [C, C, C, C], [C, C, C, C], [], []];
    expect(isPuzzleWonState(stateOf(solved, 2), cc, undefined, k)).toBe(true);
  });
  it('09 Undo B milestone restores stage1', () => {
    const cc = cons();
    const k = contract();
    // Craft: stage1 with milestone [B,B,B] + source B on top -> pour forms BBBB stage2.
    const logic = new TeaSortLogic();
    logic.initFromState(
      [[A, A, A, B], [B, B, B, B], [C, C, C, A], [C, C, C, A], [B, B, B], []],
      [], cc, undefined, undefined, undefined, undefined, undefined, undefined, undefined, k, 1,
    );
    expect(logic.brewMilestone?.stage).toBe(1);
    const mv = logic.makeMove(0, 4);
    expect(mv).not.toBeNull();
    expect(logic.brewMilestone?.stage).toBe(2);
    logic.undo();
    expect(logic.brewMilestone?.stage).toBe(1);
  });
  it('10 Undo A milestone restores stage0', () => {
    const cc = cons();
    const k = contract();
    const logic = new TeaSortLogic();
    logic.initFromState(
      [[C, C, C, A], [A, A, A, A], [B, B, B, C], [B, B, B, C], [A, A, A], []],
      [], cc, undefined, undefined, undefined, undefined, undefined, undefined, undefined, k, 0,
    );
    logic.makeMove(0, 4);
    expect(logic.brewMilestone?.stage).toBe(1);
    logic.undo();
    expect(logic.brewMilestone?.stage).toBe(0);
  });
  it('11 canonical stages 0/1/2 distinct', () => {
    const cc = cons();
    const k = contract();
    const cups: TeaId[][] = [[A, B, A, B], [B, A, B, A], [A, A, B, B], [B, B, A, A], [], []];
    const k0 = canonicalPuzzleKey(stateOf(cups, 0), cc, k);
    const k1 = canonicalPuzzleKey(stateOf(cups, 1), cc, k);
    const k2 = canonicalPuzzleKey(stateOf(cups, 2), cc, k);
    expect(new Set([k0, k1, k2]).size).toBe(3);
  });
  it('12 ordered identity A->B != B->A', () => {
    const k1: BrewMilestoneContract = { kind: 'brew-sequence', vesselIndex: 4, firstTea: A, secondTea: B };
    const k2: BrewMilestoneContract = { kind: 'brew-sequence', vesselIndex: 4, firstTea: B, secondTea: A };
    expect(brewContractSignature(k1)).not.toBe(brewContractSignature(k2));
  });
  it('13 tea transition parity', () => {
    const cc = cons();
    const k = contract();
    const cups: TeaId[][] = [[C, C, C, A], [A, A, A, A], [B, B, B, C], [B, B, B, C], [A, A, A], []];
    const rF = applyPourState(stateOf(cups, 0), 0, 4, cc, undefined, k);
    const rC = applyPourState(stateOf(cups), 0, 4, cc, undefined, undefined);
    expect(rF?.state.cups).toEqual(rC?.state.cups);
  });
  it('14 transfer count parity', () => {
    const cc = cons();
    const cups: TeaId[][] = [[C, C, C, A], [A, A, A, A], [B, B, B, C], [B, B, B, C], [A, A, A], []];
    expect(pourCountState(stateOf(cups, 0), 0, 4, cc)).toBe(pourCountState(stateOf(cups), 0, 4, cc));
  });
  it('15 source/destination parity', () => {
    const cc = cons();
    const cups: TeaId[][] = [[C, C, C, A], [A, A, A, A], [B, B, B, C], [B, B, B, C], [A, A, A], []];
    expect(canPourState(stateOf(cups, 0), 0, 4, cc)).toBe(canPourState(stateOf(cups), 0, 4, cc));
  });
  it('16 malformed A==B rejected', () => {
    const cc = cons();
    const bad = { kind: 'brew-sequence', vesselIndex: 4, firstTea: A, secondTea: A } as unknown as BrewMilestoneContract;
    expect(isValidBrewMilestoneContract(bad, cc)).toBe(false);
  });
  it('17 malformed vessel rejected + never wins', () => {
    const cc = cons();
    const bad = { kind: 'brew-sequence', vesselIndex: 5, firstTea: A, secondTea: B } as BrewMilestoneContract;
    expect(isValidBrewMilestoneContract(bad, cc)).toBe(false);
    const solved: TeaId[][] = [[A, A, A, A], [A, A, A, A], [C, C, C, C], [C, C, C, C], [], []];
    expect(isPuzzleWonState(stateOf(solved, 2), cc, undefined, bad)).toBe(false);
  });
  it('18 mustEndEmpty enforced at stage2', () => {
    const cc = cons();
    const k = contract();
    const cups: TeaId[][] = [[A, A, A, A], [B, B, B, B], [C, C, C, C], [C, C, C, C], [B, B, B, B], []];
    expect(isPuzzleWonState(stateOf(cups, 2), cc, undefined, k)).toBe(false);
  });
  it('19 legacy freeze', () => {
    const cc = cons();
    const cups: TeaId[][] = [[A, B, A, B], [B, A, B, A], [A, A, B, B], [B, B, A, A], [], []];
    expect(canonicalPuzzleKey(stateOf(cups), cc)).not.toContain('BRW:');
  });
  it('20 solver smoke', () => {
    const cc = cons();
    const k = contract();
    const cups: TeaId[][] = [[A, B, A, B], [B, A, B, A], [A, A, B, B], [B, B, A, A], [], []];
    const ctl = solvePuzzle(cups, { cupConstraints: cc, maxVisited: 30_000 });
    const full = solvePuzzle(cups, { cupConstraints: cc, maxVisited: 30_000, brewContract: k });
    expect(typeof ctl.visitedStates).toBe('number');
    expect(typeof full.visitedStates).toBe('number');
  });
  it('21 full replay wins when solvable', () => {
    const cc = cons();
    const k = contract();
    const cups: TeaId[][] = [[C, C, C, A], [A, A, A, A], [B, B, B, C], [B, B, B, C], [A, A, A], []];
    const full = solvePuzzle(cups, { cupConstraints: cc, brewContract: k, maxVisited: 50_000 });
    if (!full.solvable || !full.solution) return;
    const end = applySolutionState(stateOf(cups, 0), full.solution, cc, undefined, k);
    expect(end).not.toBeNull();
    expect(isPuzzleWonState(end as never, cc, undefined, k)).toBe(true);
  });
  it('22 Restart stage0', () => {
    const cc = cons();
    const k = contract();
    const logic = new TeaSortLogic();
    const init: TeaId[][] = [[C, C, C, A], [A, A, A, A], [B, B, B, C], [B, B, B, C], [A, A, A], []];
    logic.initFromState(init, [], cc, undefined, undefined, undefined, undefined, undefined, undefined, undefined, k, 0);
    logic.makeMove(0, 4);
    expect(logic.brewMilestone?.stage).toBe(1);
    logic.initFromState(init, [], cc, undefined, undefined, undefined, undefined, undefined, undefined, undefined, k, 0);
    expect(logic.brewMilestone?.stage).toBe(0);
  });
});
