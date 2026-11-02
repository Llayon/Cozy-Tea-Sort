/** G21 FLASK_TRAY production fast path + 200-seed stress. */
import { describe, expect, it } from 'vitest';
import {
  createGenerateStats,
  fallbackLevel,
  generateLevel,
  steepingFlaskSharedTrayTemplateKindFor,
  validateSteepingFlaskRequest,
} from '../src/game/logic/generator';
import { getLevelConfig } from '../src/utils/difficultyCurve';
import { generateRequestForLevelConfig } from '../src/game/logic/productionRequest';
import {
  emptyFloatingIngredients,
  isSteepingFlaskConstraint,
  type TeaId,
} from '../src/game/types';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import { isPuzzleWonState } from '../src/game/logic/rules';
import {
  analyzeSharedTrayParticipation,
  analyzeSteepingFlaskParticipation,
} from '../src/game/logic/generator';
import { ALL_STEEPING_FLASK_SHARED_TRAY_TEMPLATES } from '../src/game/logic/steepingFlaskSharedTrayTemplates';

const BASE = generateRequestForLevelConfig(getLevelConfig(874));

function assertC2(cups: TeaId[][], constraints: any, solution: readonly any[]) {
  const final = applySolutionState(
    { cups, floatingIngredients: emptyFloatingIngredients(cups.length) },
    solution,
    constraints,
  );
  expect(final).not.toBeNull();
  expect(isPuzzleWonState(final as any, constraints)).toBe(true);
  const flask = analyzeSteepingFlaskParticipation(cups, solution, constraints);
  const tray = analyzeSharedTrayParticipation(cups, solution, constraints);
  expect(flask.win).toBe(true);
  expect(tray.win).toBe(true);
  expect(flask.commitDepth).not.toBeNull();
  expect(flask.pressureDepth).not.toBeNull();
  expect(flask.readyDepth).not.toBeNull();
  expect(flask.releaseDepth).not.toBeNull();
  expect(flask.emptyDepth).not.toBeNull();
  expect(flask.commitDepth as number).toBeLessThanOrEqual(flask.pressureDepth as number);
  expect(flask.pressureDepth as number).toBeLessThan(flask.readyDepth as number);
  expect(flask.readyDepth as number).toBeLessThan(flask.releaseDepth as number);
  expect(tray.firstPressureDepth).not.toBeNull();
  expect(tray.firstReleaseDepth).not.toBeNull();
  expect(tray.firstRefillDepth).not.toBeNull();
  expect(tray.firstPressureDepth as number).toBeLessThan(tray.firstReleaseDepth as number);
  expect(tray.firstReleaseDepth as number).toBeLessThan(tray.firstRefillDepth as number);
  expect(flask.partialRelease).toBe(false);
  expect(flask.cleanDecant).toBe(true);
}

describe('G21 FLASK_TRAY fast path', () => {
  it('exact request matcher and no standalone matcher hijack', () => {
    expect(steepingFlaskSharedTrayTemplateKindFor(BASE)).toBe('flask-tray');
    expect(() => validateSteepingFlaskRequest(BASE)).not.toThrow();
  });

  for (const [start, count] of [
    [0, 25],
    [25, 25],
    [50, 25],
    [75, 25],
    [100, 25],
    [125, 25],
    [150, 25],
    [175, 25],
  ] as const) {
    it(`production seeds ${start}-${start + count - 1}: exact composition, C2, no fallback`, () => {
      const starts = new Set<string>();
      const depths: number[] = [];
      let attempts = 0;
      let solverCalls = 0;
      for (let i = start; i < start + count; i++) {
        const stats = createGenerateStats();
        const level = generateLevel(BASE, `g21-stress:${i}`, { stats });
        expect(level.cups.map((c) => c.length).sort((a, b) => a - b)).toEqual([0, 2, 3, 3, 4, 4]);
        expect(level.cups[5]).toEqual([]);
        expect(level.cupConstraints.filter(isSteepingFlaskConstraint)).toHaveLength(1);
        expect(level.cupConstraints.filter((c) => c.sharedCapacityGroup === 'tea-tray')).toHaveLength(2);
        expect(stats.usedFallback, `seed ${i} fallback`).toBe(false);
        expect(stats.templateAttempts).toBeLessThanOrEqual(4);
        expect(stats.solverCalls).toBe(1);
        attempts += stats.templateAttempts;
        solverCalls += stats.solverCalls;
        depths.push(level.minMoves);
        starts.add(JSON.stringify(level.cups));
        const solved = solvePuzzle(level.cups, {
          cupConstraints: level.cupConstraints,
          floatingIngredients: emptyFloatingIngredients(level.cups.length),
          maxVisited: 200_000,
          maxDepth: 60,
          returnSolution: true,
        });
        expect(solved.solvable).toBe(true);
        expect(solved.minMoves).toBe(level.minMoves);
        assertC2(level.cups, level.cupConstraints, solved.solution as any[]);
      }
      expect(starts.size).toBeGreaterThanOrEqual(15);
      expect(attempts).toBe(count);
      expect(solverCalls).toBe(count);
      expect(Math.min(...depths)).toBeGreaterThanOrEqual(10);
      expect(Math.max(...depths)).toBeLessThanOrEqual(15);
    }, 120_000);
  }

  it('fallback is the pinned first template with exact composition/depth', () => {
    const stats = createGenerateStats();
    const level = fallbackLevel(BASE, { stats });
    expect(stats.usedFallback).toBe(true);
    const tpl = ALL_STEEPING_FLASK_SHARED_TRAY_TEMPLATES[0] as (typeof ALL_STEEPING_FLASK_SHARED_TRAY_TEMPLATES)[number];
    expect(level.minMoves).toBe(tpl.depth);
    expect(level.cups.map((c) => c.length).sort((a, b) => a - b)).toEqual([0, 2, 3, 3, 4, 4]);
    expect(level.cupConstraints.filter(isSteepingFlaskConstraint)).toHaveLength(1);
    expect(level.cupConstraints.filter((c) => c.sharedCapacityGroup === 'tea-tray')).toHaveLength(2);
  });
});
