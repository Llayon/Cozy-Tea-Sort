import { expect } from 'vitest';
import { TEA_UNITS_PER_COLOR, type TeaId } from '../src/game/types';
import {
  analyzeHoneyParticipation,
  createGenerateStats,
  generateLevel,
  honeyTemplateKindFor,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import {
  HONEY_DEPTH_ACCEPT,
  HONEY_TEMPLATE_ATTEMPTS,
} from '../src/game/logic/honeyTemplates';
import {
  canonicalPuzzleKey,
  isPuzzleWonState,
  sinkingIngredientHostSatisfied,
} from '../src/game/logic/rules';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';

export { heartbeat } from './target-stress-shared';

/**
 * Shared per-seed gate for Gauntlet 7 §99 stress files (one file per
 * config, 100 seeds each). Every seed verifies: structure, determinism,
 * WITH-honey solver success without truncation (real depth == reported
 * depth, in the honey accept band), WITHOUT extra goals (honey is an
 * additional goal, not a rescue), replay with HONEY-STAY (>=1) AND
 * HONEY-MOVE (>=1) participation + eventual final honey on full
 * buckwheat with actual puzzle victory, and fast-path structure
 * (no 150-scan, no fallback).
 */
export function checkHoneyStressSeed(
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
  expect(again.sinkingIngredients).toEqual(level.sinkingIngredients);
  expect(again.minMoves).toBe(level.minMoves);

  expect(stats.usedFallback).toBe(false);
  expect(stats.candidatesTried).toBe(0);
  expect(stats.templateAttempts).toBeGreaterThanOrEqual(1);
  expect(stats.templateAttempts).toBeLessThanOrEqual(HONEY_TEMPLATE_ATTEMPTS);
  expect(stats.solverCalls).toBeGreaterThanOrEqual(1);
  expect(stats.solverCalls).toBeLessThanOrEqual(HONEY_TEMPLATE_ATTEMPTS);

  // Basic shape: loose G7 topology, tea quantities, exactly one honey.
  expect(level.cups).toHaveLength(req.numColors + req.emptyCups);
  expect(level.floatingIngredients).toHaveLength(level.cups.length);
  expect(level.floatingIngredients.every((s) => s === null)).toBe(true);
  const sinkSlots = level.sinkingIngredients ?? [];
  expect(sinkSlots).toHaveLength(level.cups.length);
  expect(sinkSlots.filter((s) => s !== null)).toHaveLength(1);
  expect(sinkSlots.filter((s) => s === 'honey')).toHaveLength(1);
  expect(level.strainer?.present ?? false).toBe(false);
  const counts = new Map<string, number>();
  for (const cup of level.cups) {
    for (const t of cup) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  for (const c of req.colors.slice(0, req.numColors)) {
    expect(counts.get(c)).toBe(TEA_UNITS_PER_COLOR);
  }
  expect(
    isPuzzleWonState(
      {
        cups: level.cups,
        floatingIngredients: level.floatingIngredients,
        sinkingIngredients: sinkSlots,
        strainer: level.strainer,
      },
      level.cupConstraints,
    ),
  ).toBe(false);

  // Honey-aware key carries the sinking marker (no legacy-key collision).
  const startKey = canonicalPuzzleKey(
    {
      cups: level.cups,
      floatingIngredients: level.floatingIngredients,
      sinkingIngredients: sinkSlots,
      strainer: level.strainer,
    },
    level.cupConstraints,
  );
  expect(startKey).toContain('#sink:honey');

  // WITH honey: solvable, non-truncated, depth == reported, in accept band.
  const withHoney = solvePuzzle(level.cups, {
    cupConstraints: level.cupConstraints,
    floatingIngredients: level.floatingIngredients,
    sinkingIngredients: sinkSlots,
    strainer: level.strainer,
  });
  expect(withHoney.solvable).toBe(true);
  expect(withHoney.truncated ?? false).toBe(false);
  expect(withHoney.minMoves).toBe(level.minMoves);
  const kind = honeyTemplateKindFor(req);
  expect(kind).not.toBe(null);
  if (kind !== null) {
    const band = HONEY_DEPTH_ACCEPT[kind];
    expect(level.minMoves).toBeGreaterThanOrEqual(band.min);
    expect(level.minMoves).toBeLessThanOrEqual(band.max);
  }

  const check = validateLevelStructure(level, req);
  expect(check.reasons).toEqual([]);
  expect(check.ok).toBe(true);

  // Replay: HONEY-STAY (>=1 partial outflow, honey stays) AND HONEY-MOVE
  // (>=1 emptying outflow, honey relocates), final honey on full
  // buckwheat with actual puzzle victory.
  const solution = withHoney.solution ?? [];
  expect(solution.length).toBeGreaterThan(0);
  const part = analyzeHoneyParticipation(
    level.cups,
    sinkSlots,
    solution,
    level.cupConstraints,
  );
  expect(part.stays).toBeGreaterThanOrEqual(1);
  expect(part.moves).toBeGreaterThanOrEqual(1);

  const finalViaHelper = applySolutionState(
    {
      cups: level.cups,
      floatingIngredients: level.floatingIngredients,
      sinkingIngredients: sinkSlots,
      strainer: level.strainer,
    },
    solution,
    level.cupConstraints,
  );
  expect(finalViaHelper).not.toBeNull();
  expect(isPuzzleWonState(finalViaHelper!, level.cupConstraints)).toBe(true);
  const finalHost = (finalViaHelper!.sinkingIngredients ?? []).findIndex(
    (s) => s === 'honey',
  );
  expect(finalHost).toBeGreaterThanOrEqual(0);
  expect(finalViaHelper!.cups[finalHost]).toEqual([
    'buckwheat',
    'buckwheat',
    'buckwheat',
    'buckwheat',
  ] as TeaId[]);
  expect(
    sinkingIngredientHostSatisfied(
      'honey',
      finalViaHelper!.cups[finalHost] as TeaId[],
      level.cupConstraints[finalHost],
    ),
  ).toBe(true);
}
