/**
 * G15 Order+Tasting bank (§§18-20, §34): 12 curated C2 templates, exact depths,
 * separate vessels, no blend leak, permutation robustness spot-checks.
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import { emptyFloatingIngredients } from '../src/game/types';
import { applyPourState, canonicalPuzzleKey, isPuzzleWonState } from '../src/game/logic/rules';
import { solvePuzzle } from '../src/game/logic/solver';
import type { SolverAction } from '../src/game/types';
import { servedPrefixLength } from '../src/game/logic/servingOrder';
import {
  ALL_SERVING_ORDER_COMPOSITION_TEMPLATES,
  SERVING_ORDER_COMPOSITION_BANK,
  SERVING_ORDER_TASTING_DEPTH_ACCEPT,
  instantiateServingOrderCompositionTemplate,
} from '../src/game/logic/servingOrderCompositionTemplates';

const ELIGIBLE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong', 'lavender', 'saffron', 'buckwheat'];
const REACTION: TeaId[] = ['black_tea', 'milk', 'milk_tea'];

function consFor(inst: { serve1Index: number; serve2Index: number; tastingIndex: number }): CupConstraint[] {
  const c = Array.from({ length: 6 }, () => ({ mode: 'normal' as const })) as CupConstraint[];
  c[inst.serve1Index] = { mode: 'normal', serveOrder: 1 };
  c[inst.serve2Index] = { mode: 'normal', serveOrder: 2 };
  c[inst.tastingIndex] = { mode: 'normal', capacity: 2, mustEndEmpty: true };
  return c;
}

describe('bank shape (§§18-19)', () => {
  it('12 templates, unique ids, canonical-distinct starts', () => {
    const bank = SERVING_ORDER_COMPOSITION_BANK['serving-order-tasting'];
    expect(bank.length).toBe(12);
    expect(new Set(bank.map((t) => t.id)).size).toBe(12);
    expect(ALL_SERVING_ORDER_COMPOSITION_TEMPLATES.length).toBe(12);
    const keys = bank.map((t) => {
      const inst = instantiateServingOrderCompositionTemplate(t, ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong']);
      return canonicalPuzzleKey({ cups: inst.cups, floatingIngredients: emptyFloatingIngredients(6) }, consFor(inst));
    });
    expect(new Set(keys).size).toBe(12);
  });
  it('valid O1/O2/tasting, correct counts, all full mixed, shape 4,4,4,4,0,0', () => {
    for (const t of SERVING_ORDER_COMPOSITION_BANK['serving-order-tasting']) {
      expect(t.serve1Index).not.toBe(t.serve2Index);
      expect(t.tastingIndex).toBe(5);
      expect([t.serve1Index, t.serve2Index].includes(5)).toBe(false);
      const lens = t.cups.map((c) => c.length).sort((a, b) => a - b);
      expect(lens).toEqual([0, 0, 4, 4, 4, 4]);
      for (const cup of t.cups) {
        if (cup.length === 4) expect(new Set(cup).size).toBeGreaterThanOrEqual(2);
        for (const r of cup) expect(['c0', 'c1', 'c2', 'c3']).toContain(r);
      }
    }
  });
  it('host diversity: >=5 distinct O1>O2 pairs, tasting fixed at 5', () => {
    const pairs = new Set(SERVING_ORDER_COMPOSITION_BANK['serving-order-tasting'].map((t) => `${t.serve1Index}>${t.serve2Index}`));
    expect(pairs.size).toBeGreaterThanOrEqual(5);
  });
});

describe('bank solves: exact depths, C2, prefix 2, win, no reaction leak (§34)', () => {
  it.each(SERVING_ORDER_COMPOSITION_BANK['serving-order-tasting'].map((t) => [t.id] as [string]))('template %s validates', (id) => {
    const t = SERVING_ORDER_COMPOSITION_BANK['serving-order-tasting'].find((x) => x.id === id) as (typeof SERVING_ORDER_COMPOSITION_BANK)['serving-order-tasting'][number];
    const inst = instantiateServingOrderCompositionTemplate(t, ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong']);
    const cons = consFor(inst);
    // No reaction ids in any instantiation.
    for (const cup of inst.cups) for (const tea of cup) expect(REACTION).not.toContain(tea);
    const r = solvePuzzle(inst.cups, { cupConstraints: cons, maxVisited: 120_000, maxDepth: 60, returnSolution: true });
    expect(r.truncated).not.toBe(true);
    expect(r.solvable).toBe(true);
    expect(r.minMoves).toBe(t.depth);
    expect(r.minMoves as number).toBeGreaterThanOrEqual(SERVING_ORDER_TASTING_DEPTH_ACCEPT.min);
    expect(r.minMoves as number).toBeLessThanOrEqual(SERVING_ORDER_TASTING_DEPTH_ACCEPT.max);
    // C2: tasting used + SERVE_1 before SERVE_2 + win + prefix 2.
    const sol = r.solution as SolverAction[];
    expect(sol.some((a) => a.kind === 'pour' && (a.from === 5 || a.to === 5))).toBe(true);
    let board = inst.cups.map((c) => [...c]);
    let s1: number | null = null;
    let s2: number | null = null;
    for (let i = 0; i < sol.length; i++) {
      const a = sol[i] as SolverAction;
      if (a.kind !== 'pour') continue;
      const res = applyPourState({ cups: board, floatingIngredients: emptyFloatingIngredients(6) }, a.from, a.to, cons);
      expect(res).not.toBeNull();
      board = res!.state.cups as TeaId[][];
      if (res!.serveCompleted === 1 && s1 === null) s1 = i;
      if (res!.serveCompleted === 2 && s2 === null) s2 = i;
    }
    expect(s1).not.toBeNull();
    expect(s2).not.toBeNull();
    expect(s1 as number).toBeLessThan(s2 as number);
    expect(servedPrefixLength({ cups: board, floatingIngredients: emptyFloatingIngredients(6) }, cons)).toBe(2);
    expect(isPuzzleWonState({ cups: board, floatingIngredients: emptyFloatingIngredients(6) }, cons)).toBe(true);
  });
  it('permutation robustness spot-check: reversed palette stays C2 in-band', () => {
    const order: TeaId[] = ['milk_oolong', 'karkade', 'sea_buckthorn', 'matcha'];
    for (const t of SERVING_ORDER_COMPOSITION_BANK['serving-order-tasting'].slice(0, 4)) {
      const inst = instantiateServingOrderCompositionTemplate(t, order);
      const cons = consFor(inst);
      const r = solvePuzzle(inst.cups, { cupConstraints: cons, maxVisited: 120_000, maxDepth: 60, returnSolution: true });
      expect(r.truncated).not.toBe(true);
      expect(r.solvable).toBe(true);
      expect(r.minMoves as number).toBeGreaterThanOrEqual(SERVING_ORDER_TASTING_DEPTH_ACCEPT.min);
      expect(r.minMoves as number).toBeLessThanOrEqual(SERVING_ORDER_TASTING_DEPTH_ACCEPT.max);
      expect((r.solution as SolverAction[]).some((a) => a.kind === 'pour' && (a.from === 5 || a.to === 5))).toBe(true);
    }
  });
  it('final-tea diversity: ①/② land on >=2 distinct teas across bank', () => {
    const finals = new Set<string>();
    for (const t of SERVING_ORDER_COMPOSITION_BANK['serving-order-tasting']) {
      const inst = instantiateServingOrderCompositionTemplate(t, ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong']);
      const cons = consFor(inst);
      const r = solvePuzzle(inst.cups, { cupConstraints: cons, maxVisited: 120_000, maxDepth: 60, returnSolution: true });
      let board = inst.cups.map((c) => [...c]);
      for (const a of r.solution as SolverAction[]) {
        if (a.kind !== 'pour') continue;
        const res = applyPourState({ cups: board, floatingIngredients: emptyFloatingIngredients(6) }, a.from, a.to, cons);
        if (!res) break;
        board = res.state.cups as TeaId[][];
      }
      finals.add(`${(board[inst.serve1Index] as TeaId[])[0]}/${(board[inst.serve2Index] as TeaId[])[0]}`);
    }
    expect(finals.size).toBeGreaterThanOrEqual(2);
    void ELIGIBLE;
  });
});
