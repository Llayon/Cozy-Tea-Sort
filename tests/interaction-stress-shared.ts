import { expect } from 'vitest';
import { TEA_UNITS_PER_COLOR, type TeaId } from '../src/game/types';
import {
  analyzeIngredientInteraction,
  createGenerateStats,
  generateLevel,
  lemonHoneyTemplateKindFor,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import {
  LEMON_HONEY_DEPTH_ACCEPT,
  LEMON_HONEY_TEMPLATE_ATTEMPTS,
} from '../src/game/logic/lemonHoneyTemplates';
import {
  canonicalPuzzleKey,
  floatingIngredientHostSatisfied,
  isPuzzleWonState,
  sinkingIngredientHostSatisfied,
} from '../src/game/logic/rules';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';

export { heartbeat } from './target-stress-shared';

/**
 * Shared per-seed gate for Gauntlet 8 §102 stress files (one file per
 * config, 200 seeds each). Every seed verifies: structure, determinism,
 * WITH-ingredients solver success without truncation (real depth ==
 * reported depth, in the 8–16 accept band), WITHOUT extra goals (both
 * ingredients are additional goals, not rescues), replay with L2
 * participation (cohost state + SPLIT event + both final goals on
 * distinct hosts + actual puzzle victory), and fast-path structure
 * (no random scan, no fallback).
 */
export function checkInteractionStressSeed(
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
  expect(stats.templateAttempts).toBeLessThanOrEqual(LEMON_HONEY_TEMPLATE_ATTEMPTS);
  expect(stats.solverCalls).toBeGreaterThanOrEqual(1);
  expect(stats.solverCalls).toBeLessThanOrEqual(LEMON_HONEY_TEMPLATE_ATTEMPTS);

  // Basic shape: G8 4c/6v/2e topology, tea quantities, exactly one lemon
  // and exactly one honey on distinct initial hosts, no strainer.
  expect(level.cups).toHaveLength(req.numColors + req.emptyCups);
  expect(level.floatingIngredients).toHaveLength(level.cups.length);
  const sinkSlots = level.sinkingIngredients ?? [];
  expect(sinkSlots).toHaveLength(level.cups.length);
  expect(level.floatingIngredients.filter((s) => s === 'lemon')).toHaveLength(1);
  expect(sinkSlots.filter((s) => s === 'honey')).toHaveLength(1);
  const lemonHost0 = level.floatingIngredients.findIndex((s) => s === 'lemon');
  const honeyHost0 = sinkSlots.findIndex((s) => s === 'honey');
  expect(lemonHost0).toBeGreaterThanOrEqual(0);
  expect(honeyHost0).toBeGreaterThanOrEqual(0);
  expect(lemonHost0).not.toBe(honeyHost0);
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

  // Interaction-aware key carries both markers (no legacy-key collision).
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
  expect(startKey).toContain('#lemon');

  // WITH both ingredients: solvable, non-truncated, depth == reported, in
  // the 8–16 accept band.
  const solved = solvePuzzle(level.cups, {
    cupConstraints: level.cupConstraints,
    floatingIngredients: level.floatingIngredients,
    sinkingIngredients: sinkSlots,
    strainer: level.strainer,
  });
  expect(solved.solvable).toBe(true);
  expect(solved.truncated ?? false).toBe(false);
  expect(solved.minMoves).toBe(level.minMoves);
  const kind = lemonHoneyTemplateKindFor(req);
  expect(kind).toBe('lemon-honey-interaction');
  expect(level.minMoves).toBeGreaterThanOrEqual(LEMON_HONEY_DEPTH_ACCEPT.min);
  expect(level.minMoves).toBeLessThanOrEqual(LEMON_HONEY_DEPTH_ACCEPT.max);

  const check = validateLevelStructure(level, req);
  expect(check.reasons).toEqual([]);
  expect(check.ok).toBe(true);

  // Replay L2: cohost state (>= 1) + SPLIT event (>= 1 partial cohost
  // outflow: lemon moves, honey stays) + both final goals + actual
  // puzzle victory.
  const solution = solved.solution ?? [];
  expect(solution.length).toBeGreaterThan(0);
  const trace = analyzeIngredientInteraction(
    level.cups,
    level.floatingIngredients,
    sinkSlots,
    solution,
    level.cupConstraints,
  );
  expect(trace.cohostStates).toBeGreaterThanOrEqual(1);
  expect(trace.splitEvents).toBeGreaterThanOrEqual(1);
  expect(trace.finalLemonOk).toBe(true);
  expect(trace.finalHoneyOk).toBe(true);
  expect(trace.win).toBe(true);

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
  const finalLemonHost = (finalViaHelper!.floatingIngredients ?? []).findIndex(
    (s) => s === 'lemon',
  );
  const finalHoneyHost = (finalViaHelper!.sinkingIngredients ?? []).findIndex(
    (s) => s === 'honey',
  );
  expect(finalLemonHost).toBeGreaterThanOrEqual(0);
  expect(finalHoneyHost).toBeGreaterThanOrEqual(0);
  expect(finalLemonHost).not.toBe(finalHoneyHost);
  expect(finalViaHelper!.cups[finalLemonHost]).toEqual([
    'sea_buckthorn',
    'sea_buckthorn',
    'sea_buckthorn',
    'sea_buckthorn',
  ] as TeaId[]);
  expect(finalViaHelper!.cups[finalHoneyHost]).toEqual([
    'buckwheat',
    'buckwheat',
    'buckwheat',
    'buckwheat',
  ] as TeaId[]);
  expect(
    floatingIngredientHostSatisfied(
      'lemon',
      finalViaHelper!.cups[finalLemonHost] as TeaId[],
      level.cupConstraints[finalLemonHost],
    ),
  ).toBe(true);
  expect(
    sinkingIngredientHostSatisfied(
      'honey',
      finalViaHelper!.cups[finalHoneyHost] as TeaId[],
      level.cupConstraints[finalHoneyHost],
    ),
  ).toBe(true);
}
