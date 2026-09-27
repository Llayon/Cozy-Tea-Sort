/** Dev-only: verify bank templates as fallback pins (identity mapping). */
import { TASTING_TEMPLATE_BANK } from '../src/game/logic/tastingTemplates';
import { instantiateTastingTemplate } from '../src/game/logic/tastingTemplates';
import { solvePuzzle } from '../src/game/logic/solver';
import { isWonState } from '../src/game/logic/rules';
import { defaultCupConstraints, type CupConstraint, type TeaId } from '../src/game/types';

const P4: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const P5: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong', 'lavender'];

for (const kind of ['tasting-challenge', 'teapot-tasting-challenge', 'tasting-mystery-peak'] as const) {
  const pal = kind === 'tasting-mystery-peak' ? P5 : P4;
  const wantDepth = kind === 'tasting-mystery-peak' ? 12 : 9;
  const cands = TASTING_TEMPLATE_BANK[kind].filter((t) => t.depth === wantDepth);
  console.log(`== ${kind}: ${cands.length} depth-${wantDepth} candidates`);
  for (const tpl of cands.slice(0, 4)) {
    const inst = instantiateTastingTemplate(tpl, pal, [...pal]);
    const constraints: CupConstraint[] = defaultCupConstraints(inst.cups.length);
    if (inst.teapotSlot !== null) constraints[inst.teapotSlot] = { mode: 'source-only' };
    constraints[inst.tastingSlot] = { mode: 'normal', capacity: 2, mustEndEmpty: true };
    const solved = solvePuzzle(inst.cups, { cupConstraints: constraints });
    const t = inst.tastingSlot;
    const sol = solved.solution ?? [];
    const enters = sol.some((m) => m.to === t);
    const firstIn = sol.findIndex((m) => m.to === t);
    const exits = sol.slice(firstIn + 1).some((m) => m.from === t);
    console.log(`  ${tpl.id}: minMoves=${solved.minMoves} enters=${enters} exitsAfter=${exits} wonCheck=${isWonState(inst.cups, constraints) === false}`);
  }
}
