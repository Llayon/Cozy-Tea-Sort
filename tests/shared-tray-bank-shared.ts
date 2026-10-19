/**
 * Gauntlet 16 — shared bank/control helpers for template + stress tests.
 * Plain-control solves (tray markers stripped) with pair-occupancy tracking;
 * L3A (cross-member reuse) / L3B (bound transfer) / strong classification
 * from the SHARED optimal replay. Analysis only.
 */
import type { CupConstraint, TeaId } from '../src/game/types';
import { cloneCupConstraint, emptyFloatingIngredients } from '../src/game/types';
import type { SolverAction } from '../src/game/types';
import { applyPourState, pourCountState } from '../src/game/logic/rules';
import { solvePuzzle } from '../src/game/logic/solver';

export function stripTray(cons: readonly CupConstraint[]): CupConstraint[] {
  return cons.map((c) => {
    const n = cloneCupConstraint(c);
    delete (n as { sharedCapacityGroup?: unknown }).sharedCapacityGroup;
    return n;
  });
}

export interface SharedControlReport {
  plainMin: number | null;
  sharedMin: number;
  delta: number | null;
  overload: boolean;
  plainMaxPair: number | null;
  crossMemberReuse: boolean;
  boundTransfer: boolean;
  l3a: boolean;
  l3b: boolean;
  strong: boolean;
}

const MAX_VISITED = 120_000;
const MAX_DEPTH = 60;

export function sharedControlReport(
  cups: TeaId[][],
  sharedSolution: readonly SolverAction[],
  cons: readonly CupConstraint[],
  sharedMin: number,
): SharedControlReport {
  const out: SharedControlReport = {
    plainMin: null, sharedMin, delta: null,
    overload: false, plainMaxPair: null,
    crossMemberReuse: false, boundTransfer: false,
    l3a: false, l3b: false, strong: false,
  };
  const tray = cons
    .map((c, i) => (c?.sharedCapacityGroup === 'tea-tray' ? i : -1))
    .filter((i) => i >= 0);
  const traySet = new Set(tray);
  // Shared-replay evidence: cross-member reuse + bound transfers.
  {
    let board = cups.map((c) => [...c]);
    const st = () => ({ cups: board, floatingIngredients: emptyFloatingIngredients(board.length) });
    const ctrl = stripTray(cons);
    const released = new Set<number>();
    for (const a of sharedSolution) {
      if ((a as SolverAction).kind !== 'pour') continue;
      const from = (a as { from: number }).from;
      const to = (a as { to: number }).to;
      const before = board.map((c) => [...c]);
      const res = applyPourState(st(), from, to, cons);
      if (!res) return out;
      board = res.state.cups as TeaId[][];
      const occBefore = tray.reduce((s, m) => s + (before[m] as TeaId[]).length, 0);
      const occAfter = tray.reduce((s, m) => s + (board[m] as TeaId[]).length, 0);
      if (traySet.has(from) && !traySet.has(to) && occAfter < occBefore) released.add(from);
      if (!traySet.has(from) && traySet.has(to) && occAfter > occBefore) {
        for (const m of released) {
          if (m !== to) {
            out.crossMemberReuse = true;
            break;
          }
        }
        // Bound: transferred strictly below the no-shared ordinary count.
        const pre = { cups: before, floatingIngredients: emptyFloatingIngredients(before.length) };
        const mOrd = pourCountState(pre, from, to, ctrl);
        if (res.transferred > 0 && res.transferred < mOrd) out.boundTransfer = true;
      }
    }
  }
  // Plain control: same tea, tray markers stripped.
  {
    const ctrl = stripTray(cons);
    const rc = solvePuzzle(cups, { cupConstraints: ctrl, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
    if (rc.truncated || !rc.solvable || rc.minMoves === undefined || !rc.solution) return out;
    out.plainMin = rc.minMoves;
    out.delta = sharedMin - (rc.minMoves as number);
    let board = cups.map((c) => [...c]);
    let mx = (board[tray[0] as number] as TeaId[]).length + (board[tray[1] as number] as TeaId[]).length;
    const st = () => ({ cups: board, floatingIngredients: emptyFloatingIngredients(board.length) });
    for (const a of rc.solution) {
      if ((a as SolverAction).kind !== 'pour') continue;
      const res = applyPourState(st(), (a as { from: number }).from, (a as { to: number }).to, ctrl);
      if (!res) break;
      board = res.state.cups as TeaId[][];
      mx = Math.max(mx, (board[tray[0] as number] as TeaId[]).length + (board[tray[1] as number] as TeaId[]).length);
    }
    out.plainMaxPair = mx;
    out.overload = mx > 6;
  }
  out.l3a = out.crossMemberReuse;
  out.l3b = out.boundTransfer;
  out.strong = out.crossMemberReuse && out.boundTransfer;
  return out;
}
