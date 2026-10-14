/**
 * Gauntlet 14 — production stress part B (seeds 100–199) + order fairness.
 * Split into two batches so no single vitest process holds a long BFS
 * load (worker-RPC flake mitigation, same pattern as G13 stress).
 */
import { describe, expect, it } from 'vitest';
import { runOneServingSeed } from './serving-order-stress-shared';

function pct(a: number[], p: number): number {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
}

describe('100 production serving seeds (100–199)', () => {
  it('all deterministic L2 with conservation + win', () => {
    const results = [];
    for (let i = 100; i < 200; i++) {
      results.push(runOneServingSeed(i));
    }
    const genTimes = results.map((r) => r.genMs);
    const solvTimes = results.map((r) => r.solveMs);
    const visited = results.map((r) => r.visited);
    const attempts = results.map((r) => r.templateAttempts);
    const roots = results.map((r) => r.rootConstructive);
    console.log(`serving stress-B gen p50=${pct(genTimes, 50)} p95=${pct(genTimes, 95)} max=${Math.max(...genTimes)}`);
    console.log(`serving stress-B solver p50=${pct(solvTimes, 50)} p95=${pct(solvTimes, 95)} max=${Math.max(...solvTimes)}`);
    console.log(`visited p50=${pct(visited, 50)} p95=${pct(visited, 95)} max=${Math.max(...visited)}`);
    console.log(`attempts median=${pct(attempts, 50)} p95=${pct(attempts, 95)} max=${Math.max(...attempts)}`);
    console.log(`rootConstructive median=${pct(roots, 50)} p95=${pct(roots, 95)} max=${Math.max(...roots)}`);
    // Order fairness snapshot: early pressure + serve gaps + batch rate.
    // Full child-solve fairness lives in scripts/dev/serving-order-fairness.ts.
    const early = results.filter((r) => r.pressDiv <= 0.65).length;
    const deep = results.filter((r) => r.gap12 >= 2).length;
    console.log(`pressure<=0.65: ${early}/100, gap>=2: ${deep}/100`);
    expect(early).toBeGreaterThanOrEqual(40);
  }, 300000);
});
