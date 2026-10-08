/**
 * Gauntlet 9 §88–91, §119–124 — frozen-cup fast-path contract.
 *
 * Request detection (frozenCupTemplateKindFor), fail-fast validation
 * (ER/ES + sibling-special carve-outs), bounded template attempts with a
 * single production solve (no 150-scan), fallback branch, determinism,
 * 100-seed variety (≥14 distinct starts), root fairness spot (≥50 seeds,
 * report-only medians + ice timing), and a legacy regression spot (G8
 * routing untouched).
 */
import { describe, expect, it } from 'vitest';
import type { TeaId } from '../src/game/types';
import {
  applyPuzzleActionState,
  canonicalPuzzleKey,
  isPuzzleWonState,
  listConstructiveActionsState,
  listLegalMovesState,
  puzzleActionCost,
} from '../src/game/logic/rules';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import {
  analyzeIceParticipation,
  createGenerateStats,
  fallbackLevel,
  frozenCupTemplateKindFor,
  generateLevel,
  lemonHoneyTemplateKindFor,
  validateLevelStructure,
  type GeneratedLevel,
  type GenerateRequest,
} from '../src/game/logic/generator';
import {
  FROZEN_CUP_DEPTH_ACCEPT,
  FROZEN_CUP_TEMPLATE_ATTEMPTS,
} from '../src/game/logic/frozenCupTemplates';

const SB: TeaId = 'sea_buckthorn';
const M: TeaId = 'matcha';
const K: TeaId = 'karkade';
const O: TeaId = 'milk_oolong';

const FROZEN_CHALLENGE: GenerateRequest = {
  numColors: 4,
  colors: [SB, M, K, O],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  frozenCupCount: 1,
};

function median(a: number[]): number {
  if (a.length === 0) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)] as number;
}

function expectFrozenLevel(req: GenerateRequest, seed: string): { lvl: GeneratedLevel } {
  const lvl = generateLevel(req, seed);
  expect(validateLevelStructure(lvl, req).ok).toBe(true);
  const solved = solvePuzzle(lvl.cups, {
    cupConstraints: lvl.cupConstraints,
    floatingIngredients: lvl.floatingIngredients,
    iceSlots: lvl.iceSlots,
  });
  expect(solved.solvable).toBe(true);
  expect(solved.truncated).not.toBe(true);
  expect(solved.minMoves).toBe(lvl.minMoves);
  expect(lvl.minMoves).toBeGreaterThanOrEqual(FROZEN_CUP_DEPTH_ACCEPT.min);
  expect(lvl.minMoves).toBeLessThanOrEqual(FROZEN_CUP_DEPTH_ACCEPT.max);
  const host = (lvl.iceSlots ?? []).findIndex((s) => s === 'ice');
  expect(host).toBeGreaterThanOrEqual(0);
  const part = analyzeIceParticipation(
    lvl.cups,
    lvl.iceSlots ?? [],
    host,
    (solved.solution ?? []) as never[],
    lvl.cupConstraints,
  );
  expect(part.melts).toBeGreaterThanOrEqual(1);
  expect(part.sourceUses).toBeGreaterThanOrEqual(1);
  expect(part.finalIceCleared).toBe(true);
  expect(part.win).toBe(true);
  const fin = applySolutionState(
    { cups: lvl.cups, floatingIngredients: lvl.floatingIngredients, iceSlots: lvl.iceSlots },
    solved.solution ?? [],
    lvl.cupConstraints,
  );
  expect(fin).not.toBe(null);
  expect(isPuzzleWonState(fin as never, lvl.cupConstraints)).toBe(true);
  return { lvl };
}

