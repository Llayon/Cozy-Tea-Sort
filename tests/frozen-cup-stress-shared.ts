import { expect } from 'vitest';
import { TEA_UNITS_PER_COLOR, type TeaId } from '../src/game/types';
import {
  analyzeIceParticipation,
  createGenerateStats,
  frozenCupTemplateKindFor,
  generateLevel,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import {
  FROZEN_CUP_DEPTH_ACCEPT,
  FROZEN_CUP_TEMPLATE_ATTEMPTS,
} from '../src/game/logic/frozenCupTemplates';
import {
  canonicalPuzzleKey,
  isPuzzleWonState,
} from '../src/game/logic/rules';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';

export { heartbeat } from './target-stress-shared';

/**
 * Shared per-seed gate for Gauntlet 9 §117 stress files (200 production
 * frozen-cup seeds). Every seed verifies: structure, determinism,
 * WITH-ice solver success without truncation (real depth == reported
 * depth, in the frozen accept band), replay with MELT (>=1) AND later
 * SOURCE-USE (>=1) participation with cleared ice and actual puzzle
 * victory, and fast-path structure (no 150-scan, no fallback).
 */
export function checkFrozenCupStressSeed(
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
  expect(again.iceSlots).toEqual(level.iceSlots);
  expect(again.minMoves).toBe(level.minMoves);

  expect(stats.usedFallback).toBe(false);
  expect(stats.candidatesTried).toBe(0);
  expect(stats.templateAttempts).toBeGreaterThanOrEqual(1);
  expect(stats.templateAttempts).toBeLessThanOrEqual(FROZEN_CUP_TEMPLATE_ATTEMPTS);
  expect(stats.solverCalls).toBeGreaterThanOrEqual(1);
  expect(stats.solverCalls).toBeLessThanOrEqual(FROZEN_CUP_TEMPLATE_ATTEMPTS);

  // Basic shape: authored 4,4,4,3,1,0 topology, tea quantities, one ice.
  expect(level.cups).toHaveLength(req.numColors + req.emptyCups);
  expect(level.floatingIngredients).toHaveLength(level.cups.length);
  expect(level.floatingIngredients.every((s) => s === null)).toBe(true);
  const ice = level.iceSlots ?? [];
  expect(ice).toHaveLength(level.cups.length);
  expect(ice.filter((s) => s !== null)).toHaveLength(1);
  expect(ice.filter((s) => s === 'ice')).toHaveLength(1);
  expect(level.strainer?.present ?? false).toBe(false);
  const lens = level.cups.map((c) => c.length).sort((a, b) => a - b);
  expect(lens).toEqual([0, 1, 3, 4, 4, 4]);
  const counts = new Map<string, number>();
  for (const cup of level.cups) {
    for (const t of cup) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  for (const c of req.colors.slice(0, req.numColors)) {
    expect(counts.get(c)).toBe(TEA_UNITS_PER_COLOR);
  }
  const host = ice.findIndex((s) => s === 'ice');
  const hostCup = level.cups[host] as TeaId[];
  expect(hostCup).toHaveLength(3);
  expect(hostCup[hostCup.length - 1]).toBe('sea_buckthorn');
  expect(
    isPuzzleWonState(
      {
        cups: level.cups,
        floatingIngredients: level.floatingIngredients,
        strainer: level.strainer,
        iceSlots: ice,
      },
      level.cupConstraints,
    ),
  ).toBe(false);

  // Ice-aware key carries the ice marker (no legacy-key collision).
  const startKey = canonicalPuzzleKey(
    {
      cups: level.cups,
      floatingIngredients: level.floatingIngredients,
      strainer: level.strainer,
      iceSlots: ice,
    },
    level.cupConstraints,
  );
  expect(startKey).toContain('#ice:ice');

  // WITH ice: solvable, non-truncated, depth == reported, in accept band.
  const withIce = solvePuzzle(level.cups, {
    cupConstraints: level.cupConstraints,
    floatingIngredients: level.floatingIngredients,
    strainer: level.strainer,
    iceSlots: ice,
  });
  expect(withIce.solvable).toBe(true);
  expect(withIce.truncated ?? false).toBe(false);
  expect(withIce.minMoves).toBe(level.minMoves);
  const kind = frozenCupTemplateKindFor(req);
  expect(kind).not.toBe(null);
  if (kind !== null) {
    expect(level.minMoves).toBeGreaterThanOrEqual(FROZEN_CUP_DEPTH_ACCEPT.min);
    expect(level.minMoves).toBeLessThanOrEqual(FROZEN_CUP_DEPTH_ACCEPT.max);
  }

  const check = validateLevelStructure(level, req);
  expect(check.reasons).toEqual([]);
  expect(check.ok).toBe(true);

  // Replay: MELT (>=1 hot inflow clearing ice) AND later SOURCE-USE (>=1
  // pour from the formerly frozen vessel), cleared ice, actual victory.
  const solution = withIce.solution ?? [];
  expect(solution.length).toBeGreaterThan(0);
  const part = analyzeIceParticipation(
    level.cups,
    ice,
    host,
    solution,
    level.cupConstraints,
  );
  expect(part.melts).toBeGreaterThanOrEqual(1);
  expect(part.sourceUses).toBeGreaterThanOrEqual(1);
  expect(part.finalIceCleared).toBe(true);
  expect(part.win).toBe(true);

  const finalViaHelper = applySolutionState(
    {
      cups: level.cups,
      floatingIngredients: level.floatingIngredients,
      strainer: level.strainer,
      iceSlots: ice,
    },
    solution,
    level.cupConstraints,
  );
  expect(finalViaHelper).not.toBeNull();
  expect(isPuzzleWonState(finalViaHelper!, level.cupConstraints)).toBe(true);
  expect((finalViaHelper!.iceSlots ?? []).every((s) => s === null)).toBe(true);
}
