/**
 * Dev-only fairness benchmark (Gauntlet 3 §54, offline analysis only).
 * For 50 production seeds per config: legal / solvable / optimal / fatal /
 * sink-directed first moves (child states solved by the PRODUCTION solver,
 * non-truncated). Interprets planning-vs-traps; never runs in production.
 *
 * Usage: bun scripts/sink-fairness.ts [N]
 */
import { generateLevel } from '../src/game/logic/generator';
import { applyPour, listLegalMoves } from '../src/game/logic/rules';
import { solvePuzzle } from '../src/game/logic/solver';
import type { CupConstraint, TeaId } from '../src/game/types';

const CH4 = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'] as TeaId[];
const PK5 = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong', 'lavender'] as TeaId[];

const CFGS: Array<{ name: string; req: Record<string, unknown> }> = [
  { name: 'base-challenge', req: { numColors: 4, colors: CH4, emptyCups: 2, hasMysteryLayer: false, phase: 'challenge' } },
  { name: 'sink-challenge', req: { numColors: 4, colors: CH4, emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', sinkOnlyCount: 1 } },
  { name: 'teapot-sink-challenge', req: { numColors: 4, colors: CH4, emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', sourceOnlyCount: 1, sinkOnlyCount: 1 } },
  { name: 'sink-mystery-peak', req: { numColors: 5, colors: PK5, emptyCups: 2, hasMysteryLayer: true, phase: 'peak', sinkOnlyCount: 1 } },
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
  const sinkD: number[] = [];
  const sinkDS: number[] = [];
  for (let s = 0; s < N; s++) {
    const lvl = generateLevel(req as never, `fair:${name}:${s}`);
    const constraints = lvl.cupConstraints as readonly CupConstraint[];
    const sinkIdx = constraints.findIndex((c) => c.mode === 'sink-only');
    const moves = listLegalMoves(lvl.cups, true, constraints);
    let sv = 0, op = 0, fa = 0, sd = 0, sds = 0;
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
      if (m.to === sinkIdx) {
        sd++;
        if (ok) sds++;
      }
    }
    legal.push(moves.length);
    solvable.push(sv);
    optimal.push(op);
    fatal.push(fa);
    sinkD.push(sd);
    sinkDS.push(sds);
  }
  const fratios = fatal.map((f, i) => (legal[i] as number) > 0 ? (f / (legal[i] as number)) : 0);
  console.log(
    `${name}: n=${N} ` +
    `legal med=${pct(legal, 50)} p90=${pct(legal, 90)} | ` +
    `solvable med=${pct(solvable, 50)} p90=${pct(solvable, 90)} | ` +
    `optimal med=${pct(optimal, 50)} | ` +
    `fatal med=${pct(fatal, 50)} p90=${pct(fatal, 90)} mean=${mean(fatal).toFixed(2)} | ` +
    `fatalRatio mean=${(mean(fratios) * 100).toFixed(1)}% | ` +
    `sinkD med=${pct(sinkD, 50)} sinkDS med=${pct(sinkDS, 50)}`,
  );
}
