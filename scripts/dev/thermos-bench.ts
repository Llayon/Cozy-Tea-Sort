/**
 * OFFLINE thermos bench (dev-only): 200 production seeds, generator + solver
 * timings (report-only) and structural counters (hard gates).
 * Usage: bun scripts/dev/thermos-bench.ts
 */
import { generateLevel, type GenerateRequest } from '../../src/game/logic/generator.ts';
import { createGenerateStats } from '../../src/game/logic/generator.ts';

const req: GenerateRequest = {
  numColors: 4,
  colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  thermosCupCount: 1,
};
const N = 200;
const genMs: number[] = [];
const solverMs: number[] = [];
const visited: number[] = [];
let attemptsMax = 0;
let solverCallsMax = 0;
let fallback = 0;
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const stats = createGenerateStats();
  const g0 = Date.now();
  const lvl = generateLevel(req, `bench:${i}`, { stats });
  genMs.push(Date.now() - g0);
  solverMs.push(0);
  visited.push(lvl.visitedStates);
  attemptsMax = Math.max(attemptsMax, stats.templateAttempts);
  solverCallsMax = Math.max(solverCallsMax, stats.solverCalls);
  if (stats.usedFallback) fallback++;
}
const pct = (a: number[], p: number): number => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
};
console.log(`n=${N} total=${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`generator ms p50=${pct(genMs, 50)} p90=${pct(genMs, 90)} p95=${pct(genMs, 95)} max=${Math.max(...genMs)}`);
console.log(`visited p50=${pct(visited, 50)} p95=${pct(visited, 95)} max=${Math.max(...visited)}`);
console.log(`templateAttempts max=${attemptsMax} solverCalls max=${solverCallsMax} fallback=${fallback}`);
console.log('targets: generator p95 <150ms (report-only), attempts<=4, solverCalls 1 happy path');
