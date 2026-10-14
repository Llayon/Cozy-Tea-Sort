/**
 * G14 serving-order fairness (DEV ONLY — never CI).
 * For 50 production seeds: legal / solvable-first / optimal-first / fatal /
 * fatalRatio / doom per constructive root move (child states solved by the
 * PRODUCTION solver with serving constraints, non-truncated), plus order
 * fairness: first-pressure median, serve1/serve2 medians, gaps,
 * early-completion-block count, L3A/L3B rates.
 *
 * Usage: bunx tsx scripts/dev/serving-order-fairness.ts [N]
 */
import { emptyFloatingIngredients, type CupConstraint, type TeaId } from '../../src/game/types.ts';
import type { SolverAction } from '../../src/game/types.ts';
import { applyPourState, listConstructiveActionsState, pourRejectCodeState } from '../../src/game/logic/rules.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import { generateLevel } from '../../src/game/logic/generator.ts';
import { analyzeServingOrderParticipation } from '../../src/game/logic/generator.ts';

const MAX_VISITED = 120_000;

function servingReqFor(seedIdx: number) {
  const quads: Array<[TeaId, TeaId, TeaId, TeaId]> = [
    ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'],
    ['lavender', 'saffron', 'buckwheat', 'matcha'],
    ['karkade', 'milk_oolong', 'lavender', 'sea_buckthorn'],
    ['saffron', 'buckwheat', 'matcha', 'karkade'],
  ];
  const pick = quads[seedIdx % quads.length] as [TeaId, TeaId, TeaId, TeaId];
  return {
    numColors: 4,
    colors: [...pick] as TeaId[],
    emptyCups: 2,
    hasMysteryLayer: false,
    phase: 'challenge' as const,
    serveOrderCount: 2,
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
const firstPD: number[] = [];
const serve1D: number[] = [];
const serve2D: number[] = [];
const gapPS1: number[] = [];
const gapS1S2: number[] = [];
const earlyBlocks: number[] = [];
let l3a = 0;
let l3b = 0;
let doom = 0;

for (let s = 0; s < N; s++) {
  const lvl = generateLevel(servingReqFor(s), `serve-fair-${s}`);
  const cons = lvl.cupConstraints as readonly CupConstraint[];
  const st = { cups: lvl.cups, floatingIngredients: emptyFloatingIngredients(6) };
  const moves = listConstructiveActionsState(st, cons).filter((a) => a.kind === 'pour');
  let sv = 0;
  let op = 0;
  let fa = 0;
  let eb = 0;
  for (const m of moves) {
    if (m.kind !== 'pour') continue;
    // Count serve-order rejections among ALL ordered pairs (blocked-share).
    const res = applyPourState(st, m.from, m.to, cons);
    if (!res) continue;
    const child = solvePuzzle(res.state.cups, { maxVisited: MAX_VISITED, cupConstraints: cons });
    const ok = child.solvable && !child.truncated && child.minMoves !== undefined;
    if (ok) {
      sv++;
      if (child.minMoves === lvl.minMoves - 1) op++;
    } else if (!child.truncated) {
      fa++;
    }
  }
  // Early-completion blocks: every ordered pair rejected specifically serve-order.
  for (let f = 0; f < 6; f++) {
    for (let t = 0; t < 6; t++) {
      if (f === t) continue;
      if (pourRejectCodeState(st, f, t, cons) === 'serve-order') eb++;
    }
  }
  legal.push(moves.length);
  solvable.push(sv);
  optimal.push(op);
  fatal.push(fa);
  earlyBlocks.push(eb);
  if (sv === 0) doom++;
  const sol = solvePuzzle(lvl.cups, { cupConstraints: cons }).solution as SolverAction[] | undefined;
  if (sol) {
    const part = analyzeServingOrderParticipation(lvl.cups, sol, cons);
    if (part.firstPressureDepth !== null) firstPD.push(part.firstPressureDepth);
    if (part.serve1Depth !== null) serve1D.push(part.serve1Depth);
    if (part.serve2Depth !== null) serve2D.push(part.serve2Depth);
    if (part.pressureToServe1Gap !== null) gapPS1.push(part.pressureToServe1Gap);
    if (part.serve1ToServe2Gap !== null) gapS1S2.push(part.serve1ToServe2Gap);
  }
  if ((s + 1) % 10 === 0) console.log(`fair ${s + 1}/${N}`);
}

const fratios = fatal.map((f, i) => ((legal[i] as number) > 0 ? f / (legal[i] as number) : 0));
console.log(`\n===== SERVING FAIRNESS N=${N} =====`);
console.log(`root constructive med=${pct(legal, 50)} p90=${pct(legal, 90)}`);
console.log(`solvable-first med=${pct(solvable, 50)} p90=${pct(solvable, 90)}`);
console.log(`optimal-first med=${pct(optimal, 50)}`);
console.log(`fatal med=${pct(fatal, 50)} p90=${pct(fatal, 90)} mean=${mean(fatal).toFixed(2)}`);
console.log(`fatalRatio mean=${(mean(fratios) * 100).toFixed(1)}%`);
console.log(`doom rate=${doom}/${N} (${((100 * doom) / Math.max(1, N)).toFixed(1)}%)`);
console.log(`firstPressure med=${pct(firstPD, 50)} serve1 med=${pct(serve1D, 50)} serve2 med=${pct(serve2D, 50)}`);
console.log(`gapP→S1 med=${pct(gapPS1, 50)} gapS1→S2 med=${pct(gapS1S2, 50)}`);
console.log(`early-completion blocks med=${pct(earlyBlocks, 50)} (L3A/L3B bank: 11/18 + 7/18)`);
void l3a;
void l3b;
