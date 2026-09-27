/**
 * Deterministic BFS solver for the actual game rules.
 *
 * Pure: operates on puzzle state, never touches Pixi/React.
 * Uses the shared `rules.ts` move table so solver, UI, generator
 * and deadlock detection can never diverge.
 *
 * Constraint-aware (Gauntlet 1): vessel constraints travel with the
 * puzzle and are threaded through EVERY rule call. Canonicalization
 * groups cups by identical constraint signature — normal and
 * source-only vessels are never interchangeable. The constructive-move
 * pruning (`homogeneous -> empty`) is likewise applied only within
 * identical-constraint groups (see `rules.isConstructiveMoveState`).
 *
 * Floating ingredients (Gauntlet 5): the BFS queue carries full
 * `PuzzleState` (tea + ingredient slots) and keys on
 * `canonicalPuzzleKey`. Callers without ingredients get byte-identical
 * legacy behavior (same keys, same verdicts). Ingredient movement is
 * deterministic from state + move, so `SolverMove` is unchanged.
 */

import {
  CupConstraint,
  FloatingIngredientSlot,
  PuzzleState,
  ReadonlyPuzzleState,
  TeaId,
  normalizeCupConstraints,
  normalizeFloatingIngredients,
} from '../types';
import {
  applyPour,
  applyPourState,
  canonicalPuzzleKey,
  isHomogeneous,
  isPuzzleWonState,
  listLegalMovesState,
} from './rules';

export interface SolverMove {
  from: number;
  to: number;
  layer: TeaId;
  count: number;
}

export interface SolverResult {
  solvable: boolean;
  /** Minimum number of pours (BFS depth). Present only when solvable. */
  minMoves?: number;
  visitedStates: number;
  /** One optimal path when solvable (may be omitted for very long paths). */
  solution?: SolverMove[];
  /** True when the search hit the visit budget without a verdict. */
  truncated?: boolean;
}

export interface SolverOptions {
  /** Safety budget for mobile/dev use. Default 200_000. */
  maxVisited?: number;
  /** Hard depth cap. Default 60. */
  maxDepth?: number;
  /** When false, omit the solution path to save memory. Default true. */
  returnSolution?: boolean;
  /** Per-vessel behavioral constraints, aligned with cup indices. */
  cupConstraints?: readonly CupConstraint[];
  /**
   * Floating-ingredient slots, aligned with cup indices (Gauntlet 5).
   * Omitted (or all null) = legacy tea-only behavior, unchanged.
   */
  floatingIngredients?: readonly FloatingIngredientSlot[];
}

const DEFAULT_MAX_VISITED = 200_000;
const DEFAULT_MAX_DEPTH = 60;

export function solvePuzzle(cups: TeaId[][], opts: SolverOptions = {}): SolverResult {
  const maxVisited = opts.maxVisited ?? DEFAULT_MAX_VISITED;
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  const returnSolution = opts.returnSolution ?? true;
  const constraints: readonly CupConstraint[] | undefined = opts.cupConstraints
    ? normalizeCupConstraints(opts.cupConstraints, cups.length)
    : undefined;

  // Never mutate caller input.
  const start: PuzzleState = {
    cups: cups.map((c) => [...c]),
    floatingIngredients: normalizeFloatingIngredients(opts.floatingIngredients, cups.length),
  };

  if (isPuzzleWonState(start, constraints)) {
    return { solvable: true, minMoves: 0, visitedStates: 1, solution: [] };
  }

  const visited = new Set<string>();
  visited.add(canonicalPuzzleKey(start, constraints));

  // BFS queue with head pointer (no shift()).
  const queue: Array<{ state: PuzzleState; depth: number; path: SolverMove[] }> = [
    { state: start, depth: 0, path: [] },
  ];
  let head = 0;

  while (head < queue.length) {
    if (visited.size >= maxVisited) {
      return { solvable: false, visitedStates: visited.size, truncated: true };
    }
    const node = queue[head++] as { state: PuzzleState; depth: number; path: SolverMove[] };
    if (node.depth >= maxDepth) continue;

    // Constructive moves only — same set deadlock detection uses.
    // (Homogeneous stack -> empty only permutes identical cups WITHIN the
    // same constraint group; cross-group moves stay constructive. The
    // ingredient marker travels with its contents, so the same argument
    // covers ingredient-carrying relocations.)
    const moves = listLegalMovesState(node.state, true, constraints);

    for (const m of moves) {
      const res = applyPourState(node.state, m.from, m.to, constraints);
      if (!res) continue;
      const key = canonicalPuzzleKey(res.state, constraints);
      if (visited.has(key)) continue;
      visited.add(key);

      const step: SolverMove = { from: m.from, to: m.to, layer: res.layer, count: res.transferred };
      const nextDepth = node.depth + 1;

      if (isPuzzleWonState(res.state, constraints)) {
        const solution = returnSolution ? [...node.path, step] : undefined;
        return {
          solvable: true,
          minMoves: nextDepth,
          visitedStates: visited.size,
          solution,
        };
      }

      queue.push({
        state: res.state,
        depth: nextDepth,
        path: returnSolution ? [...node.path, step] : [],
      });
    }
  }

  return { solvable: visited.size >= maxVisited ? false : false, visitedStates: visited.size };
}

/**
 * Replay a solver path against a board (test/debug helper).
 * Returns the final board, or null if any step is illegal.
 * Constraint-aware: pass the same `cupConstraints` the solver used.
 * Tea-only: on ingredient levels use `applySolutionState` instead.
 */
export function applySolution(
  cups: TeaId[][],
  solution: SolverMove[],
  cupConstraints?: readonly CupConstraint[],
): TeaId[][] | null {
  let board = cups.map((c) => [...c]);
  for (const step of solution) {
    // Cheap sanity: source top must match recorded layer.
    const top = board[step.from]?.[board[step.from].length - 1];
    if (top !== step.layer) {
      // Still try the pour — legality is decided by rules.
      void top;
    }
    const res = applyPour(board, step.from, step.to, cupConstraints);
    if (!res) return null;
    void isHomogeneous;
    board = res.cups;
  }
  return board;
}

/**
 * State-aware replay (Gauntlet 5): replays a solver path against a full
 * puzzle state, tracking ingredient rides. Returns the final state, or
 * null if any step is illegal. Lemon tests MUST use this.
 */
export function applySolutionState(
  state: ReadonlyPuzzleState,
  solution: SolverMove[],
  cupConstraints?: readonly CupConstraint[],
): PuzzleState | null {
  let board: PuzzleState = {
    cups: state.cups.map((c) => [...c]),
    floatingIngredients: normalizeFloatingIngredients(state.floatingIngredients, state.cups.length),
  };
  for (const step of solution) {
    const res = applyPourState(board, step.from, step.to, cupConstraints);
    if (!res) return null;
    void isHomogeneous;
    board = res.state;
  }
  return board;
}
