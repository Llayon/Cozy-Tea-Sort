/**
 * G13 blend fairness (DEV ONLY — never CI).
 * For 50 production seeds: legal / solvable-first / optimal-first / fatal /
 * fatalRatio / doom per constructive root move (child states solved by the
 * PRODUCTION solver with recipe, non-truncated), plus chemistry fairness:
 * first-move reaction rate, fatal-reaction share, batch-first-4 rate,
 * reaction timing (first/last), product-transfer and distributed-craft rates.
 *
 * Usage: bunx tsx scripts/dev/blend-fairness.ts [N]
 */
import { emptyFloatingIngredients, type CupConstraint, type TeaId } from '../../src/game/types.ts';
import { applyPourState, listConstructiveActionsState } from '../../src/game/logic/rules.ts';
import { solvePuzzle, type SolverAction } from '../../src/game/logic/solver.ts';
import { generateLevel } from '../../src/game/logic/generator.ts';
import { MILK_TEA_BLEND_RECIPE } from '../../src/game/logic/blendRecipe.ts';

const R = MILK_TEA_BLEND_RECIPE;
const MAX_VISITED = 120_000;

function blendReqFor(seedIdx: number) {
  const pairs: Array<[TeaId, TeaId]> = [
    ['matcha', 'sea_buckthorn'],
    ['karkade', 'buckwheat'],
    ['lavender', 'saffron'],
    ['matcha', 'karkade'],
  ];
  const pick = pairs[seedIdx % pairs.length] as [TeaId, TeaId];
  return {
    numColors: 4,
    colors: ['black_tea', 'milk', pick[0], pick[1]] as TeaId[],
    emptyCups: 2,
    hasMysteryLayer: false,
    phase: 'challenge' as const,
    blendRecipeId: 'milk-tea' as const,
  };
}

function pct(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
}
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

const N = Number(process.argv[2] ?? 50);
const legal: number[] = [];
const solvable: number[] = [];
const optimal: number[] = [];
const fatal: number[] = [];
const firstIsReaction: number[] = [];
const fatalIsReaction: number[] = [];
const firstDepth: number[] = [];
const lastDepth: number[] = [];
const between: number[] = [];
const pTrans: number[] = [];
const dests: number[] = [];
let doom = 0;
let batch4 = 0;

for (let s = 0; s < N; s++) {
  const lvl = generateLevel(blendReqFor(s), `blend-fair-${s}`);
  const cons = lvl.cupConstraints as readonly CupConstraint[];
  const moves = listConstructiveActionsState(
    { cups: lvl.cups, floatingIngredients: emptyFloatingIngredients(6) }, cons, R,
  ).filter((a) => a.kind === 'pour');
  let sv = 0;
  let op = 0;
  let fa = 0;
  let fatalReact = 0;
  for (const m of moves) {
    if (m.kind !== 'pour') continue;
    const res = applyPourState(
      { cups: lvl.cups, floatingIngredients: emptyFloatingIngredients(6) },
      m.from, m.to, cons, R,
    );
    if (!res) continue;
    const child = solvePuzzle(res.state.cups, { maxVisited: MAX_VISITED, cupConstraints: cons, blendRecipe: R });
    const ok = child.solvable && !child.truncated && child.minMoves !== undefined;
    if (ok) {
      sv++;
      if (child.minMoves === lvl.minMoves - 1) op++;
    } else if (!child.truncated) {
      fa++;
      if (res.reaction) fatalReact++;
    }
  }
  legal.push(moves.length);
  solvable.push(sv);
  optimal.push(op);
  fatal.push(fa);
  fatalIsReaction.push(fa > 0 ? fatalReact / fa : 0);
  if (sv === 0) doom++;
  // Chemistry timing from the optimal path.
  const sol = solvePuzzle(lvl.cups, { cupConstraints: cons, blendRecipe: R }).solution as SolverAction[] | undefined;
  if (sol) {
    let board = lvl.cups.map((c) => [...c]);
    let first: number | null = null;
    let last: number | null = null;
    const rIdx: number[] = [];
    let pt = 0;
    const ds = new Set<number>();
    const first4: boolean[] = [];
    for (let i = 0; i < sol.length; i++) {
      const a = sol[i] as SolverAction;
      if (a.kind !== 'pour') continue;
      const r2 = applyPourState({ cups: board, floatingIngredients: emptyFloatingIngredients(board.length) }, a.from, a.to, cons, R);
      if (!r2) break;
      board = r2.state.cups as TeaId[][];
      const isReact = !!r2.reaction;
      if (i < 4) first4.push(isReact);
      if (isReact) {
        rIdx.push(i);
        ds.add(a.to);
        if (first === null) first = i;
        last = i;
      } else if (r2.layer === 'milk_tea') pt++;
    }
    if (first !== null) {
      firstIsReaction.push(sol[0]?.kind === 'pour' && rIdx.includes(0) ? 1 : 0);
      firstDepth.push(first);
      lastDepth.push(last as number);
      let b = 0;
      for (let i = (first as number) + 1; i < (last as number); i++) if (!rIdx.includes(i)) b++;
      between.push(b);
      pTrans.push(pt);
      dests.push(ds.size);
      if (first4.length === 4 && first4.every(Boolean)) batch4++;
    }
  }
  if ((s + 1) % 10 === 0) console.log(`fair ${s + 1}/${N}`);
}

const fratios = fatal.map((f, i) => ((legal[i] as number) > 0 ? f / (legal[i] as number) : 0));
console.log(`\n===== BLEND FAIRNESS N=${N} =====`);
console.log(`root constructive med=${pct(legal, 50)} p90=${pct(legal, 90)}`);
console.log(`solvable-first med=${pct(solvable, 50)} p90=${pct(solvable, 90)}`);
console.log(`optimal-first med=${pct(optimal, 50)}`);
console.log(`fatal med=${pct(fatal, 50)} p90=${pct(fatal, 90)} mean=${mean(fatal).toFixed(2)}`);
console.log(`fatalRatio mean=${(mean(fratios) * 100).toFixed(1)}%`);
console.log(`doom rate=${doom}/${N} (${((100 * doom) / Math.max(1, N)).toFixed(1)}%)`);
console.log(`first-move reaction rate=${(mean(firstIsReaction) * 100).toFixed(1)}%`);
console.log(`fatal-is-reaction share mean=${(mean(fatalIsReaction) * 100).toFixed(1)}%`);
console.log(`firstReaction p50=${pct(firstDepth, 50)} lastReaction p50=${pct(lastDepth, 50)} between p50=${pct(between, 50)}`);
console.log(`productTransfer rate=${pTrans.filter((v) => v >= 1).length}/${pTrans.length} dests>=2 rate=${dests.filter((v) => v >= 2).length}/${dests.length}`);
console.log(`batch-first-4 rate=${batch4}/${N}`);
