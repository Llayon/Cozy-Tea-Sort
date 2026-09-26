/** Dev-only smoke: tasting generation plumbing (falls back until bank lands). */
import { createGenerateStats, fallbackLevel, generateLevel } from '../src/game/logic/generator';
import type { TeaId } from '../src/game/types';

const CH4 = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'] as TeaId[];
const PK5 = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong', 'lavender'] as TeaId[];

const reqs = [
  { name: 'tasting-challenge', req: { numColors: 4, colors: CH4, emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', tastingCupCount: 1 } },
  { name: 'tasting-mystery-peak', req: { numColors: 5, colors: PK5, emptyCups: 2, hasMysteryLayer: true, phase: 'peak', tastingCupCount: 1 } },
  { name: 'teapot-tasting-challenge', req: { numColors: 4, colors: CH4, emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', sourceOnlyCount: 1, tastingCupCount: 1 } },
];

for (const { name, req } of reqs) {
  const stats = createGenerateStats();
  const lvl = generateLevel(req as never, `tasting-smoke:${name}`, { stats });
  console.log(
    `${name}: minMoves=${lvl.minMoves} constraints=${lvl.cupConstraints.map((c) => (c.mode === 'normal' && c.capacity === 2 ? 'tasting' : c.mode)).join(',')} stats=${JSON.stringify(stats)}`,
  );
  const fs = createGenerateStats();
  const fb = fallbackLevel(req as never, { stats: fs });
  console.log(`  fallback: minMoves=${fb.minMoves} stats=${JSON.stringify(fs)}`);
}
