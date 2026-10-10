/**
 * Gauntlet 13 — reaction view contract (structural, no screenshots).
 *
 * Reaction starts like a normal one-layer pour (transferred 1 even for top
 * runs); destination occupancy unchanged (received 0, no fifth layer);
 * view receives reaction metadata (never reconstructs chemistry from colors);
 * milk_tea afterwards renders/pours ordinarily; one POUR = one move = one
 * input lock = one onMoveComplete (single ticker preserved by construction —
 * animatePour extension adds no ticker).
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import { TEA_TYPES } from '../src/game/types';
import { applyPourState } from '../src/game/logic/rules';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import { MILK_TEA_BLEND_RECIPE } from '../src/game/logic/blendRecipe';

const R = MILK_TEA_BLEND_RECIPE;
const N: CupConstraint = { mode: 'normal' };

describe('source layer: exactly one travels', () => {
  it('top run of 3 still transfers 1', () => {
    const s = { cups: [['x', 'black_tea', 'black_tea', 'black_tea'], ['y', 'milk']] as TeaId[][], floatingIngredients: [null, null] };
    const res = applyPourState(s, 0, 1, [N, N], R);
    expect(res?.transferred).toBe(1);
    expect(res?.layer).toBe('black_tea');
  });
});

describe('contact: no fifth layer, dest unchanged length', () => {
  it('full 4/4 dest stays 4/4 with top replaced', () => {
    const s = { cups: [['black_tea'], ['matcha', 'sea_buckthorn', 'karkade', 'milk']] as TeaId[][], floatingIngredients: [null, null] };
    const before = (s.cups[1] as TeaId[]).length;
    const res = applyPourState(s, 0, 1, [N, N], R);
    expect(before).toBe(4);
    expect((res?.state.cups[1] as TeaId[]).length).toBe(4);
    expect(res?.received).toBe(0);
    expect((res?.state.cups[1] as TeaId[])[3]).toBe('milk_tea');
  });
});

describe('view metadata: enough to render without re-deriving chemistry', () => {
  it('reaction carries source/target/product + recipe id', () => {
    const logic = new TeaSortLogic(
      [['matcha', 'black_tea'], ['matcha', 'milk']], [0, 0], [N, N],
      undefined, undefined, undefined, undefined, undefined, undefined, R,
    );
    const mv = logic.makeMove(0, 1);
    expect(mv?.reaction).toEqual({
      recipeId: 'milk-tea',
      sourceReactant: 'black_tea',
      targetReactant: 'milk',
      product: 'milk_tea',
    });
  });
});

describe('product movement ordinary afterwards', () => {
  it('milk_tea pours like ordinary tea (no badge, no reaction)', () => {
    const s = { cups: [['milk_tea', 'milk_tea'], ['milk_tea']] as TeaId[][], floatingIngredients: [null, null] };
    const res = applyPourState(s, 0, 1, [N, N], R);
    expect(res?.reaction).toBe(undefined);
    expect(res?.state.cups[1]).toEqual(['milk_tea', 'milk_tea', 'milk_tea']);
  });
});

describe('visual distinction (palette)', () => {
  it('black/milk/milk_tea distinct from each other and legacy', () => {
    const black = TEA_TYPES.black_tea.colorHex;
    const milk = TEA_TYPES.milk.colorHex;
    const blend = TEA_TYPES.milk_tea.colorHex;
    const oolong = TEA_TYPES.milk_oolong.colorHex;
    expect(new Set([black, milk, blend]).size).toBe(3);
    expect(milk).not.toBe(oolong);
    // Milk is the lightest (clean ivory vs warmer oolong).
    const lum = (hex: string) => {
      const v = parseInt(hex.slice(1), 16);
      const r = (v >> 16) & 255;
      const g = (v >> 8) & 255;
      const b = v & 255;
      return 0.299 * r + 0.587 * g + 0.114 * b;
    };
    expect(lum(milk)).toBeGreaterThan(lum(oolong));
    expect(TEA_TYPES.black_tea.nameRu).toBe('Чёрный чай');
    expect(TEA_TYPES.milk.nameRu).toBe('Молоко');
    expect(TEA_TYPES.milk_tea.nameRu).toBe('Молочный чай');
  });
});
