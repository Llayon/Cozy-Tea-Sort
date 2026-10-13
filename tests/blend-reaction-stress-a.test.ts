/**
 * Gauntlet 13 — production stress part A (seeds 0–99) + variety/perf.
 * Split from the 200-seed stress into two batches so no single vitest
 * process holds a 2-minute BFS load (worker-RPC flake mitigation).
 */
import { describe, expect, it } from 'vitest';
import { runOneBlendSeed } from './blend-reaction-stress-shared';

function pct(a: number[], p: number): number {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
}

describe('100 production blend seeds (0–99)', () => {
  it('all deterministic L2 with stoichiometry + win', () => {
    const results = [];
    for (let i = 0; i < 100; i++) {
      results.push(runOneBlendSeed(i));
    }
    const genTimes = results.map((r) => r.genMs);
    const solvTimes = results.map((r) => r.solveMs);
    const visited = results.map((r) => r.visited);
    const attempts = results.map((r) => r.templateAttempts);
    const roots = results.map((r) => r.rootConstructive);
    console.log(`blend stress-A gen p50=${pct(genTimes, 50)} p95=${pct(genTimes, 95)} max=${Math.max(...genTimes)}`);
    console.log(`blend stress-A solver p50=${pct(solvTimes, 50)} p95=${pct(solvTimes, 95)} max=${Math.max(...solvTimes)}`);
    console.log(`visited p50=${pct(visited, 50)} p95=${pct(visited, 95)} max=${Math.max(...visited)}`);
    console.log(`attempts median=${pct(attempts, 50)} p95=${pct(attempts, 95)} max=${Math.max(...attempts)}`);
    console.log(`rootConstructive median=${pct(roots, 50)} p95=${pct(roots, 95)} max=${Math.max(...roots)}`);
    // Variety: >=14 distinct starts across these 100 seeds (prefer 18).
    const keys = new Set(results.map((r) => r.startKey));
    console.log(`variety distinct/100 = ${keys.size}`);
    expect(keys.size).toBeGreaterThanOrEqual(14);
  }, 300000);
});
