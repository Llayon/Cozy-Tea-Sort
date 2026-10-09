/**
 * Gauntlet 10 §§110-111 — thermos solver fixtures.
 *
 * §110 hand fixture: deterministic mixed partial thermos (len3, mixed,
 * top-once) whose optimal line RECEIVES to 5/5, later DRAINS below 5,
 * empties fully and wins — exact minMoves pinned. §111 cap4 control: the
 * same tea with a cap4/mustEndEmpty vessel stays solvable but strictly
 * longer (delta +1); a deadlocked board stays unsolvable non-truncated.
 * Shared single 0-1 BFS: pour costs exactly 1, the fixture solution is
 * pour-only with length == minMoves, and re-solves are deterministic.
 */
import { describe, expect, it } from 'vitest';
import {
  THERMOS_CAPACITY,
  emptyFloatingIngredients,
  isThermosCupConstraint,
  type CupConstraint,
  type SolverAction,
  type TeaId,
} from '../src/game/types';
import {
  applyPourState,
  isPuzzleWonState,
  puzzleActionCost,
} from '../src/game/logic/rules';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import { analyzeThermosParticipation } from '../src/game/logic/generator';

const N: CupConstraint = { mode: 'normal' };
const TH: CupConstraint = { mode: 'normal', capacity: 5, mustEndEmpty: true };
const CAP4E: CupConstraint = { mode: 'normal', capacity: 4, mustEndEmpty: true };

const M: TeaId = 'matcha';
const K: TeaId = 'karkade';
const L: TeaId = 'lavender';

// §110 hand fixture (compact 3-color, 5 vessels; thermos last).
// Found offline: optimal 6-pour line parks karkade into the thermos to
// 5/5 (move 1), works elsewhere, then drains 3+2 out and wins.
const FIXTURE_CUPS: TeaId[][] = [
  [L, L, L, K],
  [K, L, M, K],
  [M],
  [],
  [M, M, K],
];
const FIXTURE_CONS: CupConstraint[] = [N, N, N, N, TH];
const THERMOS = 4;

describe('§110 hand fixture: mixed partial thermos → 5/5 → drain → empty → win', () => {
  it('starts as a deterministic mixed T3 thermos (len3, mixed, top-once)', () => {
    const t = FIXTURE_CUPS[THERMOS] as TeaId[];
    expect(FIXTURE_CUPS).toHaveLength(5);
    expect(t).toHaveLength(3);
    expect(new Set(t).size).toBeGreaterThan(1);
    const top = t[t.length - 1] as TeaId;
    expect(t.filter((x) => x === top)).toHaveLength(1);
    expect(isThermosCupConstraint(FIXTURE_CONS[THERMOS])).toBe(true);
    expect(isPuzzleWonState(
      { cups: FIXTURE_CUPS, floatingIngredients: emptyFloatingIngredients(5) },
      FIXTURE_CONS,
    )).toBe(false);
  });

  it('optimal minMoves is exactly 6 with fifth-slot use, drain, empty and win (L2)', () => {
    const solved = solvePuzzle(FIXTURE_CUPS, {
      maxVisited: 120_000,
      cupConstraints: FIXTURE_CONS,
    });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated ?? false).toBe(false);
    expect(solved.minMoves).toBe(6);
    const solution = (solved.solution ?? []) as SolverAction[];
    expect(solution).toHaveLength(6);
    expect(solution.every((s) => s.kind === 'pour')).toBe(true);
    const part = analyzeThermosParticipation(FIXTURE_CUPS, THERMOS, solution, FIXTURE_CONS);
    expect(part.fifthSlotUses).toBeGreaterThanOrEqual(1);
    expect(part.drainsAfterFifth).toBeGreaterThanOrEqual(1);
    expect(part.firstFifthSlotDepth).toBe(1);
    expect(part.firstDrainAfterFifthDepth).toBe(4);
    expect(part.finalThermosEmpty).toBe(true);
    expect(part.win).toBe(true);
    const fin = applySolutionState(
      { cups: FIXTURE_CUPS, floatingIngredients: emptyFloatingIngredients(5) },
      solution,
      FIXTURE_CONS,
    );
    expect(fin).not.toBe(null);
    expect(isPuzzleWonState(fin as never, FIXTURE_CONS)).toBe(true);
    expect((fin?.cups[THERMOS] ?? [M])).toEqual([]);
  });

  it('replay reaches exactly 5/5 on move 1, drains on move 4, empties on move 5', () => {
    const solved = solvePuzzle(FIXTURE_CUPS, { cupConstraints: FIXTURE_CONS });
    const solution = (solved.solution ?? []) as Array<{ kind: string; from: number; to: number }>;
    let board = FIXTURE_CUPS.map((c) => [...c]);
    let maxOcc = (board[THERMOS] as TeaId[]).length;
    const occ: number[] = [maxOcc];
    for (const step of solution) {
      const res = applyPourState(
        { cups: board, floatingIngredients: emptyFloatingIngredients(board.length) },
        step.from,
        step.to,
        FIXTURE_CONS,
      );
      expect(res).not.toBe(null);
      board = (res?.state.cups ?? board) as TeaId[][];
      board.forEach((cup, i) => {
        expect(cup.length).toBeLessThanOrEqual(i === THERMOS ? THERMOS_CAPACITY : 4);
      });
      maxOcc = Math.max(maxOcc, (board[THERMOS] as TeaId[]).length);
      occ.push((board[THERMOS] as TeaId[]).length);
    }
    expect(maxOcc).toBe(5);
    // 3 → 4 → 5 → 5 → 5 → 2 → 0 across the 6 moves.
    expect(occ).toEqual([3, 4, 5, 5, 5, 2, 0]);
    expect(board[THERMOS]).toEqual([]);
  });

  it('replays through TeaSortLogic to a win with the thermos empty', () => {
    const solved = solvePuzzle(FIXTURE_CUPS, { cupConstraints: FIXTURE_CONS });
    const logic = new TeaSortLogic(
      FIXTURE_CUPS.map((c) => [...c]),
      [0, 0, 0, 0, 0],
      FIXTURE_CONS,
    );
    for (const m of solved.solution ?? []) {
      if (m.kind !== 'pour') continue;
      expect(logic.makeMove(m.from, m.to)).not.toBe(null);
    }
    expect(logic.isWon()).toBe(true);
    expect(logic.cups[THERMOS]?.layers).toEqual([]);
  });
});

