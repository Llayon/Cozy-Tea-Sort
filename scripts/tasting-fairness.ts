/**
 * Dev-only fairness + participation benchmark (Gauntlet 4 §45–46, offline).
 * For N production seeds per config: legal / solvable / optimal / fatal /
 * tasting-directed first moves (production solver on children) + the share
 * of returned optimal solutions that use the bowl (required: 100%).
 *
 * Usage: bun scripts/tasting-fairness.ts [N]
 */
import { generateLevel } from '../src/game/logic/generator';
import { applyPour, isWonState, listLegalMoves } from '../src/game/logic/rules';
import { solvePuzzle } from '../src/game/logic/solver';
import type { CupConstraint, TeaId } from '../src/game/types';

const CH4 = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'] as TeaId[];
const PK5 = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong', 'lavender'] as TeaId[];

const CFGS: Array<{ name: string; req: Record<string, unknown> }> = [
  { name: 'tasting-challenge', req: { numColors: 4, colors: CH4, emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', tastingCupCount: 1 } },
  { name: 'teapot-tasting-challenge', req: { numColors: 4, colors: CH4, emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', sourceOnlyCount: 1, tastingCupCount: 1 } },
  { name: 'tasting-mystery-peak', req: { numColors: 5, colors: PK5, emptyCups: 2, hasMysteryLayer: true, phase: 'peak', tastingCupCount: 1 } },
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
  const tastD: number[] = [];
  const tastDS: number[] = [];
  let usingTasting = 0;
  for (let s = 0; s < N; s++) {
    const lvl = generateLevel(req as never, `tfair:${name}:${s}`);
    const constraints = lvl.cupConstraints as readonly CupConstraint[];
    const tastingIdx = constraints.findIndex(
      (c) => c.mode === 'normal' && c.capacity === 2 && c.mustEndEmpty === true,
    );
    const solved = solvePuzzle(lvl.cups, { cupConstraints: constraints });
    const sol = solved.solution ?? [];
    if (sol.some((m) => m.to === tastingIdx) && sol.slice(sol.findIndex((m) => m.to === tastingIdx) + 1).some((m) => m.from === tastingIdx)) {
      usingTasting++;
    }
    // Sanity: final replay leaves the bowl empty and wins.
    let board = lvl.cups.map((c) => [...c]);
    for (const step of sol) {
      const res = applyPour(board, step.from, step.to, constraints);
      if (res) board = res.cups;
    }
    if (!isWonState(board, constraints) || board[tastingIdx]?.length !== 0) {
      console.log(`${name} seed ${s}: REPLAY MISMATCH`);
    }
    const moves = listLegalMoves(lvl.cups, true, constraints);
    let sv = 0, op = 0, fa = 0, td = 0, tds = 0;
    for (const m of moves) {
      const res = applyPour(lvl.cups, m.from, m.to, constraints);
      if (!res) continue;
      const child = solvePuzzle(res.cups, { maxVisited: 120_000, cupConstraints: constraints });
      const ok = child.solvable && !child.truncated && child.minMoves !== undefined;
      if (ok) {
        sv++;
        if (child.minMoves === lvl.minMoves - 1) op++;
      } else if (!child.truncated) {
        fa++;
      }
      if (m.to === tastingIdx) {
        td++;
        if (ok) tds++;
      }
    }
    legal.push(moves.length);
    solvable.push(sv);
    optimal.push(op);
    fatal.push(fa);
    tastD.push(td);
    tastDS.push(tds);
  }
  const fratios = fatal.map((f, i) => ((legal[i] as number) > 0 ? f / (legal[i] as number) : 0));
  console.log(
    `${name}: n=${N} ` +
    `legal med=${pct(legal, 50)} | solvable med=${pct(solvable, 50)} | optimal med=${pct(optimal, 50)} | ` +
    `fatal med=${pct(fatal, 50)} p90=${pct(fatal, 90)} mean=${mean(fatal).toFixed(2)} ` +
    `fatalRatio mean=${(mean(fratios) * 100).toFixed(1)}% | ` +
    `tastD med=${pct(tastD, 50)} tastDS med=${pct(tastDS, 50)} | ` +
    `usingTasting=${((usingTasting / N) * 100).toFixed(1)}%`,
  );
}
