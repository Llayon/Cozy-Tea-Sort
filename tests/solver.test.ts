import { describe, expect, it } from 'vitest';
import { TeaId } from '../src/game/types';
import { applySolution, solvePuzzle } from '../src/game/logic/solver';
import { isWonState } from '../src/game/logic/rules';

describe('solver', () => {
  it('already solved board has depth 0', () => {
    const res = solvePuzzle([
      ['matcha', 'matcha', 'matcha', 'matcha'],
      ['karkade', 'karkade', 'karkade', 'karkade'],
      [],
    ]);
    expect(res.solvable).toBe(true);
    expect(res.minMoves).toBe(0);
    expect(res.solution).toEqual([]);
  });

  it('simple 1-move puzzle', () => {
    const board: TeaId[][] = [
      ['matcha', 'matcha', 'matcha'],
      ['matcha'],
      [],
    ];
    const res = solvePuzzle(board);
    expect(res.solvable).toBe(true);
    expect(res.minMoves).toBe(1);
    expect(res.solution).toHaveLength(1);
  });

  it('multi-step puzzle reports minimum depth and a replayable path', () => {
    const board: TeaId[][] = [
      ['matcha', 'karkade', 'matcha', 'karkade'],
      ['karkade', 'matcha', 'karkade', 'matcha'],
      [],
      [],
    ];
    const res = solvePuzzle(board);
    expect(res.solvable).toBe(true);
    expect(res.minMoves).toBeGreaterThan(1);
    expect(res.minMoves).toBeDefined();
    expect(res.solution).toHaveLength(res.minMoves as number);
    // The returned path must actually solve the board.
    const finalBoard = applySolution(board, res.solution ?? []);
    expect(finalBoard).not.toBeNull();
    expect(isWonState(finalBoard ?? [])).toBe(true);
  });

  it('known impossible position is unsolvable', () => {
    // No empty cup and every top blocked by a mismatch -> no legal moves.
    const board: TeaId[][] = [
      ['matcha', 'matcha', 'matcha', 'karkade'],
      ['karkade', 'karkade', 'karkade', 'matcha'],
    ];
    const res = solvePuzzle(board);
    expect(res.solvable).toBe(false);
    expect(res.minMoves).toBeUndefined();
  });

  it('does not mutate its input', () => {
    const board: TeaId[][] = [
      ['matcha', 'karkade'],
      ['sea_buckthorn', 'karkade'],
      [],
    ];
    const snapshot = board.map((c) => [...c]);
    solvePuzzle(board);
    expect(board).toEqual(snapshot);
  });

  it('handles the maximum supported puzzle (5 colors, 7 cups, cap 4)', () => {
    const board: TeaId[][] = [
      ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'],
      ['lavender', 'matcha', 'sea_buckthorn', 'karkade'],
      ['milk_oolong', 'lavender', 'matcha', 'sea_buckthorn'],
      ['karkade', 'milk_oolong', 'lavender', 'matcha'],
      ['sea_buckthorn', 'karkade', 'milk_oolong', 'lavender'],
      [],
      [],
    ];
    const res = solvePuzzle(board, { maxVisited: 200_000 });
    // Either verdict is acceptable without a reference solution, but the
    // solver must terminate with a visited budget report.
    expect(res.visitedStates).toBeGreaterThan(0);
    if (res.solvable) {
      expect(res.minMoves).toBeGreaterThan(0);
      const finalBoard = applySolution(board, res.solution ?? []);
      expect(isWonState(finalBoard ?? [])).toBe(true);
    }
  });

  it('respects the visit budget via truncated flag', () => {
    const board: TeaId[][] = [
      ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'],
      ['lavender', 'matcha', 'sea_buckthorn', 'karkade'],
      ['milk_oolong', 'lavender', 'matcha', 'sea_buckthorn'],
      ['karkade', 'milk_oolong', 'lavender', 'matcha'],
      ['sea_buckthorn', 'karkade', 'milk_oolong', 'lavender'],
      [],
      [],
    ];
    const res = solvePuzzle(board, { maxVisited: 5 });
    expect(res.truncated).toBe(true);
  });
});
