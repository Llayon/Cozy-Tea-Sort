/**
 * Dev-only performance benchmark (Gauntlet 4 §48–49).
 * Same contract as sink-bench: wall ms per generateLevel + solverCalls /
 * templateAttempts + fallback rate over N seeds. Wall-clock is dev signal
 * only; structural counters are the CI contract.
 *
 * Usage: bun scripts/tasting-bench.ts [N] [only]
 */
import { createGenerateStats, generateLevel } from '../src/game/logic/generator';

interface Cfg { name: string; req: Record<string, unknown> }
const CH4 = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const PK5 = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong', 'lavender'];

const CFGS: Cfg[] = [
  { name: 'tasting-challenge', req: { numColors: 4, colors: CH4, emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', tastingCupCount: 1 } },
  { name: 'tasting-mystery-peak', req: { numColors: 5, colors: PK5, emptyCups: 2, hasMysteryLayer: true, phase: 'peak', tastingCupCount: 1 } },
  { name: 'teapot-tasting-challenge', req: { numColors: 4, colors: CH4, emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', sourceOnlyCount: 1, tastingCupCount: 1 } },
  { name: 'base-challenge', req: { numColors: 4, colors: CH4, emptyCups: 2, hasMysteryLayer: false, phase: 'challenge' } },
  { name: 'target-challenge', req: { numColors: 4, colors: ['saffron', 'lavender', 'karkade', 'milk_oolong'], emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', targetTeaIds: ['lavender', 'karkade'] } },
  { name: 'sink-challenge', req: { numColors: 4, colors: CH4, emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', sinkOnlyCount: 1 } },
];

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
  const tmpl: number[] = [];
  let fallbacks = 0;
  let worst = 0;
  for (let s = 0; s < N; s++) {
    const stats = createGenerateStats();
    const t0 = performance.now();
    generateLevel(req as never, `tbench:${name}:${s}`, { stats });
    const dt = performance.now() - t0;
    ms.push(dt);
    calls.push(stats.solverCalls);
    tmpl.push(stats.templateAttempts);
    if (stats.usedFallback) fallbacks++;
    if (dt > worst) worst = dt;
  }
  console.log(
    `${name}: n=${N} p50=${pct(ms, 50).toFixed(1)}ms p90=${pct(ms, 90).toFixed(1)}ms ` +
    `p95=${pct(ms, 95).toFixed(1)}ms max=${worst.toFixed(1)}ms ` +
    `solverCalls med=${pct(calls, 50)} p95=${pct(calls, 95)} ` +
    `tmplAttempts med=${pct(tmpl, 50)} p95=${pct(tmpl, 95)} fallback=${((fallbacks / N) * 100).toFixed(1)}%`,
  );
}