describe('frozen-cup template-kind routing', () => {
  it('canonical frozen requests hit the fast path; others do not', () => {
    expect(frozenCupTemplateKindFor(FROZEN_CHALLENGE)).toBe('frozen-cup');
    expect(frozenCupTemplateKindFor({ ...FROZEN_CHALLENGE, frozenCupCount: 0 })).toBe(null);
    expect(frozenCupTemplateKindFor({ ...FROZEN_CHALLENGE, numColors: 3 })).toBe(null);
    expect(frozenCupTemplateKindFor({ ...FROZEN_CHALLENGE, emptyCups: 1 })).toBe(null);
    expect(frozenCupTemplateKindFor({ ...FROZEN_CHALLENGE, hasMysteryLayer: true })).toBe(null);
    expect(frozenCupTemplateKindFor({ ...FROZEN_CHALLENGE, sourceOnlyCount: 1 })).toBe(null);
    expect(frozenCupTemplateKindFor({ ...FROZEN_CHALLENGE, floatingIngredient: 'lemon' })).toBe(null);
    expect(frozenCupTemplateKindFor({ ...FROZEN_CHALLENGE, sinkingIngredient: 'honey' })).toBe(null);
    expect(frozenCupTemplateKindFor({ ...FROZEN_CHALLENGE, hasStrainer: true })).toBe(null);
    expect(frozenCupTemplateKindFor({ ...FROZEN_CHALLENGE, sinkOnlyCount: 1 })).toBe(null);
    expect(frozenCupTemplateKindFor({ ...FROZEN_CHALLENGE, tastingCupCount: 1 })).toBe(null);
    expect(frozenCupTemplateKindFor({ ...FROZEN_CHALLENGE, targetTeaIds: [M, K] })).toBe(null);
  });

  it('frozenCupCount validation rejects bad combos loudly (ER/ES)', () => {
    expect(() => generateLevel({ ...FROZEN_CHALLENGE, frozenCupCount: 2 }, 'bad:multi')).toThrow();
    expect(() => generateLevel({ ...FROZEN_CHALLENGE, hasMysteryLayer: true }, 'bad:mystery')).toThrow();
    expect(() => generateLevel({ ...FROZEN_CHALLENGE, sourceOnlyCount: 1 }, 'bad:teapot')).toThrow();
    expect(() => generateLevel({ ...FROZEN_CHALLENGE, targetTeaIds: [M, K] }, 'bad:targets')).toThrow();
    expect(() => generateLevel({ ...FROZEN_CHALLENGE, sinkOnlyCount: 1 }, 'bad:sink')).toThrow();
    expect(() => generateLevel({ ...FROZEN_CHALLENGE, tastingCupCount: 1 }, 'bad:tasting')).toThrow();
    expect(() => generateLevel({ ...FROZEN_CHALLENGE, floatingIngredient: 'lemon' }, 'bad:lemon')).toThrow();
    expect(() => generateLevel({ ...FROZEN_CHALLENGE, sinkingIngredient: 'honey' }, 'bad:honey')).toThrow();
    expect(() => generateLevel({ ...FROZEN_CHALLENGE, hasStrainer: true }, 'bad:strainer')).toThrow();
    expect(() =>
      generateLevel({ ...FROZEN_CHALLENGE, colors: [M, K, O, 'lavender'] }, 'bad:palette'),
    ).toThrow();
  });
});

describe('frozen-cup fast-path structural contract (no 150-scan)', () => {
  it('uses bounded template attempts with a single solver call', () => {
    const attempts: number[] = [];
    for (let s = 0; s < 10; s++) {
      const st = createGenerateStats();
      generateLevel(FROZEN_CHALLENGE, `frozen-fp:${s}`, { stats: st });
      expect(st.candidatesTried).toBe(0);
      expect(st.templateAttempts).toBeGreaterThanOrEqual(1);
      expect(st.templateAttempts).toBeLessThanOrEqual(FROZEN_CUP_TEMPLATE_ATTEMPTS);
      // Ice needs no without-proof: exactly one production solve.
      expect(st.solverCalls).toBe(1);
      expect(st.usedFallback).toBe(false);
      attempts.push(st.templateAttempts);
    }
    expect(median(attempts)).toBe(1);
  }, 120000);
});

describe('frozen-cup generator (100 seeds)', () => {
  it('every seed is deterministic, solver-valid, L2, in-band, with >= 14 distinct start keys', () => {
    const keys = new Set<string>();
    for (let s = 0; s < 100; s++) {
      const { lvl } = expectFrozenLevel(FROZEN_CHALLENGE, `frozen-ch:${s}`);
      keys.add(canonicalPuzzleKey(lvl, lvl.cupConstraints));
      const again = generateLevel(FROZEN_CHALLENGE, `frozen-ch:${s}`);
      expect(again.cups).toEqual(lvl.cups);
      expect(again.iceSlots).toEqual(lvl.iceSlots);
    }
    expect(keys.size).toBeGreaterThanOrEqual(14);
  }, 240000);
});

