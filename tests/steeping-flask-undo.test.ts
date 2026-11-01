/**
 * G20 Undo/restart kernel — readiness is derived from restored layers.
 */
import { describe, expect, it } from 'vitest';
import {
  STEEPING_FLASK_CONSTRAINT,
  cloneCupConstraint,
  emptyFloatingIngredients,
  type CupConstraint,
  type TeaId,
} from '../src/game/types';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import { isSteepingFlaskReady } from '../src/game/logic/rules';

const A: TeaId = 'matcha';

function setup() {
  const constraints: CupConstraint[] = [
    cloneCupConstraint(STEEPING_FLASK_CONSTRAINT),
    { mode: 'normal' },
    { mode: 'normal' },
  ];
  const logic = new TeaSortLogic(
    [[A, A, A], [A], []],
    [0, 0, 0],
    constraints,
    emptyFloatingIngredients(3),
  );
  return { logic, constraints };
}

describe('G20 Undo readiness restoration', () => {
  it('partial -> fill ready -> undo returns partial and not ready', () => {
    const { logic, constraints } = setup();
    const before = logic.toState();
    logic.makeMove(1, 0);
    expect(logic.cups[0]?.layers).toEqual([A, A, A, A]);
    expect(isSteepingFlaskReady(logic.cups[0]?.layers as TeaId[], constraints[0])).toBe(true);
    logic.undo();
    expect(logic.toState().cups).toEqual(before.cups);
    expect(logic.movesCount).toBe(0);
    expect(isSteepingFlaskReady(logic.cups[0]?.layers as TeaId[], constraints[0])).toBe(false);
  });

  it('ready -> clean release -> undo returns ready', () => {
    const { logic, constraints } = setup();
    logic.makeMove(1, 0);
    const readyState = logic.toState();
    logic.makeMove(0, 2);
    expect(logic.cups[0]?.layers).toEqual([]);
    expect(logic.isWon()).toBe(true);
    logic.undo();
    expect(logic.toState().cups).toEqual(readyState.cups);
    expect(isSteepingFlaskReady(logic.cups[0]?.layers as TeaId[], constraints[0])).toBe(true);
    expect(logic.movesCount).toBe(1);
  });

  it('full solve -> full undo restores exact cups/constraints/moves', () => {
    const { logic, constraints } = setup();
    const start = logic.toState();
    logic.makeMove(1, 0);
    logic.makeMove(0, 2);
    expect(logic.isWon()).toBe(true);
    logic.undo();
    logic.undo();
    const back = logic.toState();
    expect(back.cups).toEqual(start.cups);
    expect(back.cupConstraints).toEqual(start.cupConstraints);
    expect(back.cupConstraints[0]?.steepingFlask).toBe(true);
    expect(constraints[0]?.steepingFlask).toBe(true);
    expect(logic.movesCount).toBe(0);
    expect(logic.canUndo).toBe(false);
  });

  it('PuzzleState carries no flask readiness field (readiness is derived)', () => {
    const { logic } = setup();
    const st = logic.toState() as unknown as Record<string, unknown>;
    for (const forbidden of ['flaskReady', 'isSteeped', 'steepedTea', 'flaskPhase', 'brewProgress', 'flaskLocked', 'flaskTea', 'flaskOpened']) {
      expect(forbidden in st).toBe(false);
    }
  });

  it('partial release leaves a relocked flask; undo restores the ready state', () => {
    const constraints: CupConstraint[] = [
      cloneCupConstraint(STEEPING_FLASK_CONSTRAINT),
      { mode: 'normal' },
    ];
    const logic = new TeaSortLogic(
      [[A, A, A, A], [A, A]],
      [0, 0],
      constraints,
      emptyFloatingIngredients(2),
    );
    logic.makeMove(0, 1);
    expect(logic.cups[0]?.layers).toEqual([A, A]);
    expect(isSteepingFlaskReady(logic.cups[0]?.layers as TeaId[], constraints[0])).toBe(false);
    logic.undo();
    expect(logic.cups[0]?.layers).toEqual([A, A, A, A]);
    expect(isSteepingFlaskReady(logic.cups[0]?.layers as TeaId[], constraints[0])).toBe(true);
  });
});
