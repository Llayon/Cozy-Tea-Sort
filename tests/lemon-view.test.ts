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
  lemonSurfaceLocalY,
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
