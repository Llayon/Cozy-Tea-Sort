/**
 * Gauntlet 11 — cinnamon fast-path contract (GI–HA, L2 trace inside).
 *
 * Request detection (cinnamonTemplateKindFor), fail-fast validation,
 * bounded template attempts with a single production solve per attempt
 * (no 150-scan, no plain-control on the runtime path), fallback branch,
 * determinism, 20-seed structural spot (attempts median 1 p95 ≤2,
 * solverCalls 1 happy path), and a legacy routing regression spot
 * (G8/G9/G10 routing untouched).
 */
import { describe, expect, it } from 'vitest';
import {
  type CapacityObstacleSlot,
  type CupConstraint,
  type PuzzleState,
  type SolverAction,
  type TeaId,
} from '../src/game/types';
import {
  applyPuzzleActionState,
  canonicalPuzzleKey,
  isPuzzleWonState,
  listConstructiveActionsState,
  puzzleActionCost,
} from '../src/game/logic/rules';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import {
  analyzeCinnamonParticipation,
  cinnamonTemplateKindFor,
  createGenerateStats,
  fallbackLevel,
  frozenCupTemplateKindFor,
  generateLevel,
  lemonHoneyTemplateKindFor,
  thermosTemplateKindFor,
  validateLevelStructure,
  type GeneratedLevel,
  type GenerateRequest,
} from '../src/game/logic/generator';
import {
  CINNAMON_DEPTH_ACCEPT,
  CINNAMON_TEMPLATE_ATTEMPTS,
} from '../src/game/logic/cinnamonTemplates';

const M: TeaId = 'matcha';
const K: TeaId = 'karkade';
const O: TeaId = 'milk_oolong';
const SB: TeaId = 'sea_buckthorn';

const CINNAMON_CHALLENGE: GenerateRequest = {
  numColors: 4,
  colors: [M, SB, K, O],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  cinnamonCupCount: 1,
};

function median(a: number[]): number {
  if (a.length === 0) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)] as number;
}

function p95(a: number[]): number {
  if (a.length === 0) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(0.95 * s.length))] as number;
}

function cinnamonHostOf(level: GeneratedLevel): number {
  return (level.capacityObstacles ?? []).findIndex((s) => s === 'cinnamon');
}

function expectCinnamonLevel(req: GenerateRequest, seed: string): { lvl: GeneratedLevel } {
  const lvl = generateLevel(req, seed);
  expect(validateLevelStructure(lvl, req).ok).toBe(true);
  // Exactly one active cinnamon on a standard normal base-4 vessel.
  const obstacles = lvl.capacityObstacles ?? [];
  expect(obstacles.filter((s) => s === 'cinnamon')).toHaveLength(1);
  const host = cinnamonHostOf(lvl);
  expect(host).toBeGreaterThanOrEqual(0);
  const hostC = lvl.cupConstraints[host] as CupConstraint;
  expect(hostC.mode).toBe('normal');
  expect(hostC.targetTeaId).toBe(undefined);
  // Len-2 mixed host, base cap 4 (effective 2 while active).
  const hostCup = lvl.cups[host] as TeaId[];
  expect(hostCup).toHaveLength(2);
  expect(hostCup[0]).not.toBe(hostCup[1]);
  // Authored multiset 4,4,3,3,2,0 with one true empty and 4/color.
  expect(lvl.cups.map((c) => c.length).sort((a, b) => a - b)).toEqual([0, 2, 3, 3, 4, 4]);
  expect(lvl.cups.filter((c) => c.length === 0)).toHaveLength(1);
  const counts = new Map<string, number>();
  for (const cup of lvl.cups) for (const t of cup) counts.set(t, (counts.get(t) ?? 0) + 1);
  for (const c of req.colors.slice(0, req.numColors)) expect(counts.get(c)).toBe(4);
  // No sibling special.
  expect(lvl.cupConstraints.some((c) => c.mode === 'source-only')).toBe(false);
  expect(lvl.cupConstraints.some((c) => c.mode === 'sink-only')).toBe(false);
  expect(lvl.cupConstraints.some((c) => c.targetTeaId !== undefined)).toBe(false);
  expect(lvl.floatingIngredients.every((s) => s === null)).toBe(true);
  expect((lvl.sinkingIngredients ?? []).every((s) => s === null)).toBe(true);
  expect((lvl.iceSlots ?? []).every((s) => s === null)).toBe(true);
  expect(lvl.cupConstraints.filter((c) => c.capacity === 5).length).toBe(0);
  expect(lvl.strainer?.present ?? false).toBe(false);
  expect(lvl.hiddenCounts.every((h) => h === 0)).toBe(true);
  const solved = solvePuzzle(lvl.cups, {
    cupConstraints: lvl.cupConstraints,
    floatingIngredients: lvl.floatingIngredients,
    capacityObstacles: lvl.capacityObstacles,
  });
  expect(solved.solvable).toBe(true);
  expect(solved.truncated ?? false).toBe(false);
  expect(solved.minMoves).toBe(lvl.minMoves);
  expect(lvl.minMoves).toBeGreaterThanOrEqual(CINNAMON_DEPTH_ACCEPT.min);
  expect(lvl.minMoves).toBeLessThanOrEqual(CINNAMON_DEPTH_ACCEPT.max);
  const part = analyzeCinnamonParticipation(
    lvl.cups,
    (lvl.capacityObstacles ?? []) as CapacityObstacleSlot[],
    host,
    (solved.solution ?? []) as SolverAction[],
    lvl.cupConstraints,
  );
  expect(part.unlocks).toBeGreaterThanOrEqual(1);
  expect(part.firstExpandedUseDepth).not.toBe(null);
  expect(part.finalObstacleCleared).toBe(true);
  expect(part.win).toBe(true);
  const fin = applySolutionState(
    { cups: lvl.cups, floatingIngredients: lvl.floatingIngredients, capacityObstacles: lvl.capacityObstacles },
    solved.solution ?? [],
    lvl.cupConstraints,
  );
  expect(fin).not.toBe(null);
  expect(isPuzzleWonState(fin as PuzzleState, lvl.cupConstraints)).toBe(true);
  expect((fin as PuzzleState).capacityObstacles.every((s) => s === null)).toBe(true);
  return { lvl };
}

