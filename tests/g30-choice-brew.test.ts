/**
 * G30-B — CHOICE BREW direct history witnesses (research-only).
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
  return { kind: 'choice-brew', vesselIndex: G30_MILESTONE_INDEX, allowedTeas: [A, B] };
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

describe('G30-B choice-brew direct witnesses', () => {
  it('01 AAAA allowed triggers stage1', () => {
    const cc = cons();
    const k = contract();
    expect(isValidBrewMilestoneContract(k, cc)).toBe(true);
    const cups: TeaId[][] = [[A, A, A, A], [B, B, B, B], [C, C, C, C], [C, C, C, C], [A, A, A, A], []];
    expect(advanceBrewMilestoneState({ stage: 0 }, cups, k, cc)?.stage).toBe(1);
  });
  it('02 BBBB allowed triggers stage1', () => {
    const cc = cons();
    const k = contract();
    const cups: TeaId[][] = [[A, A, A, A], [B, B, B, B], [C, C, C, C], [C, C, C, C], [B, B, B, B], []];
    expect(advanceBrewMilestoneState({ stage: 0 }, cups, k, cc)?.stage).toBe(1);
  });
  it('03 CCCC off-pair stays stage0', () => {
    const cc = cons();
    const k = contract();
    const cups: TeaId[][] = [[A, A, A, A], [B, B, B, B], [C, C, C, C], [C, C, C, C], [C, C, C, C], []];
    expect(advanceBrewMilestoneState({ stage: 0 }, cups, k, cc)?.stage).toBe(0);
  });
  it('04 partial allowed stays stage0', () => {
    const cc = cons();
    const k = contract();
    const cups: TeaId[][] = [[A, A, A, A], [B, B, B, B], [C, C, C, C], [C, C, C, C], [A, A], []];
    expect(advanceBrewMilestoneState({ stage: 0 }, cups, k, cc)?.stage).toBe(0);
  });
  it('05 drain after trigger persists', () => {
    const cc = cons();
    const k = contract();
    const cups: TeaId[][] = [[A, A, A, A], [A, A, A, A], [C, C, C, C], [C, C, C, C], [B, B, B, B], []];
    const st = stateOf(cups, 1);
    expect(canPourState(st, 4, 5, cc)).toBe(true);
    const res = applyPourState(st, 4, 5, cc, undefined, k);
    expect(res?.state.brewMilestone?.stage).toBe(1);
  });
  it('06 no chosen tea stored (victory only cares stage==1)', () => {
    const cc = cons();
    const kA: BrewMilestoneContract = { kind: 'choice-brew', vesselIndex: 4, allowedTeas: [A, B] };
    const solved: TeaId[][] = [[A, A, A, A], [A, A, A, A], [C, C, C, C], [C, C, C, C], [], []];
    // Trigger via A or via B both lead to same stage1 win; contract stores pair, not choice.
    expect(isPuzzleWonState(stateOf(solved, 1), cc, undefined, kA)).toBe(true);
    expect(JSON.stringify(kA)).not.toContain('chosen');
  });
  it('07 Undo restores stage0', () => {
    const cc = cons();
    const k = contract();
    const logic = new TeaSortLogic();
    logic.initFromState(
      [[C, C, C, B], [B, B, B, B], [A, A, A, C], [A, A, A, C], [B, B, B], []],
      [], cc, undefined, undefined, undefined, undefined, undefined, undefined, undefined, k, 0,
    );
    const before = logic.brewMilestone?.stage;
    expect(before).toBe(0);
    const mv = logic.makeMove(0, 4);
    expect(mv).not.toBeNull();
    expect(logic.brewMilestone?.stage).toBe(1);
    logic.undo();
    expect(logic.brewMilestone?.stage).toBe(0);
  });
  it('08 canonical stage distinction', () => {
    const cc = cons();
    const k = contract();
    const cups: TeaId[][] = [[A, B, A, B], [B, A, B, A], [A, A, B, B], [B, B, A, A], [], []];
    expect(canonicalPuzzleKey(stateOf(cups, 0), cc, k)).not.toBe(canonicalPuzzleKey(stateOf(cups, 1), cc, k));
  });
  it('09 static pair canonical identity (unordered normalization)', () => {
    const k1: BrewMilestoneContract = { kind: 'choice-brew', vesselIndex: 4, allowedTeas: [A, B] };
    const k2: BrewMilestoneContract = { kind: 'choice-brew', vesselIndex: 4, allowedTeas: [B, A] };
    expect(brewContractSignature(k1)).toBe(brewContractSignature(k2));
  });
  it('10 different pairs distinct', () => {
    const k1: BrewMilestoneContract = { kind: 'choice-brew', vesselIndex: 4, allowedTeas: [A, B] };
    const k2: BrewMilestoneContract = { kind: 'choice-brew', vesselIndex: 4, allowedTeas: [A, C] };
    expect(brewContractSignature(k1)).not.toBe(brewContractSignature(k2));
  });
  it('11 tea transition parity vs CONTROL', () => {
    const cc = cons();
    const k = contract();
    const cups: TeaId[][] = [[C, C, C, B], [B, B, B, B], [A, A, A, C], [A, A, A, C], [B, B, B], []];
    const rF = applyPourState(stateOf(cups, 0), 0, 4, cc, undefined, k);
    const rC = applyPourState(stateOf(cups), 0, 4, cc, undefined, undefined);
    expect(rF?.state.cups).toEqual(rC?.state.cups);
    expect(rF?.transferred).toBe(rC?.transferred);
  });
  it('12 transfer count parity', () => {
    const cc = cons();
    const k = contract();
    void k;
    const cups: TeaId[][] = [[C, C, C, B], [B, B, B, B], [A, A, A, C], [A, A, A, C], [B, B, B], []];
    expect(pourCountState(stateOf(cups, 0), 0, 4, cc)).toBe(pourCountState(stateOf(cups), 0, 4, cc));
  });
  it('13 source behavior parity (sink-only N/A, ordinary sources identical)', () => {
    const cc = cons();
    const cups: TeaId[][] = [[C, C, C, B], [B, B, B, B], [A, A, A, C], [A, A, A, C], [B, B, B], []];
    expect(canPourState(stateOf(cups, 0), 0, 4, cc)).toBe(canPourState(stateOf(cups), 0, 4, cc));
  });
  it('14 destination parity (mismatch rejected)', () => {
    const cc = cons();
    const cups: TeaId[][] = [[A, A, A, A], [A, A, A, A], [C, C, C, C], [C, C, C, C], [B, B, B], []];
    // Source top A into [B,B,B] mismatch.
    expect(canPourState(stateOf(cups, 0), 0, 4, cc)).toBe(false);
  });
  it('15 win requires milestone', () => {
    const cc = cons();
    const k = contract();
    const solved: TeaId[][] = [[A, A, A, A], [A, A, A, A], [C, C, C, C], [C, C, C, C], [], []];
    expect(isPuzzleWonState(stateOf(solved, 0), cc, undefined, k)).toBe(false);
    expect(isPuzzleWonState(stateOf(solved, 1), cc, undefined, k)).toBe(true);
  });
  it('16 mustEndEmpty enforced', () => {
    const cc = cons();
    const k = contract();
    const cups: TeaId[][] = [[A, A, A, A], [B, B, B, B], [C, C, C, C], [C, C, C, C], [A, A, A, A], []];
    expect(isPuzzleWonState(stateOf(cups, 1), cc, undefined, k)).toBe(false);
  });
  it('17 legacy freeze', () => {
    const cc = cons();
    const cups: TeaId[][] = [[A, B, A, B], [B, A, B, A], [A, A, B, B], [B, B, A, A], [], []];
    const k = canonicalPuzzleKey(stateOf(cups), cc);
    expect(k).not.toContain('BRW:');
  });
  it('18 malformed A==B rejected', () => {
    const cc = cons();
    const bad = { kind: 'choice-brew', vesselIndex: 4, allowedTeas: [A, A] } as unknown as BrewMilestoneContract;
    expect(isValidBrewMilestoneContract(bad, cc)).toBe(false);
  });
  it('19 malformed vessel/capacity rejected', () => {
    const cc = cons();
    const bad = { kind: 'choice-brew', vesselIndex: 5, allowedTeas: [A, B] } as BrewMilestoneContract;
    expect(isValidBrewMilestoneContract(bad, cc)).toBe(false);
  });
  it('20 solver smoke FULL vs CONTROL', () => {
    const cc = cons();
    const k = contract();
    const cups: TeaId[][] = [[A, B, A, B], [B, A, B, A], [A, A, B, B], [B, B, A, A], [], []];
    const ctl = solvePuzzle(cups, { cupConstraints: cc, maxVisited: 30_000 });
    const full = solvePuzzle(cups, { cupConstraints: cc, maxVisited: 30_000, brewContract: k });
    expect(typeof ctl.visitedStates).toBe('number');
    expect(typeof full.visitedStates).toBe('number');
  });
  it('21 replay FULL wins when solvable', () => {
    const cc = cons();
    const k = contract();
    const cups: TeaId[][] = [[C, C, C, B], [B, B, B, B], [A, A, A, C], [A, A, A, C], [B, B, B], []];
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
    const init: TeaId[][] = [[C, C, C, B], [B, B, B, B], [A, A, A, C], [A, A, A, C], [B, B, B], []];
    logic.initFromState(init, [], cc, undefined, undefined, undefined, undefined, undefined, undefined, undefined, k, 0);
    logic.makeMove(0, 4);
    expect(logic.brewMilestone?.stage).toBe(1);
    logic.initFromState(init, [], cc, undefined, undefined, undefined, undefined, undefined, undefined, undefined, k, 0);
    expect(logic.brewMilestone?.stage).toBe(0);
  });
});
