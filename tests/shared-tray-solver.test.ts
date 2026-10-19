/**
 * Gauntlet 16 — solver fixtures (§§139-144).
 *
 * Hand fixture (tray-10-0, identity palette): exact minMoves 10, optimal
 * replay under shared pressure pours OUT of tray member 0, later pours
 * outside tea INTO tray member 1 (cross-member reuse), then wins. Partial-
 * bound, full-block and internal-transfer fixtures live in the kernel suite;
 * this file pins the solver-level story. Legacy minmove regression + G15
 * freeze: tray-absent boards keep exact historical depths.
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, SolverAction, TeaId } from '../src/game/types';
import { emptyFloatingIngredients } from '../src/game/types';
import { applyPourState, isPuzzleWonState } from '../src/game/logic/rules';
import { solvePuzzle } from '../src/game/logic/solver';
import {
  SHARED_TRAY_TEMPLATE_BANK,
  instantiateSharedTrayTemplate,
} from '../src/game/logic/sharedTrayTemplates';
import {
  SERVING_ORDER_COMPOSITION_BANK,
  instantiateServingOrderCompositionTemplate,
} from '../src/game/logic/servingOrderCompositionTemplates';
import { sharedCapacityOccupancy } from '../src/game/logic/sharedCapacity';

const PAL: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const TPL = SHARED_TRAY_TEMPLATE_BANK['shared-tray'][0]!;

function traySetup(order: TeaId[] = PAL) {
  const inst = instantiateSharedTrayTemplate(TPL, order);
  const cons: CupConstraint[] = Array.from({ length: 6 }, () => ({ mode: 'normal' as const }));
  for (const m of inst.trayMembers) cons[m] = { mode: 'normal', sharedCapacityGroup: 'tea-tray' };
  return { inst, cons };
}

function replay(cups: TeaId[][], sol: readonly SolverAction[], cons: readonly CupConstraint[]) {
  let board = cups.map((c) => [...c]);
  const occ = () => (board[0] as TeaId[]).length + (board[1] as TeaId[]).length;
  const events: Array<{ i: number; from: number; to: number; before: number; after: number }> = [];
  for (let i = 0; i < sol.length; i++) {
    const a = sol[i] as SolverAction;
    if (a.kind !== 'pour') continue;
    const before = occ();
    const res = applyPourState(
      { cups: board, floatingIngredients: emptyFloatingIngredients(board.length) },
      a.from, a.to, cons,
    );
    if (!res) throw new Error(`replay failed at ${i}`);
    board = res.state.cups as TeaId[][];
    events.push({ i, from: a.from, to: a.to, before, after: occ() });
  }
  return { board, events };
}

describe('hand fixture: pressure → release(0) → refill(1) → win (§139)', () => {
  it('exact minMoves 10 with cross-member reuse in the optimal replay', () => {
    const { inst, cons } = traySetup();
    const r = solvePuzzle(inst.cups, { cupConstraints: cons, maxVisited: 120_000, maxDepth: 60, returnSolution: true });
    expect(r.truncated).not.toBe(true);
    expect(r.solvable).toBe(true);
    expect(r.minMoves).toBe(10);
    expect(r.solution).toBeDefined();
    const sol = r.solution as SolverAction[];
    expect(sol.length).toBe(10);
    expect(sol.every((a) => a.kind === 'pour')).toBe(true);
    const { board, events } = replay(inst.cups, sol, cons);
    // First move pours OUT of a tray member while the group is full (6/6).
    expect(events[0]?.before).toBe(6);
    expect([0, 1]).toContain(events[0]?.from);
    // Later an outside pour refills the OTHER tray member (cross-member).
    const firstRelease = events.find((e) => (e.from === 0 || e.from === 1) && e.after < e.before);
    expect(firstRelease).toBeDefined();
    const refill = events.find(
      (e) => e.i > (firstRelease?.i ?? -1) && (e.to === 0 || e.to === 1) && e.after > e.before,
    );
    expect(refill).toBeDefined();
    expect(refill?.to).not.toBe(firstRelease?.from);
    expect(isPuzzleWonState({ cups: board, floatingIngredients: emptyFloatingIngredients(6) }, cons)).toBe(true);
    expect(sharedCapacityOccupancy({ cups: board, floatingIngredients: emptyFloatingIngredients(6) }, cons, 'tea-tray')).toBeLessThanOrEqual(6);
  });

  it('no solver fork: every step is an ordinary cost-1 POUR', () => {
    const { inst, cons } = traySetup();
    const r = solvePuzzle(inst.cups, { cupConstraints: cons, maxVisited: 120_000, maxDepth: 60, returnSolution: true });
    for (const a of r.solution as SolverAction[]) {
      expect(a.kind).toBe('pour');
    }
    expect(r.placementCount ?? 0).toBe(0);
    expect(r.releaseCount ?? 0).toBe(0);
    expect(r.strainedPourCount ?? 0).toBe(0);
  });
});

describe('legacy minmove regression: tray-absent boards unchanged (§143)', () => {
  it('trivial 1-move board still solves in exactly 1', () => {
    const cups: TeaId[][] = [['matcha'], ['matcha', 'matcha', 'matcha']];
    const r = solvePuzzle(cups, { returnSolution: true });
    expect(r.solvable).toBe(true);
    expect(r.minMoves).toBe(1);
  });

  it('hand-fixture board with tray stripped solves in exactly 10 (plain control pin)', () => {
    const { inst, cons } = traySetup();
    const plain = cons.map((c) => {
      const n = { ...c };
      delete (n as { sharedCapacityGroup?: unknown }).sharedCapacityGroup;
      return n;
    });
    const r = solvePuzzle(inst.cups, { cupConstraints: plain, returnSolution: true });
    expect(r.solvable).toBe(true);
    expect(r.truncated ?? false).toBe(false);
    expect(r.minMoves).toBe(10);
  });
});

describe('G15 freeze: Order+Tasting bank untouched (§144)', () => {
  it('serve-taste fallback still pins depth 11', () => {
    const tpl = SERVING_ORDER_COMPOSITION_BANK['serving-order-tasting'][0]!;
    const inst = instantiateServingOrderCompositionTemplate(tpl, PAL);
    const cons: CupConstraint[] = Array.from({ length: 6 }, () => ({ mode: 'normal' as const }));
    cons[inst.serve1Index] = { mode: 'normal', serveOrder: 1 };
    cons[inst.serve2Index] = { mode: 'normal', serveOrder: 2 };
    cons[inst.tastingIndex] = { mode: 'normal', capacity: 2, mustEndEmpty: true };
    const r = solvePuzzle(inst.cups, { cupConstraints: cons, maxVisited: 120_000, maxDepth: 60, returnSolution: true });
    expect(r.solvable).toBe(true);
    expect(r.minMoves).toBe(11);
  });
});