describe('cinnamon template-kind routing (GI)', () => {
  it('canonical cinnamon requests hit the fast path; others do not', () => {
    expect(cinnamonTemplateKindFor(CINNAMON_CHALLENGE)).toBe('cinnamon');
    expect(cinnamonTemplateKindFor({ ...CINNAMON_CHALLENGE, cinnamonCupCount: 0 })).toBe(null);
    expect(cinnamonTemplateKindFor({ ...CINNAMON_CHALLENGE, cinnamonCupCount: 2 })).toBe(null);
    expect(cinnamonTemplateKindFor({ ...CINNAMON_CHALLENGE, numColors: 3 })).toBe(null);
    expect(cinnamonTemplateKindFor({ ...CINNAMON_CHALLENGE, emptyCups: 1 })).toBe(null);
    expect(cinnamonTemplateKindFor({ ...CINNAMON_CHALLENGE, hasMysteryLayer: true })).toBe(null);
    expect(cinnamonTemplateKindFor({ ...CINNAMON_CHALLENGE, sourceOnlyCount: 1 })).toBe(null);
    expect(cinnamonTemplateKindFor({ ...CINNAMON_CHALLENGE, floatingIngredient: 'lemon' })).toBe(null);
    expect(cinnamonTemplateKindFor({ ...CINNAMON_CHALLENGE, sinkingIngredient: 'honey' })).toBe(null);
    expect(cinnamonTemplateKindFor({ ...CINNAMON_CHALLENGE, hasStrainer: true })).toBe(null);
    expect(cinnamonTemplateKindFor({ ...CINNAMON_CHALLENGE, sinkOnlyCount: 1 })).toBe(null);
    expect(cinnamonTemplateKindFor({ ...CINNAMON_CHALLENGE, tastingCupCount: 1 })).toBe(null);
    expect(cinnamonTemplateKindFor({ ...CINNAMON_CHALLENGE, targetTeaIds: [M, K] })).toBe(null);
    expect(cinnamonTemplateKindFor({ ...CINNAMON_CHALLENGE, frozenCupCount: 1 })).toBe(null);
    expect(cinnamonTemplateKindFor({ ...CINNAMON_CHALLENGE, thermosCupCount: 1 })).toBe(null);
  });

  it('cinnamonCupCount validation rejects bad combos loudly (GI/GJ)', () => {
    expect(() => generateLevel({ ...CINNAMON_CHALLENGE, cinnamonCupCount: 2 }, 'bad:multi')).toThrow();
    expect(() => generateLevel({ ...CINNAMON_CHALLENGE, hasMysteryLayer: true }, 'bad:mystery')).toThrow();
    expect(() => generateLevel({ ...CINNAMON_CHALLENGE, sourceOnlyCount: 1 }, 'bad:teapot')).toThrow();
    expect(() => generateLevel({ ...CINNAMON_CHALLENGE, targetTeaIds: [M, K] }, 'bad:targets')).toThrow();
    expect(() => generateLevel({ ...CINNAMON_CHALLENGE, sinkOnlyCount: 1 }, 'bad:sink')).toThrow();
    expect(() => generateLevel({ ...CINNAMON_CHALLENGE, tastingCupCount: 1 }, 'bad:tasting')).toThrow();
    expect(() => generateLevel({ ...CINNAMON_CHALLENGE, floatingIngredient: 'lemon' }, 'bad:lemon')).toThrow();
    expect(() => generateLevel({ ...CINNAMON_CHALLENGE, sinkingIngredient: 'honey' }, 'bad:honey')).toThrow();
    expect(() => generateLevel({ ...CINNAMON_CHALLENGE, hasStrainer: true }, 'bad:strainer')).toThrow();
    expect(() => generateLevel({ ...CINNAMON_CHALLENGE, frozenCupCount: 1 }, 'bad:frozen')).toThrow();
    expect(() => generateLevel({ ...CINNAMON_CHALLENGE, thermosCupCount: 1 }, 'bad:thermos')).toThrow();
  });
});

