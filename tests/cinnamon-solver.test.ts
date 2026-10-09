/**
 * Gauntlet 11 §§147-149 — cinnamon solver fixtures.
 *
 * §147 hand fixture: deterministic mixed active host at slot 3 (len-2,
 * blocked effective 2/2 initially) whose optimal line does a partial
 * manipulation (3->2 leaves one, stick stays), then empties to unlock
 * (3->4 removes), later refills the same vessel to 4 (EXPANDED_USE +
 * FOURTH_SLOT + L3B repurpose) and wins — exact minMoves pinned.
 * §148 L3A-or-L3B trace pin + §149 plain control (minMoves both + delta,
 * no pass requirement) + shared 0-1 BFS cost-1.
 */
import { describe, expect, it } from 'vitest';
import {
  emptyFloatingIngredients,
  type CapacityObstacleSlot,
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
import { analyzeCinnamonParticipation } from '../src/game/logic/generator';

const N: CupConstraint = { mode: 'normal' };

const M: TeaId = 'matcha';
const K: TeaId = 'karkade';
const L: TeaId = 'lavender';

// §147 hand fixture (compact 3-color, 5 vessels; cinnamon host at slot 3).
// Optimal 7-pour line: elsewhere, partial 3->2 (lavender, stick stays),
// empty 3->4 (matcha, unlock), work elsewhere, then refill host to 4/4
// karkade (expanded + fourth-slot + final repurpose) and win.
const FIXTURE_CUPS: TeaId[][] = [
  [M, K, M, M],
  [L, K, K, K],
  [L, L],
  [M, L],
  [],
];
const FIXTURE_CONS: CupConstraint[] = [N, N, N, N, N];
const FIXTURE_OBS: CapacityObstacleSlot[] = [null, null, null, 'cinnamon', null];
const CINNAMON_HOST = 3;

describe('§147 hand fixture: mixed active host at slot 3 → partial → unlock → ≥3 → win', () => {
  it('starts as a deterministic mixed len-2 active host, blocked 2/2, not won', () => {
    const host = FIXTURE_CUPS[CINNAMON_HOST] as TeaId[];
    expect(FIXTURE_CUPS).toHaveLength(5);
    expect(host).toHaveLength(2);
    expect(host[0]).not.toBe(host[1]);
    expect(FIXTURE_OBS[CINNAMON_HOST]).toBe('cinnamon');
    expect(FIXTURE_OBS.filter((s) => s !== null)).toHaveLength(1);
    expect(
      isPuzzleWonState(
        { cups: FIXTURE_CUPS, floatingIngredients: emptyFloatingIngredients(5), capacityObstacles: [...FIXTURE_OBS] },
        FIXTURE_CONS,
      ),
    ).toBe(false);
  });

  it('optimal minMoves is exactly 7 with unlock, expanded use, cleared obstacle and win (L2)', () => {
    const solved = solvePuzzle(FIXTURE_CUPS, {
      maxVisited: 120_000,
      cupConstraints: FIXTURE_CONS,
      capacityObstacles: [...FIXTURE_OBS],
    });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated ?? false).toBe(false);
    expect(solved.minMoves).toBe(7);
    const solution = (solved.solution ?? []) as SolverAction[];
    expect(solution).toHaveLength(7);
    expect(solution.every((s) => s.kind === 'pour')).toBe(true);
    const part = analyzeCinnamonParticipation(FIXTURE_CUPS, [...FIXTURE_OBS], CINNAMON_HOST, solution, FIXTURE_CONS);
    expect(part.unlocks).toBeGreaterThanOrEqual(1);
    expect(part.firstUnlockDepth).toBe(2);
    expect(part.expandedUses).toBeGreaterThanOrEqual(1);
    expect(part.firstExpandedUseDepth).toBe(5);
    expect(part.maxPostUnlockOccupancy).toBeGreaterThanOrEqual(3);
    expect(part.finalObstacleCleared).toBe(true);
    expect(part.win).toBe(true);
    const fin = applySolutionState(
      { cups: FIXTURE_CUPS, floatingIngredients: emptyFloatingIngredients(5), capacityObstacles: [...FIXTURE_OBS] },
      solution,
      FIXTURE_CONS,
    );
    expect(fin).not.toBe(null);
    expect(isPuzzleWonState(fin as never, FIXTURE_CONS)).toBe(true);
    expect((fin?.capacityObstacles ?? []).every((s) => s === null)).toBe(true);
    expect((fin?.cups[CINNAMON_HOST] ?? [])).toHaveLength(4);
  });

  it('replay: partial keeps stick, empty unlocks, later the same vessel reaches 4', () => {
    const solved = solvePuzzle(FIXTURE_CUPS, {
      cupConstraints: FIXTURE_CONS,
      capacityObstacles: [...FIXTURE_OBS],
    });
    const solution = (solved.solution ?? []) as Array<{ kind: string; from: number; to: number }>;
    let cups = FIXTURE_CUPS.map((c) => [...c]);
    let obs = [...FIXTURE_OBS];
    const occ: number[] = [(cups[CINNAMON_HOST] as TeaId[]).length];
    for (let i = 0; i < solution.length; i++) {
      const step = solution[i] as { kind: string; from: number; to: number };
      const res = applyPourState(
        { cups, floatingIngredients: emptyFloatingIngredients(cups.length), capacityObstacles: [...obs] },
        step.from,
        step.to,
        FIXTURE_CONS,
      );
      expect(res).not.toBe(null);
      if (i === 1) {
        // Partial 3->2: leaves [matcha], stick stays.
        expect(step.from).toBe(3);
        expect(res?.state.cups[3]).toEqual([M]);
        expect(res?.state.capacityObstacles[3]).toBe('cinnamon');
        expect(res?.capacityObstacleRemoved).toBe(undefined);
      }
      if (i === 2) {
        // Empty 3->4: removes the stick atomically.
        expect(step.from).toBe(3);
        expect(res?.state.cups[3]).toEqual([]);
        expect(res?.state.capacityObstacles[3]).toBe(null);
        expect(res?.capacityObstacleRemoved).toBe('cinnamon');
      }
      cups = (res?.state.cups ?? cups) as TeaId[][];
      obs = [...(res?.state.capacityObstacles ?? obs)];
      occ.push((cups[CINNAMON_HOST] as TeaId[]).length);
      cups.forEach((cup) => expect(cup.length).toBeLessThanOrEqual(4));
    }
    // 2 → 2 → 1 → 0 → 1 → 1 → 4 → 4 across the 7 moves.
    expect(occ).toEqual([2, 2, 1, 0, 1, 1, 4, 4]);
    expect(Math.max(...occ)).toBe(4);
    expect(cups[CINNAMON_HOST]).toEqual([K, K, K, K]);
  });

  it('replays through TeaSortLogic to a win with the obstacle cleared', () => {
    const solved = solvePuzzle(FIXTURE_CUPS, {
      cupConstraints: FIXTURE_CONS,
      capacityObstacles: [...FIXTURE_OBS],
    });
    const logic = new TeaSortLogic(
      FIXTURE_CUPS.map((c) => [...c]),
      [0, 0, 0, 0, 0],
      FIXTURE_CONS,
      undefined,
      undefined,
      undefined,
      undefined,
      [...FIXTURE_OBS],
    );
    for (const m of solved.solution ?? []) {
      if (m.kind !== 'pour') continue;
      const res = logic.makeMove(m.from, m.to);
      expect(res).not.toBe(null);
    }
    expect(logic.isWon()).toBe(true);
    expect(logic.capacityObstacles.every((s) => s === null)).toBe(true);
    expect(logic.cups[CINNAMON_HOST]?.layers).toEqual([K, K, K, K]);
    // Exact undo restores the active host.
    expect(logic.undo()).not.toBe(null);
    expect(logic.isWon()).toBe(false);
  });
});

