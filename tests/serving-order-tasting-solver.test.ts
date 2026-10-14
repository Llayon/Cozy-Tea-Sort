/**
 * G15 Order+Tasting solver (§§9, 33): ONE existing solver, no combo edge.
 * Hand fixture (serve-taste-11-36016, identity palette): exact depth 11,
 * both mechanics participating, pressure→SERVE_1→SERVE_2→win, plus
 * FULL/ORDER/TASTE/PLAIN controls and an explicit C3 buffer-choice witness
 * (FULL opens 1→5 tasting bowl; all single-mechanic controls open 1→4).
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, SolverAction, TeaId } from '../src/game/types';
import { emptyFloatingIngredients } from '../src/game/types';
import { applyPourState, canPourState, isPuzzleWonState } from '../src/game/logic/rules';
import { solvePuzzle } from '../src/game/logic/solver';
import { servedPrefixLength } from '../src/game/logic/servingOrder';
import {
  SERVING_ORDER_COMPOSITION_BANK,
  instantiateServingOrderCompositionTemplate,
} from '../src/game/logic/servingOrderCompositionTemplates';

const PAL: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const TPL = SERVING_ORDER_COMPOSITION_BANK['serving-order-tasting'][0] as (typeof SERVING_ORDER_COMPOSITION_BANK)['serving-order-tasting'][number];

function fullCons() {
  const inst = instantiateServingOrderCompositionTemplate(TPL, PAL);
  const c = Array.from({ length: 6 }, () => ({ mode: 'normal' as const })) as CupConstraint[];
  c[inst.serve1Index] = { mode: 'normal', serveOrder: 1 };
  c[inst.serve2Index] = { mode: 'normal', serveOrder: 2 };
  c[inst.tastingIndex] = { mode: 'normal', capacity: 2, mustEndEmpty: true };
  return { inst, cons: c };
}
function replay(cups: TeaId[][], sol: readonly SolverAction[], cons: readonly CupConstraint[]) {
  let board = cups.map((c) => [...c]);
  let s1: number | null = null;
  let s2: number | null = null;
  for (let i = 0; i < sol.length; i++) {
    const a = sol[i] as SolverAction;
    if (a.kind !== 'pour') continue;
    const res = applyPourState({ cups: board, floatingIngredients: emptyFloatingIngredients(board.length) }, a.from, a.to, cons);
    if (!res) throw new Error(`replay failed at ${i}`);
    board = res.state.cups as TeaId[][];
    if (res.serveCompleted === 1 && s1 === null) s1 = i;
    if (res.serveCompleted === 2 && s2 === null) s2 = i;
  }
  return { board, s1, s2 };
}

describe('hand fixture: Order+Tasting C2 (§33)', () => {
  it('exact depth 11, tasting used, SERVE_1(8) before SERVE_2(10), win, prefix 2', () => {
    const { inst, cons } = fullCons();
    const r = solvePuzzle(inst.cups, { cupConstraints: cons, maxVisited: 120_000, maxDepth: 60, returnSolution: true });
    expect(r.truncated).not.toBe(true);
    expect(r.solvable).toBe(true);
    expect(r.minMoves).toBe(11);
    expect(r.solution).toBeDefined();
    const sol = r.solution as SolverAction[];
    expect(sol.length).toBe(11);
    expect(sol.some((a) => a.kind === 'pour' && (a.from === 5 || a.to === 5))).toBe(true);
    const { board, s1, s2 } = replay(inst.cups, sol, cons);
    expect(s1).toBe(8);
    expect(s2).toBe(10);
    expect(s1 as number).toBeLessThan(s2 as number);
    expect(servedPrefixLength({ cups: board, floatingIngredients: emptyFloatingIngredients(6) }, cons)).toBe(2);
    expect(isPuzzleWonState({ cups: board, floatingIngredients: emptyFloatingIngredients(6) }, cons)).toBe(true);
  });
  it('no solver fork: every step is an ordinary cost-1 POUR', () => {
    const { inst, cons } = fullCons();
    const r = solvePuzzle(inst.cups, { cupConstraints: cons, maxVisited: 120_000, maxDepth: 60, returnSolution: true });
    for (const a of r.solution as SolverAction[]) {
      expect(a.kind).toBe('pour');
    }
    expect(r.placementCount ?? 0).toBe(0);
    expect(r.releaseCount ?? 0).toBe(0);
    expect(r.strainedPourCount ?? 0).toBe(0);
  });
});

describe('controls: FULL/ORDER/TASTE/PLAIN + C3 witness (§§11-12)', () => {
  it('same board controls: FULL 11, ORDER 11, TASTE 11, PLAIN 11; FULL diverges by buffer choice', () => {
    const { inst } = fullCons();
    const mk = (kind: 'full' | 'order' | 'taste' | 'plain') => {
      const c = Array.from({ length: 6 }, () => ({ mode: 'normal' as const })) as CupConstraint[];
      if (kind === 'full' || kind === 'order') {
        c[inst.serve1Index] = { mode: 'normal', serveOrder: 1 };
        c[inst.serve2Index] = { mode: 'normal', serveOrder: 2 };
      }
      if (kind === 'full' || kind === 'taste') c[inst.tastingIndex] = { mode: 'normal', capacity: 2, mustEndEmpty: true };
      return c;
    };
    const firstOf = (sol: readonly SolverAction[] | undefined) => {
      const f = (sol as SolverAction[])[0];
      return `${f.kind}:${(f as { from?: number }).from}→${(f as { to?: number }).to}`;
    };
    const rf = solvePuzzle(inst.cups, { cupConstraints: mk('full'), maxVisited: 120_000, maxDepth: 60, returnSolution: true });
    const ro = solvePuzzle(inst.cups, { cupConstraints: mk('order'), maxVisited: 120_000, maxDepth: 60, returnSolution: true });
    const rb = solvePuzzle(inst.cups, { cupConstraints: mk('taste'), maxVisited: 120_000, maxDepth: 60, returnSolution: true });
    const rp = solvePuzzle(inst.cups, { cupConstraints: mk('plain'), maxVisited: 120_000, maxDepth: 60, returnSolution: true });
    expect(rf.minMoves).toBe(11);
    expect(ro.minMoves).toBe(11);
    expect(rb.minMoves).toBe(11);
    expect(rp.minMoves).toBe(11);
    // C3 witness: same depth, different optimal buffer — FULL opens into the
    // tasting bowl (1→5); every single-mechanic control opens 1→4.
    expect(firstOf(rf.solution)).toBe('pour:1→5');
    expect(firstOf(ro.solution)).toBe('pour:1→4');
    expect(firstOf(rb.solution)).toBe('pour:1→4');
    expect(firstOf(rp.solution)).toBe('pour:1→4');
  });
  it('served cups expose no source actions in solver expansion', () => {
    const { inst, cons } = fullCons();
    const r = solvePuzzle(inst.cups, { cupConstraints: cons, maxVisited: 120_000, maxDepth: 60, returnSolution: true });
    const { board } = replay(inst.cups, r.solution as SolverAction[], cons);
    // Final board: both ordered cups served → neither may source.
    expect(canPourState({ cups: board, floatingIngredients: emptyFloatingIngredients(6) }, inst.serve1Index, 4, cons)).toBe(false);
    expect(canPourState({ cups: board, floatingIngredients: emptyFloatingIngredients(6) }, inst.serve2Index, 4, cons)).toBe(false);
  });
});
