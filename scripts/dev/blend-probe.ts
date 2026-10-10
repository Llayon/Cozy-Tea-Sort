/**
 * G13 blend probe (DEV ONLY): single deterministic shaped board diagnostics.
 * Usage: bunx tsx scripts/dev/blend-probe.ts [seedIndex]
 */
import { emptyFloatingIngredients, CupConstraint } from '../../src/game/types.ts';
import { applyPourState, canonicalPuzzleKey } from '../../src/game/logic/rules.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import { shaped, RECIPE, analyzeBlendTrace } from './blend-search.ts';

const idx = Number(process.argv[2] ?? 0);
const C: CupConstraint[] = Array.from({ length: 6 }, () => ({ mode: 'normal' as const }));
const { cups } = shaped(idx);
console.log(`board #${idx}:`, JSON.stringify(cups));
console.log('key:', canonicalPuzzleKey({ cups, floatingIngredients: emptyFloatingIngredients(6) }, C));
const t0 = Date.now();
const r = solvePuzzle(cups, { cupConstraints: C, blendRecipe: RECIPE });
console.log(`solved=${r.solvable} minMoves=${r.minMoves} visited=${r.visitedStates} trunc=${r.truncated} ms=${Date.now() - t0}`);
if (r.solvable && r.solution) {
  const tr = analyzeBlendTrace(cups, r.solution, C);
  console.log('trace:', JSON.stringify(tr, null, 2));
  console.log('moves:', JSON.stringify(r.solution.map((a) => a.kind === 'pour' ? `${a.from}→${a.to}${(a as { reactionProduct?: string }).reactionProduct ? `[P:${(a as { reactionProduct?: string }).reactionProduct}]` : ''}` : a.kind)));
}
const plain = solvePuzzle(cups, { cupConstraints: C });
console.log(`control plain: solved=${plain.solvable} minMoves=${plain.minMoves} visited=${plain.visitedStates}`);