describe('§148 L3A-or-L3B trace pin (offline curation truth, no runtime gate)', () => {
  it('fixture optimal trace is L3B (final 4/4 repurpose); L3A buffer-cycle absent here', () => {
    const solved = solvePuzzle(FIXTURE_CUPS, {
      cupConstraints: FIXTURE_CONS,
      capacityObstacles: [...FIXTURE_OBS],
    });
    const part = analyzeCinnamonParticipation(
      FIXTURE_CUPS,
      [...FIXTURE_OBS],
      CINNAMON_HOST,
      (solved.solution ?? []) as SolverAction[],
      FIXTURE_CONS,
    );
    const isL3B = part.finalRepurpose === true;
    const isL3A = part.expandedDrains >= 1;
    // L3A-or-L3B holds (here via L3B, matching the bank nature: ~18 L3B, 0 L3A).
    expect(isL3A || isL3B).toBe(true);
    expect(isL3B).toBe(true);
    expect(part.fourthSlotUses).toBeGreaterThanOrEqual(1);
    expect(part.firstFourthSlotDepth).toBe(5);
    expect(isL3A).toBe(false);
    expect(part.expandedDrains).toBe(0);
  });
});

describe('§149 plain control: same tea without the stick (minMoves both + delta, no pass requirement)', () => {
  it('plain control solves in exactly 6 (delta cinnamon-plain = +1)', () => {
    const withStick = solvePuzzle(FIXTURE_CUPS, {
      maxVisited: 120_000,
      cupConstraints: FIXTURE_CONS,
      capacityObstacles: [...FIXTURE_OBS],
    });
    const plain = solvePuzzle(FIXTURE_CUPS, {
      maxVisited: 120_000,
      cupConstraints: FIXTURE_CONS,
    });
    expect(withStick.solvable).toBe(true);
    expect(plain.solvable).toBe(true);
    expect(withStick.truncated ?? false).toBe(false);
    expect(plain.truncated ?? false).toBe(false);
    expect(withStick.minMoves).toBe(7);
    expect(plain.minMoves).toBe(6);
    expect((withStick.minMoves as number) - (plain.minMoves as number)).toBe(1);
    // No pass requirement: delta is reported, never a production gate.
    // (Runtime finalizeCandidate never solves a plain control.)
  });

  it('deadlocked board stays unsolvable non-truncated (solver distinguishes)', () => {
    const locked: TeaId[][] = [[M, M, M, M], [K, K, K, K]];
    const cons: CupConstraint[] = [N, N];
    const r = solvePuzzle(locked, {
      maxVisited: 120_000,
      cupConstraints: cons,
      capacityObstacles: [null, 'cinnamon'],
    });
    expect(r.solvable).toBe(false);
    expect(r.truncated ?? false).toBe(false);
  });
});

