/**
 * Choice Brew production domain tests (Gauntlet 22).
 *
 * Covers: contract validation, trigger rules, history persistence in
 * snapshots, victory gates, canonical identity, constructive pruning of
 * milestone-advancing moves, Undo/Restart, legacy freeze, malformed
 * fail-closed behavior, and pour parity vs the no-mechanic transition.
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import { clonePuzzleState } from '../src/game/types';
import {
  applyPourState,
  canonicalPuzzleKey,
  canPourState,
  isConstructiveMoveState,
  isPuzzleDeadlockedState,
  isPuzzleWonState,
  listConstructiveActionsState,
  pourCountState,
} from '../src/game/logic/rules';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import {
  advanceChoiceBrewState,
  choiceBrewContractSignature,
  isValidChoiceBrewContract,
  type ChoiceBrewContract,
} from '../src/game/logic/choiceBrew';

const A: TeaId = 'matcha';
const B: TeaId = 'sea_buckthorn';
const C: TeaId = 'karkade';
const D: TeaId = 'milk_oolong';

function constraints(): CupConstraint[] {
  const plain: CupConstraint = { mode: 'normal' };
  return [
    { ...plain },
    { ...plain },
    { ...plain },
    { ...plain },
    { mode: 'normal', capacity: 4, mustEndEmpty: true },
    { ...plain },
  ];
}

function contract(): ChoiceBrewContract {
  return { vesselIndex: 4, allowedTeas: [A, B] };
}

function stateOf(cups: TeaId[][], stage?: 0 | 1) {
  const n = cups.length;
  const nulls = (): null[] => Array.from({ length: n }, () => null);
  return {
    cups: cups.map((c) => [...c]),
    floatingIngredients: nulls(),
    sinkingIngredients: nulls(),
    strainer: { present: false, attachedCupIndex: null, heldTea: null },
    iceSlots: nulls(),
    capacityObstacles: nulls(),
    teaBudSlots: nulls(),
    ...(stage !== undefined ? { choiceBrewState: { stage } } : {}),
  };
}

describe('choice-brew contract validation', () => {
  it('accepts the valid production shape', () => {
    expect(isValidChoiceBrewContract(contract(), constraints())).toBe(true);
  });

  it('rejects missing/extra fields and out-of-range vessels', () => {
    const cc = constraints();
    expect(isValidChoiceBrewContract(undefined, cc)).toBe(false);
    expect(isValidChoiceBrewContract(null, cc)).toBe(false);
    expect(isValidChoiceBrewContract({ vesselIndex: 9, allowedTeas: [A, B] }, cc)).toBe(false);
    expect(isValidChoiceBrewContract({ vesselIndex: 0, allowedTeas: [A, B] }, cc)).toBe(false);
    expect(isValidChoiceBrewContract({ vesselIndex: 5, allowedTeas: [A, B] }, cc)).toBe(false);
  });

  it('rejects invalid pairs (unknown, duplicate, wrong arity)', () => {
    const cc = constraints();
    const badUnknown = { vesselIndex: 4, allowedTeas: [A, 'nope'] } as unknown as ChoiceBrewContract;
    expect(isValidChoiceBrewContract(badUnknown, cc)).toBe(false);
    const badDup = { vesselIndex: 4, allowedTeas: [A, A] } as unknown as ChoiceBrewContract;
    expect(isValidChoiceBrewContract(badDup, cc)).toBe(false);
    const badArity = { vesselIndex: 4, allowedTeas: [A] } as unknown as ChoiceBrewContract;
    expect(isValidChoiceBrewContract(badArity, cc)).toBe(false);
    const badTriple = { vesselIndex: 4, allowedTeas: [A, B, C] } as unknown as ChoiceBrewContract;
    expect(isValidChoiceBrewContract(badTriple, cc)).toBe(false);
  });

  it('rejects non-standalone boards (targets, orders, groups, flask, second must-empty)', () => {
    const base = constraints();
    const withTarget = base.map((c, i) => (i === 0 ? { ...c, targetTeaId: A } : c));
    expect(isValidChoiceBrewContract(contract(), withTarget)).toBe(false);
    const withOrder = base.map((c, i) => (i === 0 ? { ...c, serveOrder: 1 } : c));
    expect(isValidChoiceBrewContract(contract(), withOrder)).toBe(false);
    const withTray = base.map((c, i) => (i === 0 ? { ...c, sharedCapacityGroup: 'tea-tray' as const } : c));
    expect(isValidChoiceBrewContract(contract(), withTray)).toBe(false);
    const withPair = base.map((c, i) => (i === 0 ? { ...c, pairedTeaGroup: 'tea-pair' as const } : c));
    expect(isValidChoiceBrewContract(contract(), withPair)).toBe(false);
    const withFlask = base.map((c, i) => (i === 5 ? { ...c, steepingFlask: true } : c));
    expect(isValidChoiceBrewContract(contract(), withFlask)).toBe(false);
    const twoEmpty = base.map((c, i) => (i === 5 ? { ...c, capacity: 4, mustEndEmpty: true } : c));
    expect(isValidChoiceBrewContract(contract(), twoEmpty)).toBe(false);
  });

  it('unordered pair canonicalizes identically; different pairs stay distinct', () => {
    const k1: ChoiceBrewContract = { vesselIndex: 4, allowedTeas: [A, B] };
    const k2: ChoiceBrewContract = { vesselIndex: 4, allowedTeas: [B, A] };
    expect(choiceBrewContractSignature(k1)).toBe(choiceBrewContractSignature(k2));
    const k3: ChoiceBrewContract = { vesselIndex: 4, allowedTeas: [A, C] };
    expect(choiceBrewContractSignature(k1)).not.toBe(choiceBrewContractSignature(k3));
    const k4: ChoiceBrewContract = { vesselIndex: 4, allowedTeas: [A, B] };
    const k5: ChoiceBrewContract = { vesselIndex: 5, allowedTeas: [A, B] };
    expect(choiceBrewContractSignature(k4)).not.toBe(choiceBrewContractSignature(k5));
  });
});

describe('choice-brew triggers', () => {
  it('full allowed AAAA triggers 0 -> 1', () => {
    const cc = constraints();
    const k = contract();
    const cups: TeaId[][] = [[A, A, A, A], [B, B, B, B], [C, C, C, C], [D, D, D, D], [A, A, A, A], []];
    expect(advanceChoiceBrewState({ stage: 0 }, cups, k, cc)).toEqual({ stage: 1 });
  });

  it('full allowed BBBB triggers 0 -> 1', () => {
    const cc = constraints();
    const k = contract();
    const cups: TeaId[][] = [[A, A, A, A], [B, B, B, B], [C, C, C, C], [D, D, D, D], [B, B, B, B], []];
    expect(advanceChoiceBrewState({ stage: 0 }, cups, k, cc)).toEqual({ stage: 1 });
  });

  it('full wrong tea does not trigger', () => {
    const cc = constraints();
    const k = contract();
    for (const wrong of [C, D]) {
      const cups: TeaId[][] = [[A, A, A, A], [B, B, B, B], [C, C, C, C], [D, D, D, D], [wrong, wrong, wrong, wrong], []];
      expect(advanceChoiceBrewState({ stage: 0 }, cups, k, cc)).toEqual({ stage: 0 });
    }
  });

  it('partial pair tea does not trigger; pair tea in the wrong vessel does not trigger', () => {
    const cc = constraints();
    const k = contract();
    const partial: TeaId[][] = [[A, A, A, A], [B, B, B, B], [C, C, C, C], [D, D, D, D], [A, A], []];
    expect(advanceChoiceBrewState({ stage: 0 }, partial, k, cc)).toEqual({ stage: 0 });
    const wrongVessel: TeaId[][] = [[A, A, A, A], [B, B, B, B], [C, C, C, C], [D, D, D, D], [], [A, A, A, A]];
    expect(advanceChoiceBrewState({ stage: 0 }, wrongVessel, k, cc)).toEqual({ stage: 0 });
  });

  it('stage persists after drain and never regresses in normal play', () => {
    const cc = constraints();
    const k = contract();
    const drained: TeaId[][] = [[A, A, A, A], [A, A, A, A], [C, C, C, C], [D, D, D, D], [], [B, B, B, B]];
    expect(advanceChoiceBrewState({ stage: 1 }, drained, k, cc)).toEqual({ stage: 1 });
    const full: TeaId[][] = [[A, A, A, A], [B, B, B, B], [C, C, C, C], [D, D, D, D], [B, B, B, B], []];
    expect(advanceChoiceBrewState({ stage: 1 }, full, k, cc)).toEqual({ stage: 1 });
  });

  it('advancement happens atomically inside the successful pour transition', () => {
    const cc = constraints();
    const k = contract();
    const cups: TeaId[][] = [
      [C, C, C, B],
      [B, B, B, B],
      [A, A, A, C],
      [A, A, A, C],
      [B, B, B],
      [],
    ];
    const st = stateOf(cups, 0);
    expect(canPourState(st, 0, 4, cc)).toBe(true);
    const res = applyPourState(st, 0, 4, cc, undefined, k);
    expect(res?.state.cups[4]).toEqual([B, B, B, B]);
    expect(res?.state.choiceBrewState).toEqual({ stage: 1 });
    const ctl = applyPourState(stateOf(cups), 0, 4, cc, undefined, undefined);
    expect(ctl?.state.cups).toEqual(res?.state.cups);
    expect(ctl?.transferred).toBe(res?.transferred);
  });

  it('stores no chosenTea: both triggers converge to the same stage', () => {
    const cc = constraints();
    const k = contract();
    const viaA: TeaId[][] = [[A, A, A, A], [B, B, B, B], [C, C, C, C], [D, D, D, D], [A, A, A, A], []];
    const viaB: TeaId[][] = [[A, A, A, A], [B, B, B, B], [C, C, C, C], [D, D, D, D], [B, B, B, B], []];
    expect(advanceChoiceBrewState({ stage: 0 }, viaA, k, cc)).toEqual(
      advanceChoiceBrewState({ stage: 0 }, viaB, k, cc),
    );
    expect(JSON.stringify(contract())).not.toContain('chosen');
  });
});

describe('choice-brew victory', () => {
  const solved: TeaId[][] = [[A, A, A, A], [A, A, A, A], [C, C, C, C], [D, D, D, D], [], []];

  it('final empty + stage0 is not won; final empty + stage1 wins', () => {
    const cc = constraints();
    const k = contract();
    expect(isPuzzleWonState(stateOf(solved), cc, undefined, undefined)).toBe(true);
    expect(isPuzzleWonState(stateOf(solved, 0), cc, undefined, k)).toBe(false);
    expect(isPuzzleWonState(stateOf(solved, 1), cc, undefined, k)).toBe(true);
  });

  it('non-empty brewing vessel is never final, even at stage1', () => {
    const cc = constraints();
    const k = contract();
    const full: TeaId[][] = [[A, A, A, A], [B, B, B, B], [C, C, C, C], [D, D, D, D], [A, A, A, A], []];
    expect(isPuzzleWonState(stateOf(full, 1), cc, undefined, k)).toBe(false);
  });

  it('history without contract never silently wins', () => {
    const cc = constraints();
    expect(isPuzzleWonState(stateOf(solved, 1), cc, undefined, undefined)).toBe(false);
  });

  it('malformed contracts and blend composition fail closed', () => {
    const cc = constraints();
    const bad = { vesselIndex: 0, allowedTeas: [A, B] } as ChoiceBrewContract;
    expect(isPuzzleWonState(stateOf(solved, 1), cc, undefined, bad)).toBe(false);
    expect(isPuzzleWonState(stateOf(solved, 2 as never), cc, undefined, contract())).toBe(false);
  });
});

describe('choice-brew canonical identity', () => {
  it('same cups stage0 != stage1', () => {
    const cc = constraints();
    const k = contract();
    const cups: TeaId[][] = [[A, B, A, B], [B, A, B, A], [C, C, D, D], [D, D, C, C], [], []];
    const k0 = canonicalPuzzleKey(stateOf(cups, 0), cc, k);
    const k1 = canonicalPuzzleKey(stateOf(cups, 1), cc, k);
    expect(k0).not.toBe(k1);
    expect(k0).toContain('||CB:');
    expect(k1).toContain('||CB:');
  });

  it('different pair contracts do not collide', () => {
    const cc = constraints();
    const kAB: ChoiceBrewContract = { vesselIndex: 4, allowedTeas: [A, B] };
    const kAC: ChoiceBrewContract = { vesselIndex: 4, allowedTeas: [A, C] };
    const cups: TeaId[][] = [[A, B, A, B], [B, A, B, A], [C, C, D, D], [D, D, C, C], [], []];
    expect(canonicalPuzzleKey(stateOf(cups, 0), cc, kAB)).not.toBe(
      canonicalPuzzleKey(stateOf(cups, 0), cc, kAC),
    );
  });

  it('unordered pair canonicalizes identically', () => {
    const cc = constraints();
    const kAB: ChoiceBrewContract = { vesselIndex: 4, allowedTeas: [A, B] };
    const kBA: ChoiceBrewContract = { vesselIndex: 4, allowedTeas: [B, A] };
    const cups: TeaId[][] = [[A, B, A, B], [B, A, B, A], [C, C, D, D], [D, D, C, C], [], []];
    expect(canonicalPuzzleKey(stateOf(cups, 0), cc, kAB)).toBe(
      canonicalPuzzleKey(stateOf(cups, 0), cc, kBA),
    );
    expect(canonicalPuzzleKey(stateOf(cups, 1), cc, kAB)).toBe(
      canonicalPuzzleKey(stateOf(cups, 1), cc, kBA),
    );
  });

  it('legacy canonical freeze: no contract + no history is byte-identical', () => {
    const cc = constraints();
    const cups: TeaId[][] = [[A, B, A, B], [B, A, B, A], [C, C, D, D], [D, D, C, C], [], []];
    const st = stateOf(cups);
    expect(canonicalPuzzleKey(st, cc)).toBe(canonicalPuzzleKey(st, cc, undefined));
    expect(canonicalPuzzleKey(st, cc)).not.toContain('CB:');
  });

  it('clone preserves history; absent stays absent', () => {
    const cups: TeaId[][] = [[A], [B], [], [], [], []];
    expect(clonePuzzleState(stateOf(cups, 1)).choiceBrewState).toEqual({ stage: 1 });
    expect(clonePuzzleState(stateOf(cups)).choiceBrewState).toBeUndefined();
  });
});

describe('choice-brew pruning and deadlock', () => {
  it('stage0 full allowed run into the empty brewing vessel is constructive', () => {
    const cc = constraints();
    const k = contract();
    // Ordinary full AAAA -> empty choice vessel: full-group relocation look,
    // but it advances the milestone, so it must stay searchable.
    const cups: TeaId[][] = [[A, A, A, A], [B, C, B, C], [C, B, C, B], [D, D, B, D], [], []];
    const st = stateOf(cups, 0);
    expect(canPourState(st, 0, 4, cc)).toBe(true);
    expect(isConstructiveMoveState(st, 0, 4, cc)).toBe(true);
    const actions = listConstructiveActionsState(st, cc).filter((a) => a.kind === 'pour');
    expect(actions.some((a) => a.kind === 'pour' && a.from === 0 && a.to === 4)).toBe(true);
    void k;
  });

  it('a stage0 board with a milestone move is not deadlocked', () => {
    const cc = constraints();
    const cups: TeaId[][] = [[A, A, A, A], [B, C, B, C], [C, B, C, B], [D, D, B, D], [], []];
    const st = stateOf(cups, 0);
    expect(isPuzzleDeadlockedState(st, cc)).toBe(false);
  });

  it('pour parity: tea transition identical to the no-mechanic transition', () => {
    const cc = constraints();
    const k = contract();
    const cups: TeaId[][] = [
      [C, C, C, B],
      [B, B, B, B],
      [A, A, A, C],
      [A, A, A, C],
      [B, B, B],
      [],
    ];
    const full = applyPourState(stateOf(cups, 0), 0, 4, cc, undefined, k);
    const ctl = applyPourState(stateOf(cups), 0, 4, cc, undefined, undefined);
    expect(full?.state.cups).toEqual(ctl?.state.cups);
    expect(full?.transferred).toBe(ctl?.transferred);
    expect(pourCountState(stateOf(cups, 0), 0, 4, cc)).toBe(pourCountState(stateOf(cups), 0, 4, cc));
  });
});

describe('choice-brew undo and restart', () => {
  function wiredBoard(): { cups: TeaId[][]; cc: CupConstraint[]; k: ChoiceBrewContract } {
    return {
      cups: [
        [C, C, C, B],
        [B, B, B, B],
        [A, A, A, C],
        [A, A, A, C],
        [B, B, B],
        [],
      ],
      cc: constraints(),
      k: contract(),
    };
  }

  it('undo restores stage0; redo restores stage1', () => {
    const { cups, cc, k } = wiredBoard();
    const logic = new TeaSortLogic();
    logic.initFromState(cups, [], cc, undefined, undefined, undefined, undefined, undefined, undefined, undefined, k, 0);
    expect(logic.choiceBrewState).toEqual({ stage: 0 });
    expect(logic.makeMove(0, 4)).not.toBeNull();
    expect(logic.choiceBrewState).toEqual({ stage: 1 });
    logic.undo();
    expect(logic.choiceBrewState).toEqual({ stage: 0 });
    expect(logic.makeMove(0, 4)).not.toBeNull();
    expect(logic.choiceBrewState).toEqual({ stage: 1 });
  });

  it('multi-step undo: stage1 -> two more moves -> undo x3 -> stage0', () => {
    const { cups, cc, k } = wiredBoard();
    const logic = new TeaSortLogic();
    logic.initFromState(cups, [], cc, undefined, undefined, undefined, undefined, undefined, undefined, undefined, k, 0);
    expect(logic.makeMove(0, 4)).not.toBeNull();
    expect(logic.choiceBrewState).toEqual({ stage: 1 });
    expect(logic.makeMove(4, 5)).not.toBeNull();
    expect(logic.choiceBrewState).toEqual({ stage: 1 });
    expect(logic.makeMove(2, 0)).not.toBeNull();
    logic.undo();
    expect(logic.choiceBrewState).toEqual({ stage: 1 });
    logic.undo();
    expect(logic.choiceBrewState).toEqual({ stage: 1 });
    logic.undo();
    expect(logic.choiceBrewState).toEqual({ stage: 0 });
  });

  it('restart (re-init) restores stage0 with the contract intact', () => {
    const { cups, cc, k } = wiredBoard();
    const logic = new TeaSortLogic();
    logic.initFromState(cups, [], cc, undefined, undefined, undefined, undefined, undefined, undefined, undefined, k, 0);
    logic.makeMove(0, 4);
    expect(logic.choiceBrewState).toEqual({ stage: 1 });
    logic.initFromState(cups, [], cc, undefined, undefined, undefined, undefined, undefined, undefined, undefined, k, 0);
    expect(logic.choiceBrewState).toEqual({ stage: 0 });
    expect(logic.choiceBrewContract).toEqual(k);
  });

  it('solver FULL solution replays to a win; CONTROL lacks the history bit', () => {
    // Valid 4-each inventory with a 4-move FULL win:
    // (0->4) AAA, (1->0) BBB, (1->4) A => AAAA stage1, (4->5) drain => solved.
    const cups: TeaId[][] = [
      [B, A, A, A],
      [A, B, B, B],
      [C, C, C, C],
      [D, D, D, D],
      [],
      [],
    ];
    const cc = constraints();
    const k = contract();
    const full = solvePuzzle(cups, { cupConstraints: cc, choiceBrewContract: k, maxVisited: 50_000 });
    expect(full.solvable).toBe(true);
    if (!full.solvable || !full.solution) return;
    const end = applySolutionState(stateOf(cups, 0), full.solution, cc, undefined, k);
    expect(end).not.toBeNull();
    expect(isPuzzleWonState(end as never, cc, undefined, k)).toBe(true);
    const ctl = solvePuzzle(cups, { cupConstraints: cc, maxVisited: 50_000 });
    expect(ctl.solvable).toBe(true);
    expect(JSON.stringify(ctl.solution)).not.toContain('CB:');
  });
});
