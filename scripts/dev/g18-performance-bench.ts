/**
 * G18 generation/solver benchmark (DEV evidence).
 *
 * Fixed machine/command/seeds for before/after comparison:
 *   bunx tsx scripts/dev/g18-performance-bench.ts --out scripts/dev/out/g18-perf-baseline.json
 *
 * Each representative production level is generated 100 times with
 * deterministic seeds, then independently re-solved with the production
 * solver. Reports p50/p95/max wall-clock plus generation counters.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createGenerateStats, generateLevel } from '../../src/game/logic/generator.ts';
import { generateRequestForLevelConfig } from '../../src/game/logic/productionRequest.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import { getLevelConfig } from '../../src/utils/difficultyCurve.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const outIndex = process.argv.indexOf('--out');
const OUT = resolve(
  ROOT,
  outIndex >= 0
    ? (process.argv[outIndex + 1] as string)
    : 'scripts/dev/out/g18-perf-baseline.json',
);
const seedsArg = process.argv.indexOf('--seeds');
const SEEDS = seedsArg >= 0 ? Math.max(1, Number(process.argv[seedsArg + 1]) || 100) : 100;
const onlyArg = process.argv.indexOf('--only');
const ONLY = onlyArg >= 0 ? (process.argv[onlyArg + 1] as string) : null;

const TYPES: Array<{ id: string; level: number }> = [
  { id: 'warmup-clean', level: 1 },
  { id: 'challenge-clean', level: 2 },
  { id: 'peak-mystery', level: 3 },
  { id: 'teapot', level: 6 },
  { id: 'targets', level: 10 },
  { id: 'sink', level: 18 },
  { id: 'tasting', level: 26 },
  { id: 'lemon', level: 34 },
  { id: 'strainer', level: 42 },
  { id: 'honey', level: 50 },
  { id: 'lemon-honey', level: 58 },
  { id: 'frozen', level: 66 },
  { id: 'thermos', level: 74 },
  { id: 'cinnamon', level: 82 },
  { id: 'tea-bloom', level: 90 },
  { id: 'blend', level: 98 },
  { id: 'serving-order', level: 106 },
  { id: 'order-tasting', level: 154 },
  { id: 'shared-tray', level: 162 },
  { id: 'tea-pair', level: 250 },
];

const requestForConfig = generateRequestForLevelConfig;
function pct(values: number[], p: number): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
}
function stats(values: number[]) {
  return {
    p50: Number(pct(values, 50).toFixed(1)),
    p90: Number(pct(values, 90).toFixed(1)),
    p95: Number(pct(values, 95).toFixed(1)),
    max: Number(Math.max(...values).toFixed(1)),
  };
}

const results = [];
for (const type of ONLY ? TYPES.filter((t) => t.id === ONLY) : TYPES) {
  const cfg = getLevelConfig(type.level);
  const req = requestForConfig(cfg);
  const genMs: number[] = [];
  const solverMs: number[] = [];
  const minMoves: number[] = [];
  const visited: number[] = [];
  const solverCalls: number[] = [];
  const templateAttempts: number[] = [];
  let fallbacks = 0;
  let failures = 0;
  for (let i = 0; i < SEEDS; i++) {
    const seed = `g18-perf:${type.id}:${i}`;
    const genStats = createGenerateStats();
    const g0 = performance.now();
    try {
      const level = generateLevel(req, seed, { stats: genStats });
      genMs.push(performance.now() - g0);
      solverCalls.push(genStats.solverCalls);
      templateAttempts.push(genStats.templateAttempts);
      if (genStats.usedFallback) fallbacks++;
      const s0 = performance.now();
      const solved = solvePuzzle(level.cups, {
        cupConstraints: level.cupConstraints,
        floatingIngredients: level.floatingIngredients,
        sinkingIngredients: level.sinkingIngredients,
        strainer: level.strainer,
        iceSlots: level.iceSlots,
        capacityObstacles: level.capacityObstacles,
        teaBudSlots: level.teaBudSlots,
        blendRecipe: level.blendRecipe,
        maxVisited: 120_000,
        maxDepth: 60,
      });
      solverMs.push(performance.now() - s0);
      if (!solved.solvable || solved.truncated) failures++;
      if (solved.minMoves !== undefined) minMoves.push(solved.minMoves);
      visited.push(solved.visitedStates);
    } catch (err) {
      failures++;
      console.error(`[perf] ${type.id} seed ${i} failed: ${String(err)}`);
    }
  }
  results.push({
    type: type.id,
    level: type.level,
    phase: cfg.phase,
    seeds: SEEDS,
    failures,
    fallbacks,
    genMs: stats(genMs),
    solverMs: stats(solverMs),
    minMoves: minMoves.length
      ? { min: Math.min(...minMoves), p50: pct(minMoves, 50), p95: pct(minMoves, 95), max: Math.max(...minMoves) }
      : null,
    visited: visited.length ? stats(visited) : null,
    solverCalls: {
      p50: pct(solverCalls, 50),
      p95: pct(solverCalls, 95),
      max: Math.max(...solverCalls),
    },
    templateAttempts: {
      p50: pct(templateAttempts, 50),
      p95: pct(templateAttempts, 95),
      max: Math.max(...templateAttempts),
    },
  });
  const r = results[results.length - 1]!;
  console.error(
    `[perf] ${type.id}: gen p50 ${r.genMs.p50} p95 ${r.genMs.p95} max ${r.genMs.max}; ` +
      `solver p50 ${r.solverMs.p50} p95 ${r.solverMs.p95} max ${r.solverMs.max}; failures ${failures}`,
  );
}

mkdirSync(dirname(OUT), { recursive: true });
const artifact = {
  gauntlet: 'G18',
  command: 'bunx tsx scripts/dev/g18-performance-bench.ts',
  seedPolicy: 'g18-perf:<type>:<0..99>',
  machine: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    cpus: (await import('node:os')).cpus().length,
    model: (await import('node:os')).cpus()[0]?.model,
  },
  generatedAt: new Date().toISOString(),
  results,
};
writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`);
console.error(`[perf] wrote ${OUT}`);