describe('shared single 0-1 BFS: cost 1 per pour', () => {
  it('pour costs 1 (place 0, release 1) and the fixture line costs exactly minMoves', () => {
    expect(puzzleActionCost({ kind: 'pour', from: 0, to: 1 })).toBe(1);
    expect(puzzleActionCost({ kind: 'place-strainer', to: 0 })).toBe(0);
    expect(puzzleActionCost({ kind: 'release-strainer', to: 0 })).toBe(1);
    const solved = solvePuzzle(FIXTURE_CUPS, {
      cupConstraints: FIXTURE_CONS,
      capacityObstacles: [...FIXTURE_OBS],
    });
    const solution = (solved.solution ?? []) as SolverAction[];
    const total = solution.reduce((sum, a) => sum + puzzleActionCost(a), 0);
    expect(total).toBe(solved.minMoves);
    expect(total).toBe(solution.length);
  });

  it('re-solves are deterministic (same minMoves, same first move, same visit count)', () => {
    const a = solvePuzzle(FIXTURE_CUPS, {
      cupConstraints: FIXTURE_CONS,
      capacityObstacles: [...FIXTURE_OBS],
    });
    const b = solvePuzzle(FIXTURE_CUPS, {
      cupConstraints: FIXTURE_CONS,
      capacityObstacles: [...FIXTURE_OBS],
    });
    expect(b.minMoves).toBe(a.minMoves);
    expect(b.visitedStates).toBe(a.visitedStates);
    expect(JSON.stringify(b.solution)).toBe(JSON.stringify(a.solution));
  });
});
