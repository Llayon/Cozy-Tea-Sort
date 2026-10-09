import { expect } from 'vitest';
import {
  THERMOS_CAPACITY,
  TEA_UNITS_PER_COLOR,
  cupCapacity,
  isThermosCupConstraint,
  type TeaId,
} from '../src/game/types';
import {
  analyzeThermosParticipation,
  createGenerateStats,
  generateLevel,
  thermosTemplateKindFor,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { THERMOS_DEPTH_ACCEPT, THERMOS_TEMPLATE_ATTEMPTS } from '../src/game/logic/thermosTemplates';
import { canonicalPuzzleKey, isPuzzleWonState } from '../src/game/logic/rules';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';

export { heartbeat } from './target-stress-shared';

/**
 * Shared per-seed gate for the Gauntlet 10 stress file (200 production
 * thermos seeds). Every seed verifies: structure, determinism,
 * production-solver success without truncation (real depth == reported
 * depth, in the thermos accept band), replay with FIFTH_SLOT_USE (>=1)
 * AND later DRAIN (>=1) participation with final empty and actual puzzle
 * victory, per-vessel capacity respected on the replay, and fast-path
 * structure (no 150-scan, no fallback, no cap4 control solve).
 */
export function checkThermosStressSeed(
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
  expect(again.minMoves).toBe(level.minMoves);

  expect(stats.usedFallback).toBe(false);
  expect(stats.candidatesTried).toBe(0);
  expect(stats.templateAttempts).toBeGreaterThanOrEqual(1);
  expect(stats.templateAttempts).toBeLessThanOrEqual(THERMOS_TEMPLATE_ATTEMPTS);
  expect(stats.solverCalls).toBeGreaterThanOrEqual(1);
  expect(stats.solverCalls).toBeLessThanOrEqual(THERMOS_TEMPLATE_ATTEMPTS);

  // Basic shape: authored 4,4,3,3,2,0 topology, tea quantities, one thermos.
  expect(level.cups).toHaveLength(req.numColors + req.emptyCups);
  expect(level.floatingIngredients).toHaveLength(level.cups.length);
  expect(level.floatingIngredients.every((s) => s === null)).toBe(true);
  expect((level.sinkingIngredients ?? []).every((s) => s === null)).toBe(true);
  expect((level.iceSlots ?? []).every((s) => s === null)).toBe(true);
  expect(level.strainer?.present ?? false).toBe(false);
  expect(level.hiddenCounts.every((h) => h === 0)).toBe(true);
  const hosts = level.cupConstraints.filter((c) => isThermosCupConstraint(c));
  expect(hosts).toHaveLength(1);
  const host = level.cupConstraints.findIndex((c) => isThermosCupConstraint(c));
  const hostC = level.cupConstraints[host];
  expect(hostC?.mode).toBe('normal');
  expect(cupCapacity(hostC)).toBe(THERMOS_CAPACITY);
  expect(hostC?.mustEndEmpty).toBe(true);
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
  const hostCup = level.cups[host] as TeaId[];
  expect(hostCup).toHaveLength(3);
  expect(new Set(hostCup).size).toBeGreaterThan(1);
  expect(hostCup.filter((t) => t === hostCup[hostCup.length - 1]).length).toBe(1);
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

  // Thermos-aware key carries the C5:E marker (no legacy-key collision).
  const startKey = canonicalPuzzleKey(
    {
      cups: level.cups,
      floatingIngredients: level.floatingIngredients,
      strainer: level.strainer,
    },
    level.cupConstraints,
  );
  expect(startKey).toContain('C5:E');

  // Production solve: solvable, non-truncated, depth == reported, in band.
  const solved = solvePuzzle(level.cups, {
    cupConstraints: level.cupConstraints,
    floatingIngredients: level.floatingIngredients,
    strainer: level.strainer,
  });
  expect(solved.solvable).toBe(true);
  expect(solved.truncated ?? false).toBe(false);
  expect(solved.minMoves).toBe(level.minMoves);
  expect(thermosTemplateKindFor(req)).not.toBe(null);
  expect(level.minMoves).toBeGreaterThanOrEqual(THERMOS_DEPTH_ACCEPT.min);
  expect(level.minMoves).toBeLessThanOrEqual(THERMOS_DEPTH_ACCEPT.max);

  const check = validateLevelStructure(level, req);
  expect(check.reasons).toEqual([]);
  expect(check.ok).toBe(true);

  // Replay: FIFTH_SLOT_USE (>=1 reach to 5/5) AND later DRAIN (>=1 pour
  // from the thermos back below 5), final empty, actual victory, and
  // per-vessel capacity respected along the path.
  const solution = solved.solution ?? [];
  expect(solution.length).toBeGreaterThan(0);
  const part = analyzeThermosParticipation(level.cups, host, solution, level.cupConstraints);
  expect(part.fifthSlotUses).toBeGreaterThanOrEqual(1);
  expect(part.drainsAfterFifth).toBeGreaterThanOrEqual(1);
  expect(part.finalThermosEmpty).toBe(true);
  expect(part.win).toBe(true);

  const finalViaHelper = applySolutionState(
    {
      cups: level.cups,
      floatingIngredients: level.floatingIngredients,
      strainer: level.strainer,
    },
    solution,
    level.cupConstraints,
  );
  expect(finalViaHelper).not.toBeNull();
  expect(isPuzzleWonState(finalViaHelper!, level.cupConstraints)).toBe(true);
  expect((finalViaHelper!.cups[host] ?? [null])).toEqual([]);
  for (const cup of finalViaHelper!.cups) {
    expect(cup.length).toBeLessThanOrEqual(5);
  }
}
