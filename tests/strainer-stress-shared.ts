import { expect } from 'vitest';
import { TEA_UNITS_PER_COLOR, type TeaId } from '../src/game/types';
import {
  createGenerateStats,
  generateLevel,
  strainerTemplateKindFor,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import {
  STRAINER_DEPTH_ACCEPT,
  STRAINER_TEMPLATE_ATTEMPTS,
} from '../src/game/logic/strainerTemplates';
import {
  applyPuzzleActionState,
  canonicalPuzzleKey,
  isPuzzleWonState,
} from '../src/game/logic/rules';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';

export { heartbeat } from './target-stress-shared';

/**
 * Shared per-seed gate for Gauntlet 6 §65 stress files (one file per
 * config, 100 seeds each). Every seed verifies: structure, determinism,
 * WITH-tool solver success without truncation (real depth == reported
 * depth, in the strainer accept band), WITHOUT-tool non-truncated
 * unsolvable (rescued necessity), replay with free placement + meaningful
 * catch (m>=2, dest inflow m-1, correct held layer) + eventual release,
 * final held null + actual puzzle victory, and fast-path structure
 * (no 150-scan, no fallback).
 */
export function checkStrainerStressSeed(
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
  expect(again.strainer).toEqual(level.strainer);
  expect(again.minMoves).toBe(level.minMoves);

  expect(stats.usedFallback).toBe(false);
  expect(stats.candidatesTried).toBe(0);
  expect(stats.templateAttempts).toBeGreaterThanOrEqual(1);
  expect(stats.templateAttempts).toBeLessThanOrEqual(STRAINER_TEMPLATE_ATTEMPTS);
  expect(stats.solverCalls).toBeGreaterThanOrEqual(1);
  expect(stats.solverCalls).toBeLessThanOrEqual(STRAINER_TEMPLATE_ATTEMPTS * 2);

  // Basic shape: tight G6 topology, tea quantities, tool on stand.
  expect(level.cups).toHaveLength(req.numColors + req.emptyCups);
  expect(level.floatingIngredients).toHaveLength(level.cups.length);
  expect(level.floatingIngredients.every((s) => s === null)).toBe(true);
  const counts = new Map<string, number>();
  for (const cup of level.cups) {
    for (const t of cup) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  for (const c of req.colors.slice(0, req.numColors)) {
    expect(counts.get(c)).toBe(TEA_UNITS_PER_COLOR);
  }
  expect(level.strainer?.present).toBe(true);
  expect(level.strainer?.attachedCupIndex).toBe(null);
  expect(level.strainer?.heldTea).toBe(null);
  expect(
    isPuzzleWonState(
      {
        cups: level.cups,
        floatingIngredients: level.floatingIngredients,
        strainer: level.strainer,
      },
      level.cupConstraints,
    ),
  ).toBe(false);

  // Stand-state key carries the tool marker (no legacy-key collision).
  const startKey = canonicalPuzzleKey(
    {
      cups: level.cups,
      floatingIngredients: level.floatingIngredients,
      strainer: { present: true, attachedCupIndex: null, heldTea: null },
    },
    level.cupConstraints,
  );
  expect(startKey).toContain('STR:STAND:EMPTY');

  // WITH tool: solvable, non-truncated, depth == reported, in accept band.
  const withTool = solvePuzzle(level.cups, {
    cupConstraints: level.cupConstraints,
    floatingIngredients: level.floatingIngredients,
    strainer: { present: true, attachedCupIndex: null, heldTea: null },
  });
  expect(withTool.solvable).toBe(true);
  expect(withTool.truncated ?? false).toBe(false);
  expect(withTool.minMoves).toBe(level.minMoves);
  const kind = strainerTemplateKindFor(req);
  expect(kind).not.toBe(null);
  if (kind !== null) {
    const band = STRAINER_DEPTH_ACCEPT[kind];
    expect(level.minMoves).toBeGreaterThanOrEqual(band.min);
    expect(level.minMoves).toBeLessThanOrEqual(band.max);
  }

  // WITHOUT tool: non-truncated UNSOLVABLE (rescue, not shortening).
  const without = solvePuzzle(level.cups, {
    cupConstraints: level.cupConstraints,
    floatingIngredients: level.floatingIngredients,
  });
  expect(without.solvable).toBe(false);
  expect(without.truncated ?? false).toBe(false);

  const check = validateLevelStructure(level, req);
  expect(check.reasons).toEqual([]);
  expect(check.ok).toBe(true);

  // Replay: free placement + meaningful catch + eventual release, final win.
  const solution = withTool.solution ?? [];
  expect(solution.some((a) => a.kind === 'place-strainer')).toBe(true);
  expect(solution.some((a) => a.kind === 'release-strainer')).toBe(true);
  expect(
    solution.some((a) => a.kind === 'pour' && (a as { strained?: boolean }).strained === true),
  ).toBe(true);

  let rcups = level.cups.map((c) => [...c]);
  let rslots = [...level.floatingIngredients];
  let rstrainer: { present: boolean; attachedCupIndex: number | null; heldTea: TeaId | null } = {
    present: true,
    attachedCupIndex: null,
    heldTea: null,
  };
  let sawPlace = false;
  let sawCatch = false;
  let sawRelease = false;
  for (const a of solution) {
    const res = applyPuzzleActionState(
      { cups: rcups, floatingIngredients: rslots, strainer: rstrainer },
      a,
      level.cupConstraints,
    );
    expect(res).not.toBeNull();
    if (!res) throw new Error('strainer replay hit an illegal action');
    if (a.kind === 'place-strainer') sawPlace = true;
    if (a.kind === 'pour' && res.strained === true) {
      expect(res.transferred ?? 0).toBeGreaterThanOrEqual(2);
      expect(res.received).toBe((res.transferred ?? 0) - 1);
      expect(res.caughtTea).toBe(res.layer);
      sawCatch = true;
    }
    if (a.kind === 'release-strainer') sawRelease = true;
    rcups = res.state.cups;
    rslots = res.state.floatingIngredients;
    rstrainer = res.state.strainer;
  }
  expect(sawPlace).toBe(true);
  expect(sawCatch).toBe(true);
  expect(sawRelease).toBe(true);
  expect(rstrainer.heldTea).toBe(null);
  expect(
    isPuzzleWonState(
      { cups: rcups, floatingIngredients: rslots, strainer: rstrainer },
      level.cupConstraints,
    ),
  ).toBe(true);

  // Same victory through the public applySolutionState entry point.
  const finalViaHelper = applySolutionState(
    {
      cups: level.cups,
      floatingIngredients: level.floatingIngredients,
      strainer: { present: true, attachedCupIndex: null, heldTea: null },
    },
    solution,
    level.cupConstraints,
  );
  expect(finalViaHelper).not.toBeNull();
  expect(isPuzzleWonState(finalViaHelper!, level.cupConstraints)).toBe(true);
  expect(finalViaHelper!.strainer.heldTea).toBe(null);
}
