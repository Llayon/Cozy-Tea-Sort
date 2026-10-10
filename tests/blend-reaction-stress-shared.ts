/**
 * Gauntlet 13 — production blend stress (shared helpers, DEV-bounded).
 * 200 deterministic seeds: shape/counts/mixed/recipe/solver/band/
 * 4-reactions/L2/final/win + per-move stoichiometry. No mining in CI
 * beyond this bounded stress (feasibility 1k/5k lives in scripts/dev).
 */
import { defaultCupConstraints, emptyFloatingIngredients, type CupConstraint, type TeaId } from '../src/game/types';
import { applyPourState, isPuzzleWonState } from '../src/game/logic/rules';
import { solvePuzzle, type SolverAction } from '../src/game/logic/solver';
import { analyzeBlendParticipation, createGenerateStats, generateLevel, type GenerateRequest } from '../src/game/logic/generator';
import { BLEND_DEPTH_ACCEPT } from '../src/game/logic/blendTemplates';
import { MILK_TEA_BLEND_RECIPE, countTeaLayers, countTotalLayers } from '../src/game/logic/blendRecipe';

export const R = MILK_TEA_BLEND_RECIPE;
export const CONS6: CupConstraint[] = defaultCupConstraints(6);

export function blendReqFor(seedIdx: number): GenerateRequest {
  // Deterministic filler rotation across stress (never milk_oolong).
  const pairs: Array<[TeaId, TeaId]> = [
    ['matcha', 'sea_buckthorn'],
    ['karkade', 'buckwheat'],
    ['lavender', 'saffron'],
    ['matcha', 'karkade'],
  ];
  const pick = pairs[seedIdx % pairs.length] as [TeaId, TeaId];
  return {
    numColors: 4,
    colors: ['black_tea', 'milk', pick[0], pick[1]],
    emptyCups: 2,
    hasMysteryLayer: false,
    phase: 'challenge',
    blendRecipeId: 'milk-tea',
  };
}

export interface BlendStressResult {
  seed: string;
  minMoves: number;
  visited: number;
  reactions: number;
  between: number;
  pTrans: number;
  dests: number;
  firstDiv: number;
  depth: number;
  templateAttempts: number;
  solverCalls: number;
}

export function runOneBlendSeed(seedIdx: number): BlendStressResult {
  const req = blendReqFor(seedIdx);
  const seed = `blend-stress-${seedIdx}`;
  const stats = createGenerateStats();
  const lvl = generateLevel(req, seed, { stats });
  if (lvl.blendRecipe?.id !== 'milk-tea') throw new Error(`seed ${seedIdx}: missing recipe`);
  if (lvl.cups.length !== 6) throw new Error(`seed ${seedIdx}: vessels`);
  const lens = lvl.cups.map((c) => c.length).sort((a, b) => a - b);
  if (JSON.stringify(lens) !== JSON.stringify([0, 0, 4, 4, 4, 4])) throw new Error(`seed ${seedIdx}: shape`);
  if (countTeaLayers(lvl.cups, 'black_tea') !== 4) throw new Error(`seed ${seedIdx}: black4`);
  if (countTeaLayers(lvl.cups, 'milk') !== 4) throw new Error(`seed ${seedIdx}: milk4`);
  if (countTeaLayers(lvl.cups, 'milk_tea') !== 0) throw new Error(`seed ${seedIdx}: product0`);
  for (const cup of lvl.cups) {
    if (cup.length === 4 && new Set(cup).size < 2) throw new Error(`seed ${seedIdx}: mixed`);
  }
  if (lvl.minMoves < BLEND_DEPTH_ACCEPT.min || lvl.minMoves > BLEND_DEPTH_ACCEPT.max) {
    throw new Error(`seed ${seedIdx}: band ${lvl.minMoves}`);
  }
  // Re-solve explicitly to verify determinism + replay invariants per move.
  const r = solvePuzzle(lvl.cups, { cupConstraints: lvl.cupConstraints, blendRecipe: R });
  if (!r.solvable || r.truncated || r.minMoves === undefined || !r.solution) {
    throw new Error(`seed ${seedIdx}: unsolvable`);
  }
  if (r.minMoves !== lvl.minMoves) throw new Error(`seed ${seedIdx}: depth drift`);
  let board = lvl.cups.map((c) => [...c]);
  let reactions = 0;
  for (const a of r.solution as SolverAction[]) {
    if (a.kind !== 'pour') continue;
    const preA = countTeaLayers(board, 'black_tea');
    const preB = countTeaLayers(board, 'milk');
    const preP = countTeaLayers(board, 'milk_tea');
    const preT = countTotalLayers(board);
    const res = applyPourState(
      { cups: board, floatingIngredients: emptyFloatingIngredients(6) },
      (a as { from: number }).from, (a as { to: number }).to, lvl.cupConstraints, R,
    );
    if (!res) throw new Error(`seed ${seedIdx}: replay fail`);
    board = res.state.cups as TeaId[][];
    const postA = countTeaLayers(board, 'black_tea');
    const postB = countTeaLayers(board, 'milk');
    const postP = countTeaLayers(board, 'milk_tea');
    const postT = countTotalLayers(board);
    if (res.reaction) {
      reactions++;
      if (postA !== preA - 1 || postB !== preB - 1 || postP !== preP + 1 || postT !== preT - 1) {
        throw new Error(`seed ${seedIdx}: delta`);
      }
    } else if (postA !== preA || postB !== preB || postP !== preP || postT !== preT) {
      throw new Error(`seed ${seedIdx}: ordinary delta`);
    }
    if (postA + postP !== 4 || postB + postP !== 4 || postT !== 16 - postP) {
      throw new Error(`seed ${seedIdx}: invariant`);
    }
  }
  if (reactions !== 4) throw new Error(`seed ${seedIdx}: reactions ${reactions}`);
  const part = analyzeBlendParticipation(lvl.cups, r.solution as SolverAction[], lvl.cupConstraints, R);
  if (!part.recipeSatisfied || !part.win) throw new Error(`seed ${seedIdx}: final`);
  if (part.ordinaryPoursBetweenFirstLastReaction < 1) throw new Error(`seed ${seedIdx}: interleave`);
  if (!isPuzzleWonState({ cups: board, floatingIngredients: emptyFloatingIngredients(6) }, lvl.cupConstraints, R)) {
    throw new Error(`seed ${seedIdx}: win`);
  }
  return {
    seed, minMoves: lvl.minMoves, visited: lvl.visitedStates, reactions,
    between: part.ordinaryPoursBetweenFirstLastReaction, pTrans: part.productTransfers,
    dests: part.reactionDestinationCount,
    firstDiv: (part.firstReactionDepth as number) / Math.max(1, lvl.minMoves),
    depth: lvl.minMoves, templateAttempts: stats.templateAttempts, solverCalls: stats.solverCalls,
  };
}
