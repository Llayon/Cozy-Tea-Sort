/**
 * G26 fairness pre-probe (DEV ONLY): 20-board first-action analysis.
 * Usage: bunx tsx scripts/dev/g26-fairness.ts <candidate>
 */
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import { applyPourState, isPuzzleWonState } from '../../src/game/logic/rules.ts';
import { dealG26Board, g26ControlConstraints } from './g26-access-lib.ts';

const candidate = process.argv[2] as 'bottom-draw' | 'pair-ready' | 'linked-gate';
if (!['bottom-draw', 'pair-ready', 'linked-gate'].includes(candidate)) {
  console.error('usage: g26-fairness.ts <candidate>');
  process.exit(1);
}

const N = 20;
let doom = 0;
let fatalCounts: number[] = [];
for (let i = 0; i < N; i++) {
  const seed = `g26-${candidate}-probe-${i}`;
  const { cups, constraints } = dealG26Board(seed, candidate);
  // Root legal moves under FULL.
  const { listLegalMovesState } = await import('../../src/game/logic/rules.ts');
  const moves = listLegalMovesState({ cups }, false, constraints);
  let solvableRoot = 0;
  let fatal = 0;
  for (const m of moves) {
    const res = applyPourState({ cups }, m.from, m.to, constraints);
    if (!res) {
      fatal++;
      continue;
    }
    const sub = solvePuzzle(res.state.cups, { cupConstraints: constraints });
    if (sub.solvable) solvableRoot++;
    else fatal++;
  }
  fatalCounts.push(fatal);
  if (solvableRoot === 0) doom++;
  console.log(`board ${i}: rootMoves=${moves.length} solvableRoot=${solvableRoot} fatal=${fatal}`);
}
fatalCounts.sort((a, b) => a - b);
const quant = (arr: number[], q: number) => (arr.length === 0 ? 0 : arr[Math.min(arr.length - 1, Math.floor(q * arr.length))]);
console.log(JSON.stringify({ candidate, N, doom, fatalP50: quant(fatalCounts, 0.5), fatalP90: quant(fatalCounts, 0.9), fatalMax: fatalCounts[fatalCounts.length - 1] }, null, 2));
