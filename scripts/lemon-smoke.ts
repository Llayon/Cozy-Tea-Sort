/** Dev-only smoke: lemon generation plumbing (rotation fallback until bank lands). */
import { createGenerateStats, fallbackLevel, generateLevel } from '../src/game/logic/generator';
import { solvePuzzle, applySolutionState } from '../src/game/logic/solver';
import { isPuzzleWonState } from '../src/game/logic/rules';
import type { TeaId } from '../src/game/types';

const CH4 = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'] as TeaId[];

const req = {
  numColors: 4, colors: CH4, emptyCups: 2, hasMysteryLayer: false,
  phase: 'challenge', floatingIngredient: 'lemon',
} as never;

const stats = createGenerateStats();
const lvl = generateLevel(req, 'lemon-smoke:1', { stats });
console.log(`level: minMoves=${lvl.minMoves} slots=${JSON.stringify(lvl.floatingIngredients)} stats=${JSON.stringify(stats)}`);
const solved = solvePuzzle(lvl.cups, { cupConstraints: lvl.cupConstraints, floatingIngredients: lvl.floatingIngredients });
console.log(`solved=${solved.solvable} minMoves=${solved.minMoves} truncated=${solved.truncated}`);
const t = lvl.floatingIngredients.findIndex((s) => s !== null);
const sol = solved.solution ?? [];
console.log(`lemonHost=${t} enters=${sol.some((m) => m.to === t)} exits=${sol.some((m) => m.from === t)}`);
const final = applySolutionState({ cups: lvl.cups, floatingIngredients: lvl.floatingIngredients }, sol, lvl.cupConstraints);
console.log(`finalWon=${final ? isPuzzleWonState(final, lvl.cupConstraints) : false} finalSlots=${final ? JSON.stringify(final.floatingIngredients) : null}`);
const fs = createGenerateStats();
const fb = fallbackLevel(req, { stats: fs });
console.log(`fallback: minMoves=${fb.minMoves} slots=${JSON.stringify(fb.floatingIngredients)} stats=${JSON.stringify(fs)}`);
