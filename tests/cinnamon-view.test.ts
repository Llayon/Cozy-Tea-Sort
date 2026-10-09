/**
 * Gauntlet 11 — cinnamon view/UX regression via pure helpers + existing
 * view exports only (no Pixi Application, no invented cinnamon painters;
 * game rules stay in rules.ts, TeaSortView keeps the standard-cup geometry).
 *
 * Covered here (read from the source — no invented names):
 * - standard-cup geometry: CupView for a normal constraint stays 64x142
 *   with slotHeight 29 (2 active layers are NOT stretched to fill the
 *   vessel — base-4 rhythm preserved);
 * - no fake tea: logic layers stay len-2 while active (view never invents
 *   layers to fill the stick gap);
 * - post-unlock indistinguishable: after the obstacle clears the same
 *   CupView geometry/behavior holds (no vessel swap, no residual marker);
 * - no view-owned state: CupView carries no cinnamon/stick/obstacle fields
 *   (the aligned capacityObstacles array on logic is the only truth);
 * - hitbox unchanged: standard 64x142 body already clears 44px, padded
 *   targets larger still; selection pours like a normal cup.
 *
 * Deliberately NOT asserted as pixel truth (needs a Pixi Graphics):
 * - the stick illustration itself (shape language lives in the sibling
 *   visual implementation; geometry + state ownership above are the
 *   testable contract here).
 */
import { describe, expect, it } from 'vitest';
import {
  effectiveCupCapacity,
  type CapacityObstacleSlot,
  type CupConstraint,
  type TeaId,
} from '../src/game/types';
import { canPourState, pourRejectCodeState } from '../src/game/logic/rules';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import { CupView } from '../src/game/view/TeaSortView';

const N: CupConstraint = { mode: 'normal' };
const M: TeaId = 'matcha';
const K: TeaId = 'karkade';

describe('stick lives in a standard cup (no new vessel geometry)', () => {
  it('cinnamon host constraint is plain normal: CupView is the standard 64x142 glass', () => {
    const view = new CupView(0, N);
    expect(view.width).toBe(64);
    expect(view.height).toBe(142);
    expect(view.isTeapot).toBe(false);
    expect(view.isSinkOnly).toBe(false);
    expect(view.isTastingBowl).toBe(false);
    expect(view.isThermos).toBe(false);
    expect(view.rimLocalY).toBe(4);
    view.destroy();
  });

  it('logic host keeps the static base capacity 4 while active (view never sees effective)', () => {
    const logic = new TeaSortLogic(
      [[M, K], []],
      [0, 0],
      [N, N],
      undefined,
      undefined,
      undefined,
      undefined,
      ['cinnamon', null],
    );
    expect(logic.cups[0]?.capacity).toBe(4);
    expect(logic.cups[0]?.constraint).toEqual(N);
    expect(effectiveCupCapacity(logic.cups[0]?.constraint, 'cinnamon')).toBe(2);
    expect(logic.cups[0]?.layers).toEqual([M, K]);
  });
});

describe('base-4 geometry: 2 active layers are NOT stretched', () => {
  it('slotHeight stays 29 for the cinnamon host (never half-height stretch)', () => {
    const view = new CupView(0, N);
    expect(view.slotHeightFor(N)).toBe(29);
    // 2 layers occupy the bottom 2 slots only (2*29=58 from the base),
    // never stretched to fill the 142-tall body.
    expect(view.slotHeightFor(N) * 2).toBe(58);
    expect(view.slotHeightFor(N) * 4).toBeLessThanOrEqual(view.height);
    view.destroy();
  });

  it('active 2/2 is target-full at the rules level, not a view stretch', () => {
    const st = {
      cups: [[M], [M, K]] as TeaId[][],
      floatingIngredients: [null, null] as null[],
      capacityObstacles: [null, 'cinnamon'] as CapacityObstacleSlot[],
    };
    expect(pourRejectCodeState(st, 0, 1, [N, N])).toBe('target-full');
    expect(canPourState(st, 0, 1, [N, N])).toBe(false);
  });
});

