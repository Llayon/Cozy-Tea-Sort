/**
 * Shared production Tea Bloom stress helpers (bounded, deterministic).
 *
 * 200 production seeds: every level deterministic, 4c/6v/16u 4,4,4,4,0,0,
 * one full mixed bud host, two normal empties, solver solvable,
 * non-truncated, inside band, BLOOM + later occupancy>=2 + cleared + win.
 */
import type { TeaId } from '../src/game/types';
import { solvePuzzle } from '../src/game/logic/solver';
import {
  analyzeTeaBloomParticipation,
  createGenerateStats,
  generateLevel,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';

export const BUD_COLORS: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];

export function budRequest(): GenerateRequest {
  return {
    numColors: 4,
    colors: [...BUD_COLORS],
    emptyCups: 2,
    hasMysteryLayer: false,
    phase: 'challenge',
    teaBudCount: 1,
  } as GenerateRequest;
}

export interface BudStressOutcome {
  seed: string;
  minMoves: number;
  visitedStates: number;
  templateAttempts: number;
  solverCalls: number;
  usedFallback: boolean;
  budHost: number;
  bloomDepth: number | null;
  reuseDepth: number | null;
  maxOcc: number;
  delta: number;
  l3a: boolean;
  l3b: boolean;
}

export function runBudSeed(seed: string): BudStressOutcome {
  const stats = createGenerateStats();
  const lvl = generateLevel(budRequest(), seed, { stats });
  const check = validateLevelStructure(lvl, budRequest());
  if (!check.ok) throw new Error(`seed ${seed} invalid: ${check.reasons.join('; ')}`);
  const host = (lvl.teaBudSlots as string[]).findIndex((s) => s === 'tea_bud');
  const solved = solvePuzzle(lvl.cups, {
    cupConstraints: lvl.cupConstraints,
    floatingIngredients: lvl.floatingIngredients,
    teaBudSlots: lvl.teaBudSlots,
  });
  if (!solved.solvable || solved.truncated || solved.minMoves === undefined || !solved.solution) {
    throw new Error(`seed ${seed} unsolvable/truncated`);
  }
  if (solved.minMoves !== lvl.minMoves) throw new Error(`seed ${seed} depth mismatch`);
  const part = analyzeTeaBloomParticipation(lvl.cups, lvl.teaBudSlots ?? [], host, solved.solution, lvl.cupConstraints);
  if (part.blooms < 1) throw new Error(`seed ${seed} no bloom`);
  if (part.firstReuseDepth === null) throw new Error(`seed ${seed} no meaningful reuse`);
  if (!part.finalBudCleared || !part.win) throw new Error(`seed ${seed} not cleared/won`);
  const plain = solvePuzzle(lvl.cups, { cupConstraints: lvl.cupConstraints });
  const delta = plain.solvable && plain.minMoves !== undefined ? lvl.minMoves - plain.minMoves : 99;
  return {
    seed,
    minMoves: lvl.minMoves,
    visitedStates: lvl.visitedStates,
    templateAttempts: stats.templateAttempts,
    solverCalls: stats.solverCalls,
    usedFallback: stats.usedFallback,
    budHost: host,
    bloomDepth: part.firstBloomDepth,
    reuseDepth: part.firstReuseDepth,
    maxOcc: part.maxPostBloomOccupancy,
    delta,
    l3a: part.firstPostBloomSourceDepth !== null,
    l3b: part.finalRepurpose,
  };
}
