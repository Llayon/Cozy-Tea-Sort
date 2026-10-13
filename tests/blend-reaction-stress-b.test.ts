/**
 * Gauntlet 13 — production stress part B (seeds 100–199) + chemistry fairness.
 * Split from the 200-seed stress into two batches so no single vitest
 * process holds a 2-minute BFS load (worker-RPC flake mitigation).
 */
import { describe, expect, it } from 'vitest';
import { runOneBlendSeed } from './blend-reaction-stress-shared';

function pct(a: number[], p: number): number {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
}

describe('100 production blend seeds (100–199)', () => {
  it('all deterministic L2 with stoichiometry + win', () => {
    const results = [];
    for (let i = 100; i < 200; i++) {
      results.push(runOneBlendSeed(i));
    }
    const genTimes = results.map((r) => r.genMs);
    const solvTimes = results.map((r) => r.solveMs);
    const visited = results.map((r) => r.visited);
    const attempts = results.map((r) => r.templateAttempts);
    const roots = results.map((r) => r.rootConstructive);
    console.log(`blend stress-B gen p50=${pct(genTimes, 50)} p95=${pct(genTimes, 95)} max=${Math.max(...genTimes)}`);
    console.log(`blend stress-B solver p50=${pct(solvTimes, 50)} p95=${pct(solvTimes, 95)} max=${Math.max(...solvTimes)}`);
    console.log(`visited p50=${pct(visited, 50)} p95=${pct(visited, 95)} max=${Math.max(...visited)}`);
    console.log(`attempts median=${pct(attempts, 50)} p95=${pct(attempts, 95)} max=${Math.max(...attempts)}`);
    console.log(`rootConstructive median=${pct(roots, 50)} p95=${pct(roots, 95)} max=${Math.max(...roots)}`);
    // Chemistry fairness snapshot: interleaving + product use + batch rate.
    // Full child-solve fairness (solvable/optimal/fatal/doom) lives in
    // scripts/dev/blend-fairness.ts (50 seeds, offline evidence).
    const pTrans = results.filter((r) => r.pTrans >= 1).length;
    const batch = results.filter((r) => r.between === 0).length;
    const deep = results.filter((r) => r.between >= 2).length;
    console.log(`interleave>=2: ${deep}/100, productTransfer: ${pTrans}/100, batch0: ${batch}/100`);
    expect(pTrans).toBeGreaterThanOrEqual(75);
    expect(batch).toBe(0);
    expect(deep).toBeGreaterThanOrEqual(60);
  }, 300000);
});
