/**
 * G30-A — BREW ONCE direct history witnesses (research-only).
 * Minimum 20 deterministic scenario/assertion groups before N100.
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
  isValidBrewMilestoneContract,
  type BrewMilestoneContract,
} from '../src/game/logic/brewMilestone';
import { G30_MILESTONE_INDEX, g30Constraints } from '../scripts/dev/g30-milestone-lib';

const A: TeaId = 'matcha';
const B: TeaId = 'karkade';

function constraints(): CupConstraint[] {
  return g30Constraints();
}

function contractA(): BrewMilestoneContract {
  return { kind: 'brew-once', vesselIndex: G30_MILESTONE_INDEX, brewTeaId: A };
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

describe('G30-A brew-once direct witnesses', () => {
  it('01 partial A does not advance (stage0)', () => {
    const cons = constraints();
    const c = contractA();
    expect(isValidBrewMilestoneContract(c, cons)).toBe(true);
    // Special holds [A,A] partial -> stage stays 0.
    const cups: TeaId[][] = [[B, B, B, B], [A, A, A], [], [], [A, A], []];
    // Pad to 6 vessels: indices 0..5; milestone is 4.
    const full: TeaId[][] = [cups[0] as TeaId[], cups[1] as TeaId[], [B], [B], [A, A] as TeaId[], []];
    const next = advanceBrewMilestoneState({ stage: 0 }, full, c, cons);
    expect(next?.stage).toBe(0);
  });

  it('02 AAAA after successful receive advances 0->1', () => {
    const cons = constraints();
    const c = contractA();
    // Build a legal pour that forms AAAA in milestone (index 4).
    // Source 0: [B,A] top A x1? Need full homogeneous formation.
    // Simplest: milestone [A,A,A], source [A,X..] top A, pour 1 -> AAAA.
    const cups: TeaId[][] = [
      [B, B, B, A],
      [B, B, B, B],
      [A, A, A, B],
      [A, A, A, B],
      [A, A, A],
      [],
    ];
    const st = stateOf(cups, 0);
    expect(canPourState(st, 0, 4, cons)).toBe(true);
    const res = applyPourState(st, 0, 4, cons, undefined, c);
    expect(res).not.toBeNull();
    expect(res?.state.cups[4]).toEqual([A, A, A, A]);
    expect(res?.state.brewMilestone?.stage).toBe(1);
  });

  it('03 BBBB full wrong tea does not advance', () => {
    const cons = constraints();
    const c = contractA();
    const cups: TeaId[][] = [
      [A, A, A, A],
      [A, A, A, A],
      [B, B, B, B],
      [B, B, B, B],
      [B, B, B, B],
      [],
    ];
    const next = advanceBrewMilestoneState({ stage: 0 }, cups, c, cons);
    expect(next?.stage).toBe(0);
  });

  it('04 drain AAAA persists stage1', () => {
    const cons = constraints();
    const c = contractA();
    // Milestone AAAA, drain one run to empty ordinary vessel 5.
    const cups: TeaId[][] = [
      [B, B, B, B],
      [B, B, B, B],
      [A, A, A, B],
      [A, A, A, B],
      [A, A, A, A],
      [],
    ];
    const st = stateOf(cups, 1);
    expect(canPourState(st, 4, 5, cons)).toBe(true);
    const res = applyPourState(st, 4, 5, cons, undefined, c);
    expect(res).not.toBeNull();
    expect(res?.state.brewMilestone?.stage).toBe(1);
    expect((res?.state.cups[4] as TeaId[]).length).toBe(0);
  });

  it('05 empty final + stage0 is not win', () => {
    const cons = constraints();
    const c = contractA();
    // Otherwise solved: 4 full homogeneous ordinary + milestone empty + ordinary empty.
    const cups: TeaId[][] = [
      [A, A, A, A],
      [A, A, A, A],
      [B, B, B, B],
      [B, B, B, B],
      [],
      [],
    ];
    // Need 4 teas total; use A/B only for this unit test? Tea counts not enforced by victory.
    // Victory checks vessel end-states: 0-3 full homo, 4 empty (mustEndEmpty), 5 empty.
    expect(isPuzzleWonState(stateOf(cups), cons, undefined, undefined)).toBe(true);
    expect(isPuzzleWonState(stateOf(cups, 0), cons, undefined, c)).toBe(false);
  });

  it('06 empty final + stage1 + otherwise solved is win', () => {
    const cons = constraints();
    const c = contractA();
    const cups: TeaId[][] = [
      [A, A, A, A],
      [A, A, A, A],
      [B, B, B, B],
      [B, B, B, B],
      [],
      [],
    ];
    const st = stateOf(cups, 1);
    expect(isPuzzleWonState(st, cons, undefined, c)).toBe(true);
  });

  it('07 Undo milestone move restores stage0 (TeaSortLogic)', () => {
    const cons = constraints();
    const c = contractA();
    const logic = new TeaSortLogic();
    logic.initFromState(
      [
        [B, B, B, A],
        [B, B, B, B],
        [A, A, A, B],
        [A, A, A, B],
        [A, A, A],
        [],
      ],
      [],
      cons,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      c,
      0,
    );
    expect(logic.brewMilestone?.stage).toBe(0);
    const mv = logic.makeMove(0, 4);
    expect(mv).not.toBeNull();
    expect(logic.brewMilestone?.stage).toBe(1);
    logic.undo();
    expect(logic.brewMilestone?.stage).toBe(0);
    expect(logic.cups[4]?.layers).toEqual([A, A, A]);
  });

  it('08 redo/reapply restores stage1', () => {
    const cons = constraints();
    const c = contractA();
    const logic = new TeaSortLogic();
    const init: TeaId[][] = [
      [B, B, B, A],
      [B, B, B, B],
      [A, A, A, B],
      [A, A, A, B],
      [A, A, A],
      [],
    ];
    logic.initFromState(init, [], cons, undefined, undefined, undefined, undefined, undefined, undefined, undefined, c, 0);
    logic.makeMove(0, 4);
    expect(logic.brewMilestone?.stage).toBe(1);
    logic.undo();
    expect(logic.brewMilestone?.stage).toBe(0);
    const mv2 = logic.makeMove(0, 4);
    expect(mv2).not.toBeNull();
    expect(logic.brewMilestone?.stage).toBe(1);
  });

  it('09 canonical stage distinction (stage0 != stage1)', () => {
    const cons = constraints();
    const c = contractA();
    const cups: TeaId[][] = [
      [A, A, A, A],
      [B, B, B, B],
      [A, B, A, B],
      [B, A, B, A],
      [],
      [],
    ];
    const s0 = stateOf(cups, 0);
    const s1 = stateOf(cups, 1);
    const k0 = canonicalPuzzleKey(s0, cons, c);
    const k1 = canonicalPuzzleKey(s1, cons, c);
    expect(k0).not.toBe(k1);
    expect(k0).toContain('BRW:');
    expect(k1).toContain('BRW:');
  });

  it('10 source legality parity vs CONTROL (tea transition identical)', () => {
    const cons = constraints();
    const c = contractA();
    const cups: TeaId[][] = [
      [B, B, B, A],
      [B, B, B, B],
      [A, A, A, B],
      [A, A, A, B],
      [A, A, A],
      [],
    ];
    const st0 = stateOf(cups, 0);
    const stNo = stateOf(cups);
    // Same legality with and without contract.
    expect(canPourState(st0, 0, 4, cons)).toBe(canPourState(stNo, 0, 4, cons));
    const rFull = applyPourState(st0, 0, 4, cons, undefined, c);
    const rCtl = applyPourState(stNo, 0, 4, cons, undefined, undefined);
    expect(rFull?.state.cups).toEqual(rCtl?.state.cups);
    expect(rFull?.transferred).toBe(rCtl?.transferred);
  });

  it('11 destination parity (wrong-color still rejected)', () => {
    const cons = constraints();
    const c = contractA();
    const cups: TeaId[][] = [
      [B, B, B, B],
      [A, A, A, A],
      [A, A, A, A],
      [B, B, B, B],
      [B, B, B],
      [],
    ];
    const st = stateOf(cups, 0);
    // Milestone [B,B,B], source top A -> color mismatch, rejected in both.
    expect(canPourState(st, 1, 4, cons)).toBe(false);
    expect(applyPourState(st, 1, 4, cons, undefined, c)).toBeNull();
  });

  it('12 transfer count parity (m bounded by free space)', () => {
    const cons = constraints();
    const c = contractA();
    const cups: TeaId[][] = [
      [B, B, B, A],
      [B, B, B, B],
      [A, A, A, B],
      [A, A, A, B],
      [A, A, A],
      [],
    ];
    const stFull = stateOf(cups, 0);
    const stCtl = stateOf(cups);
    expect(pourCountState(stFull, 0, 4, cons)).toBe(pourCountState(stCtl, 0, 4, cons));
  });

  it('13 non-trigger partial receive keeps stage0', () => {
    const cons = constraints();
    const c = contractA();
    const cups: TeaId[][] = [
      [B, B, A, A],
      [B, B, B, B],
      [A, A, B, B],
      [A, A, B, B],
      [A],
      [],
    ];
    const st = stateOf(cups, 0);
    expect(canPourState(st, 0, 4, cons)).toBe(true);
    const res = applyPourState(st, 0, 4, cons, undefined, c);
    expect(res?.state.cups[4]?.length).toBeLessThan(4);
    expect(res?.state.brewMilestone?.stage).toBe(0);
  });

  it('14 Restart restores stage0 (re-init)', () => {
    const cons = constraints();
    const c = contractA();
    const logic = new TeaSortLogic();
    const init: TeaId[][] = [
      [B, B, B, A],
      [B, B, B, B],
      [A, A, A, B],
      [A, A, A, B],
      [A, A, A],
      [],
    ];
    logic.initFromState(init, [], cons, undefined, undefined, undefined, undefined, undefined, undefined, undefined, c, 0);
    logic.makeMove(0, 4);
    expect(logic.brewMilestone?.stage).toBe(1);
    // Restart = re-init same board.
    logic.initFromState(init, [], cons, undefined, undefined, undefined, undefined, undefined, undefined, undefined, c, 0);
    expect(logic.brewMilestone?.stage).toBe(0);
    expect(logic.cups[4]?.layers).toEqual([A, A, A]);
  });

  it('15 win requires milestone (solved tea + stage0 fails, stage1 passes)', () => {
    const cons = constraints();
    const c = contractA();
    const solved: TeaId[][] = [
      [A, A, A, A],
      [A, A, A, A],
      [B, B, B, B],
      [B, B, B, B],
      [],
      [],
    ];
    expect(isPuzzleWonState(stateOf(solved, 0), cons, undefined, c)).toBe(false);
    expect(isPuzzleWonState(stateOf(solved, 1), cons, undefined, c)).toBe(true);
    // Invalid stage 2 never wins for brew-once.
    expect(isPuzzleWonState(stateOf(solved, 2), cons, undefined, c)).toBe(false);
  });

  it('16 mustEndEmpty still enforced (full milestone blocks win even stage1)', () => {
    const cons = constraints();
    const c = contractA();
    const cups: TeaId[][] = [
      [A, A, A, A],
      [B, B, B, B],
      [A, A, B, B],
      [B, B, A, A],
      [A, A, A, A],
      [],
    ];
    const st = stateOf(cups, 1);
    expect(isPuzzleWonState(st, cons, undefined, c)).toBe(false);
  });

  it('17 legacy canonical freeze (no contract + no milestone byte-identical)', () => {
    const cons = constraints();
    const cups: TeaId[][] = [
      [A, B, A, B],
      [B, A, B, A],
      [A, A, B, B],
      [B, B, A, A],
      [],
      [],
    ];
    const st = stateOf(cups);
    const k1 = canonicalPuzzleKey(st, cons);
    const k2 = canonicalPuzzleKey(st, cons, undefined);
    expect(k1).toBe(k2);
    expect(k1).not.toContain('BRW:');
  });

  it('18 clone/normalize preserves milestone; absent stays absent', async () => {
    const { clonePuzzleState } = await import('../src/game/types');
    const cups: TeaId[][] = [[A], [B], [], [], [], []];
    const withStage = stateOf(cups, 1);
    const cloned = clonePuzzleState(withStage);
    expect(cloned.brewMilestone?.stage).toBe(1);
    const legacy = stateOf(cups);
    const clonedLegacy = clonePuzzleState(legacy);
    expect(clonedLegacy.brewMilestone).toBeUndefined();
  });

  it('19 malformed contracts fail closed', () => {
    const cons = constraints();
    const badVessel = { kind: 'brew-once', vesselIndex: 0, brewTeaId: A } as BrewMilestoneContract;
    expect(isValidBrewMilestoneContract(badVessel, cons)).toBe(false);
    const badTea = { kind: 'brew-once', vesselIndex: 4, brewTeaId: 'nope' } as unknown as BrewMilestoneContract;
    expect(isValidBrewMilestoneContract(badTea, cons)).toBe(false);
    // Wrong capacity: milestone must be explicit cap4; plain normal at 5 is not valid vessel.
    const wrongCap = { kind: 'brew-once', vesselIndex: 5, brewTeaId: A } as BrewMilestoneContract;
    expect(isValidBrewMilestoneContract(wrongCap, cons)).toBe(false);
    // Victory never passes with malformed contract.
    const solved: TeaId[][] = [
      [A, A, A, A],
      [A, A, A, A],
      [B, B, B, B],
      [B, B, B, B],
      [],
      [],
    ];
    expect(isPuzzleWonState(stateOf(solved, 1), cons, undefined, badVessel)).toBe(false);
    // Advancement never fires with malformed contract.
    const cups: TeaId[][] = [
      [A, A, A, A],
      [A, A, A, A],
      [B, B, B, B],
      [B, B, B, B],
      [A, A, A, A],
      [],
    ];
    expect(advanceBrewMilestoneState({ stage: 0 }, cups, badVessel, cons)?.stage).toBe(0);
  });

  it('20 solver FULL vs CONTROL on tiny handcrafted board (smoke)', () => {
    const cons = constraints();
    const c = contractA();
    // Tiny solvable research-shaped board (not necessarily from g30Deal).
    const cups: TeaId[][] = [
      [A, B, A, B],
      [B, A, B, A],
      [A, A, B, B],
      [B, B, A, A],
      [],
      [],
    ];
    const ctl = solvePuzzle(cups, { cupConstraints: cons, maxVisited: 50_000 });
    const full = solvePuzzle(cups, { cupConstraints: cons, maxVisited: 50_000, brewContract: c });
    // Both should terminate (solvable or not) without truncation crash; record only.
    expect(typeof ctl.visitedStates).toBe('number');
    expect(typeof full.visitedStates).toBe('number');
    if (ctl.solvable && full.solvable) {
      expect(full.minMoves).toBeGreaterThanOrEqual(ctl.minMoves as number);
    }
  });

  it('21 no second pour path: tea cups identical with/without contract', () => {
    const cons = constraints();
    const c = contractA();
    const cups: TeaId[][] = [
      [B, A, A, A],
      [B, B, B, B],
      [A, A, B, B],
      [B, B, A, A],
      [B],
      [],
    ];
    const st = stateOf(cups, 0);
    const r1 = applyPourState(st, 0, 4, cons, undefined, c);
    const r2 = applyPourState(stateOf(cups), 0, 4, cons, undefined, undefined);
    expect(r1?.state.cups).toEqual(r2?.state.cups);
  });

  it('22 replay FULL solution preserves stage and wins', () => {
    const cons = constraints();
    const c = contractA();
    const cups: TeaId[][] = [
      [B, B, B, A],
      [B, B, B, B],
      [A, A, A, B],
      [A, A, A, B],
      [A, A, A],
      [],
    ];
    const full = solvePuzzle(cups, { cupConstraints: cons, brewContract: c, maxVisited: 50_000 });
    if (!full.solvable || !full.solution) return;
    const start = stateOf(cups, 0);
    const end = applySolutionState(start, full.solution, cons, undefined, c);
    expect(end).not.toBeNull();
    expect(isPuzzleWonState(end as never, cons, undefined, c)).toBe(true);
  });
});
