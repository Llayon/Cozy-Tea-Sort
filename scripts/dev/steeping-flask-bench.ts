/**
 * G20 production performance bench (DEV evidence): 200 deterministic seeds.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createGenerateStats, generateLevel } from '../../src/game/logic/generator.ts';
import { generateRequestForLevelConfig } from '../../src/game/logic/productionRequest.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import { getLevelConfig } from '../../src/utils/difficultyCurve.ts';
import { emptyFloatingIngredients, isSteepingFlaskConstraint } from '../../src/game/types.ts';

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}
function pct(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] as number;
}

const req = generateRequestForLevelConfig(getLevelConfig(558));
const genMs: number[] = [];
const solverMs: number[] = [];
const visited: number[] = [];
const depths: number[] = [];
const attempts: number[] = [];
const solverCalls: number[] = [];
const starts = new Set<string>();
let fallbacks = 0;
let exceptions = 0;
const rows: unknown[] = [];
const t0 = performance.now();
for (let i = 0; i < 200; i++) {
  const stats = createGenerateStats();
  try {
    const started = performance.now();
    const level = generateLevel(req, `g20-bench:${i}`, { stats });
    const gms = performance.now() - started;
    const solveStarted = performance.now();
    const solved = solvePuzzle(level.cups, {
      cupConstraints: level.cupConstraints,
      floatingIngredients: level.floatingIngredients,
      sinkingIngredients: level.sinkingIngredients,
      strainer: level.strainer,
      iceSlots: level.iceSlots,
      capacityObstacles: level.capacityObstacles,
      teaBudSlots: level.teaBudSlots,
      blendRecipe: level.blendRecipe,
      maxVisited: 200_000,
      maxDepth: 60,
    });
    const sms = performance.now() - solveStarted;
    genMs.push(gms);
    solverMs.push(sms);
    visited.push(solved.visitedStates);
    depths.push(level.minMoves);
    attempts.push(stats.templateAttempts);
    solverCalls.push(stats.solverCalls);
    starts.add(JSON.stringify(level.cups));
    if (stats.usedFallback) fallbacks++;
    if (stats.templateAttempts > 4) exceptions++;
    if (level.cupConstraints.filter(isSteepingFlaskConstraint).length !== 1) exceptions++;
    rows.push({
      seed: i,
      depth: level.minMoves,
      genMs: Math.round(gms * 100) / 100,
      solverMs: Math.round(sms * 100) / 100,
      visited: solved.visitedStates,
      attempts: stats.templateAttempts,
      solverCalls: stats.solverCalls,
      fallback: stats.usedFallback,
    });
  } catch (e) {
    exceptions++;
    rows.push({ seed: i, error: String(e) });
  }
}
const out = {
  gauntlet: 'G20',
  seeds: 200,
  wallMs: Math.round(performance.now() - t0),
  exceptions,
  fallbacks,
  distinctStarts: starts.size,
  generatorMs: { p50: median(genMs), p90: pct(genMs, 90), p95: pct(genMs, 95), max: genMs.length ? Math.max(...genMs) : null },
  solverMs: { p50: median(solverMs), p95: pct(solverMs, 95), max: solverMs.length ? Math.max(...solverMs) : null },
  visited: { p50: median(visited), p95: pct(visited, 95), max: visited.length ? Math.max(...visited) : null },
  depth: { p50: median(depths), p95: pct(depths, 95), max: depths.length ? Math.max(...depths) : null },
  attempts: { p50: median(attempts), p95: pct(attempts, 95), max: attempts.length ? Math.max(...attempts) : null },
  solverCalls: { p50: median(solverCalls), p95: pct(solverCalls, 95), max: solverCalls.length ? Math.max(...solverCalls) : null },
  rows,
};
const OUT = resolve(import.meta.dirname, 'out/g20-flask-perf.json');
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ ...out, rows: undefined }, null, 2));
console.log(`wrote ${OUT}`);