describe('cinnamon fast-path structural contract (no 150-scan, no plain runtime solve)', () => {
  it('uses bounded template attempts with a single solver call on the happy path', () => {
    const attempts: number[] = [];
    const calls: number[] = [];
    for (let s = 0; s < 20; s++) {
      const st = createGenerateStats();
      generateLevel(CINNAMON_CHALLENGE, `cinnamon-fp:${s}`, { stats: st });
      expect(st.candidatesTried).toBe(0);
      expect(st.templateAttempts).toBeGreaterThanOrEqual(1);
      expect(st.templateAttempts).toBeLessThanOrEqual(CINNAMON_TEMPLATE_ATTEMPTS);
      // Happy path is exactly one production solve (L2 trace inside finalize).
      expect(st.solverCalls).toBe(1);
      expect(st.usedFallback).toBe(false);
      attempts.push(st.templateAttempts);
      calls.push(st.solverCalls);
    }
    expect(median(attempts)).toBe(1);
    expect(p95(attempts)).toBeLessThanOrEqual(2);
    expect(Math.max(...attempts)).toBeLessThanOrEqual(CINNAMON_TEMPLATE_ATTEMPTS);
    expect(calls.every((c) => c === 1)).toBe(true);
  }, 180000);
});

describe('cinnamon generator determinism (20 seeds)', () => {
  it('every seed is deterministic, solver-valid, L2, in-band', () => {
    const keys = new Set<string>();
    for (let s = 0; s < 20; s++) {
      const { lvl } = expectCinnamonLevel(CINNAMON_CHALLENGE, `cinnamon-ch:${s}`);
      keys.add(canonicalPuzzleKey(lvl, lvl.cupConstraints));
      const again = generateLevel(CINNAMON_CHALLENGE, `cinnamon-ch:${s}`);
      expect(again.cups).toEqual(lvl.cups);
      expect(again.capacityObstacles).toEqual(lvl.capacityObstacles);
      expect(again.cupConstraints).toEqual(lvl.cupConstraints);
      expect(again.minMoves).toBe(lvl.minMoves);
    }
    // Variety spot (full 100+ seed variety lives in cinnamon-stress).
    expect(keys.size).toBeGreaterThanOrEqual(10);
  }, 300000);
});

describe('cinnamon fallback branch (direct fallbackLevel)', () => {
  it('pinned fallback is solver-validated with its REAL recorded depth 11 and L2 trace', () => {
    const st = createGenerateStats();
    const lvl = fallbackLevel(CINNAMON_CHALLENGE, { stats: st });
    expect(st.usedFallback).toBe(true);
    expect(validateLevelStructure(lvl, CINNAMON_CHALLENGE).ok).toBe(true);
    expect(lvl.minMoves).toBe(11);
    const solved = solvePuzzle(lvl.cups, {
      cupConstraints: lvl.cupConstraints,
      capacityObstacles: lvl.capacityObstacles,
    });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated ?? false).toBe(false);
    expect(solved.minMoves).toBe(lvl.minMoves);
    const host = cinnamonHostOf(lvl);
    expect(host).toBeGreaterThanOrEqual(0);
    const part = analyzeCinnamonParticipation(
      lvl.cups,
      (lvl.capacityObstacles ?? []) as CapacityObstacleSlot[],
      host,
      (solved.solution ?? []) as SolverAction[],
      lvl.cupConstraints,
    );
    expect(part.unlocks).toBeGreaterThanOrEqual(1);
    expect(part.firstExpandedUseDepth).not.toBe(null);
    expect(part.finalObstacleCleared).toBe(true);
    expect(part.win).toBe(true);
    const fin = applySolutionState(
      { cups: lvl.cups, floatingIngredients: lvl.floatingIngredients, capacityObstacles: lvl.capacityObstacles },
      solved.solution ?? [],
      lvl.cupConstraints,
    );
    expect(fin).not.toBe(null);
    expect(isPuzzleWonState(fin as PuzzleState, lvl.cupConstraints)).toBe(true);
  }, 120000);
});

