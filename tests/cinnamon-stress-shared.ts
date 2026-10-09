import { expect } from 'vitest';
import {
  STANDARD_CUP_CAPACITY,
  TEA_UNITS_PER_COLOR,
  cupCapacity,
  type CapacityObstacleSlot,
  type TeaId,
} from '../src/game/types';
import {
  analyzeCinnamonParticipation,
  createGenerateStats,
  cinnamonTemplateKindFor,
  generateLevel,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { CINNAMON_DEPTH_ACCEPT, CINNAMON_TEMPLATE_ATTEMPTS } from '../src/game/logic/cinnamonTemplates';
import { canonicalPuzzleKey, isPuzzleWonState } from '../src/game/logic/rules';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';

export { heartbeat } from './target-stress-shared';

/**
 * Shared per-seed gate for the Gauntlet 11 stress file (200 production
 * cinnamon seeds). Every seed verifies: structure, determinism,
 * production-solver success without truncation (real depth == reported
 * depth, in the cinnamon accept band), replay with UNLOCK (>=1) AND later
 * EXPANDED_USE (>=3 occupancy, >=1 event) participation with cleared
 * obstacle and actual puzzle victory, per-vessel base capacity respected
 * on the replay, and fast-path structure (no 150-scan, no fallback, no
 * plain-control solve).
 */
export function checkCinnamonStressSeed(
  level: ReturnType<typeof generateLevel>,
  req: GenerateRequest,
  seed: string,
): void {
  // Determinism + fast-path structure: same seed -> identical puzzle via
  // the bounded template path (never the random scan, never fallback).
  const stats = createGenerateStats();
  const again = generateLevel(req, seed, { stats });
  expect(again.cups).toEqual(level.cups);
  expect(again.hiddenCounts).toEqual(level.hiddenCounts);
  expect(again.cupConstraints).toEqual(level.cupConstraints);
  expect(again.floatingIngredients).toEqual(level.floatingIngredients);
  expect(again.capacityObstacles).toEqual(level.capacityObstacles);
  expect(again.minMoves).toBe(level.minMoves);

  expect(stats.usedFallback).toBe(false);
  expect(stats.candidatesTried).toBe(0);
  expect(stats.templateAttempts).toBeGreaterThanOrEqual(1);
  expect(stats.templateAttempts).toBeLessThanOrEqual(CINNAMON_TEMPLATE_ATTEMPTS);
  expect(stats.solverCalls).toBeGreaterThanOrEqual(1);
  expect(stats.solverCalls).toBeLessThanOrEqual(CINNAMON_TEMPLATE_ATTEMPTS);

  // Basic shape: authored 4,4,3,3,2,0 topology, tea quantities, one cinnamon.
  expect(level.cups).toHaveLength(req.numColors + req.emptyCups);
  expect(level.floatingIngredients).toHaveLength(level.cups.length);
  expect(level.floatingIngredients.every((s) => s === null)).toBe(true);
  expect((level.sinkingIngredients ?? []).every((s) => s === null)).toBe(true);
  expect((level.iceSlots ?? []).every((s) => s === null)).toBe(true);
  expect(level.cupConstraints.filter((c) => c.capacity === 5).length).toBe(0);
  expect(level.strainer?.present ?? false).toBe(false);
  expect(level.hiddenCounts.every((h) => h === 0)).toBe(true);
  const obstacles = (level.capacityObstacles ?? []) as CapacityObstacleSlot[];
  expect(obstacles).toHaveLength(level.cups.length);
  expect(obstacles.filter((s) => s === 'cinnamon')).toHaveLength(1);
  const host = obstacles.findIndex((s) => s === 'cinnamon');
  const hostC = level.cupConstraints[host];
  expect(hostC?.mode).toBe('normal');
  expect(cupCapacity(hostC)).toBe(STANDARD_CUP_CAPACITY);
  expect(hostC?.targetTeaId).toBe(undefined);
  const lens = level.cups.map((c) => c.length).sort((a, b) => a - b);
  expect(lens).toEqual([0, 2, 3, 3, 4, 4]);
  expect(level.cups.filter((c) => c.length === 0)).toHaveLength(1);
  const counts = new Map<string, number>();
  for (const cup of level.cups) {
    for (const t of cup) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  for (const c of req.colors.slice(0, req.numColors)) {
    expect(counts.get(c)).toBe(TEA_UNITS_PER_COLOR);
  }
  // Len-2 mixed host with base-4 static capacity (effective 2 while active).
  const hostCup = level.cups[host] as TeaId[];
  expect(hostCup).toHaveLength(2);
  expect(hostCup[0]).not.toBe(hostCup[1]);
  expect(
    isPuzzleWonState(
      {
        cups: level.cups,
        floatingIngredients: level.floatingIngredients,
        strainer: level.strainer,
        capacityObstacles: obstacles,
      },
      level.cupConstraints,
    ),
  ).toBe(false);

  // Cinnamon-aware key carries the #cap:cinnamon marker (no legacy collision).
  const startKey = canonicalPuzzleKey(
    {
      cups: level.cups,
      floatingIngredients: level.floatingIngredients,
      strainer: level.strainer,
      capacityObstacles: obstacles,
    },
    level.cupConstraints,
  );
  expect(startKey).toContain('#cap:cinnamon');

  // Production solve: solvable, non-truncated, depth == reported, in band.
  const solved = solvePuzzle(level.cups, {
    cupConstraints: level.cupConstraints,
    floatingIngredients: level.floatingIngredients,
    strainer: level.strainer,
    capacityObstacles: obstacles,
  });
  expect(solved.solvable).toBe(true);
  expect(solved.truncated ?? false).toBe(false);
  expect(solved.minMoves).toBe(level.minMoves);
  expect(cinnamonTemplateKindFor(req)).not.toBe(null);
  expect(level.minMoves).toBeGreaterThanOrEqual(CINNAMON_DEPTH_ACCEPT.min);
  expect(level.minMoves).toBeLessThanOrEqual(CINNAMON_DEPTH_ACCEPT.max);

  const check = validateLevelStructure(level, req);
  expect(check.reasons).toEqual([]);
  expect(check.ok).toBe(true);

  // Replay: UNLOCK (>=1 emptying removal) AND later EXPANDED_USE (>=1 reach
  // to >=3 with max occupancy >=3), cleared obstacle, actual victory, and
  // base capacity respected along the path.
  const solution = solved.solution ?? [];
  expect(solution.length).toBeGreaterThan(0);
  const part = analyzeCinnamonParticipation(level.cups, obstacles, host, solution, level.cupConstraints);
  expect(part.unlocks).toBeGreaterThanOrEqual(1);
  expect(part.firstExpandedUseDepth).not.toBe(null);
  expect(part.expandedUses).toBeGreaterThanOrEqual(1);
  expect(part.maxPostUnlockOccupancy).toBeGreaterThanOrEqual(3);
  expect(part.finalObstacleCleared).toBe(true);
  expect(part.win).toBe(true);

  const finalViaHelper = applySolutionState(
    {
      cups: level.cups,
      floatingIngredients: level.floatingIngredients,
      strainer: level.strainer,
      capacityObstacles: obstacles,
    },
    solution,
    level.cupConstraints,
  );
  expect(finalViaHelper).not.toBeNull();
  expect(isPuzzleWonState(finalViaHelper!, level.cupConstraints)).toBe(true);
  expect((finalViaHelper!.capacityObstacles ?? []).every((s) => s === null)).toBe(true);
  for (const cup of finalViaHelper!.cups) {
    expect(cup.length).toBeLessThanOrEqual(STANDARD_CUP_CAPACITY);
  }
}
