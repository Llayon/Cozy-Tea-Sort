/**
 * Dev-only fairness benchmark (Gauntlet 5 §53–54, offline).
 * For N production seeds per config: legal / solvable / optimal / fatal /
 * lemon-host-directed first moves (production solver on children) plus
 * wrong-final deadlock rate. Unlimited Undo exists, but the mechanic must
 * feel like planning, not punishment.
 *
 * Usage: bun scripts/dev/lemon-fairness.ts [N]
 */
import { generateLevel } from '../../src/game/logic/generator';
import {
  applyPourState,
  isPuzzleDeadlockedState,
  isPuzzleWonState,
  isWonState,
  listLegalMovesState,
} from '../../src/game/logic/rules';
import { solvePuzzle } from '../../src/game/logic/solver';
import { floatingIngredientIndex, type CupConstraint, type TeaId } from '../../src/game/types';

const CH4 = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'] as TeaId[];
const PK5 = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong', 'lavender'] as TeaId[];

const CFGS: Array<{ name: string; req: Record<string, unknown> }> = [
  { name: 'lemon-challenge', req: { numColors: 4, colors: CH4, emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', floatingIngredient: 'lemon' } },
  { name: 'teapot-lemon-challenge', req: { numColors: 4, colors: CH4, emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', sourceOnlyCount: 1, floatingIngredient: 'lemon' } },
  { name: 'lemon-mystery-peak', req: { numColors: 5, colors: PK5, emptyCups: 2, hasMysteryLayer: true, phase: 'peak', floatingIngredient: 'lemon' } },
];

function pct(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
}
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

const N = parseInt(process.argv[2] ?? '50', 10);
for (const { name, req } of CFGS) {
  const legal: number[] = [];
  const solvable: number[] = [];
  const optimal: number[] = [];
  const fatal: number[] = [];
  const lemonD: number[] = [];
  const lemonDS: number[] = [];
  const wrongFinal: number[] = [];
  for (let s = 0; s < N; s++) {
    const lvl = generateLevel(req as never, `lfair:${name}:${s}`);
    const constraints = lvl.cupConstraints as readonly CupConstraint[];
    const state = { cups: lvl.cups, floatingIngredients: lvl.floatingIngredients };
    const host = floatingIngredientIndex(state, 'lemon');
    const moves = listLegalMovesState(state, true, constraints);
    let sv = 0, op = 0, fa = 0, ld = 0, lds = 0, wf = 0;
    for (const m of moves) {
      const res = applyPourState(state, m.from, m.to, constraints);
      if (!res) continue;
      const child = solvePuzzle(res.state.cups, {
        maxVisited: 120_000,
        cupConstraints: constraints,
        floatingIngredients: res.state.floatingIngredients,
      });
      const ok = child.solvable && !child.truncated && child.minMoves !== undefined;
      if (ok) {
        sv++;
        if (child.minMoves === lvl.minMoves - 1) op++;
      } else if (!child.truncated) {
        fa++;
      }
      if (m.from === host) {
        ld++;
        if (ok) lds++;
      }
      if (isWonState(res.state.cups, constraints) && !isPuzzleWonState(res.state, constraints) && isPuzzleDeadlockedState(res.state, constraints)) {
        wf++;
      }
    }
    legal.push(moves.length);
    solvable.push(sv);
    optimal.push(op);
    fatal.push(fa);
    lemonD.push(ld);
    lemonDS.push(lds);
    wrongFinal.push(wf);
  }
  const fratios = fatal.map((f, i) => ((legal[i] as number) > 0 ? f / (legal[i] as number) : 0));
  console.log(
    `${name}: n=${N} ` +
    `legal med=${pct(legal, 50)} | solvable med=${pct(solvable, 50)} | optimal med=${pct(optimal, 50)} | ` +
    `fatal med=${pct(fatal, 50)} p90=${pct(fatal, 90)} mean=${mean(fatal).toFixed(2)} ` +
    `fatalRatio mean=${(mean(fratios) * 100).toFixed(1)}% | ` +
    `lemonD med=${pct(lemonD, 50)} lemonDS med=${pct(lemonDS, 50)} | ` +
    `wrongFinal mean=${mean(wrongFinal).toFixed(2)}`,
  );
}
