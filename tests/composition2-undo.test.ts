/** G21 FLASK_TRAY undo/restart kernel. */
import { describe, expect, it } from 'vitest';
import {
  STEEPING_FLASK_CONSTRAINT,
  cloneCupConstraint,
  defaultCupConstraints,
  emptyFloatingIngredients,
  type CupConstraint,
  type TeaId,
} from '../src/game/types';
import {
  ALL_STEEPING_FLASK_SHARED_TRAY_TEMPLATES,
  instantiateSteepingFlaskSharedTrayTemplate,
} from '../src/game/logic/steepingFlaskSharedTrayTemplates';
import { solvePuzzle } from '../src/game/logic/solver';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';

const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];

function setup() {
  const tpl = ALL_STEEPING_FLASK_SHARED_TRAY_TEMPLATES[0] as (typeof ALL_STEEPING_FLASK_SHARED_TRAY_TEMPLATES)[number];
  const inst = instantiateSteepingFlaskSharedTrayTemplate(tpl, PALETTE, PALETTE);
  const cons: CupConstraint[] = defaultCupConstraints(inst.cups.length);
  for (const member of inst.trayMembers) {
    cons[member] = { mode: 'normal', sharedCapacityGroup: 'tea-tray' };
  }
  cons[inst.flaskSlot] = cloneCupConstraint(STEEPING_FLASK_CONSTRAINT);
  const solved = solvePuzzle(inst.cups, {
    cupConstraints: cons,
    floatingIngredients: emptyFloatingIngredients(inst.cups.length),
    maxVisited: 200_000,
    maxDepth: 60,
    returnSolution: true,
  });
  if (!solved.solution) throw new Error('bank template must solve');
  return { inst, cons, solution: solved.solution };
}

describe('G21 FLASK_TRAY undo', () => {
  it('mid-composition undo restores exact cups/constraints and derived state', () => {
    const { inst, cons, solution } = setup();
    const logic = new TeaSortLogic(
      inst.cups.map((c) => [...c]),
      inst.cups.map(() => 0),
      cons,
      emptyFloatingIngredients(inst.cups.length),
    );
    const start = logic.toState();
    for (let i = 0; i < Math.min(5, solution.length); i++) {
      const action = solution[i] as { kind: string; from: number; to: number };
      if (action.kind === 'pour') logic.makeMove(action.from, action.to);
    }
    const mid = logic.toState();
    logic.undo();
    expect(logic.toState().cups).not.toEqual(mid.cups);
    while (logic.canUndo) logic.undo();
    expect(logic.toState()).toEqual(start);
    expect(logic.movesCount).toBe(0);
  });

  it('full solution + full undo restores the exact start', () => {
    const { inst, cons, solution } = setup();
    const logic = new TeaSortLogic(
      inst.cups.map((c) => [...c]),
      inst.cups.map(() => 0),
      cons,
      emptyFloatingIngredients(inst.cups.length),
    );
    const start = logic.toState();
    for (const action of solution) {
      if (action.kind !== 'pour') continue;
      expect(logic.makeMove(action.from as number, action.to as number)).not.toBeNull();
    }
    expect(logic.isWon()).toBe(true);
    while (logic.canUndo) logic.undo();
    expect(logic.toState()).toEqual(start);
    expect(logic.movesCount).toBe(0);
    expect(logic.toState().cupConstraints[5]?.steepingFlask).toBe(true);
  });

  it('PuzzleState contains no combo progress field', () => {
    const { inst, cons } = setup();
    const logic = new TeaSortLogic(inst.cups, inst.cups.map(() => 0), cons, emptyFloatingIngredients(inst.cups.length));
    const state = logic.toState() as unknown as Record<string, unknown>;
    for (const forbidden of ['comboProgress', 'flaskTrayProgress', 'orderTrayProgress', 'interactionFlags', 'flaskReady', 'trayProgress']) {
      expect(forbidden in state).toBe(false);
    }
  });
});
