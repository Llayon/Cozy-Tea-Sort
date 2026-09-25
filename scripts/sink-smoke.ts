/** Dev-only smoke: generate canonical sink levels via production generateLevel. */
import { generateLevel, createGenerateStats } from '../src/game/logic/generator';

const cfgs = [
  { name: 'sink-challenge', req: { numColors: 4, colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'] as const, emptyCups: 2, hasMysteryLayer: false, phase: 'challenge' as const, sinkOnlyCount: 1 } },
  { name: 'sink-mystery-peak', req: { numColors: 5, colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong', 'lavender'] as const, emptyCups: 2, hasMysteryLayer: true, phase: 'peak' as const, sinkOnlyCount: 1 } },
  { name: 'teapot-sink-challenge', req: { numColors: 4, colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'] as const, emptyCups: 2, hasMysteryLayer: false, phase: 'challenge' as const, sinkOnlyCount: 1, sourceOnlyCount: 1 } },
];

for (const { name, req } of cfgs) {
  const t0 = Date.now();
  for (let s = 0; s < 20; s++) {
    const stats = createGenerateStats();
    // eslint-disable-next-line no-await-in-loop
    const lvl = generateLevel(req as never, `smoke:${name}:${s}`, { stats });
    if (s === 0) console.log(`${name}: cups=${lvl.cups.length} minMoves=${lvl.minMoves} constraints=${lvl.cupConstraints.map((c) => `${c.mode[0]}${c.targetTeaId ? '*' : ''}`).join(',')} stats=${JSON.stringify(stats)}`);
  }
  console.log(`${name}: 20 levels in ${Date.now() - t0}ms`);
}
// maxRetries=0 fallback-exhaustion check
for (const { name, req } of cfgs) {
  const stats = createGenerateStats();
  const lvl = generateLevel(req as never, `smoke0:${name}`, { stats, maxRetries: 0 });
  console.log(`${name} maxRetries=0: minMoves=${lvl.minMoves} usedFallback=${stats.usedFallback} solverCalls=${stats.solverCalls} templateAttempts=${stats.templateAttempts}`);
}