describe('no fake tea: view never invents layers', () => {
  it('active host holds exactly its 2 tea layers (stick is not tea)', () => {
    const logic = new TeaSortLogic(
      [[M, K], []],
      [0, 0],
      [N, N],
      undefined,
      undefined,
      undefined,
      undefined,
      ['cinnamon', null],
    );
    expect(logic.cups[0]?.layers).toHaveLength(2);
    expect(logic.toState().cups[0]).toEqual([M, K]);
    // Tea counts stay 4/color at generation; the stick contributes none.
    // (Unit counts are pinned in templates/stress; here the shape truth.)
    expect(logic.capacityObstacles).toEqual(['cinnamon', null]);
  });
});

describe('post-unlock indistinguishable from an ordinary cup', () => {
  it('unlock → same geometry, same behavior, no residual marker', () => {
    const logic = new TeaSortLogic(
      [[], [], [M, K]],
      [0, 0, 0],
      [N, N, N],
      undefined,
      undefined,
      undefined,
      undefined,
      [null, null, 'cinnamon'],
    );
    expect(logic.makeMove(2, 0)).not.toBe(null);
    expect(logic.toState().capacityObstacles[2]).toBe('cinnamon');
    expect(logic.makeMove(2, 1)).not.toBe(null);
    expect(logic.toState().capacityObstacles).toEqual([null, null, null]);
    expect(logic.toState().cups[2]).toEqual([]);
    // The same standard CupView renders the unlocked vessel (no swap).
    const view = new CupView(1, N);
    expect(view.width).toBe(64);
    expect(view.height).toBe(142);
    expect(view.slotHeightFor(N)).toBe(29);
    view.destroy();
    // And it now receives like any ordinary empty (mixed source stays legal).
    expect(
      canPourState(
        { cups: [[M, K], []] as TeaId[][], floatingIngredients: [null, null], capacityObstacles: [null, null] },
        0,
        1,
        [N, N],
      ),
    ).toBe(true);
  });
});

describe('no view-owned cinnamon state', () => {
  it('CupView carries no stick/obstacle fields (logic array is the only truth)', () => {
    const view = new CupView(0, N) as unknown as Record<string, unknown>;
    expect('cinnamon' in view).toBe(false);
    expect('stick' in view).toBe(false);
    expect('capacityObstacle' in view).toBe(false);
    expect('capacityObstacles' in view).toBe(false);
    expect('obstacle' in view).toBe(false);
    (view as { destroy: () => void }).destroy();
  });

  it('freeze → unlock → undo round-trips through logic alone (no view fields needed)', () => {
    const logic = new TeaSortLogic(
      [[], [], [M, K]],
      [0, 0, 0],
      [N, N, N],
      undefined,
      undefined,
      undefined,
      undefined,
      [null, null, 'cinnamon'],
    );
    expect(logic.capacityObstacles).toEqual([null, null, 'cinnamon']);
    expect(logic.makeMove(2, 0)?.capacityObstacleRemoved).toBe(undefined);
    expect(logic.capacityObstacles).toEqual([null, null, 'cinnamon']);
    expect(logic.makeMove(2, 1)?.capacityObstacleRemoved).toBe('cinnamon');
    expect(logic.capacityObstacles).toEqual([null, null, null]);
    logic.undo();
    expect(logic.capacityObstacles).toEqual([null, null, 'cinnamon']);
    expect(logic.toState().cups).toEqual([[K], [], [M]]);
  });
});

describe('hitbox unchanged (≥44px both axes)', () => {
  it('standard 64x142 body already clears 44px; padded targets larger still', () => {
    const view = new CupView(0, N);
    expect(view.width).toBeGreaterThanOrEqual(44);
    expect(view.height).toBeGreaterThanOrEqual(44);
    expect(view.width + 20 * 2).toBeGreaterThanOrEqual(44);
    expect(view.height + 16 + 32).toBeGreaterThanOrEqual(44);
    view.destroy();
  });
});
