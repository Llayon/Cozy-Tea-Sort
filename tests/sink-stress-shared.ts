import { expect } from 'vitest';
import { MAX_CUP_CAPACITY } from '../src/game/types';
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
 * Shared per-seed gate for Gauntlet 3 §74 stress files (one file per
 * config). Every seed verifies: structure, determinism, independent
 * solver success without truncation, real depth == reported depth, hard
 * acceptance, sink invariants, and that the replayed solution never pours
 * out of the sink and ends with a full homogeneous guest cup.
 */
export function checkSinkStressSeed(
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
    expect(cup.length).toBeLessThanOrEqual(MAX_CUP_CAPACITY);
    for (const t of cup) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  for (const c of req.colors.slice(0, req.numColors)) {
    expect(counts.get(c)).toBe(MAX_CUP_CAPACITY);
  }
  expect(isWonState(level.cups, level.cupConstraints)).toBe(false);

  const sinkIdx = level.cupConstraints.findIndex((c) => c.mode === 'sink-only');
  expect(sinkIdx).toBe(level.cups.length - 1);
  expect(level.cups[sinkIdx]).toEqual([]);

  const solved = solvePuzzle(level.cups, { cupConstraints: level.cupConstraints });
  expect(solved.solvable).toBe(true);
  expect(solved.truncated ?? false).toBe(false);
  expect(solved.minMoves).toBe(level.minMoves);
  expect(depthAccepted(level.minMoves, req.phase)).toBe(true);

  const check = validateLevelStructure(level, req);
  expect(check.reasons).toEqual([]);
  expect(check.ok).toBe(true);

  // Replay: solution never sources the sink; guest ends full homogeneous.
  let board = level.cups.map((c) => [...c]);
  for (const step of solved.solution ?? []) {
    expect(step.from).not.toBe(sinkIdx);
    const res = applyPour(board, step.from, step.to, level.cupConstraints);
    expect(res).not.toBeNull();
    board = res?.cups ?? board;
  }
  expect(isWonState(board, level.cupConstraints)).toBe(true);
  expect(board[sinkIdx]).toHaveLength(MAX_CUP_CAPACITY);
  expect(isHomogeneous(board[sinkIdx] ?? [])).toBe(true);
}
