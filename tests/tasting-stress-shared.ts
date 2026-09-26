import { expect } from 'vitest';
import { TEA_UNITS_PER_COLOR, cupCapacity } from '../src/game/types';
import {
  generateLevel,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { solvePuzzle } from '../src/game/logic/solver';
import { depthAccepted } from '../src/game/logic/difficulty';
import { applyPour, isHomogeneous, isWonState } from '../src/game/logic/rules';

export { heartbeat } from './target-stress-shared';

/**
 * Shared per-seed gate for Gauntlet 4 §54 stress files (one file per
 * config). Every seed verifies: structure, determinism, independent
 * solver success without truncation, real depth == reported depth, hard
 * acceptance, tasting invariants, participation (enters AND exits, final
 * empty), and per-vessel capacity respected on the replay.
 */
export function checkTastingStressSeed(
  level: ReturnType<typeof generateLevel>,
  req: GenerateRequest,
  seed: string,
): void {
  const again = generateLevel(req, seed);
  expect(again.cups).toEqual(level.cups);
  expect(again.hiddenCounts).toEqual(level.hiddenCounts);
  expect(again.cupConstraints).toEqual(level.cupConstraints);
  expect(again.minMoves).toBe(level.minMoves);

  expect(level.cups).toHaveLength(req.numColors + req.emptyCups);
  const counts = new Map<string, number>();
  for (const cup of level.cups) {
    for (const t of cup) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  for (const c of req.colors.slice(0, req.numColors)) {
    expect(counts.get(c)).toBe(TEA_UNITS_PER_COLOR);
  }
  expect(isWonState(level.cups, level.cupConstraints)).toBe(false);

  const tastingIdx = level.cupConstraints.findIndex(
    (c) => c.mode === 'normal' && c.capacity === 2 && c.mustEndEmpty === true,
  );
  expect(tastingIdx).toBe(level.cups.length - 1);
  expect(level.cups[tastingIdx]).toEqual([]);
  expect(cupCapacity(level.cupConstraints[tastingIdx])).toBe(2);

  const solved = solvePuzzle(level.cups, { cupConstraints: level.cupConstraints });
  expect(solved.solvable).toBe(true);
  expect(solved.truncated ?? false).toBe(false);
  expect(solved.minMoves).toBe(level.minMoves);
  expect(depthAccepted(level.minMoves, req.phase)).toBe(true);

  const check = validateLevelStructure(level, req);
  expect(check.reasons).toEqual([]);
  expect(check.ok).toBe(true);

  // Participation + capacity on the replayed solution path.
  const solution = solved.solution ?? [];
  expect(solution.some((m) => m.to === tastingIdx)).toBe(true);
  const firstIn = solution.findIndex((m) => m.to === tastingIdx);
  expect(solution.slice(firstIn + 1).some((m) => m.from === tastingIdx)).toBe(true);
  let board = level.cups.map((c) => [...c]);
  for (const step of solution) {
    const res = applyPour(board, step.from, step.to, level.cupConstraints);
    expect(res).not.toBeNull();
    board = res?.cups ?? board;
    board.forEach((cup, i) => {
      expect(cup.length).toBeLessThanOrEqual(cupCapacity(level.cupConstraints[i]));
    });
  }
  expect(isWonState(board, level.cupConstraints)).toBe(true);
  expect(board[tastingIdx]).toEqual([]);
  expect(isHomogeneous(board[tastingIdx] ?? [])).toBe(true);
}
