/**
 * G16 shared-tray fairness (DEV ONLY — never CI).
 * For 50 production seeds: legal / solvable-first / optimal-first / fatal /
 * fatalRatio / doom per constructive root move (child states solved by the
 * PRODUCTION solver with tray constraints, non-truncated), plus shared
 * fairness: first-pressure/release/refill medians, gaps, shared-full-block
 * count, cross-member/bound rates.
 *
 * Usage: bun scripts/dev/shared-tray-fairness.ts [N]
 */
import { emptyFloatingIngredients, type CupConstraint, type TeaId } from '../../src/game/types.ts';
import type { SolverAction } from '../../src/game/types.ts';
import { applyPourState, listConstructiveActionsState, pourCountState, pourRejectCodeState } from '../../src/game/logic/rules.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import { generateLevel } from '../../src/game/logic/generator.ts';
import { analyzeSharedTrayParticipation } from '../../src/game/logic/generator.ts';
import { cloneCupConstraint } from '../../src/game/types.ts';

function stripTray(cons: readonly CupConstraint[]): CupConstraint[] {
  return cons.map((c) => {
    const n = cloneCupConstraint(c);
    delete (n as { sharedCapacityGroup?: unknown }).sharedCapacityGroup;
    return n;
  });
}

const MAX_VISITED = 120_000;

function trayReqFor(seedIdx: number) {
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
    sharedTrayCount: 1,
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
const releaseD: number[] = [];
const refillD: number[] = [];
const gapPR: number[] = [];
const gapRR: number[] = [];
const fullBlocks: number[] = [];
let cross = 0;
let bound = 0;
let doom = 0;

for (let s = 0; s < N; s++) {
  const lvl = generateLevel(trayReqFor(s), `tray-fair-${s}`);
  const cons = lvl.cupConstraints as readonly CupConstraint[];
  const st = { cups: lvl.cups, floatingIngredients: emptyFloatingIngredients(6) };
  const moves = listConstructiveActionsState(st, cons).filter((a) => a.kind === 'pour');
  let sv = 0;
  let op = 0;
  let fa = 0;
  let fb = 0;
  for (const m of moves) {
    if (m.kind !== 'pour') continue;
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
  // Shared-full blocks: every ordered pair rejected specifically shared-capacity-full.
  for (let f = 0; f < 6; f++) {
    for (let t = 0; t < 6; t++) {
      if (f === t) continue;
      if (pourRejectCodeState(st, f, t, cons) === 'shared-capacity-full') fb++;
    }
  }
  legal.push(moves.length);
  solvable.push(sv);
  optimal.push(op);
  fatal.push(fa);
  fullBlocks.push(fb);
  if (sv === 0) doom++;
  const sol = solvePuzzle(lvl.cups, { cupConstraints: cons }).solution as SolverAction[] | undefined;
  if (sol) {
    const part = analyzeSharedTrayParticipation(lvl.cups, sol, cons);
    if (part.firstPressureDepth !== null) firstPD.push(part.firstPressureDepth);
    if (part.firstReleaseDepth !== null) releaseD.push(part.firstReleaseDepth);
    if (part.firstRefillDepth !== null) refillD.push(part.firstRefillDepth);
    if (part.firstPressureDepth !== null && part.firstReleaseDepth !== null) {
      gapPR.push(part.firstReleaseDepth - part.firstPressureDepth);
    }
    if (part.firstReleaseDepth !== null && part.firstRefillDepth !== null) {
      gapRR.push(part.firstRefillDepth - part.firstReleaseDepth);
    }
    // Cross-member reuse + bound transfers in the optimal replay.
    const tray = cons.map((c, i) => (c?.sharedCapacityGroup === 'tea-tray' ? i : -1)).filter((i) => i >= 0);
    const traySet = new Set(tray);
    const ctrl = stripTray(cons);
    let board = lvl.cups.map((c) => [...c]);
    const bst = () => ({ cups: board, floatingIngredients: emptyFloatingIngredients(board.length) });
    const released = new Set<number>();
    let seedCross = false;
    let seedBound = false;
    for (const a of sol) {
      if ((a as SolverAction).kind !== 'pour') continue;
      const from = (a as { from: number }).from;
      const to = (a as { to: number }).to;
      const before = board.map((c) => [...c]);
      const occBefore = tray.reduce((sum, m) => sum + (before[m] as TeaId[]).length, 0);
      const res = applyPourState(bst(), from, to, cons);
      if (!res) break;
      board = res.state.cups as TeaId[][];
      const occAfter = tray.reduce((sum, m) => sum + (board[m] as TeaId[]).length, 0);
      if (traySet.has(from) && !traySet.has(to) && occAfter < occBefore) released.add(from);
      if (!traySet.has(from) && traySet.has(to) && occAfter > occBefore) {
        for (const m of released) if (m !== to) seedCross = true;
        const pre = { cups: before, floatingIngredients: emptyFloatingIngredients(before.length) };
        if (res.transferred > 0 && res.transferred < pourCountState(pre, from, to, ctrl)) seedBound = true;
      }
    }
    if (seedCross) cross++;
    if (seedBound) bound++;
  }
  if ((s + 1) % 10 === 0) console.log(`fair ${s + 1}/${N}`);
}

const fratios = fatal.map((f, i) => ((legal[i] as number) > 0 ? f / (legal[i] as number) : 0));
console.log(`\n===== SHARED-TRAY FAIRNESS N=${N} =====`);
console.log(`root constructive med=${pct(legal, 50)} p90=${pct(legal, 90)}`);
console.log(`solvable-first med=${pct(solvable, 50)} p90=${pct(solvable, 90)}`);
console.log(`optimal-first med=${pct(optimal, 50)}`);
console.log(`fatal med=${pct(fatal, 50)} p90=${pct(fatal, 90)} mean=${mean(fatal).toFixed(2)}`);
console.log(`fatalRatio mean=${(mean(fratios) * 100).toFixed(1)}%`);
console.log(`doom rate=${doom}/${N} (${((100 * doom) / Math.max(1, N)).toFixed(1)}%)`);
console.log(`firstPressure med=${pct(firstPD, 50)} release med=${pct(releaseD, 50)} refill med=${pct(refillD, 50)}`);
console.log(`gapP→R med=${pct(gapPR, 50)} gapR→R med=${pct(gapRR, 50)}`);
console.log(`shared-full blocks med=${pct(fullBlocks, 50)} cross=${cross} bound=${bound} (bank L3A 18/18, L3B 0/18)`);
