/** G30 G24 screen (DEV ONLY). */
import { analyzeTerminalAllocation } from '../../src/game/logic/contractPreflight.ts';
import type { TeaId } from '../../src/game/types.ts';

const teas = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'] as unknown as TeaId[];
const inventory = { matcha: 4, sea_buckthorn: 4, karkade: 4, milk_oolong: 4 } as never;
function ordinary(id: string) {
  return {
    id,
    kind: 'vessel' as const,
    capacity: 4,
    options: [
      { amounts: {}, label: 'empty' },
      ...teas.map((t) => ({ amounts: { [t]: 4 } as never, label: `${String(t)} x4` })),
    ],
  };
}
function mustEmpty(id: string) {
  return { id, kind: 'vessel' as const, capacity: 4, options: [{ amounts: {}, label: 'empty' }] };
}
const units = [
  ordinary('v0'),
  ordinary('v1'),
  ordinary('v2'),
  ordinary('v3'),
  mustEmpty('milestone'),
  ordinary('buffer'),
];
for (const name of ['Brew Once', 'Choice Brew', 'Brew Sequence']) {
  const res = analyzeTerminalAllocation({ teaIds: teas, inventory, units });
  console.log(`${name}: ${res.verdict} explored=${res.exploredStates} reason=${res.reason ?? 'feasible'}`);
  if (res.witness) {
    for (const a of res.witness.assignments) console.log(`  ${a.unitId} -> ${JSON.stringify(a.amounts)}`);
  }
}
