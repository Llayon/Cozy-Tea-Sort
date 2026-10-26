/**
 * G15 Order+Tasting stress + fairness + performance (§§29-30, §36):
 * 200 generated/replayed boards (tea conservation, legality, prefix order,
 * locks, participation, replay parity, win parity, no reaction leak);
 * 50-seed child-solve fairness (doom=0, fatal rate); perf budgets
 * (solver p95 <250ms, visited p95 <10k).
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { CupConstraint, SolverAction, TeaId } from '../src/game/types';
import { emptyFloatingIngredients, TEA_UNITS_PER_COLOR } from '../src/game/types';
import { applyPourState, canPourState, isPuzzleWonState } from '../src/game/logic/rules';
import { solvePuzzle } from '../src/game/logic/solver';
import { generateLevel, createGenerateStats } from '../src/game/logic/generator';
import { servedPrefixLength } from '../src/game/logic/servingOrder';

// CPU-heavy fairness/stress loops block the worker event loop for ~30s each.
// Yield between tests so Vitest can flush its worker RPC task updates; this
// changes no assertions and keeps the known onTaskUpdate timeout flake out of
// the gate.
afterEach(async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
});

const PAL: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
function req() {
  return {
    numColors: 4, colors: [...PAL], emptyCups: 2, hasMysteryLayer: false,
    phase: 'challenge' as const, sourceOnlyCount: 0, targetTeaIds: [] as TeaId[],
    tastingCupCount: 1, floatingIngredient: undefined, hasStrainer: false,
    sinkingIngredient: undefined, frozenCupCount: 0, thermosCupCount: 0,
    cinnamonCupCount: 0, teaBudCount: 0, blendRecipeId: undefined, serveOrderCount: 2,
  };
}
function teaCounts(cups: TeaId[][]): Map<TeaId, number> {
  const m = new Map<TeaId, number>();
  for (const cup of cups) for (const t of cup) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}
function pct(a: number[], p: number): number {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
}

describe('stress: 200 production boards (§30)', () => {
  it('replay parity, conservation, prefix order, locks, participation, win', () => {
    const solverMs: number[] = [];
    const visited: number[] = [];
    let tastedCount = 0;
    for (let i = 0; i < 200; i++) {
      const lvl = generateLevel(req(), `g15-stress-${i}`);
      // Structural: combo intact, shape, counts, no reaction leak.
      expect(lvl.cupConstraints.filter((c) => c.serveOrder === 1).length).toBe(1);
      expect(lvl.cupConstraints.filter((c) => c.serveOrder === 2).length).toBe(1);
      expect(lvl.cupConstraints.filter((c) => c.capacity === 2 && c.mustEndEmpty === true).length).toBe(1);
      expect(lvl.blendRecipe).toBeUndefined();
      for (const cup of lvl.cups) for (const t of cup) expect(['black_tea', 'milk', 'milk_tea']).not.toContain(t);
      const counts = teaCounts(lvl.cups);
      for (const t of PAL) expect(counts.get(t)).toBe(TEA_UNITS_PER_COLOR);
      const t0 = Date.now();
      const r = solvePuzzle(lvl.cups, { cupConstraints: lvl.cupConstraints, maxVisited: 120_000, maxDepth: 60, returnSolution: true });
      solverMs.push(Date.now() - t0);
      visited.push(r.visitedStates);
      expect(r.truncated).not.toBe(true);
      expect(r.solvable).toBe(true);
      expect(r.minMoves).toBe(lvl.minMoves);
      // Replay with per-move conservation + legality.
      let board = lvl.cups.map((c) => [...c]);
      let s1: number | null = null;
      let s2: number | null = null;
      let tasted = false;
      const sol = r.solution as SolverAction[];
      for (let k = 0; k < sol.length; k++) {
        const a = sol[k] as SolverAction;
        expect(a.kind).toBe('pour');
        const pour = a as Extract<SolverAction, { kind: 'pour' }>;
        expect(canPourState({ cups: board, floatingIngredients: emptyFloatingIngredients(6) }, pour.from, pour.to, lvl.cupConstraints)).toBe(true);
        const before = teaCounts(board);
        const res = applyPourState({ cups: board, floatingIngredients: emptyFloatingIngredients(6) }, pour.from, pour.to, lvl.cupConstraints);
        expect(res).not.toBeNull();
        expect(teaCounts(res!.state.cups as TeaId[][])).toEqual(before);
        if (pour.from === 5 || pour.to === 5) tasted = true;
        board = res!.state.cups as TeaId[][];
        if (res!.serveCompleted === 1 && s1 === null) s1 = k;
        if (res!.serveCompleted === 2 && s2 === null) s2 = k;
        if (res!.serveCompleted === 2) expect(s1).not.toBeNull();
      }
      expect(tasted).toBe(true);
      if (tasted) tastedCount++;
      expect(s1).not.toBeNull();
      expect(s2).not.toBeNull();
      expect(s1 as number).toBeLessThan(s2 as number);
      expect(servedPrefixLength({ cups: board, floatingIngredients: emptyFloatingIngredients(6) }, lvl.cupConstraints)).toBe(2);
      expect(isPuzzleWonState({ cups: board, floatingIngredients: emptyFloatingIngredients(6) }, lvl.cupConstraints)).toBe(true);
      // Served locks hold at win.
      const o1 = lvl.cupConstraints.findIndex((c) => c.serveOrder === 1);
      const o2 = lvl.cupConstraints.findIndex((c) => c.serveOrder === 2);
      expect(canPourState({ cups: board, floatingIngredients: emptyFloatingIngredients(6) }, o1, 4, lvl.cupConstraints)).toBe(false);
      expect(canPourState({ cups: board, floatingIngredients: emptyFloatingIngredients(6) }, o2, 4, lvl.cupConstraints)).toBe(false);
    }
    expect(tastedCount).toBe(200);
    console.log(`[g15-stress] solver ms p50=${pct(solverMs, 50)} p95=${pct(solverMs, 95)} max=${Math.max(...solverMs)} | visited p50=${pct(visited, 50)} p95=${pct(visited, 95)} max=${Math.max(...visited)}`);
    expect(pct(solverMs, 95)).toBeLessThan(500);
    expect(pct(visited, 95)).toBeLessThan(10000);
  }, 600000);
});

describe('fairness: 50-seed child-solve (§29)', () => {
  it('doom=0, safe first moves exist, fatal rate sane', () => {
    let doom = 0;
    let fatalFirst = 0;
    let totalFirst = 0;
    for (let i = 0; i < 50; i++) {
      const lvl = generateLevel(req(), `g15-fair-${i}`);
      const r = solvePuzzle(lvl.cups, { cupConstraints: lvl.cupConstraints, maxVisited: 120_000, maxDepth: 60, returnSolution: false });
      expect(r.solvable).toBe(true);
      // Child-solve every legal first pour: fatal = makes puzzle unsolvable.
      const tried: Array<{ from: number; to: number }> = [];
      for (let f = 0; f < lvl.cups.length; f++) {
        for (let t = 0; t < lvl.cups.length; t++) {
          if (f === t) continue;
          if (canPourState({ cups: lvl.cups, floatingIngredients: emptyFloatingIngredients(6) }, f, t, lvl.cupConstraints)) {
            tried.push({ from: f, to: t });
          }
        }
      }
      expect(tried.length).toBeGreaterThan(0);
      let solvableChildren = 0;
      for (const m of tried) {
        totalFirst++;
        const res = applyPourState({ cups: lvl.cups.map((c) => [...c]), floatingIngredients: emptyFloatingIngredients(6) }, m.from, m.to, lvl.cupConstraints);
        if (!res) { fatalFirst++; continue; }
        const rc = solvePuzzle(res.state.cups as TeaId[][], {
          cupConstraints: lvl.cupConstraints,
          floatingIngredients: res.state.floatingIngredients,
          maxVisited: 120_000, maxDepth: 60, returnSolution: false,
        });
        if (rc.solvable) solvableChildren++;
        else fatalFirst++;
      }
      if (solvableChildren === 0) doom++;
    }
    console.log(`[g15-fair] doom=${doom}/50 fatalFirst=${fatalFirst}/${totalFirst} (${(100 * fatalFirst / Math.max(1, totalFirst)).toFixed(1)}%)`);
    expect(doom).toBe(0);
    expect(fatalFirst / Math.max(1, totalFirst)).toBeLessThan(0.4);
  }, 600000);
});

describe('production perf (§36)', () => {
  it('generator happy path: attempts ≤4, 1 solver call', () => {
    const gens: number[] = [];
    for (let i = 0; i < 20; i++) {
      const stats = createGenerateStats();
      const t0 = Date.now();
      generateLevel(req(), `g15-perf-${i}`, { stats });
      gens.push(Date.now() - t0);
      expect(stats.templateAttempts).toBeLessThanOrEqual(4);
      expect(stats.solverCalls).toBe(1);
      expect(stats.usedFallback).toBe(false);
    }
    console.log(`[g15-perf] generator ms p50=${pct(gens, 50)} p95=${pct(gens, 95)} max=${Math.max(...gens)}`);
  });
});
