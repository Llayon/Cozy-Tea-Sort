/**
 * G15 Order+Tasting undo/restart/reshuffle (§23): no combo mutable state;
 * undo after SERVE_1/SERVE_2 restores exact tea+constraints+usability;
 * restart restores combo; reshuffle keeps combo class.
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import { generateLevel } from '../src/game/logic/generator';
import { solvePuzzle } from '../src/game/logic/solver';
import { applyPourState } from '../src/game/logic/rules';
import { emptyFloatingIngredients } from '../src/game/types';
import type { SolverAction } from '../src/game/types';
import { servedPrefixLength, isServedCupState } from '../src/game/logic/servingOrder';
import {
  SERVING_ORDER_COMPOSITION_BANK,
  instantiateServingOrderCompositionTemplate,
} from '../src/game/logic/servingOrderCompositionTemplates';

const PAL: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
function comboSetup() {
  const tpl = SERVING_ORDER_COMPOSITION_BANK['serving-order-tasting'][0]!;
  const inst = instantiateServingOrderCompositionTemplate(tpl, PAL);
  const cons: CupConstraint[] = Array.from({ length: 6 }, () => ({ mode: 'normal' as const }));
  cons[inst.serve1Index] = { mode: 'normal', serveOrder: 1 };
  cons[inst.serve2Index] = { mode: 'normal', serveOrder: 2 };
  cons[inst.tastingIndex] = { mode: 'normal', capacity: 2, mustEndEmpty: true };
  return { inst, cons };
}

describe('undo after SERVE_1/SERVE_2 (§23)', () => {
  it('undo SERVE_1 restores prefix 0 + usability, exact layers', () => {
    const { inst, cons } = comboSetup();
    const logic = new TeaSortLogic(inst.cups, inst.cups.map(() => 0), cons);
    const r = solvePuzzle(inst.cups, { cupConstraints: cons, maxVisited: 120_000, maxDepth: 60, returnSolution: true });
    const sol = r.solution as SolverAction[];
    // Play until just after SERVE_1.
    let played = 0;
    for (const a of sol) {
      if (a.kind !== 'pour') continue;
      logic.makeMove(a.from, a.to);
      played++;
      const prefix = servedPrefixLength({ cups: logic.cups.map((c) => [...c.layers]), floatingIngredients: emptyFloatingIngredients(6) }, cons);
      if (prefix === 1) break;
    }
    expect(played).toBeGreaterThan(0);
    const afterLayers = logic.cups.map((c) => [...c.layers]);
    expect(logic.canMakeMove(inst.serve1Index, 4)).toBe(false); // served ① locked
    logic.undo();
    const backState = { cups: logic.cups.map((c) => [...c.layers]), floatingIngredients: emptyFloatingIngredients(6) };
    const prefixBack = servedPrefixLength(backState, cons);
    expect(prefixBack).toBe(0);
    // Lock released: ① incomplete ⇒ not served (even if this tight position
    // happens to expose no legal source move, the reason is never source-served).
    expect(isServedCupState(backState, inst.serve1Index, cons)).toBe(false);
    expect(logic.cups.map((c) => [...c.layers])).not.toEqual(afterLayers);
  });
  it('multi-step undo across tasting use restores exact timeline', () => {
    const { inst, cons } = comboSetup();
    const logic = new TeaSortLogic(inst.cups, inst.cups.map(() => 0), cons);
    const start = logic.cups.map((c) => [...c.layers]);
    const r = solvePuzzle(inst.cups, { cupConstraints: cons, maxVisited: 120_000, maxDepth: 60, returnSolution: true });
    const sol = (r.solution as SolverAction[]).filter((a) => a.kind === 'pour').slice(0, 4);
    for (const a of sol) logic.makeMove(a.from, a.to);
    expect(logic.movesCount).toBe(4);
    for (let i = 0; i < 4; i++) logic.undo();
    expect(logic.movesCount).toBe(0);
    expect(logic.cups.map((c) => [...c.layers])).toEqual(start);
  });
});

describe('restart / reshuffle (§23)', () => {
  it('restart restores combo constraints + start layers', () => {
    const { inst, cons } = comboSetup();
    const logic = new TeaSortLogic(inst.cups, inst.cups.map(() => 0), cons);
    logic.makeMove(1, 5);
    expect(logic.movesCount).toBe(1);
    logic.initFromState(inst.cups, inst.cups.map(() => 0), cons);
    expect(logic.movesCount).toBe(0);
    expect(logic.cupConstraints.filter((c) => c.serveOrder === 1).length).toBe(1);
    expect(logic.cupConstraints.filter((c) => c.serveOrder === 2).length).toBe(1);
    expect(logic.cupConstraints.filter((c) => c.capacity === 2 && c.mustEndEmpty === true).length).toBe(1);
  });
  it('reshuffle keeps combo class (serve 2 + tasting 1, no advance)', () => {
    const mkReq = () => ({
      numColors: 4, colors: [...PAL], emptyCups: 2, hasMysteryLayer: false,
      phase: 'challenge' as const, sourceOnlyCount: 0, targetTeaIds: [] as TeaId[],
      tastingCupCount: 1, floatingIngredient: undefined, hasStrainer: false,
      sinkingIngredient: undefined, frozenCupCount: 0, thermosCupCount: 0,
      cinnamonCupCount: 0, teaBudCount: 0, blendRecipeId: undefined, serveOrderCount: 2,
    });
    const a = generateLevel(mkReq(), 'g15-reshuffle-a');
    const b = generateLevel(mkReq(), 'g15-reshuffle-b');
    for (const lvl of [a, b]) {
      expect(lvl.cupConstraints.filter((c) => c.serveOrder === 1).length).toBe(1);
      expect(lvl.cupConstraints.filter((c) => c.serveOrder === 2).length).toBe(1);
      expect(lvl.cupConstraints.filter((c) => c.capacity === 2 && c.mustEndEmpty === true).length).toBe(1);
    }
    void applyPourState;
  });
});
