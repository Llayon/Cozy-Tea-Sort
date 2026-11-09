/**
 * G25 shared pilot harness (DEV ONLY).
 * Deterministic 4-color 6-vessel deals + solver timing + percentile helpers.
 */
import type { CupConstraint, TeaId } from '../../../src/game/types.ts';
import { createRng, shuffleInPlace } from '../../../src/game/logic/rng.ts';
import { canonicalPuzzleKey } from '../../../src/game/logic/rules.ts';
import { solvePuzzle, type SolverAction } from '../../../src/game/logic/solver.ts';
import { G25_PALETTE, TEA_UNITS_PER_COLOR } from '../../../src/game/logic/g25Research.ts';

export function dealPilotBoard(seed: string): TeaId[][] {
  const rng = createRng(seed);
  const pool: TeaId[] = [];
  for (const color of G25_PALETTE) {
    for (let k = 0; k < TEA_UNITS_PER_COLOR; k++) pool.push(color);
  }
  shuffleInPlace(rng, pool);
  const cups: TeaId[][] = [];
  for (let c = 0; c < 4; c++) cups.push(pool.slice(c * TEA_UNITS_PER_COLOR, (c + 1) * TEA_UNITS_PER_COLOR));
  cups.push([]);
  cups.push([]);
  shuffleInPlace(rng, cups);
  return cups;
}

/** Solve with wall-clock timing (ms). Uses authoritative solver defaults unless overridden. */
export function solveTimed(
  cups: TeaId[][],
  constraints: readonly CupConstraint[],
  opts?: { maxVisited?: number; maxDepth?: number },
): { solvable: boolean; truncated: boolean; minMoves?: number; visited: number; ms: number; solution?: SolverAction[] } {
  const t0 = Date.now();
  const r = solvePuzzle(cups, {
    cupConstraints: [...constraints],
    maxVisited: opts?.maxVisited,
    maxDepth: opts?.maxDepth,
    returnSolution: true,
  });
  const ms = Date.now() - t0;
  return {
    solvable: r.solvable,
    truncated: r.truncated === true,
    minMoves: r.minMoves,
    visited: r.visitedStates,
    ms,
    solution: r.solution as SolverAction[] | undefined,
  };
}

export function pct(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
}

export function canonicalOf(cups: TeaId[][], constraints: readonly CupConstraint[]): string {
  return canonicalPuzzleKey({ cups }, constraints);
}

export type FirstAction = string | null;
export function firstActionOf(sol?: readonly SolverAction[]): FirstAction {
  if (!sol || sol.length === 0) return null;
  const a = sol[0] as SolverAction & { kind: string; from?: number; to?: number; count?: number };
  if (a.kind === 'pour') return `pour:${String(a.from)}->${String(a.to)}x${String(a.count)}`;
  return a.kind;
}
