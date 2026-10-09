/**
 * Gauntlet 12 — tea-bloom view/UX regression via pure helpers + existing
 * view exports only (no Pixi Application; game rules stay in rules.ts,
 * TeaSortView keeps the standard-cup geometry).
 *
 * Covered here:
 * - standard-cup geometry: bud host constraint is plain normal (CupView
 *   stays 64x142, slotHeight 29 — tea geometry unchanged, bud displaces no
 *   layer);
 * - pure helpers: teaBudBottomPoint (single bottom anchor), teaBudScaleForCup,
 *   teaBloomVisualPlan (metadata-only signal);
 * - no fake tea: logic host holds exactly its 4 tea layers (bud is not tea);
 * - post-bloom indistinguishable: after the bud clears the same CupView
 *   geometry/behavior holds (no residual marker);
 * - no view-owned state: CupView carries no bud-index fields (the aligned
 *   teaBudSlots array on logic is the only truth);
 * - one action / one ticker / one lock: bloom plan is a single timed
 *   flourish driven by transition metadata (structural: plan shape + dur).
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import { canPourState } from '../src/game/logic/rules';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import {
  CupView,
  TEA_BLOOM_MS,
  teaBloomVisualPlan,
  teaBudBottomPoint,
  teaBudScaleForCup,
} from '../src/game/view/TeaSortView';

const N: CupConstraint = { mode: 'normal' };
const M: TeaId = 'matcha';
const K: TeaId = 'karkade';

describe('bud lives in a standard cup (no new vessel geometry)', () => {
  it('bud host constraint is plain normal: CupView is the standard 64x142 glass', () => {
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

  it('slotHeight stays 29 for the bud host (bud displaces no layer)', () => {
    const view = new CupView(0, N);
    expect(view.slotHeightFor(N)).toBe(29);
    expect(view.slotHeightFor(N) * 4).toBeLessThanOrEqual(view.height);
    view.destroy();
  });

  it('pure helpers: single bottom anchor, scale, metadata-only plan', () => {
    const pt = teaBudBottomPoint(64, 142);
    expect(pt.x).toBe(32);
    expect(pt.y).toBeGreaterThan(100);
    expect(pt.y).toBeLessThanOrEqual(142);
    expect(teaBudBottomPoint(64, 142)).toEqual(teaBudBottomPoint(64, 142));
    expect(teaBudScaleForCup(64)).toBe(1);
    expect(teaBudScaleForCup(56)).toBeLessThan(1);
    expect(teaBloomVisualPlan('tea_bud')).toEqual({ shouldAnimate: true, durMs: TEA_BLOOM_MS });
    expect(TEA_BLOOM_MS).toBeGreaterThanOrEqual(350);
    expect(TEA_BLOOM_MS).toBeLessThanOrEqual(550);
    expect(teaBloomVisualPlan(null)).toEqual({ shouldAnimate: false, durMs: 0 });
    expect(teaBloomVisualPlan(undefined as never)).toEqual({ shouldAnimate: false, durMs: 0 });
  });
});

describe('no fake tea: view never invents layers', () => {
  it('active host holds exactly its 4 tea layers (bud is not tea)', () => {
    const logic = new TeaSortLogic(
      [[M, K, M, K], []],
      [0, 0],
      [N, N],
      undefined, undefined, undefined, undefined, undefined,
      ['tea_bud', null],
    );
    expect(logic.cups[0]?.layers).toHaveLength(4);
    expect(logic.toState().cups[0]).toEqual([M, K, M, K]);
    expect(logic.teaBudSlots).toEqual(['tea_bud', null]);
  });
});

describe('post-bloom indistinguishable from an ordinary cup', () => {
  it('bloom → same geometry, same behavior, no residual marker', () => {
    const logic = new TeaSortLogic(
      [[], [M]],
      [0, 0],
      [N, N],
      undefined, undefined, undefined, undefined, undefined,
      [null, 'tea_bud'],
    );
    expect(logic.makeMove(1, 0)?.teaBudBloomed).toBe('tea_bud');
    expect(logic.toState().teaBudSlots).toEqual([null, null]);
    const view = new CupView(1, N);
    expect(view.width).toBe(64);
    expect(view.height).toBe(142);
    expect(view.slotHeightFor(N)).toBe(29);
    view.destroy();
    expect(
      canPourState(
        { cups: [[M], []] as TeaId[][], floatingIngredients: [null, null], teaBudSlots: [null, null] as never },
        0, 1, [N, N],
      ),
    ).toBe(true);
  });
});

describe('no view-owned bud state', () => {
  it('CupView carries no bud-index fields (logic array is the only truth)', () => {
    const view = new CupView(0, N) as unknown as Record<string, unknown>;
    expect('teaBud' in view).toBe(false);
    expect('bud' in view).toBe(false);
    expect('teaBudSlots' in view).toBe(false);
    expect('bloomCupIndex' in view).toBe(false);
    expect('wasBudCup' in view).toBe(false);
    (view as { destroy: () => void }).destroy();
  });
});

describe('hitbox unchanged (≥44px both axes)', () => {
  it('standard 64x142 body already clears 44px; padded targets larger still', () => {
    const view = new CupView(0, N);
    expect(view.width).toBeGreaterThanOrEqual(44);
    expect(view.height).toBeGreaterThanOrEqual(44);
    view.destroy();
  });
});
