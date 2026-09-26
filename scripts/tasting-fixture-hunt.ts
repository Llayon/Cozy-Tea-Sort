/** Dev-only: hunt a compact hand fixture with tasting participation. */
import { createRng, shuffleInPlace } from '../src/game/logic/rng';
import { solvePuzzle, applySolution } from '../src/game/logic/solver';
import { isWonState } from '../src/game/logic/rules';
import type { CupConstraint, TeaId } from '../src/game/types';

const A: TeaId = 'matcha';
const B: TeaId = 'karkade';
const C: TeaId = 'lavender';
const N: CupConstraint = { mode: 'normal' };
const T: CupConstraint = { mode: 'normal', capacity: 2, mustEndEmpty: true };

const PAL = [A, B, C];
let shown = 0;
for (let s = 0; s < 3000 && shown < 6; s++) {
  const rng = createRng(`fixture-hunt:${s}`);
  const pool: TeaId[] = [];
  for (const c of PAL) for (let k = 0; k < 4; k++) pool.push(c);
  shuffleInPlace(rng, pool);
  const cups: TeaId[][] = [
    pool.slice(0, 4), pool.slice(4, 8), pool.slice(8, 12), [], [],
  ];
  const constraints: CupConstraint[] = [N, N, N, N, T];
  if (isWonState(cups, constraints)) continue;
  const solved = solvePuzzle(cups, { cupConstraints: constraints });
  if (!solved.solvable || solved.truncated || solved.minMoves === undefined) continue;
  if (solved.minMoves < 4 || solved.minMoves > 8) continue;
  const t = 4;
  const sol = solved.solution ?? [];
  if (!sol.some((m) => m.to === t) || !sol.some((m) => m.from === t)) continue;
  const final = applySolution(cups, sol, constraints);
  if (!final || !isWonState(final, constraints)) continue;
  if ((final[t] as TeaId[]).length !== 0) continue;
  console.log(`seed ${s} minMoves=${solved.minMoves}`);
  console.log(`  cups: ${JSON.stringify(cups)}`);
  console.log(`  path: ${sol.map((m) => `${m.from}->${m.to}x${m.count}`).join(' ')}`);
  shown++;
}
