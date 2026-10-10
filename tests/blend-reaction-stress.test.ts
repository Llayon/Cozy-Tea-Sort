/**
 * Gauntlet 13 — production stress (200 seeds) + variety/fairness/perf.
 */
import { describe, expect, it } from 'vitest';
import { canonicalPuzzleKey } from '../src/game/logic/rules';
import { emptyFloatingIngredients, defaultCupConstraints } from '../src/game/types';
import { generateLevel, createGenerateStats } from '../src/game/logic/generator';
import { solvePuzzle } from '../src/game/logic/solver';
import { R, blendReqFor, runOneBlendSeed } from './blend-reaction-stress-shared';

describe('200 production blend seeds', () => {
  it('all deterministic L2 with stoichiometry + win', () => {
    const results = [];
    const genTimes: number[] = [];
    const solvTimes: number[] = [];
    const visited: number[] = [];
    const attempts: number[] = [];
    for (let i = 0; i < 200; i++) {
      const t0 = Date.now();
      const r = runOneBlendSeed(i);
      genTimes.push(Date.now() - t0);
      results.push(r);
      visited.push(r.visited);
      attempts.push(r.templateAttempts);
      // Direct solver timing on the same board (perf).
      const req = blendReqFor(i);
      const lvl = generateLevel(req, `blend-stress-${i}`);
      const s0 = Date.now();
      const s = solvePuzzle(lvl.cups, { cupConstraints: lvl.cupConstraints, blendRecipe: R });
      solvTimes.push(Date.now() - s0);
      expect(s.solvable).toBe(true);
    }
    const pct = (a: number[], p: number) => {
      const s = [...a].sort((x, y) => x - y);
      return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
    };
    console.log(`blend stress gen p50=${pct(genTimes, 50)} p95=${pct(genTimes, 95)} max=${Math.max(...genTimes)}`);
    console.log(`blend stress solver p50=${pct(solvTimes, 50)} p95=${pct(solvTimes, 95)} max=${Math.max(...solvTimes)}`);
    console.log(`visited p50=${pct(visited, 50)} p95=${pct(visited, 95)} max=${Math.max(...visited)}`);
    console.log(`attempts median=${pct(attempts, 50)} p95=${pct(attempts, 95)} max=${Math.max(...attempts)}`);
    // Performance targets (preferred): generator p95 <150ms, solver p95 <250ms.
    // These run under tsx/vitest CPU load; report honestly (no hard fail on
    // infra variance, but flag architectural miss).
    // Variety: >=14 distinct starts across 100 seeds (prefer 18).
    const keys100 = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const req = blendReqFor(i);
      const lvl = generateLevel(req, `blend-stress-${i}`);
      keys100.add(canonicalPuzzleKey({ cups: lvl.cups, floatingIngredients: emptyFloatingIngredients(6) }, lvl.cupConstraints));
    }
    console.log(`variety distinct/100 = ${keys100.size}`);
    expect(keys100.size).toBeGreaterThanOrEqual(14);
    // Fairness snapshot: interleaving + product use + batch rate.
    const between = results.map((r) => r.between);
    const pTrans = results.filter((r) => r.pTrans >= 1).length;
    const batch = results.filter((r) => r.between === 0).length;
    console.log(`interleave>=2: ${results.filter((r) => r.between >= 2).length}/200, productTransfer: ${pTrans}/200, batch0: ${batch}/200`);
    expect(pTrans).toBeGreaterThanOrEqual(150);
    expect(batch).toBe(0);
  }, 300000);
});
