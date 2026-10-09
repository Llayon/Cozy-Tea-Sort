/** DEV ONLY: test L2 robustness of bank templates under role permutations. */
import { TeaId } from '../../src/game/types.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import { analyzeTeaBloomParticipation } from '../../src/game/logic/generator.ts';
import { ALL_TEA_BLOOM_TEMPLATES, instantiateTeaBloomTemplate } from '../../src/game/logic/teaBloomTemplates.ts';
import { createRng, shuffleInPlace } from '../../src/game/logic/rng.ts';

const palette: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const cons = [{ mode: 'normal' }, { mode: 'normal' }, { mode: 'normal' }, { mode: 'normal' }, { mode: 'normal' }, { mode: 'normal' }] as const;
for (const tpl of ALL_TEA_BLOOM_TEMPLATES) {
  let pass = 0;
  const trials = 12;
  for (let i = 0; i < trials; i++) {
    const rng = createRng(`robust-${tpl.id}-${i}`);
    const order = [...palette];
    shuffleInPlace(rng, order);
    const inst = instantiateTeaBloomTemplate(tpl, palette, order);
    const buds = [null, null, null, null, null, null] as (string | null)[];
    buds[inst.teaBudHost] = 'tea_bud';
    const r = solvePuzzle(inst.cups, { cupConstraints: [...cons] as never, teaBudSlots: buds as never });
    if (!r.solvable || r.truncated || r.minMoves !== tpl.depth || !r.solution) continue;
    const p = analyzeTeaBloomParticipation(inst.cups, buds as never, inst.teaBudHost, r.solution, [...cons] as never);
    if (p.blooms >= 1 && p.firstReuseDepth !== null && p.finalBudCleared && p.win) pass++;
  }
  console.log(`${tpl.id} depth=${tpl.depth} robust=${pass}/${trials}`);
}
