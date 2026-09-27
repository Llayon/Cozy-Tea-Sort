import { expect } from 'vitest';
import { TEA_UNITS_PER_COLOR } from '../src/game/types';
import {
  generateLevel,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { solvePuzzle } from '../src/game/logic/solver';
import { depthAccepted } from '../src/game/logic/difficulty';
import { applyPourState, isPuzzleWonState, isWonState } from '../src/game/logic/rules';

export { heartbeat } from './target-stress-shared';

/**
 * Shared per-seed gate for Gauntlet 5 §84 stress files (one file per
 * config, 200 seeds each). Every seed verifies: structure, determinism,
 * independent state-aware solver success without truncation, real depth
 * == reported depth, hard acceptance, exactly-one-lemon invariants,
 * participation (≥1 relocation), final lemon on full sea_buckthorn and
 * actual puzzle victory.
 */
export function checkLemonStressSeed(
  level: ReturnType<typeof generateLevel>,
  req: GenerateRequest,
  seed: string,
): void {
  const again = generateLevel(req, seed);
  expect(again.cups).toEqual(level.cups);
  expect(again.floatingIngredients).toEqual(level.floatingIngredients);
  expect(again.hiddenCounts).toEqual(level.hiddenCounts);
  expect(again.cupConstraints).toEqual(level.cupConstraints);
  expect(again.minMoves).toBe(level.minMoves);

  expect(level.cups).toHaveLength(req.numColors + req.emptyCups);
  expect(level.floatingIngredients).toHaveLength(level.cups.length);
  const counts = new Map<string, number>();
  for (const cup of level.cups) {
    for (const t of cup) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  for (const c of req.colors.slice(0, req.numColors)) {
    expect(counts.get(c)).toBe(TEA_UNITS_PER_COLOR);
  }
  expect(isWonState(level.cups, level.cupConstraints)).toBe(false);

  const host = level.floatingIngredients.findIndex((s) => s === 'lemon');
  expect(host).toBeGreaterThanOrEqual(0);
  expect(level.floatingIngredients.filter((s) => s !== null)).toHaveLength(1);

  const solved = solvePuzzle(level.cups, {
    cupConstraints: level.cupConstraints,
    floatingIngredients: level.floatingIngredients,
  });
  expect(solved.solvable).toBe(true);
  expect(solved.truncated ?? false).toBe(false);
  expect(solved.minMoves).toBe(level.minMoves);
  expect(depthAccepted(level.minMoves, req.phase)).toBe(true);

  const check = validateLevelStructure(level, req);
  expect(check.reasons).toEqual([]);
  expect(check.ok).toBe(true);

  const solution = solved.solution ?? [];
  let board = { cups: level.cups.map((c) => [...c]), floatingIngredients: [...level.floatingIngredients] };
  const at = (b: typeof board) => b.floatingIngredients.findIndex((s) => s === 'lemon');
  let relocations = 0;
  for (const step of solution) {
    const before = at(board);
    const res = applyPourState(board, step.from, step.to, level.cupConstraints);
    expect(res).not.toBeNull();
    board = { cups: res?.state.cups ?? [], floatingIngredients: res?.state.floatingIngredients ?? [] };
    if (at(board) !== before) relocations++;
  }
  expect(relocations).toBeGreaterThanOrEqual(1);
  expect(isPuzzleWonState(board, level.cupConstraints)).toBe(true);
  expect(board.cups[at(board)]).toEqual(['sea_buckthorn', 'sea_buckthorn', 'sea_buckthorn', 'sea_buckthorn']);
}
