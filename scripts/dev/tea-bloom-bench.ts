/**
 * G12 tea-bloom production bench (DEV ONLY — never CI).
 * 100 production seeds through the exact production path (template fast
 * path + single production solve): generator/solver wall-clock + structural
 * percentiles. Uses production solver/canonicalization/rules only.
 * Usage: bun scripts/dev/tea-bloom-bench.ts [seeds]
 */
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import {
  createGenerateStats,
  generateLevel,
  type GenerateRequest,
} from '../../src/game/logic/generator.ts';
import type { TeaId } from '../../src/game/types.ts';

const N = Number(process.argv[2] ?? 100);
const req: GenerateRequest = {
  numColors: 4,
  colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'] as TeaId[],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  teaBudCount: 1,
};
function pct(a: number[], p: number): number {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
}
const genMs: number[] = [];
const solverMs: number[] = [];
const visited: number[] = [];
const attempts: number[] = [];
let fallbacks = 0;
for (let i = 0; i < N; i++) {
  const stats = createGenerateStats();
  const t0 = Date.now();
  const lvl = generateLevel(req, `tea-bloom-bench-${i}`, { stats });
  genMs.push(Date.now() - t0);
  attempts.push(stats.templateAttempts);
  if (stats.usedFallback) fallbacks++;
  const t1 = Date.now();
  const r = solvePuzzle(lvl.cups, {
    cupConstraints: lvl.cupConstraints,
    floatingIngredients: lvl.floatingIngredients,
    teaBudSlots: lvl.teaBudSlots,
  });
  solverMs.push(Date.now() - t1);
  visited.push(r.visitedStates);
}
console.log(
  `tea-bloom bench n=${N} generator p50=${pct(genMs, 50)} p90=${pct(genMs, 90)} p95=${pct(genMs, 95)} max=${Math.max(...genMs)}ms ` +
    `solver p50=${pct(solverMs, 50)} p95=${pct(solverMs, 95)} max=${Math.max(...solverMs)}ms ` +
    `visited p50=${pct(visited, 50)} p95=${pct(visited, 95)} max=${Math.max(...visited)} ` +
    `attempts p50=${pct(attempts, 50)} p95=${pct(attempts, 95)} max=${Math.max(...attempts)} fallbackRate=${(fallbacks / N).toFixed(3)}`,
);
