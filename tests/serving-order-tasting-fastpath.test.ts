/**
 * G15 Order+Tasting generator fastpath (§§21-22, §34): valid combo accepted,
 * invalid rejected loudly, exact mechanics, no blend leak, bounded attempts
 * (≤4) and solver calls (1 happy path), pinned fallback preserves combo.
 */
import { describe, expect, it } from 'vitest';
import type { TeaId } from '../src/game/types';
import {
  createGenerateStats,
  fallbackLevel,
  generateLevel,
  requestedServeOrderCount,
  servingOrderCompositionKindFor,
} from '../src/game/logic/generator';
import { solvePuzzle } from '../src/game/logic/solver';
import { isPuzzleWonState, applyPourState } from '../src/game/logic/rules';
import { emptyFloatingIngredients } from '../src/game/types';
import type { SolverAction } from '../src/game/types';
import { servedPrefixLength } from '../src/game/logic/servingOrder';

const PAL: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
function req(seedPal: TeaId[] = PAL) {
  return {
    numColors: 4, colors: [...seedPal], emptyCups: 2, hasMysteryLayer: false,
    phase: 'challenge' as const, sourceOnlyCount: 0, targetTeaIds: [] as TeaId[],
    tastingCupCount: 1, floatingIngredient: undefined, hasStrainer: false,
    sinkingIngredient: undefined, frozenCupCount: 0, thermosCupCount: 0,
    cinnamonCupCount: 0, teaBudCount: 0, blendRecipeId: undefined,
    serveOrderCount: 2,
  };
}

describe('request validation (§21)', () => {
  it('valid combo recognized; standalone still recognized', () => {
    expect(servingOrderCompositionKindFor(req())).toBe('serving-order-tasting');
    expect(requestedServeOrderCount(req())).toBe(2);
  });
  it('invalid combos rejected loudly (no silent fallback)', () => {
    expect(() => generateLevel({ ...req(), serveOrderCount: 1 }, 'x')).toThrow();
    expect(() => generateLevel({ ...req(), tastingCupCount: 2 }, 'x')).toThrow();
    expect(() => generateLevel({ ...req(), hasMysteryLayer: true }, 'x')).toThrow();
    expect(() => generateLevel({ ...req(), blendRecipeId: 'milk-tea' as never }, 'x')).toThrow();
    expect(() => generateLevel({ ...req(), hasStrainer: true }, 'x')).toThrow();
    expect(() => generateLevel({ ...req(), colors: ['black_tea', 'milk', 'matcha', 'sea_buckthorn'] as TeaId[] }, 'x')).toThrow();
  });
});

describe('fastpath: bounded, exact mechanics, C2 (§22)', () => {
  it('happy path: 1 solver call, ≤4 attempts, exact combo, solvable C2', () => {
    const stats = createGenerateStats();
    const lvl = generateLevel(req(), 'g15-taste-happy-1', { stats });
    expect(stats.solverCalls).toBe(1);
    expect(stats.templateAttempts).toBeLessThanOrEqual(4);
    expect(stats.usedFallback).toBe(false);
    expect(lvl.cupConstraints.filter((c) => c.serveOrder === 1).length).toBe(1);
    expect(lvl.cupConstraints.filter((c) => c.serveOrder === 2).length).toBe(1);
    expect(lvl.cupConstraints.filter((c) => c.mode === 'normal' && c.capacity === 2 && c.mustEndEmpty === true).length).toBe(1);
    expect(lvl.blendRecipe).toBeUndefined();
    for (const cup of lvl.cups) for (const t of cup) expect(['black_tea', 'milk', 'milk_tea']).not.toContain(t);
    const r = solvePuzzle(lvl.cups, { cupConstraints: lvl.cupConstraints, maxVisited: 120_000, maxDepth: 60, returnSolution: true });
    expect(r.solvable).toBe(true);
    expect(r.minMoves).toBe(lvl.minMoves);
    // C2 witness on the generated layout.
    let board = lvl.cups.map((c) => [...c]);
    let s1: number | null = null;
    let s2: number | null = null;
    let tasted = false;
    for (let i = 0; i < (r.solution as SolverAction[]).length; i++) {
      const a = (r.solution as SolverAction[])[i] as SolverAction;
      if (a.kind !== 'pour') continue;
      if (a.from === 5 || a.to === 5) tasted = true;
      const res = applyPourState({ cups: board, floatingIngredients: emptyFloatingIngredients(6) }, a.from, a.to, lvl.cupConstraints);
      if (!res) throw new Error('replay failed');
      board = res.state.cups as TeaId[][];
      if (res.serveCompleted === 1 && s1 === null) s1 = i;
      if (res.serveCompleted === 2 && s2 === null) s2 = i;
    }
    expect(tasted).toBe(true);
    expect(s1).not.toBeNull();
    expect(s2).not.toBeNull();
    expect(servedPrefixLength({ cups: board, floatingIngredients: emptyFloatingIngredients(6) }, lvl.cupConstraints)).toBe(2);
    expect(isPuzzleWonState({ cups: board, floatingIngredients: emptyFloatingIngredients(6) }, lvl.cupConstraints)).toBe(true);
  });
  it('variety: 20 seeds give >=8 distinct starts (not just color renaming)', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const lvl = generateLevel(req(), `g15-taste-variety-${i}`);
      keys.add(JSON.stringify(lvl.cups));
    }
    expect(keys.size).toBeGreaterThanOrEqual(8);
  });
});

describe('fallback preserves combo (§22)', () => {
  it('pinned fallback: combo intact, exact depth 11, C2, prefix 2, win', () => {
    const stats = createGenerateStats();
    const lvl = fallbackLevel(req(), { stats });
    expect(stats.usedFallback).toBe(true);
    expect(lvl.cupConstraints.filter((c) => c.serveOrder === 1).length).toBe(1);
    expect(lvl.cupConstraints.filter((c) => c.serveOrder === 2).length).toBe(1);
    expect(lvl.cupConstraints.filter((c) => c.mode === 'normal' && c.capacity === 2 && c.mustEndEmpty === true).length).toBe(1);
    expect(lvl.minMoves).toBe(11);
    const r = solvePuzzle(lvl.cups, { cupConstraints: lvl.cupConstraints, maxVisited: 120_000, maxDepth: 60, returnSolution: true });
    expect(r.solvable).toBe(true);
    expect(r.minMoves).toBe(11);
    expect((r.solution as SolverAction[]).some((a) => a.kind === 'pour' && (a.from === 5 || a.to === 5))).toBe(true);
  });
});
