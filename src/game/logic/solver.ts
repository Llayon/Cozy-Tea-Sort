/**
 * Deterministic 0-1 BFS solver for the actual game rules (catch-one spike).
 *
 * Pure: operates on puzzle state, never touches Pixi/React. Uses the shared
 * `rules.ts` action table so solver, UI, generator and deadlock detection
 * can never diverge. Costs: place-strainer 0, pour 1, release-strainer 1;
 * minMoves = minimum tea-transfer actions (pours + releases).
 *
 * Legacy behavior: callers without strainer get byte-identical keys and
 * identical minMoves (only cost-1 pour edges exist, so 0-1 BFS reduces to
 * plain BFS).
 */

import {
  CapacityObstacleSlot,
  CupConstraint,
  FloatingIngredientSlot,
  IceSlot,
  PuzzleState,
  ReadonlyPuzzleState,
  SinkingIngredientSlot,
  SolverAction,
  TeaId,
  isPlaceStrainerAction,
  isReleaseStrainerAction,
  normalizeCapacityObstacles,
  normalizeCupConstraints,
  normalizeFloatingIngredients,
  normalizeIceSlots,
  normalizeSinkingIngredients,
  normalizeStrainerState,
} from '../types';
import {
  applyPour,
  applyPourState,
  applyPuzzleActionState,
  canonicalPuzzleKey,
  isHomogeneous,
  isPuzzleWonState,
  listConstructiveActionsState,
  puzzleActionCost,
} from './rules';

export interface SolverMove {
  from: number;
  to: number;
  layer: TeaId;
  count: number;
}

export interface SolverResult {
  solvable: boolean;
  /** Minimum tea-transfer actions (pours + releases). Present when solvable. */
  minMoves?: number;
  visitedStates: number;
  solution?: SolverAction[];
  truncated?: boolean;
  totalActions?: number;
  placementCount?: number;
  releaseCount?: number;
  strainedPourCount?: number;
}

export interface SolverOptions {
  maxVisited?: number;
  /** Hard tea-move cap (pours + releases). Default 60. */
  maxDepth?: number;
  returnSolution?: boolean;
  cupConstraints?: readonly CupConstraint[];
  floatingIngredients?: readonly FloatingIngredientSlot[];
  sinkingIngredients?: readonly SinkingIngredientSlot[];
  strainer?: { present: boolean; attachedCupIndex: number | null; heldTea: TeaId | null };
  iceSlots?: readonly IceSlot[];
  capacityObstacles?: readonly CapacityObstacleSlot[];
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

  const start: PuzzleState = {
    cups: cups.map((c) => [...c]),
    floatingIngredients: normalizeFloatingIngredients(opts.floatingIngredients, cups.length),
    sinkingIngredients: normalizeSinkingIngredients(opts.sinkingIngredients, cups.length),
    strainer: normalizeStrainerState(opts.strainer),
    iceSlots: normalizeIceSlots(opts.iceSlots, cups.length),
    capacityObstacles: normalizeCapacityObstacles(opts.capacityObstacles, cups.length),
  };

  if (isPuzzleWonState(start, constraints)) {
    return { solvable: true, minMoves: 0, visitedStates: 1, solution: [], totalActions: 0, placementCount: 0, releaseCount: 0, strainedPourCount: 0 };
  }

  /**
   * O(1) amortized deque (two-stack): no Array.shift/unshift on the solver
   * hot path. pushFront/popFront/length only; stale higher-cost entries are
   * skipped via the dist-map cost check below (§6).
   */
  interface DequeNode {
    state: PuzzleState;
    cost: number;
    path: SolverAction[];
  }
  const front: DequeNode[] = [];
  const back: DequeNode[] = [];
  let dequeLen = 0;
  const pushFront = (n: DequeNode): void => {
    front.push(n);
    dequeLen++;
  };
  const pushBack = (n: DequeNode): void => {
    back.push(n);
    dequeLen++;
  };
  const popFront = (): DequeNode | undefined => {
    if (front.length > 0) {
      dequeLen--;
      return front.pop();
    }
    if (back.length === 0) return undefined;
    while (back.length > 0) front.push(back.pop() as DequeNode);
    dequeLen--;
    return front.pop();
  };
  pushBack({ state: start, cost: 0, path: [] });

  const startKey = canonicalPuzzleKey(start, constraints);
  const dist = new Map<string, number>();
  dist.set(startKey, 0);

