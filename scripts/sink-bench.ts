/**
 * Dev-only performance benchmark (Gauntlet 3 §51–53).
 * For each production config, over N seeds: wall ms per generateLevel,
 * solverCalls, fallback rate. Structural counters are the CI contract;
 * wall-clock is dev signal only.
 *
 * Usage: bun scripts/sink-bench.ts [N] [only]
 *   only: optional substring filter on config names.
 * Baseline runs (pre-sink worktree) set WITH_SINK=0 to skip sink configs.
 */
import { createGenerateStats, generateLevel } from '../src/game/logic/generator';

const WITH_SINK = (process.env.WITH_SINK ?? '1') === '1';

interface Cfg { name: string; req: Record<string, unknown> }
const CH4 = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const CH4B = ['saffron', 'lavender', 'karkade', 'milk_oolong'];
const PK5 = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong', 'lavender'];
const W3 = ['matcha', 'sea_buckthorn', 'karkade'];

const CFGS: Cfg[] = [
  { name: 'base-challenge', req: { numColors: 4, colors: CH4, emptyCups: 2, hasMysteryLayer: false, phase: 'challenge' } },
  { name: 'teapot-challenge', req: { numColors: 4, colors: CH4, emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', sourceOnlyCount: 1 } },
  { name: 'target-challenge', req: { numColors: 4, colors: CH4B, emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', targetTeaIds: ['lavender', 'karkade'] } },
  { name: 'base-peak-mystery', req: { numColors: 5, colors: PK5, emptyCups: 2, hasMysteryLayer: true, phase: 'peak' } },
  { name: 'target-mystery-peak', req: { numColors: 5, colors: PK5, emptyCups: 2, hasMysteryLayer: true, phase: 'peak', targetTeaIds: ['lavender', 'karkade'] } },
  { name: 'warmup', req: { numColors: 3, colors: W3, emptyCups: 2, hasMysteryLayer: false, phase: 'warmup' } },
];
if (WITH_SINK) {
  CFGS.push(
    { name: 'sink-challenge', req: { numColors: 4, colors: CH4, emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', sinkOnlyCount: 1 } },
    { name: 'teapot-sink-challenge', req: { numColors: 4, colors: CH4, emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', sourceOnlyCount: 1, sinkOnlyCount: 1 } },
    { name: 'sink-mystery-peak', req: { numColors: 5, colors: PK5, emptyCups: 2, hasMysteryLayer: true, phase: 'peak', sinkOnlyCount: 1 } },
  );
}

function pct(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
}

const N = parseInt(process.argv[2] ?? '200', 10);
const only = process.argv[3] ?? '';
for (const { name, req } of CFGS) {
  if (only && !name.includes(only)) continue;
  const ms: number[] = [];
  const calls: number[] = [];
  let fallbacks = 0;
  let worst = 0;
  for (let s = 0; s < N; s++) {
    const stats = createGenerateStats();
    const t0 = performance.now();
    generateLevel(req as never, `bench:${name}:${s}`, { stats });
    const dt = performance.now() - t0;
    ms.push(dt);
    calls.push(stats.solverCalls);
    if (stats.usedFallback) fallbacks++;
    if (dt > worst) worst = dt;
  }
  console.log(
    `${name}: n=${N} p50=${pct(ms, 50).toFixed(1)}ms p90=${pct(ms, 90).toFixed(1)}ms ` +
    `p95=${pct(ms, 95).toFixed(1)}ms max=${worst.toFixed(1)}ms ` +
    `solverCalls med=${pct(calls, 50)} p95=${pct(calls, 95)} fallback=${((fallbacks / N) * 100).toFixed(1)}%`,
  );
}
