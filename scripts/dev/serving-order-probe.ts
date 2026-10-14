/**
 * G14 serving-order probe (DEV ONLY): single deterministic shaped board.
 * Usage: bunx tsx scripts/dev/serving-order-probe.ts [seedIndex]
 */
import { emptyFloatingIngredients, CupConstraint } from '../../src/game/types.ts';
import { canonicalPuzzleKey } from '../../src/game/logic/rules.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import { shaped, consWithHosts, analyzeServingTrace, stripOrders } from './serving-order-search.ts';

const idx = Number(process.argv[2] ?? 0);
const { cups, h1, h2 } = shaped(idx);
const C = consWithHosts(h1, h2);
console.log(`board #${idx} hosts ${h1}>${h2}:`, JSON.stringify(cups));
console.log('key:', canonicalPuzzleKey({ cups, floatingIngredients: emptyFloatingIngredients(6) }, C));
const t0 = Date.now();
const r = solvePuzzle(cups, { cupConstraints: C });
console.log(`solved=${r.solvable} minMoves=${r.minMoves} visited=${r.visitedStates} trunc=${r.truncated} ms=${Date.now() - t0}`);
if (r.solvable && r.solution) {
  const tr = analyzeServingTrace(cups, h1, h2, r.solution, C);
  console.log('trace:', JSON.stringify(tr));
  const plain = solvePuzzle(cups, { cupConstraints: stripOrders(C) });
  console.log(`control plain: solved=${plain.solvable} minMoves=${plain.minMoves} visited=${plain.visitedStates}`);
}
