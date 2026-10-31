/**
 * G19 long-run production generation audit (DEV evidence).
 *
 * 1) Every level L1–L2000 with deterministic seed g19-rollout:<level>:0.
 * 2) A deterministic stratified sample of L2001–L10000 (every 7th level plus
 *    every V2 deck slot, boundary multiples and the persistence-max window).
 *
 * Records generation exceptions, fallbacks, minMoves/visited/solver timing,
 * phase distributions and per-mechanic performance. No gameplay code lives
 * here; this is production entry-point evidence only.
 *
 * Run:
 *   bunx tsx scripts/dev/g19-long-run-generation.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createGenerateStats, generateLevel } from '../../src/game/logic/generator.ts';
import { generateRequestForLevelConfig } from '../../src/game/logic/productionRequest.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import { getLevelConfig, mechanicPlanForLevel } from '../../src/utils/difficultyCurve.ts';

type MechanicPlan = ReturnType<typeof mechanicPlanForLevel>;

const ROOT = resolve(import.meta.dirname, '../..');
const OUT_FULL = resolve(ROOT, 'scripts/dev/out/g19-generation-1-2000.json');
const OUT_LONG = resolve(ROOT, 'scripts/dev/out/g19-generation-long-range.json');

const FLAGS = [
  'teapot',
  'targets',
  'sink',
  'tasting',
  'lemon',
  'strainer',
  'honey',
  'frozen',
  'thermos',
  'cinnamon',
  'teaBloom',
  'blend',
  'servingOrder',
  'sharedTray',
  'teaPair',
] as const;

function planKey(plan: MechanicPlan): string {
  const on = FLAGS.filter((flag) => plan[flag]).sort();
  return on.length === 0 ? 'clean' : on.join('+');
}

function seedFor(level: number): string {
  return `g19-rollout:${level}:0`;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] as number;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

interface Row {
  level: number;
  phase: string;
  plan: string;
  styles: string[];
  minMoves: number;
  visited: number;
  genMs: number;
  solverMs: number | null;
  candidatesTried: number;
  solverCalls: number;
  templateAttempts: number;
  fallback: boolean;
  error?: string;
}

interface Bucket {
  count: number;
  fallback: number;
  errors: number;
  minMoves: number[];
  visited: number[];
  genMs: number[];
  solverMs: number[];
  candidatesTried: number;
  solverCalls: number;
  templateAttempts: number;
}

function emptyBucket(): Bucket {
  return {
    count: 0,
    fallback: 0,
    errors: 0,
    minMoves: [],
    visited: [],
    genMs: [],
    solverMs: [],
    candidatesTried: 0,
    solverCalls: 0,
    templateAttempts: 0,
  };
}

function addToBucket(bucket: Bucket, row: Row): void {
  bucket.count++;
  if (row.fallback) bucket.fallback++;
  if (row.error) bucket.errors++;
  if (!row.error) {
    bucket.minMoves.push(row.minMoves);
    bucket.visited.push(row.visited);
    bucket.genMs.push(row.genMs);
    if (row.solverMs !== null) bucket.solverMs.push(row.solverMs);
  }
  bucket.candidatesTried += row.candidatesTried;
  bucket.solverCalls += row.solverCalls;
  bucket.templateAttempts += row.templateAttempts;
}

function bucketSummary(bucket: Bucket) {
  return {
    count: bucket.count,
    fallback: bucket.fallback,
    errors: bucket.errors,
    attempts: {
      candidatesTried: bucket.candidatesTried,
      solverCalls: bucket.solverCalls,
      templateAttempts: bucket.templateAttempts,
    },
    minMoves: {
      p50: percentile(bucket.minMoves, 50),
      p95: percentile(bucket.minMoves, 95),
      max: bucket.minMoves.length > 0 ? Math.max(...bucket.minMoves) : null,
    },
    visited: {
      p50: percentile(bucket.visited, 50),
      p95: percentile(bucket.visited, 95),
      max: bucket.visited.length > 0 ? Math.max(...bucket.visited) : null,
    },
    genMs: {
      p50: percentile(bucket.genMs, 50),
      p95: percentile(bucket.genMs, 95),
      max: bucket.genMs.length > 0 ? Math.max(...bucket.genMs) : null,
    },
    solverMs: {
      count: bucket.solverMs.length,
      p50: percentile(bucket.solverMs, 50),
      p95: percentile(bucket.solverMs, 95),
      max: bucket.solverMs.length > 0 ? Math.max(...bucket.solverMs) : null,
    },
  };
}

function generate(rowLevel: number, measureSolver: boolean): Row {
  const cfg = getLevelConfig(rowLevel);
  const plan = mechanicPlanForLevel(rowLevel);
  const stats = createGenerateStats();
  const started = performance.now();
  let generated;
  try {
    generated = generateLevel(generateRequestForLevelConfig(cfg), seedFor(rowLevel), { stats });
  } catch (error) {
    return {
      level: rowLevel,
      phase: cfg.phase,
      plan: planKey(plan),
      styles: [],
      minMoves: -1,
      visited: 0,
      genMs: round(performance.now() - started),
      solverMs: null,
      candidatesTried: stats.candidatesTried,
      solverCalls: stats.solverCalls,
      templateAttempts: stats.templateAttempts,
      fallback: stats.usedFallback,
      error: String(error),
    };
  }
  const genMs = round(performance.now() - started);
  let solverMs: number | null = null;
  if (measureSolver) {
    const solveStarted = performance.now();
    solvePuzzle(generated.cups, {
      cupConstraints: generated.cupConstraints,
      floatingIngredients: generated.floatingIngredients,
      sinkingIngredients: generated.sinkingIngredients,
      strainer: generated.strainer,
      iceSlots: generated.iceSlots,
      capacityObstacles: generated.capacityObstacles,
      teaBudSlots: generated.teaBudSlots,
      blendRecipe: generated.blendRecipe,
      maxVisited: 120_000,
      maxDepth: 60,
    });
    solverMs = round(performance.now() - solveStarted);
  }
  return {
    level: rowLevel,
    phase: cfg.phase,
    plan: planKey(plan),
    styles: [
      cfg.hasSourceOnlyTeapot ? 'teapot' : '',
      cfg.hasSinkGuestCup ? 'sink' : '',
      cfg.hasTastingBowl ? 'tasting' : '',
      cfg.floatingIngredient === 'lemon' ? 'lemon' : '',
      cfg.sinkingIngredient === 'honey' ? 'honey' : '',
      cfg.hasStrainer ? 'strainer' : '',
      cfg.hasFrozenCup ? 'frozen' : '',
      cfg.hasThermos ? 'thermos' : '',
      cfg.hasCinnamon ? 'cinnamon' : '',
      cfg.hasTeaBloom ? 'teaBloom' : '',
      cfg.hasBlend ? 'blend' : '',
      cfg.hasServingOrder ? 'servingOrder' : '',
      cfg.hasSharedTray ? 'sharedTray' : '',
      cfg.hasTeaPair ? 'teaPair' : '',
    ].filter(Boolean),
    minMoves: generated.minMoves,
    visited: generated.visitedStates,
    genMs,
    solverMs,
    candidatesTried: stats.candidatesTried,
    solverCalls: stats.solverCalls,
    templateAttempts: stats.templateAttempts,
    fallback: stats.usedFallback,
  };
}

const startedAll = performance.now();
const fullRows: Row[] = [];
for (let level = 1; level <= 2000; level++) {
  fullRows.push(generate(level, level >= 331 && getLevelConfig(level).phase === 'challenge'));
  if (level % 100 === 0) {
    console.error(
      `[g19-generation] ${level}/2000 (${((performance.now() - startedAll) / 1000).toFixed(1)}s)`,
    );
  }
}

// Deterministic stratified long-range sample.
const longSample = new Set<number>();
for (let level = 2001; level <= 10000; level += 7) longSample.add(level);
for (let i = 0; i < 28; i++) {
  for (let deck = 0; ; deck++) {
    const level = 334 + 112 * deck + 4 * i;
    if (level < 2001) continue;
    if (level > 10000) break;
    longSample.add(level);
    break;
  }
}
for (let multiple = 2000; multiple <= 10000; multiple += 500) {
  for (let delta = -2; delta <= 2; delta++) {
    const level = multiple + delta;
    if (level >= 2001 && level <= 10000) longSample.add(level);
  }
}
for (let level = 9990; level <= 10000; level++) longSample.add(level);

const longRows: Row[] = [];
const sortedLong = [...longSample].sort((a, b) => a - b);
for (const level of sortedLong) {
  longRows.push(generate(level, getLevelConfig(level).phase === 'challenge'));
}

function summarize(rows: Row[], label: string) {
  const totals = {
    levels: rows.length,
    generated: rows.filter((row) => !row.error).length,
    exceptions: rows.filter((row) => row.error).length,
    fallback: rows.filter((row) => row.fallback).length,
    fallbackLevels: rows.filter((row) => row.fallback).map((row) => row.level),
    errorRows: rows.filter((row) => row.error),
  };
  const phaseBuckets = new Map<string, Bucket>();
  const planBuckets = new Map<string, Bucket>();
  const challengeBucket = emptyBucket();
  for (const row of rows) {
    const phaseBucket = phaseBuckets.get(row.phase) ?? emptyBucket();
    addToBucket(phaseBucket, row);
    phaseBuckets.set(row.phase, phaseBucket);
    const planBucket = planBuckets.get(row.plan) ?? emptyBucket();
    addToBucket(planBucket, row);
    planBuckets.set(row.plan, planBucket);
    if (row.phase === 'challenge') addToBucket(challengeBucket, row);
  }
  return {
    label,
    range: { from: rows[0]?.level ?? null, to: rows[rows.length - 1]?.level ?? null },
    totals,
    challenge: bucketSummary(challengeBucket),
    phases: Object.fromEntries(
      [...phaseBuckets.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([phase, bucket]) => [phase, bucketSummary(bucket)]),
    ),
    plans: Object.fromEntries(
      [...planBuckets.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([plan, bucket]) => [plan, bucketSummary(bucket)]),
    ),
  };
}

const fullSummary = summarize(fullRows, 'L1-2000 every level');
const longSummary = summarize(longRows, 'L2001-10000 deterministic stratified sample');

// Per-mechanic performance for the explicitly watched mechanics (331+ only,
// so the frozen historical prefix cannot hide a V2 cost).
const watched = [
  'blend',
  'sharedTray',
  'teaPair',
  'servingOrder',
  'servingOrder+tasting',
  'frozen',
  'cinnamon',
  'teaBloom',
];
const watchedPerformance: Record<string, ReturnType<typeof bucketSummary>> = {};
for (const key of watched) {
  const bucket = emptyBucket();
  for (const row of [...fullRows, ...longRows]) {
    if (row.level < 331) continue;
    if (row.plan !== key) continue;
    addToBucket(bucket, row);
  }
  watchedPerformance[key] = bucketSummary(bucket);
}

const fullArtifact = {
  gauntlet: 'G19',
  generatedAt: new Date().toISOString(),
  seedPolicy: 'g19-rollout:<level>:0',
  range: { from: 1, to: 2000 },
  summary: fullSummary,
  perLevel: fullRows,
};
const longArtifact = {
  gauntlet: 'G19',
  generatedAt: new Date().toISOString(),
  seedPolicy: 'g19-rollout:<level>:0',
  range: { from: 2001, to: 10000 },
  sampleSize: longRows.length,
  samplePolicy:
    'every 7th level + every V2 deck slot (first occurrence) + 500-level multiples +/-2 + persistence-max 9990-10000',
  summary: longSummary,
  watchedPerformance331Plus: watchedPerformance,
  sampleLevels: sortedLong,
};

mkdirSync(dirname(OUT_FULL), { recursive: true });
writeFileSync(OUT_FULL, `${JSON.stringify(fullArtifact, null, 2)}\n`);
writeFileSync(OUT_LONG, `${JSON.stringify(longArtifact, null, 2)}\n`);

console.log(`G19 generation 1–2000`);
console.log(JSON.stringify(fullSummary.totals, null, 2));
console.log(`G19 long-range sample: ${longRows.length} levels`);
console.log(JSON.stringify(longSummary.totals, null, 2));
console.log(`watched 331+ performance:`);
for (const [key, value] of Object.entries(watchedPerformance)) {
  console.log(
    `  ${key.padEnd(24)} n=${String(value.count).padStart(4)} gen p50=${value.genMs.p50} p95=${value.genMs.p95} max=${value.genMs.max} solver p50=${value.solverMs.p50} p95=${value.solverMs.p95} max=${value.solverMs.max}`,
  );
}
console.log(`wall ${((performance.now() - startedAll) / 1000).toFixed(1)}s`);
console.log(`wrote ${OUT_FULL}`);
console.log(`wrote ${OUT_LONG}`);
if (fullSummary.totals.exceptions > 0 || longSummary.totals.exceptions > 0) process.exitCode = 1;
