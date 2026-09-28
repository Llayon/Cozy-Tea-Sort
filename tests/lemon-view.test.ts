/**
 * Gauntlet 5 §90 — view tests via pure helpers (no brittle Pixi drawing
 * assertions; game rules stay out of drawing tests).
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint } from '../src/game/types';
import { canActAsSource, floatingIngredientHostSatisfied } from '../src/game/logic/rules';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import {
  CupView,
  LEMON_SLICE_R,
  decideSecondTap,
  drawLemonSlice,
  lemonCenterLocalY,
  lemonSurfaceLocalY,
  lemonTransitCounts,
} from '../src/game/view/TeaSortView';

const M = 'matcha' as const;
const SB = 'sea_buckthorn' as const;
const N: CupConstraint = { mode: 'normal' };
const SNK: CupConstraint = { mode: 'sink-only' };
const TASTING: CupConstraint = { mode: 'normal', capacity: 2, mustEndEmpty: true };

describe('lemon visual state derives from authoritative floatingIngredients', () => {
  it('no parallel hasLemon view boolean: Cup slot is the truth', () => {
    const logic = new TeaSortLogic([[SB, SB]], [0], [N], ['lemon']);
    expect(logic.cups[0]?.floatingIngredient).toBe('lemon');
    expect(logic.toState().floatingIngredients).toEqual(['lemon']);
    const view = new CupView(0, N);
    view.renderLemon(logic.cups[0] as import('../src/game/logic/teaSortLogic').Cup);
    view.destroy();
  });

  it('surface Y changes with liquid count (never a fixed global y)', () => {
    const y4 = lemonSurfaceLocalY(4, N);
    const y2 = lemonSurfaceLocalY(2, N);
    const y1 = lemonSurfaceLocalY(1, N);
    expect(y2).toBeGreaterThan(y4);
    expect(y1).toBeGreaterThan(y2);
    expect(y4).toBe(142 - 6 - 4 * 29);
    // Tasting geometry follows its own slots.
    expect(lemonSurfaceLocalY(2, TASTING)).toBeLessThan(lemonSurfaceLocalY(0, TASTING));
  });

  it('correct-state helper recognizes sea_buckthorn only', () => {
    expect(floatingIngredientHostSatisfied('lemon', [SB, SB, SB, SB], N)).toBe(true);
    expect(floatingIngredientHostSatisfied('lemon', [M, M, M, M], N)).toBe(false);
    expect(floatingIngredientHostSatisfied('lemon', [SB, SB, SB], N)).toBe(false);
  });

  it('lemon slice draws restrained geometry (fixed radius, no text)', () => {
    expect(LEMON_SLICE_R).toBeGreaterThanOrEqual(7);
    expect(LEMON_SLICE_R).toBeLessThanOrEqual(9);
    expect(typeof drawLemonSlice).toBe('function');
  });
});

describe('selection policy with lemon levels', () => {
  it('tasting geometry unchanged: bowl still C2/E', () => {
    const bowl = new CupView(0, TASTING);
    expect(bowl.isTastingBowl).toBe(true);
    expect(bowl.slotHeightFor(TASTING) * 2).toBeCloseTo(
      142 - 6 - (bowl.rimLocalY + 4),
      6,
    );
    bowl.destroy();
  });

  it('guest source prohibition unchanged on lemon levels', () => {
    expect(canActAsSource(SNK)).toBe(false);
    expect(decideSecondTap(SNK, false, true)).toBe('reject-sink-source');
    expect(canActAsSource(N)).toBe(true);
  });

  it('lemon transit metadata flows from move results (no stale reads)', () => {
    const logic = new TeaSortLogic([[M, SB], [SB]], [0, 0], [N, N], ['lemon', null]);
    const res = logic.makeMove(0, 1);
    expect(res?.floatingIngredientMoved).toBe('lemon');
    const plain = new TeaSortLogic([[M], [M]], [0, 0], [N, N], [null, null]);
    expect(plain.makeMove(0, 1)?.floatingIngredientMoved).toBe(null);
  });
});

describe('G5.1 lemon transit geometry', () => {
  it('1. target ending with 2 layers (transfer 2 into empty): endpoint == centerY(2)', () => {
    // Post-move target holds 2 layers; the flight must land on the shared
    // static/flight anchor (G5.2: one lemonCenterLocalY for both).
    expect(lemonTransitCounts(0, 2, 2)).toEqual({ sourcePre: 2, targetFinal: 2 });
    const target = new CupView(1, N);
    const end = target.surfaceStagePoint(2);
    expect(end.x).toBeCloseTo(32, 9);
    expect(end.y).toBeCloseTo(lemonCenterLocalY(2, N), 9);
    target.destroy();
  });

  it('2. target ending with 2 layers (transfer 1 onto 1): endpoint == centerY(2)', () => {
    expect(lemonTransitCounts(1, 2, 1)).toEqual({ sourcePre: 2, targetFinal: 2 });
    const target = new CupView(1, N);
    target.container.position.set(100, 200);
    const end = target.surfaceStagePoint(2);
    expect(end.x).toBeCloseTo(100 + 32, 9);
    expect(end.y).toBeCloseTo(200 + lemonCenterLocalY(2, N), 9);
    target.destroy();
  });

  it('3. tilted source: transformed start differs per pivot/rotation (radius preserved)', () => {
    const view = new CupView(0, N);
    view.container.position.set(100, 200);
    const rest = view.surfaceStagePoint(3);
    view.cupBodyContainer.rotation = 0.88;
    const tilted = view.surfaceStagePoint(3);
    // The tilt must move the anchor (regression: unrotated rest-pose point).
    expect(Math.hypot(tilted.x - rest.x, tilted.y - rest.y)).toBeGreaterThan(5);
    // Rotation preserves the radius around the pivot (independent math).
    const pivotStageX = 100 + 32;
    const pivotStageY = 200 + 10;
    const restR = Math.hypot(rest.x - pivotStageX, rest.y - pivotStageY);
    const tiltR = Math.hypot(tilted.x - pivotStageX, tilted.y - pivotStageY);
    expect(tiltR).toBeCloseTo(restR, 6);
    // Positive tilt swings the surface point toward the pour side.
    expect(tilted.x).toBeLessThan(rest.x);
    // Lift shifts the anchor too.
    view.cupBodyContainer.rotation = 0;
    view.currentLift = -12;
    const lifted = view.surfaceStagePoint(3);
    expect(lifted.y).toBeCloseTo(rest.y - 12, 9);
    expect(lifted.x).toBeCloseTo(rest.x, 9);
    view.destroy();
  });

  it('4. landing static lemon coincides with the transit endpoint (epsilon)', () => {
    // Full move simulation: the endpoint count is the post-pour target
    // count, and the static slice reappears at exactly that anchor.
    const logic = new TeaSortLogic([[M, SB, SB], [SB]], [0, 0], [N, N], ['lemon', null]);
    const res = logic.makeMove(0, 1);
    expect(res?.floatingIngredientMoved).toBe('lemon');
    const postTargetLen = logic.cups[1]?.layers.length ?? -1;
    expect(postTargetLen).toBe(3);
    const { targetFinal } = lemonTransitCounts(
      logic.cups[0]?.layers.length ?? 0,
      postTargetLen,
      res?.move.count ?? 0,
    );
    expect(targetFinal).toBe(postTargetLen);
    const target = new CupView(1, N);
    const endpoint = target.surfaceStagePoint(targetFinal);
    const landing = target.surfaceStagePoint(postTargetLen);
    expect(Math.hypot(endpoint.x - landing.x, endpoint.y - landing.y)).toBeLessThan(1e-9);
    // Static slice center IS the transit anchor now (G5.2): the shared
    // lemonCenterLocalY feeds both renderLemon and surfaceStagePoint, so
    // takeoff and landing have zero jump — not "within radius".
    const staticCy = lemonCenterLocalY(postTargetLen, N);
    expect(Math.abs(staticCy - (endpoint.y - target.container.y))).toBeLessThan(1e-9);
    target.destroy();
  });

  it('5. no-lemon pour: no transit metadata, static rendering untouched', () => {
    const logic = new TeaSortLogic([[M, M], [M]], [0, 0], [N, N], [null, null]);
    const res = logic.makeMove(0, 1);
    expect(res?.floatingIngredientMoved).toBe(null);
    expect(logic.toState().floatingIngredients).toEqual([null, null]);
    // Static layer renders fine with no ingredient present.
    const view = new CupView(0, N);
    view.renderLemon(logic.cups[0] as import('../src/game/logic/teaSortLogic').Cup);
    view.renderLemon(logic.cups[1] as import('../src/game/logic/teaSortLogic').Cup);
    view.destroy();
  });
});
