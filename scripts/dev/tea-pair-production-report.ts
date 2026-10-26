/**
 * G17 production report (DEV ONLY, not CI): 220 generated V6 levels through
 * the real generator, re-solved and traced with the production rules.
 *
 * Run: bunx tsx scripts/dev/tea-pair-production-report.ts
 */
import {
  analyzeTeaPairReplay,
  createGenerateStats,
  generateLevel,
  type GenerateRequest,
} from '../../src/game/logic/generator.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import { canonicalPuzzleKey } from '../../src/game/logic/rules.ts';
import { emptyFloatingIngredients, type TeaId } from '../../src/game/types.ts';

const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const req: GenerateRequest = {
  numColors: 4,
  colors: [...PALETTE],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  teaPairCount: 1,
};

function pct(a: number[], p: number): number {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
}

const depths: number[] = [];
const ratios: number[] = [];
const gaps: number[] = [];
const genMs: number[] = [];
const solverMs: number[] = [];
const visited: number[] = [];
const attempts: number[] = [];
const roles = new Map<number, number>();
const keys = new Set<string>();
let solverCalls = 0;
let fallbacks = 0;

for (let seed = 0; seed < 220; seed++) {
  const stats = createGenerateStats();
  const t0 = performance.now();
  const lvl = generateLevel(req, `g17-report-${seed}`, { stats });
  genMs.push(performance.now() - t0);
  attempts.push(stats.templateAttempts);
  solverCalls += stats.solverCalls;
  fallbacks += stats.usedFallback ? 1 : 0;

  const t1 = performance.now();
  const r = solvePuzzle(lvl.cups, {
    cupConstraints: lvl.cupConstraints,
    maxVisited: 120_000,
    maxDepth: 60,
  });
  solverMs.push(performance.now() - t1);
  if (!r.solvable || r.truncated) throw new Error(`seed ${seed} not solvable`);
  const trace = analyzeTeaPairReplay(lvl.cups, r.solution ?? [], lvl.cupConstraints);
  if (!trace.win || trace.finalStatus.kind !== 'matched') throw new Error(`seed ${seed} not matched`);
  depths.push(r.minMoves as number);
  visited.push(r.visitedStates);
  if (trace.stableCommitDepth !== null) {
    ratios.push(trace.stableCommitDepth / Math.max(1, r.minMoves as number));
  }
  if (trace.stableGap !== null) gaps.push(trace.stableGap);
  if (trace.finalStatus.kind === 'matched') {
    const role = PALETTE.indexOf(trace.finalStatus.tea);
    roles.set(role, (roles.get(role) ?? 0) + 1);
  }
  keys.add(
    canonicalPuzzleKey(
      { cups: lvl.cups, floatingIngredients: emptyFloatingIngredients(6) },
      lvl.cupConstraints,
    ),
  );
}

const gapHistogram: Record<string, number> = {};
for (const g of gaps) gapHistogram[String(g)] = (gapHistogram[String(g)] ?? 0) + 1;

console.log(
  JSON.stringify(
    {
      n: 220,
      canonicalDistinct: keys.size,
      roleDistribution: Object.fromEntries([...roles.entries()].sort((a, b) => a[0] - b[0])),
      depth: {
        min: Math.min(...depths),
        p50: pct(depths, 50),
        p95: pct(depths, 95),
        max: Math.max(...depths),
      },
      commitRatio: { p50: pct(ratios, 50), p95: pct(ratios, 95), max: Math.max(...ratios) },
      gapHistogram,
      attempts: {
        median: pct(attempts, 50),
        p95: pct(attempts, 95),
        max: Math.max(...attempts),
      },
      solverCalls,
      fallbacks,
      genMs: { p50: pct(genMs, 50), p95: pct(genMs, 95), max: Math.max(...genMs) },
      solverMs: { p50: pct(solverMs, 50), p95: pct(solverMs, 95), max: Math.max(...solverMs) },
      visited: { p50: pct(visited, 50), p95: pct(visited, 95), max: Math.max(...visited) },
    },
    null,
    2,
  ),
);