  while (dequeLen > 0) {
    if (dist.size >= maxVisited) {
      return { solvable: false, visitedStates: dist.size, truncated: true };
    }
    const node = popFront() as DequeNode;
    const nodeKey = canonicalPuzzleKey(node.state, constraints);
    const best = dist.get(nodeKey);
    if (best === undefined || node.cost !== best) continue;
    if (node.cost >= maxDepth) continue;

    const actions = listConstructiveActionsState(node.state, constraints);
    for (const a of actions) {
      const stepCost = puzzleActionCost(a);
      const nextCost = node.cost + stepCost;
      if (stepCost > 0 && nextCost > maxDepth) continue;
      const res = applyPuzzleActionState(node.state, a, constraints);
      if (!res) continue;
      const key = canonicalPuzzleKey(res.state, constraints);
      const known = dist.get(key);
      if (known !== undefined && nextCost >= known) continue;
      dist.set(key, nextCost);

      let step: SolverAction;
      if (isPlaceStrainerAction(a)) {
        step = { kind: 'place-strainer', to: a.to };
      } else if (isReleaseStrainerAction(a)) {
        step = { kind: 'release-strainer', to: a.to, layer: res.layer as TeaId };
      } else {
        step = {
          kind: 'pour',
          from: a.from,
          to: a.to,
          layer: res.layer as TeaId,
          count: res.transferred as number,
          strained: res.strained === true,
          ...(res.strained ? { caughtTea: res.caughtTea as TeaId } : {}),
        };
      }

      if (isPuzzleWonState(res.state, constraints)) {
        const solution = returnSolution ? [...node.path, step] : undefined;
        const placementCount = solution ? solution.filter((s) => s.kind === 'place-strainer').length : 0;
        const releaseCount = solution ? solution.filter((s) => s.kind === 'release-strainer').length : 0;
        const strainedPourCount = solution
          ? solution.filter((s) => s.kind === 'pour' && (s as { strained?: boolean }).strained).length
          : 0;
        return {
          solvable: true,
          minMoves: nextCost,
          visitedStates: dist.size,
          solution,
          totalActions: solution?.length,
          placementCount,
          releaseCount,
          strainedPourCount,
        };
      }

      const entry = { state: res.state, cost: nextCost, path: returnSolution ? [...node.path, step] : [] };
      if (stepCost === 0) pushFront(entry);
      else pushBack(entry);
    }
  }

  return { solvable: false, visitedStates: dist.size };
}

export function applySolution(
  cups: TeaId[][],
  solution: ReadonlyArray<SolverAction | SolverMove>,
  cupConstraints?: readonly CupConstraint[],
): TeaId[][] | null {
  let board = cups.map((c) => [...c]);
  for (const step of solution) {
    const kind = (step as SolverAction).kind;
    if (kind === 'place-strainer' || kind === 'release-strainer') return null;
    const pour = step as SolverMove & { kind?: string };
    const top = board[pour.from]?.[board[pour.from].length - 1];
    if (top !== pour.layer) void top;
    const res = applyPour(board, pour.from, pour.to, cupConstraints);
    if (!res) return null;
    void isHomogeneous;
    board = res.cups;
  }
  return board;
}

export function applySolutionState(
  state: ReadonlyPuzzleState,
  solution: ReadonlyArray<SolverAction | SolverMove>,
  cupConstraints?: readonly CupConstraint[],
): PuzzleState | null {
  let board: PuzzleState = {
    cups: state.cups.map((c) => [...c]),
    floatingIngredients: normalizeFloatingIngredients(state.floatingIngredients, state.cups.length),
    sinkingIngredients: normalizeSinkingIngredients(state.sinkingIngredients, state.cups.length),
    strainer: normalizeStrainerState(state.strainer),
    iceSlots: normalizeIceSlots(state.iceSlots, state.cups.length),
    capacityObstacles: normalizeCapacityObstacles(state.capacityObstacles, state.cups.length),
  };
  for (const step of solution) {
    const kind = (step as SolverAction).kind;
    if (kind === 'place-strainer' || kind === 'release-strainer' || kind === 'pour') {
      const res = applyPuzzleActionState(board, step as SolverAction, cupConstraints);
      if (!res) return null;
      void isHomogeneous;
      board = res.state;
      continue;
    }
    const legacy = step as SolverMove;
    if (typeof legacy.from === 'number' && typeof legacy.to === 'number') {
      const res = applyPourState(board, legacy.from, legacy.to, cupConstraints);
      if (!res) return null;
      void isHomogeneous;
      board = res.state;
      continue;
    }
    return null;
  }
  return board;
}
