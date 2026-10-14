/**
 * Gauntlet 14 Phase A — Undo exactness (§§72-74).
 *
 * No serving state is snapshotted (none exists): undo restores tea layers
 * and the derived prefix + source locks follow automatically. Multi-step
 * timelines with interleaved serving restore exactly.
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import { servedPrefixLength } from '../src/game/logic/servingOrder';

const A: TeaId = 'matcha';
const B: TeaId = 'karkade';

const N: CupConstraint = { mode: 'normal' };
const O1: CupConstraint = { mode: 'normal', serveOrder: 1 };
const O2: CupConstraint = { mode: 'normal', serveOrder: 2 };

function prefixOf(logic: TeaSortLogic): number {
  const s = logic.toState();
  return servedPrefixLength(
    { cups: s.cups, floatingIngredients: s.floatingIngredients },
    s.cupConstraints,
  );
}

describe('§72 undo SERVE_1', () => {
  it('① [A,A,A] → [A×4] (prefix1, locked); undo → [A,A,A] (prefix0, usable)', () => {
    const logic = new TeaSortLogic([[A], [A, A, A]], [0, 0], [N, O1]);
    expect(prefixOf(logic)).toBe(0);
    expect(logic.canMakeMove(1, 0)).toBe(true);
    const mv = logic.makeMove(0, 1);
    expect(mv).not.toBe(null);
    expect(mv?.serveCompleted).toBe(1);
    expect(logic.toState().cups[1]).toEqual([A, A, A, A]);
    expect(prefixOf(logic)).toBe(1);
    expect(logic.canMakeMove(1, 0)).toBe(false);
    expect(logic.undo()).not.toBe(null);
    expect(logic.toState().cups).toEqual([[A], [A, A, A]]);
    expect(prefixOf(logic)).toBe(0);
    expect(logic.canMakeMove(0, 1)).toBe(true);
    expect(logic.movesCount).toBe(0);
  });
});

describe('§73 undo SERVE_2', () => {
  it('prefix1 + ② [B,B,B] → prefix2; undo → prefix1, ② incomplete', () => {
    const logic = new TeaSortLogic(
      [[A, A, A, A], [B, B, B], [B]],
      [0, 0, 0],
      [O1, O2, N],
    );
    expect(prefixOf(logic)).toBe(1);
    const mv = logic.makeMove(2, 1);
    expect(mv?.serveCompleted).toBe(2);
    expect(prefixOf(logic)).toBe(2);
    expect(logic.isWon()).toBe(true);
    expect(logic.undo()).not.toBe(null);
    expect(prefixOf(logic)).toBe(1);
    expect(logic.toState().cups[1]).toEqual([B, B, B]);
    expect(logic.isWon()).toBe(false);
  });
});

describe('§74 multi-step undo: temp work → pressure → sort → SERVE_1 → sort → SERVE_2 → win', () => {
  it('scripted 6-move timeline undoes exactly to the initial deal', () => {
    // Valid 2-color economy: A×4 + B×4 across 6 cups.
    const init: TeaId[][] = [[A, B], [B, A], [A, A], [B, B], [], []];
    const cons = [O1, O2, N, N, N, N];
    const logic = new TeaSortLogic(init, [0, 0, 0, 0, 0, 0], cons);
    const path: Array<[number, number]> = [[2, 4], [3, 5], [0, 5], [1, 4], [4, 0], [5, 1]];
    const serves: Array<number | null> = [];
    for (const [f, t] of path) {
      const mv = logic.makeMove(f, t);
      expect(mv).not.toBe(null);
      serves.push(mv?.serveCompleted ?? null);
    }
    expect(serves).toEqual([null, null, null, null, 1, 2]);
    expect(logic.isWon()).toBe(true);
    expect(logic.toState().cups[0]).toEqual([A, A, A, A]);
    expect(logic.toState().cups[1]).toEqual([B, B, B, B]);
    expect(prefixOf(logic)).toBe(2);
    for (let i = 0; i < path.length; i++) expect(logic.undo()).not.toBe(null);
    expect(logic.toState().cups).toEqual(init);
    expect(prefixOf(logic)).toBe(0);
    expect(logic.movesCount).toBe(0);
    expect(logic.canMakeMove(2, 4)).toBe(true);
  });
});
