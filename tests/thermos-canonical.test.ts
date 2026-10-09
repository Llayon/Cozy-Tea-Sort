/**
 * Gauntlet 10 — thermos canonicalization (§§110-122, constraint encoding).
 *
 * The thermos is constraint identity only (no dynamic state): normal flow,
 * capacity 5, must-end-empty encodes as `N:_:C5:E` — distinct from normal
 * (`N:_`) and the tasting bowl (`N:_:C2:E`). Permutation holds only within
 * the same signature group; legacy ice-free/honey-free keys are
 * byte-identical to their historical encodings.
 */
import { describe, expect, it } from 'vitest';
import {
  cupConstraintSignature,
  isThermosCupConstraint,
  type CupConstraint,
  type TeaId,
} from '../src/game/types';
import { canonicalKey, canonicalPuzzleKey } from '../src/game/logic/rules';

const N: CupConstraint = { mode: 'normal' };
const TH: CupConstraint = { mode: 'normal', capacity: 5, mustEndEmpty: true };
const TASTING: CupConstraint = { mode: 'normal', capacity: 2, mustEndEmpty: true };

const M: TeaId = 'matcha';
const K: TeaId = 'karkade';

describe('constraint encoding: N:_:C5:E vs N:_ vs N:_:C2:E', () => {
  it('thermos encodes as N:_:C5:E', () => {
    expect(cupConstraintSignature(TH)).toBe('N:_:C5:E');
    expect(isThermosCupConstraint(TH)).toBe(true);
  });

  it('tasting and normal keep their legacy signatures', () => {
    expect(cupConstraintSignature(TASTING)).toBe('N:_:C2:E');
    expect(cupConstraintSignature(N)).toBe('N:_');
  });

  it('explicit defaults collapse (no state-key fragmentation)', () => {
    expect(cupConstraintSignature({ mode: 'normal', capacity: 4, mustEndEmpty: false })).toBe('N:_');
    expect(cupConstraintSignature({ mode: 'normal', capacity: 4 })).toBe('N:_');
    expect(cupConstraintSignature(N)).toBe(cupConstraintSignature({ mode: 'normal' }));
  });

  it('capacity-5 without must-end-empty is a different signature (D, not E)', () => {
    expect(cupConstraintSignature({ mode: 'normal', capacity: 5 })).toBe('N:_:C5:D');
    expect(cupConstraintSignature({ mode: 'normal', capacity: 5 })).not.toBe(cupConstraintSignature(TH));
  });

  it('thermos keys carry the C5:E marker and differ from normal/tasting placements', () => {
    const withThermos = canonicalKey([[], []], [N, TH]);
    const allNormal = canonicalKey([[], []], [N, N]);
    const withTasting = canonicalKey([[], []], [N, TASTING]);
    expect(withThermos).toContain('C5:E');
    expect(withThermos).not.toBe(allNormal);
    expect(withThermos).not.toBe(withTasting);
    expect(allNormal).not.toBe(withTasting);
  });
});

describe('permutation holds only within the same signature group', () => {
  it('two identical thermos constraints stay symmetric', () => {
    expect(canonicalKey([[M], [K]], [TH, TH])).toBe(canonicalKey([[K], [M]], [TH, TH]));
  });

  it('thermos position is canonical: same contents under swapped roles key identically', () => {
    // Thermos holding [M] + normal holding [K], roles swapped together.
    const a = canonicalKey([[M], [K]], [TH, N]);
    const b = canonicalKey([[K], [M]], [N, TH]);
    expect(a).toBe(b);
  });

  it('genuinely different thermos contents key differently', () => {
    const a = canonicalKey([[M], [K]], [TH, N]);
    const b = canonicalKey([[K], [K]], [TH, N]);
    expect(a).not.toBe(b);
  });

  it('thermos vs normal vs tasting vs sink vs source-only vs target all differ', () => {
    const keys = new Set([
      canonicalKey([[]], [TH]),
      canonicalKey([[]], [TASTING]),
      canonicalKey([[]], [N]),
      canonicalKey([[]], [{ mode: 'sink-only' }]),
      canonicalKey([[]], [{ mode: 'source-only' }]),
      canonicalKey([[]], [{ mode: 'normal', targetTeaId: 'lavender' }]),
    ]);
    expect(keys.size).toBe(6);
  });
});

describe('legacy key byte identity (thermos changes shift nothing historical)', () => {
  it('ice-free/honey-free boards keep exact historical encodings', () => {
    const cups: TeaId[][] = [[M, K], [], [K, M, M, K]];
    const cons: CupConstraint[] = [N, { mode: 'normal' }, N];
    const noField = { cups, floatingIngredients: [null, null, null] as null[] };
    const explicitNull = {
      cups,
      floatingIngredients: [null, null, null] as null[],
      iceSlots: [null, null, null] as (null)[],
    };
    expect(canonicalPuzzleKey(noField, cons)).toBe(canonicalKey(cups, cons));
    expect(canonicalPuzzleKey(explicitNull, cons)).toBe(canonicalKey(cups, cons));
    const lemon = {
      cups: [[M, M, M, M], []] as TeaId[][],
      floatingIngredients: ['lemon', null] as ('lemon' | null)[],
    };
    expect(canonicalPuzzleKey(lemon, [N, N])).toBe('N:_:#_|matcha,matcha,matcha,matcha#lemon');
  });

  it('thermos boards take the legacy path verbatim (puzzle key == tea key)', () => {
    const st = {
      cups: [[M], [K]] as TeaId[][],
      floatingIngredients: [null, null] as null[],
    };
    expect(canonicalPuzzleKey(st, [TH, N])).toBe(canonicalKey([[M], [K]], [TH, N]));
  });

  it('unconstrained legacy keys stay sorted-contents joins', () => {
    expect(canonicalKey([[M], [K]])).toBe('karkade|matcha');
  });
});
