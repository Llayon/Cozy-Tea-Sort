/**
 * Gauntlet 13 Phase A — generic blend-reaction kernel (§§51-60).
 *
 * Abstract recipe only (matcha + karkade → saffron, existing TeaIds).
 * No production IDs, no UI, no templates here — pure domain truth.
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import {
  applyPourState,
  canPourState,
  isConstructiveMoveState,
  pourCountState,
  pourRejectCodeState,
  puzzleActionCost,
} from '../src/game/logic/rules';
import {
  DEV_ABSTRACT_BLEND_RECIPE,
  countTeaLayers,
  countTotalLayers,
  isReactivePair,
} from '../src/game/logic/blendRecipe';

const A: TeaId = 'matcha';
const B: TeaId = 'karkade';
const P: TeaId = 'saffron';
const C: TeaId = 'sea_buckthorn';
const D: TeaId = 'buckwheat';

const N: CupConstraint = { mode: 'normal' };
const R = DEV_ABSTRACT_BLEND_RECIPE;

function st(cups: TeaId[][]) {
  return { cups, floatingIngredients: cups.map(() => null) };
}

describe('isReactivePair: ONE helper, symmetric, inert product', () => {
  it('A+B and B+A react, all else inert', () => {
    expect(isReactivePair(A, B, R)).toBe(true);
    expect(isReactivePair(B, A, R)).toBe(true);
    expect(isReactivePair(A, A, R)).toBe(false);
    expect(isReactivePair(B, B, R)).toBe(false);
    expect(isReactivePair(P, P, R)).toBe(false);
    expect(isReactivePair(P, A, R)).toBe(false);
    expect(isReactivePair(P, B, R)).toBe(false);
    expect(isReactivePair(A, P, R)).toBe(false);
    expect(isReactivePair(A, C, R)).toBe(false);
    expect(isReactivePair(null, B, R)).toBe(false);
    expect(isReactivePair(A, null, R)).toBe(false);
    expect(isReactivePair(A, B, undefined)).toBe(false);
  });
});

describe('§51 kernel: A on B', () => {
  it('source loses 1 A, dest top B→P, length unchanged, metadata, cost 1', () => {
    const s = st([[C, A], [D, B]]);
    expect(canPourState(s, 0, 1, [N, N], R)).toBe(true);
    expect(pourRejectCodeState(s, 0, 1, [N, N], R)).toBe('ok');
    expect(pourCountState(s, 0, 1, [N, N], R)).toBe(1);
    const res = applyPourState(s, 0, 1, [N, N], R);
    expect(res).not.toBe(null);
    expect(res?.state.cups[0]).toEqual([C]);
    expect(res?.state.cups[1]).toEqual([D, P]);
    expect(res?.transferred).toBe(1);
    expect(res?.layer).toBe(A);
    expect(res?.strained).toBe(false);
    expect(res?.reaction).toEqual({ recipeId: 'milk-tea', sourceReactant: A, targetReactant: B, product: P });
    expect(puzzleActionCost({ kind: 'pour', from: 0, to: 1 })).toBe(1);
  });
});

describe('§52 kernel: B on A (symmetric)', () => {
  it('B source onto A target produces P', () => {
    const s = st([[D, B], [C, A]]);
    expect(canPourState(s, 0, 1, [N, N], R)).toBe(true);
    const res = applyPourState(s, 0, 1, [N, N], R);
    expect(res?.state.cups[0]).toEqual([D]);
    expect(res?.state.cups[1]).toEqual([C, P]);
    expect(res?.layer).toBe(B);
    expect(res?.reaction).toEqual({ recipeId: 'milk-tea', sourceReactant: B, targetReactant: A, product: P });
  });
});

describe('§53 top run >1: exactly ONE consumed', () => {
  it('[A,A,A] onto [B] → [A,A] + [P]', () => {
    const s = st([[C, A, A, A], [D, B]]);
    const res = applyPourState(s, 0, 1, [N, N], R);
    expect(res).not.toBe(null);
    expect(res?.state.cups[0]).toEqual([C, A, A]);
    expect(res?.state.cups[1]).toEqual([D, P]);
    expect(res?.transferred).toBe(1);
    expect(countTeaLayers(res?.state.cups as TeaId[][], A)).toBe(2);
  });
});

describe('§54 no cascade', () => {
  it('[B,B] + A → [B,P], NOT [P,P]', () => {
    const s = st([[C, A], [D, B, B]]);
    const res = applyPourState(s, 0, 1, [N, N], R);
    expect(res?.state.cups[1]).toEqual([D, B, P]);
    expect(res?.transferred).toBe(1);
  });
});

describe('§55 full target reaction legal', () => {
  it('[X,X,X,B] 4/4 + A → [X,X,X,P] 4/4', () => {
    const s = st([[C, A], [D, C, D, B]]);
    expect(canPourState(s, 0, 1, [N, N], R)).toBe(true);
    expect(pourRejectCodeState(s, 0, 1, [N, N], R)).toBe('ok');
    expect(pourCountState(s, 0, 1, [N, N], R)).toBe(1);
    const res = applyPourState(s, 0, 1, [N, N], R);
    expect(res?.state.cups[1]).toEqual([D, C, D, P]);
    expect((res?.state.cups[1] as TeaId[]).length).toBe(4);
    expect(res?.state.cups[0]).toEqual([C]);
  });

  it('symmetric: full [X,X,X,A] + B reacts', () => {
    const s = st([[C, B], [D, C, D, A]]);
    expect(canPourState(s, 0, 1, [N, N], R)).toBe(true);
    const res = applyPourState(s, 0, 1, [N, N], R);
    expect(res?.state.cups[1]).toEqual([D, C, D, P]);
  });
});

describe('§56 full non-reaction stays target-full', () => {
  it('A onto full [X,X,X,C] → target-full (narrow exemption)', () => {
    const s = st([[D, A], [C, D, C, C]]);
    expect(pourRejectCodeState(s, 0, 1, [N, N], R)).toBe('target-full');
    expect(canPourState(s, 0, 1, [N, N], R)).toBe(false);
    expect(applyPourState(s, 0, 1, [N, N], R)).toBe(null);
  });

  it('P inflow into full non-P stays target-full', () => {
    const s = st([[D, P], [C, D, C, C]]);
    expect(pourRejectCodeState(s, 0, 1, [N, N], R)).toBe('target-full');
  });
});

describe('§57 empty target: no reaction, ordinary transfer', () => {
  it('A into empty moves ordinarily with no metadata', () => {
    const s = st([[C, A], []]);
    expect(canPourState(s, 0, 1, [N, N], R)).toBe(true);
    const res = applyPourState(s, 0, 1, [N, N], R);
    expect(res?.state.cups[0]).toEqual([C]);
    expect(res?.state.cups[1]).toEqual([A]);
    expect(res?.reaction).toBe(undefined);
  });
});

describe('§58 A on A: ordinary maximal transfer', () => {
  it('A→A moves top run, no reaction metadata', () => {
    const s = st([[C, A, A], [D, A]]);
    const res = applyPourState(s, 0, 1, [N, N], R);
    expect(res?.state.cups[0]).toEqual([C]);
    expect(res?.state.cups[1]).toEqual([D, A, A, A]);
    expect(res?.transferred).toBe(2);
    expect(res?.reaction).toBe(undefined);
  });
});

describe('§59 product inert', () => {
  it('P→P ordinary transfer', () => {
    const s = st([[C, P, P], [D, P]]);
    const res = applyPourState(s, 0, 1, [N, N], R);
    expect(res?.state.cups[1]).toEqual([D, P, P, P]);
    expect(res?.reaction).toBe(undefined);
  });

  it('P onto A/B/C is ordinary color-mismatch (no reaction)', () => {
    expect(pourRejectCodeState(st([[P], [A]]), 0, 1, [N, N], R)).toBe('color-mismatch');
    expect(pourRejectCodeState(st([[P], [B]]), 0, 1, [N, N], R)).toBe('color-mismatch');
    expect(pourRejectCodeState(st([[P], [C]]), 0, 1, [N, N], R)).toBe('color-mismatch');
    expect(pourRejectCodeState(st([[A], [P]]), 0, 1, [N, N], R)).toBe('color-mismatch');
    expect(pourRejectCodeState(st([[B], [P]]), 0, 1, [N, N], R)).toBe('color-mismatch');
  });
});

describe('§60 recipe absent: legacy identical', () => {
  it('A/B contact without recipe is color-mismatch', () => {
    const s = st([[C, A], [D, B]]);
    expect(pourRejectCodeState(s, 0, 1, [N, N], undefined)).toBe('color-mismatch');
    expect(canPourState(s, 0, 1, [N, N], undefined)).toBe(false);
    expect(applyPourState(s, 0, 1, [N, N], undefined)).toBe(null);
    // Full-target A→B without recipe is target-full, not a reaction.
    const full = st([[C, A], [D, C, D, B]]);
    expect(pourRejectCodeState(full, 0, 1, [N, N], undefined)).toBe('target-full');
  });

  it('constructive classification without recipe matches legacy (mismatch non-constructive)', () => {
    const s = st([[C, A], [D, B]]);
    expect(isConstructiveMoveState(s, 0, 1, [N, N], undefined)).toBe(false);
    expect(isConstructiveMoveState(s, 0, 1, [N, N], R)).toBe(true);
  });
});

describe('total-layer delta sanity', () => {
  it('reaction reduces total by exactly 1, ordinary preserves', () => {
    const r = applyPourState(st([[C, A], [D, B]]), 0, 1, [N, N], R);
    expect(countTotalLayers(r?.state.cups as TeaId[][])).toBe(3);
    const o = applyPourState(st([[C, A, A], [D, A]]), 0, 1, [N, N], R);
    expect(countTotalLayers(o?.state.cups as TeaId[][])).toBe(5);
  });
});