describe('cinnamon root fairness spot (20 seeds, report-only medians)', () => {
  it('never dooms the blind first move; unlock/expanded timing reported', () => {
    const constructives: number[] = [];
    const solvables: number[] = [];
    const optimals: number[] = [];
    const fatals: number[] = [];
    const ratios: number[] = [];
    const unlocks: number[] = [];
    const expanded: number[] = [];
    let doomSeeds = 0;
    for (let s = 0; s < 20; s++) {
      const lvl = generateLevel(CINNAMON_CHALLENGE, `cinnamon-fair:${s}`);
      const constraints = lvl.cupConstraints;
      const state = { cups: lvl.cups, floatingIngredients: lvl.floatingIngredients, capacityObstacles: lvl.capacityObstacles };
      const constructive = listConstructiveActionsState(state, constraints);
      constructives.push(constructive.length);
      let sv = 0;
      let op = 0;
      let fa = 0;
      for (const action of constructive) {
        const res = applyPuzzleActionState(state, action, constraints);
        if (!res) continue;
        const child = solvePuzzle(res.state.cups, {
          cupConstraints: constraints,
          floatingIngredients: res.state.floatingIngredients,
          capacityObstacles: res.state.capacityObstacles,
        });
        const ok = child.solvable && !child.truncated && child.minMoves !== undefined;
        if (ok) {
          sv++;
          if (child.minMoves === (lvl.minMoves as number) - puzzleActionCost(action)) op++;
        } else if (!child.truncated) {
          fa++;
        }
      }
      solvables.push(sv);
      optimals.push(op);
      fatals.push(fa);
      ratios.push(constructive.length > 0 ? fa / constructive.length : 0);
      if (sv === 0) doomSeeds++;
      expect(sv).toBeGreaterThanOrEqual(1);
      const solved = solvePuzzle(lvl.cups, { cupConstraints: constraints, capacityObstacles: lvl.capacityObstacles });
      const host = cinnamonHostOf(lvl);
      const part = analyzeCinnamonParticipation(
        lvl.cups,
        (lvl.capacityObstacles ?? []) as CapacityObstacleSlot[],
        host,
        (solved.solution ?? []) as SolverAction[],
        constraints,
      );
      if (part.firstUnlockDepth !== null) unlocks.push(part.firstUnlockDepth);
      if (part.firstExpandedUseDepth !== null) expanded.push(part.firstExpandedUseDepth);
    }
    expect(doomSeeds / 20).toBeLessThan(0.5);
    console.log(
      `cinnamon fairness: n=20 ` +
        `constructive med=${median(constructives)} solvableFirst med=${median(solvables)} ` +
        `optimalFirst med=${median(optimals)} fatal med=${median(fatals)} ` +
        `fatalRatio med=${median(ratios).toFixed(3)} doomRate=${(doomSeeds / 20).toFixed(3)} ` +
        `firstUnlock med=${median(unlocks)} firstExpanded med=${median(expanded)}`,
    );
  }, 300000);
});

describe('legacy routing regression (G8/G9/G10 untouched)', () => {
  it('lemon+honey still routes to interaction, frozen to frozen, thermos to thermos — never cinnamon', () => {
    const interaction: GenerateRequest = {
      numColors: 4,
      colors: ['buckwheat', 'sea_buckthorn', 'matcha', 'karkade'],
      emptyCups: 2,
      hasMysteryLayer: false,
      phase: 'challenge',
      floatingIngredient: 'lemon',
      sinkingIngredient: 'honey',
      targetTeaIds: [],
    };
    expect(lemonHoneyTemplateKindFor(interaction)).toBe('lemon-honey-interaction');
    expect(cinnamonTemplateKindFor(interaction)).toBe(null);
    const frozen: GenerateRequest = {
      numColors: 4,
      colors: ['sea_buckthorn', 'matcha', 'karkade', 'milk_oolong'],
      emptyCups: 2,
      hasMysteryLayer: false,
      phase: 'challenge',
      frozenCupCount: 1,
    };
    expect(frozenCupTemplateKindFor(frozen)).toBe('frozen-cup');
    expect(cinnamonTemplateKindFor(frozen)).toBe(null);
    const thermos: GenerateRequest = {
      numColors: 4,
      colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'],
      emptyCups: 2,
      hasMysteryLayer: false,
      phase: 'challenge',
      thermosCupCount: 1,
    };
    expect(thermosTemplateKindFor(thermos)).toBe('thermos');
    expect(cinnamonTemplateKindFor(thermos)).toBe(null);
    expect(cinnamonTemplateKindFor(CINNAMON_CHALLENGE)).toBe('cinnamon');
    expect(frozenCupTemplateKindFor(CINNAMON_CHALLENGE)).toBe(null);
    expect(thermosTemplateKindFor(CINNAMON_CHALLENGE)).toBe(null);
  });
});
