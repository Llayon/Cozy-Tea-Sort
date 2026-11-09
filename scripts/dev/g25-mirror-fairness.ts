/**
 * G25 Mirror fairness probe (DEV ONLY, N=50).
 * Root constructive / solvable / optimal / fatal / doomed.
 */
import type { CupConstraint, TeaId } from '../../src/game/types.ts';
import { applyPourState, listConstructiveActionsState } from '../../src/game/logic/rules.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import { g25MirrorRecipeForSlot } from '../../src/game/logic/g25Research.ts';
import { dealPilotBoard, pct } from './lib/g25-harness.ts';

const N = Number(process.argv[2] ?? 50);
function build(cups: TeaId[][]): CupConstraint[] {
  const empties: number[] = [];
  cups.forEach((c, i) => {
    if (c.length === 0) empties.push(i);
  });
  const cons: CupConstraint[] = cups.map(() => ({ mode: 'normal' as const }));
  cons[empties[0] as number] = { mode: 'normal', capacity: 4, g25MirrorGroup: 'mirror-pair', g25MirrorRecipe: [...g25MirrorRecipeForSlot(0)] };
  cons[empties[1] as number] = { mode: 'normal', capacity: 4, g25MirrorGroup: 'mirror-pair', g25MirrorRecipe: [...g25MirrorRecipeForSlot(1)] };
  return cons;
}
const legal: number[] = [];
const solv: number[] = [];
const opt: number[] = [];
const fatal: number[] = [];
let doom = 0;
for (let s = 0; s < N; s++) {
  const cups = dealPilotBoard(`g25-pilot-${s}`);
  const cons = build(cups);
  const root = solvePuzzle(cups, { cupConstraints: [...cons], returnSolution: true });
  const moves = listConstructiveActionsState({ cups }, cons).filter((a) => (a as { kind: string }).kind === 'pour');
  let sv = 0;
  let op = 0;
  let fa = 0;
  for (const m of moves as Array<{ kind: string; from: number; to: number }>) {
    const res = applyPourState({ cups }, m.from, m.to, cons);
    if (!res) continue;
    const child = solvePuzzle(res.state.cups, { cupConstraints: [...cons], returnSolution: false });
    if (child.solvable && !child.truncated) {
      sv++;
      if (root.solvable && child.minMoves === (root.minMoves as number) - 1) op++;
    } else if (!child.truncated) {
      fa++;
    }
  }
  legal.push(moves.length);
  solv.push(sv);
  opt.push(op);
  fatal.push(fa);
  if (sv === 0) doom++;
  if ((s + 1) % 10 === 0) console.log(`fair ${s + 1}/${N}`);
}
console.log(`\nMIRROR FAIRNESS N=${N}`);
console.log(`constructive med=${pct(legal, 50)} solvable-first med=${pct(solv, 50)} optimal-first med=${pct(opt, 50)}`);
console.log(`fatal med=${pct(fatal, 50)} p90=${pct(fatal, 90)} doom=${doom}/${N}`);
