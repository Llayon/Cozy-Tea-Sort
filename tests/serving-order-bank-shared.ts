/**
 * Gauntlet 14 — shared bank/control helpers for template + stress tests.
 * Plain-control solves (orders stripped) with completion-order tracking;
 * L3A (reverses) / L3B (move-cost) / strong classification. Analysis only.
 */
import type { CupConstraint, TeaId } from '../src/game/types';
import { cloneCupConstraint, emptyFloatingIngredients } from '../src/game/types';
import type { SolverAction } from '../src/game/types';
import { applyPourState } from '../src/game/logic/rules';
import { solvePuzzle } from '../src/game/logic/solver';

export function stripServeOrders(cons: readonly CupConstraint[]): CupConstraint[] {
  return cons.map((c) => {
    const n = cloneCupConstraint(c);
    delete (n as { serveOrder?: number }).serveOrder;
    return n;
  });
}

export interface ControlReport {
  plainMin: number | null;
  orderedMin: number;
  delta: number | null;
  reverses: boolean;
  l3a: boolean;
  l3b: boolean;
  strong: boolean;
}

const MAX_VISITED = 120_000;
const MAX_DEPTH = 60;

export function controlReport(
  cups: TeaId[][],
  orderedSolution: readonly SolverAction[],
  cons: readonly CupConstraint[],
  h1: number,
  h2: number,
  orderedMin: number,
): ControlReport {
  const out: ControlReport = {
    plainMin: null, orderedMin, delta: null,
    reverses: false, l3a: false, l3b: false, strong: false,
  };
  const ctrl = stripServeOrders(cons);
  const rc = solvePuzzle(cups, { cupConstraints: ctrl, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
  if (rc.truncated || !rc.solvable || rc.minMoves === undefined || !rc.solution) return out;
  out.plainMin = rc.minMoves;
  out.delta = orderedMin - (rc.minMoves as number);
  let board = cups.map((c) => [...c]);
  let f1: number | null = null;
  let f2: number | null = null;
  const full = (cup: TeaId[]) => cup.length === 4 && cup.every((t) => t === cup[0]);
  rc.solution.forEach((a, i) => {
    if ((a as SolverAction).kind !== 'pour') return;
    const res = applyPourState(
      { cups: board, floatingIngredients: emptyFloatingIngredients(board.length) },
      (a as { from: number }).from, (a as { to: number }).to, ctrl,
    );
    if (!res) return;
    board = res.state.cups as TeaId[][];
    if (f1 === null && full(board[h1] as TeaId[])) f1 = i;
    if (f2 === null && full(board[h2] as TeaId[])) f2 = i;
  });
  out.reverses = f2 !== null && (f1 === null || (f2 as number) < (f1 as number));
  out.l3a = out.reverses;
  out.l3b = (out.delta as number) > 0;
  out.strong = (out.delta as number) >= 2;
  void orderedSolution;
  return out;
}
