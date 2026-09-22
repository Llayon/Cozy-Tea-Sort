/**
 * Post-generation difficulty analysis.
 *
 * Difficulty is NEVER the raw `shuffleSteps` count. It is the
 * solver-derived minimum solution depth plus light sanity metrics.
 */

import { TeaId } from '../types';
import { listLegalMoves } from './rules';
import { solvePuzzle } from './solver';

export type RhythmPhase = 'warmup' | 'challenge' | 'peak' | 'relax';

export interface DifficultyReport {
  /** Solver-derived minimum pours to solve. */
  minMoves: number;
  solvable: boolean;
  visitedStates: number;
  /** Legal constructive moves from the initial position. */
  initialMoves: number;
  /** Average branching over the optimal path neighborhood (cheap proxy). */
  avgBranching: number;
}

/**
 * Starting target bands for solver depth (tunable, not sacred).
 * The generator aims at these; acceptance uses a wider tolerance
 * band so generation stays efficient.
 */
export const SOLVER_DEPTH_TARGETS: Record<RhythmPhase, { min: number; max: number }> = {
  warmup: { min: 4, max: 6 },
  challenge: { min: 7, max: 10 },
  peak: { min: 10, max: 14 },
  relax: { min: 4, max: 6 },
};

/** Robust acceptance bands actually enforced by the generator. */
export const SOLVER_DEPTH_ACCEPTANCE: Record<RhythmPhase, { min: number; max: number }> = {
  warmup: { min: 3, max: 9 },
  challenge: { min: 5, max: 13 },
  peak: { min: 8, max: 18 },
  relax: { min: 3, max: 9 },
};

export function analyzeDifficulty(cups: TeaId[][]): DifficultyReport {
  const solved = solvePuzzle(cups);
  const initialMoves = listLegalMoves(cups, true).length;
  return {
    minMoves: solved.minMoves ?? -1,
    solvable: solved.solvable,
    visitedStates: solved.visitedStates,
    initialMoves,
    avgBranching: initialMoves,
  };
}

export function depthInTarget(depth: number, phase: RhythmPhase): boolean {
  const t = SOLVER_DEPTH_TARGETS[phase];
  return depth >= t.min && depth <= t.max;
}

export function depthAccepted(depth: number, phase: RhythmPhase): boolean {
  const t = SOLVER_DEPTH_ACCEPTANCE[phase];
  return depth >= t.min && depth <= t.max;
}

/** Distance to the target band (0 when inside). Used to pick fallbacks. */
export function depthDistance(depth: number, phase: RhythmPhase): number {
  const t = SOLVER_DEPTH_TARGETS[phase];
  if (depth < t.min) return t.min - depth;
  if (depth > t.max) return depth - t.max;
  return 0;
}