describe('frozen-cup fallback branch (direct fallbackLevel)', () => {
  it('pinned fallback is solver-validated with its REAL recorded depth, L2, melt + source-use', () => {
    const st = createGenerateStats();
    const lvl = fallbackLevel(FROZEN_CHALLENGE, { stats: st });
    expect(st.usedFallback).toBe(true);
    expect(validateLevelStructure(lvl, FROZEN_CHALLENGE).ok).toBe(true);
    // Pinned strong L2 fallback (depth 11, delayed melt).
    expect(lvl.minMoves).toBe(11);
    const solved = solvePuzzle(lvl.cups, {
      cupConstraints: lvl.cupConstraints,
      iceSlots: lvl.iceSlots,
    });
    expect(solved.solvable).toBe(true);
    expect(solved.minMoves).toBe(lvl.minMoves);
    const host = (lvl.iceSlots ?? []).findIndex((s) => s === 'ice');
    const part = analyzeIceParticipation(
      lvl.cups,
      lvl.iceSlots ?? [],
      host,
      (solved.solution ?? []) as never[],
      lvl.cupConstraints,
    );
    expect(part.melts).toBeGreaterThanOrEqual(1);
    expect(part.sourceUses).toBeGreaterThanOrEqual(1);
    expect(part.finalIceCleared).toBe(true);
    expect(part.win).toBe(true);
  }, 120000);
});

describe('frozen-cup root fairness spot (50 seeds, report-only medians)', () => {
  it('never dooms the blind first move; melt timing reported', () => {
    const constructives: number[] = [];
    const solvables: number[] = [];
    const optimals: number[] = [];
    const fatals: number[] = [];
    const ratios: number[] = [];
    const meltDepths: number[] = [];
    const useDepths: number[] = [];
    let immediateMelts = 0;
    let doomSeeds = 0;
    for (let s = 0; s < 50; s++) {
      const lvl = generateLevel(FROZEN_CHALLENGE, `frozen-fair:${s}`);
      const constraints = lvl.cupConstraints;
      const state = {
        cups: lvl.cups,
        floatingIngredients: lvl.floatingIngredients,
        iceSlots: lvl.iceSlots,
      };
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
          iceSlots: res.state.iceSlots,
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
      // Ice timing on the optimal line.
      const solved = solvePuzzle(lvl.cups, {
        cupConstraints: constraints,
        iceSlots: lvl.iceSlots,
      });
      const host = (lvl.iceSlots ?? []).findIndex((x) => x === 'ice');
      const part = analyzeIceParticipation(
        lvl.cups,
        lvl.iceSlots ?? [],
        host,
        (solved.solution ?? []) as never[],
        constraints,
      );
      if (part.firstMeltDepth !== null) {
        meltDepths.push(part.firstMeltDepth);
        if (part.firstMeltDepth === 0) immediateMelts++;
      }
      if (part.firstSourceUseDepth !== null) useDepths.push(part.firstSourceUseDepth);
    }
    expect(doomSeeds / 50).toBeLessThan(0.5);
    console.log(
      `frozen-cup fairness: n=50 ` +
        `constructive med=${median(constructives)} solvableFirst med=${median(solvables)} ` +
        `optimalFirst med=${median(optimals)} fatal med=${median(fatals)} ` +
        `fatalRatio med=${median(ratios).toFixed(3)} doomRate=${(doomSeeds / 50).toFixed(3)} ` +
        `firstMelt med=${median(meltDepths)} immediate=${immediateMelts}/50 ` +
        `firstSourceUse med=${median(useDepths)}`,
    );
  }, 240000);
});

describe('legacy routing regression (G8 untouched)', () => {
  it('lemon+honey requests still route to the interaction bank, never frozen', () => {
    const req: GenerateRequest = {
      numColors: 4,
      colors: ['buckwheat', 'sea_buckthorn', 'matcha', 'karkade'],
      emptyCups: 2,
      hasMysteryLayer: false,
      phase: 'challenge',
      floatingIngredient: 'lemon',
      sinkingIngredient: 'honey',
      targetTeaIds: [],
    };
    expect(lemonHoneyTemplateKindFor(req)).toBe('lemon-honey-interaction');
    expect(frozenCupTemplateKindFor(req)).toBe(null);
  });
});
