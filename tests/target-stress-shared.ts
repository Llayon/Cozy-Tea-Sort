import { expect } from 'vitest';
import { MAX_CUP_CAPACITY } from '../src/game/types';
import {
  generateLevel,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { solvePuzzle } from '../src/game/logic/solver';
import { depthAccepted } from '../src/game/logic/difficulty';
import { applyPour, isWonState } from '../src/game/logic/rules';

/**
 * Yield to the event loop so the Vitest worker heartbeat keeps flowing
 * during long synchronous BFS batches (prevents spurious
 * `Timeout calling "onTaskUpdate"` unhandled errors).
 */
export function heartbeat(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Shared per-seed gate for Gauntlet 2 §28 stress files (split one file per
 * config so Vitest workers run them in parallel). Every seed verifies:
 * structure, deterministic generation, independent solver success without
 * truncation, real depth == reported depth, hard acceptance, and target
 * end-state semantics on the replayed solution path.
 */
export function checkTargetStressSeed(
  level: ReturnType<typeof generateLevel>,
  req: GenerateRequest,
  seed: string,
): void {
  // Determinism: same seed -> identical puzzle.
  const again = generateLevel(req, seed);
  expect(again.cups).toEqual(level.cups);
  expect(again.hiddenCounts).toEqual(level.hiddenCounts);
  expect(again.cupConstraints).toEqual(level.cupConstraints);
  expect(again.minMoves).toBe(level.minMoves);

  expect(level.cups).toHaveLength(req.numColors + req.emptyCups);
  const counts = new Map<string, number>();
  for (const cup of level.cups) {
    expect(cup.length).toBeLessThanOrEqual(MAX_CUP_CAPACITY);
    for (const t of cup) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  for (const c of req.colors.slice(0, req.numColors)) {
    expect(counts.get(c)).toBe(MAX_CUP_CAPACITY);
  }
  expect(isWonState(level.cups, level.cupConstraints)).toBe(false);

  // Solver independently confirms the REAL depth with target goal-state.
  const solved = solvePuzzle(level.cups, { cupConstraints: level.cupConstraints });
  expect(solved.solvable).toBe(true);
  expect(solved.truncated ?? false).toBe(false);
  expect(solved.minMoves).toBe(level.minMoves);
  expect(depthAccepted(level.minMoves, req.phase)).toBe(true);

  const check = validateLevelStructure(level, req);
  expect(check.reasons).toEqual([]);
  expect(check.ok).toBe(true);

  // Target end-state semantics on the replayed solution path.
  let board = level.cups.map((c) => [...c]);
  for (const step of solved.solution ?? []) {
    const res = applyPour(board, step.from, step.to, level.cupConstraints);
    expect(res).not.toBeNull();
    board = res?.cups ?? board;
  }
  level.cupConstraints.forEach((c, i) => {
    if (c.targetTeaId !== undefined) {
      expect(board[i]).toHaveLength(MAX_CUP_CAPACITY);
      expect((board[i] ?? []).every((l) => l === c.targetTeaId)).toBe(true);
    }
    if (c.mode === 'source-only') {
      expect(board[i]).toHaveLength(0);
    }
  });
}
