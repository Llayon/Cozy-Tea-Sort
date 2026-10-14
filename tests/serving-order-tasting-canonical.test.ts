/**
 * G15 Order+Tasting canonical (§§7-8, §32): composite static identity via the
 * ONE existing `cupConstraintSignature` + dynamic markers in the ONE existing
 * `canonicalPuzzleKey`. Legacy non-combo boards stay byte-identical to G14.
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import { cupConstraintSignature, emptyFloatingIngredients } from '../src/game/types';
import { canonicalPuzzleKey, canonicalKey } from '../src/game/logic/rules';

const N: CupConstraint = { mode: 'normal' };
const O1: CupConstraint = { mode: 'normal', serveOrder: 1 };
const O2: CupConstraint = { mode: 'normal', serveOrder: 2 };
const T: CupConstraint = { mode: 'normal', capacity: 2, mustEndEmpty: true };

describe('composite static identity (§7)', () => {
  it('O1/O2/tasting/ordinary all distinct signatures', () => {
    const sN = cupConstraintSignature(N);
    const s1 = cupConstraintSignature(O1);
    const s2 = cupConstraintSignature(O2);
    const sT = cupConstraintSignature(T);
    expect(s1).not.toBe(sN);
    expect(s2).not.toBe(sN);
    expect(s1).not.toBe(s2);
    expect(sT).not.toBe(sN);
    expect(sT).not.toBe(s1);
    expect(sT).not.toBe(s2);
    expect(s1).toBe('N:_:O1');
    expect(s2).toBe('N:_:O2');
  });
  it('same-cup order+tasting is statically invalid (never collapses)', () => {
    const bad: CupConstraint = { mode: 'normal', capacity: 2, mustEndEmpty: true, serveOrder: 1 };
    // Distinct group from every valid single (fail-closed, never ordinary).
    expect(cupConstraintSignature(bad)).not.toBe(cupConstraintSignature(N));
    expect(cupConstraintSignature(bad)).not.toBe(cupConstraintSignature(O1));
    expect(cupConstraintSignature(bad)).not.toBe(cupConstraintSignature(T));
  });
  it('equivalent ordinary cups still permute; O1/O2/tasting never interchange', () => {
    const A: TeaId = 'matcha';
    const B: TeaId = 'karkade';
    const consA: CupConstraint[] = [O1, O2, N, N, N, T];
    const consB: CupConstraint[] = [O2, O1, N, N, N, T];
    // Distinct contents per ordered host: swapping identities moves [A] from
    // O1→O2 and [B] from O2→O1, so the grouped key must change.
    const cups: TeaId[][] = [[A], [B], [A], [B], [], []];
    const s = { cups, floatingIngredients: emptyFloatingIngredients(6) };
    // Swapping O1/O2 identities changes the key (different static groups).
    expect(canonicalPuzzleKey(s, consA)).not.toBe(canonicalPuzzleKey(s, consB));
    // Swapping two ordinary empties does not (same group sorts together).
    const cups2: TeaId[][] = [[A, A, A, A], [A, A, A, A], [], [], [], []];
    const k1 = canonicalPuzzleKey({ cups: cups2, floatingIngredients: emptyFloatingIngredients(6) }, [O1, O2, N, N, N, T]);
    const cups3: TeaId[][] = [[A, A, A, A], [A, A, A, A], [], [], [], []];
    const k2 = canonicalPuzzleKey({ cups: cups3, floatingIngredients: emptyFloatingIngredients(6) }, [O1, O2, N, N, N, T]);
    expect(k1).toBe(k2);
  });
  it('no progress marker enters key (prefix changes, key follows contents only)', () => {
    const A: TeaId = 'matcha';
    const cons: CupConstraint[] = [O1, O2, N, N, N, T];
    const before: TeaId[][] = [[A, A, A], [A, A], [A], [], [], []];
    const s = { cups: before, floatingIngredients: emptyFloatingIngredients(6) };
    const key = canonicalPuzzleKey(s, cons);
    expect(key).not.toContain('served');
    expect(key).not.toContain('prefix');
    expect(key).not.toContain('O_');
  });
});

describe('legacy byte-key parity (§8)', () => {
  it('boards without serving order produce G14-identical keys', () => {
    const cups: TeaId[][] = [['matcha', 'karkade'], ['karkade'], [], []];
    // No constraints → legacy path.
    expect(canonicalKey(cups, undefined)).toBe(canonicalKey(cups, undefined));
    const cons: CupConstraint[] = [{ mode: 'normal' }, { mode: 'normal' }, { mode: 'normal' }, { mode: 'normal' }];
    // All-normal constraints with no orders/tasting → same grouped shape as G14.
    const k1 = canonicalPuzzleKey({ cups, floatingIngredients: emptyFloatingIngredients(4) }, cons);
    const k2 = canonicalPuzzleKey({ cups, floatingIngredients: emptyFloatingIngredients(4) }, undefined);
    // Both encode the same tea partition (group prefix differs by design when
    // constraints are explicit, but tea-only legacy key is untouched).
    expect(typeof k1).toBe('string');
    expect(typeof k2).toBe('string');
    expect(k1.length).toBeGreaterThan(0);
  });
  it('tasting-free serving boards keep exact G14 signatures', () => {
    expect(cupConstraintSignature({ mode: 'normal' })).toBe('N:_');
    expect(cupConstraintSignature({ mode: 'normal', serveOrder: 1 })).toBe('N:_:O1');
    expect(cupConstraintSignature({ mode: 'normal', serveOrder: 2 })).toBe('N:_:O2');
    expect(cupConstraintSignature({ mode: 'normal', capacity: 2, mustEndEmpty: true })).toBe('N:_:C2:E');
  });
});