describe('§111 cap4 control: same tea under cap4 stays solvable but strictly longer', () => {
  const CONS4: CupConstraint[] = [N, N, N, N, CAP4E];

  it('cap4 control solves in exactly 7 (delta +1) and never reaches 5', () => {
    const capped = solvePuzzle(FIXTURE_CUPS, {
      maxVisited: 120_000,
      cupConstraints: CONS4,
    });
    expect(capped.solvable).toBe(true);
    expect(capped.truncated ?? false).toBe(false);
    expect(capped.minMoves).toBe(7);
    expect((capped.minMoves as number) - 6).toBe(1);
    let board = FIXTURE_CUPS.map((c) => [...c]);
    for (const step of capped.solution ?? []) {
      if (step.kind !== 'pour') continue;
      const res = applyPourState(
        { cups: board, floatingIngredients: emptyFloatingIngredients(board.length) },
        step.from,
        step.to,
        CONS4,
      );
      expect(res).not.toBe(null);
      board = (res?.state.cups ?? board) as TeaId[][];
      board.forEach((cup) => expect(cup.length).toBeLessThanOrEqual(4));
    }
    expect(board[THERMOS]).toEqual([]);
  });

  it('unsolvable boards report unsolvable (never truncated): solver distinguishes', () => {
    // Both vessels full with no empty to work in: no legal pour exists.
    const locked: TeaId[][] = [[M, M, M, M], [K, K, K, K]];
    const cons: CupConstraint[] = [TH, N];
    const r = solvePuzzle(locked, { maxVisited: 120_000, cupConstraints: cons });
    expect(r.solvable).toBe(false);
    expect(r.truncated ?? false).toBe(false);
  });
});

describe('shared single 0-1 BFS: cost 1 per pour', () => {
  it('pour costs 1 (place 0, release 1) and the fixture line costs exactly minMoves', () => {
    expect(puzzleActionCost({ kind: 'pour', from: 0, to: 1 })).toBe(1);
    expect(puzzleActionCost({ kind: 'place-strainer', to: 0 })).toBe(0);
    expect(puzzleActionCost({ kind: 'release-strainer', to: 0 })).toBe(1);
    const solved = solvePuzzle(FIXTURE_CUPS, { cupConstraints: FIXTURE_CONS });
    const solution = (solved.solution ?? []) as SolverAction[];
    const total = solution.reduce((sum, a) => sum + puzzleActionCost(a), 0);
    expect(total).toBe(solved.minMoves);
    expect(total).toBe(solution.length);
  });

  it('re-solves are deterministic (same minMoves, same first move, same visit count)', () => {
    const a = solvePuzzle(FIXTURE_CUPS, { cupConstraints: FIXTURE_CONS });
    const b = solvePuzzle(FIXTURE_CUPS, { cupConstraints: FIXTURE_CONS });
    expect(b.minMoves).toBe(a.minMoves);
    expect(b.visitedStates).toBe(a.visitedStates);
    expect(JSON.stringify(b.solution)).toBe(JSON.stringify(a.solution));
  });
});
