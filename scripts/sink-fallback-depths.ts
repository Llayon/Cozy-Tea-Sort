/** Dev-only: report real fallbackLevel depths for the 3 sink configs. */
import { createGenerateStats, fallbackLevel } from '../src/game/logic/generator';
import type { TeaId } from '../src/game/types';

const CH4 = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'] as TeaId[];
const PK5 = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong', 'lavender'] as TeaId[];

const reqs = [
  { name: 'sink-challenge', req: { numColors: 4, colors: CH4, emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', sinkOnlyCount: 1 } },
  { name: 'sink-mystery-peak', req: { numColors: 5, colors: PK5, emptyCups: 2, hasMysteryLayer: true, phase: 'peak', sinkOnlyCount: 1 } },
  { name: 'teapot-sink-challenge', req: { numColors: 4, colors: CH4, emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', sourceOnlyCount: 1, sinkOnlyCount: 1 } },
];

for (const { name, req } of reqs) {
  const stats = createGenerateStats();
  const lvl = fallbackLevel(req as never, { stats });
  console.log(
    `${name}: minMoves=${lvl.minMoves} visited=${lvl.visitedStates} ` +
    `constraints=${lvl.cupConstraints.map((c) => c.mode).join(',')} ` +
    `hidden=${JSON.stringify(lvl.hiddenCounts)} stats=${JSON.stringify(stats)}`,
  );
}
