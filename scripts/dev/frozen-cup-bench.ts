/**
 * OFFLINE frozen-cup production benchmark (Gauntlet 9 §123, dev-only).
 * 200 production seeds through generateLevel with stats: generator
 * wall-clock p50/p90/p95/max, solver p50/p95/max, visited p50/p95/max,
 * templateAttempts, solverCalls, fallback rate.
 * Usage: bun scripts/dev/frozen-cup-bench.ts [numSeeds]
 */
import { createGenerateStats, generateLevel, type GenerateRequest } from '../../src/game/logic/generator';
import { solvePuzzle } from '../../src/game/logic/solver';
import type { TeaId } from '../../src/game/types';

const REQ: GenerateRequest = {
  numColors: 4,
  colors: ['sea_buckthorn', 'matcha', 'karkade', 'milk_oolong'] as TeaId[],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  frozenCupCount: 1,
};

const pct = (a: number[], p: number): number => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
};

async function main(numSeeds: number) {
  const genMs: number[] = [];
  const solveMs: number[] = [];
  const visited: number[] = [];
  const attempts: number[] = [];
  const calls: number[] = [];
  let fallback = 0;
  for (let s = 0; s < numSeeds; s++) {
    const stats = createGenerateStats();
    const t0 = Date.now();
    const lvl = generateLevel(REQ, `frozen-bench:${s}`, { stats });
    genMs.push(Date.now() - t0);
    attempts.push(stats.templateAttempts);
    calls.push(stats.solverCalls);
    if (stats.usedFallback) fallback++;
    const t1 = Date.now();
    const solved = solvePuzzle(lvl.cups, {
      cupConstraints: lvl.cupConstraints,
      iceSlots: lvl.iceSlots,
    });
    solveMs.push(Date.now() - t1);
    visited.push(solved.visitedStates);
    if (!solved.solvable || solved.truncated || solved.minMoves !== lvl.minMoves) {
      console.error(`seed ${s}: production mismatch`);
      process.exit(1);
    }
  }
  console.log(`n=${numSeeds}`);
  console.log(`generatorMs p50=${pct(genMs, 50)} p90=${pct(genMs, 90)} p95=${pct(genMs, 95)} max=${Math.max(...genMs)}`);
  console.log(`solverMs p50=${pct(solveMs, 50)} p95=${pct(solveMs, 95)} max=${Math.max(...solveMs)}`);
  console.log(`visited p50=${pct(visited, 50)} p95=${pct(visited, 95)} max=${Math.max(...visited)}`);
  console.log(`templateAttempts p50=${pct(attempts, 50)} p95=${pct(attempts, 95)} max=${Math.max(...attempts)}`);
  console.log(`solverCalls p50=${pct(calls, 50)} p95=${pct(calls, 95)} max=${Math.max(...calls)}`);
  console.log(`fallbackRate=${fallback}/${numSeeds}`);
}

const numSeeds = parseInt(process.argv[2] ?? '200', 10);
await main(numSeeds);
