/**
 * Gauntlet 12 — tea-bud canonicalization (§§30-35, §62).
 *
 * Dormant-bud marker travels WITH vessel identity inside the same
 * signature group. No-bud boards stay byte-identical to G11. Active vs
 * cleared distinct. Post-bloom collapse restores ordinary permutation.
 * Legacy keys for all pre-G12 mechanics unchanged.
 */
import { describe, expect, it } from 'vitest';
import type { CapacityObstacleSlot, CupConstraint, TeaBudSlot, TeaId } from '../src/game/types';
import { canonicalKey, canonicalPuzzleKey } from '../src/game/logic/rules';

const N: CupConstraint = { mode: 'normal' };
const SRC: CupConstraint = { mode: 'source-only' };
const SNK: CupConstraint = { mode: 'sink-only' };
const TASTING: CupConstraint = { mode: 'normal', capacity: 2, mustEndEmpty: true };
const THERMOS: CupConstraint = { mode: 'normal', capacity: 5, mustEndEmpty: true };

const M: TeaId = 'matcha';
const K: TeaId = 'karkade';

describe('bud encoding: active vs cleared distinction', () => {
  it('same tea with/without bud keys differently with the #bud: marker', () => {
    const cups: TeaId[][] = [[M, K], []];
    const cons = [N, N];
    const plain = canonicalPuzzleKey({ cups, floatingIngredients: [null, null] }, cons);
    const active = canonicalPuzzleKey(
      { cups, floatingIngredients: [null, null], teaBudSlots: ['tea_bud', null] as TeaBudSlot[] },
      cons,
    );
    expect(active).not.toBe(plain);
    expect(active).toContain('#bud:tea_bud');
    expect(plain).not.toContain('#bud:');
  });

  it('genuinely different active contents key differently', () => {
    const cons = [N, N];
    const a = canonicalPuzzleKey(
      { cups: [[M], [K]] as TeaId[][], floatingIngredients: [null, null], teaBudSlots: ['tea_bud', null] as TeaBudSlot[] },
      cons,
    );
    const b = canonicalPuzzleKey(
      { cups: [[K], [K]] as TeaId[][], floatingIngredients: [null, null], teaBudSlots: ['tea_bud', null] as TeaBudSlot[] },
      cons,
    );
    expect(a).not.toBe(b);
  });
});

describe('no-bud byte identity vs G11 keys', () => {
  it('all-null buds take the legacy paths verbatim (byte-identical)', () => {
    const cups: TeaId[][] = [[M, K], [], [K, M, M, K]];
    const cons: CupConstraint[] = [N, { mode: 'normal' }, N];
    const noField = { cups, floatingIngredients: [null, null, null] as null[] };
    const explicitNull = {
      cups,
      floatingIngredients: [null, null, null] as null[],
      teaBudSlots: [null, null, null] as TeaBudSlot[],
    };
    expect(canonicalPuzzleKey(noField, cons)).toBe(canonicalKey(cups, cons));
    expect(canonicalPuzzleKey(explicitNull, cons)).toBe(canonicalKey(cups, cons));
    expect(canonicalPuzzleKey(explicitNull, cons)).toBe(canonicalPuzzleKey(noField, cons));
  });

  it('bud boards never collide with bud-free ones (#bud: is novel)', () => {
    const cups: TeaId[][] = [[M, K], []];
    const plain = canonicalPuzzleKey({ cups, floatingIngredients: [null, null] }, [N, N]);
    expect(plain).not.toContain('#bud:');
    expect(plain).not.toContain('#cap:');
    expect(plain).not.toContain('#sink:');
    expect(plain).not.toContain('#ice:');
  });
});

describe('post-bloom collapse/permutation', () => {
  it('once cleared the cup is ordinary again: cleared key == plain key', () => {
    const cups: TeaId[][] = [[M, K], []];
    const cons = [N, N];
    const cleared = canonicalPuzzleKey(
      { cups, floatingIngredients: [null, null], teaBudSlots: [null, null] as TeaBudSlot[] },
      cons,
    );
    const plain = canonicalPuzzleKey({ cups, floatingIngredients: [null, null] }, cons);
    expect(cleared).toBe(plain);
    expect(cleared).toBe(canonicalKey(cups, cons));
  });

  it('swapping interchangeable decorated vessels stays canonical', () => {
    const cons = [N, N];
    const a = canonicalPuzzleKey(
      { cups: [[M, K], [M]] as TeaId[][], floatingIngredients: [null, null], teaBudSlots: ['tea_bud', null] as TeaBudSlot[] },
      cons,
    );
    const b = canonicalPuzzleKey(
      { cups: [[M], [M, K]] as TeaId[][], floatingIngredients: [null, null], teaBudSlots: [null, 'tea_bud'] as TeaBudSlot[] },
      cons,
    );
    expect(a).toBe(b);
  });

  it('permutation holds only with the bud travelling with its tea', () => {
    const cons = [N, N];
    const a = canonicalPuzzleKey(
      { cups: [[M, K], []] as TeaId[][], floatingIngredients: [null, null], teaBudSlots: ['tea_bud', null] as TeaBudSlot[] },
      cons,
    );
    const c = canonicalPuzzleKey(
      { cups: [[M, K], []] as TeaId[][], floatingIngredients: [null, null], teaBudSlots: [null, 'tea_bud'] as TeaBudSlot[] },
      cons,
    );
    expect(a).not.toBe(c);
  });
});

describe('legacy keys for all pre-G12 mechanics unchanged', () => {
  it('plain boards keep exact historical encodings', () => {
    expect(canonicalKey([[M], [K]])).toBe('karkade|matcha');
    expect(canonicalKey([[], []], [N, N])).toContain('N:_');
  });

  it('teapot / sink / target signatures unchanged and bud-free', () => {
    expect(canonicalKey([[]], [SRC])).toBe('SRC:_:');
    expect(canonicalKey([[]], [SNK])).toBe('SNK:_:');
    expect(canonicalKey([[]], [{ mode: 'normal', targetTeaId: 'lavender' }])).toBe('N:lavender:');
    for (const key of [
      canonicalKey([[]], [SRC]),
      canonicalKey([[]], [SNK]),
      canonicalKey([[]], [{ mode: 'normal', targetTeaId: 'lavender' }]),
    ]) {
      expect(key).not.toContain('#bud:');
    }
  });

  it('tasting bowl keeps N:_:C2:E and thermos keeps N:_:C5:E, both bud-free keys', () => {
    expect(canonicalKey([[], []], [N, TASTING])).toContain('C2:E');
    expect(canonicalKey([[], []], [N, THERMOS])).toContain('C5:E');
    expect(canonicalPuzzleKey({ cups: [[M], [K]] as TeaId[][], floatingIngredients: [null, null] }, [TASTING, N])).not.toContain('#bud:');
    expect(canonicalPuzzleKey({ cups: [[M], [K]] as TeaId[][], floatingIngredients: [null, null] }, [THERMOS, N])).not.toContain('#bud:');
  });

  it('lemon boards keep the exact G5 key', () => {
    const lemon = {
      cups: [[M, M, M, M], []] as TeaId[][],
      floatingIngredients: ['lemon', null] as ('lemon' | null)[],
    };
    expect(canonicalPuzzleKey(lemon, [N, N])).toBe('N:_:#_|matcha,matcha,matcha,matcha#lemon');
  });

  it('strainer / honey / lemon+honey / frozen / cinnamon boards keep markers, never #bud:', () => {
    const withStrainer = canonicalPuzzleKey(
      { cups: [[M], []] as TeaId[][], floatingIngredients: [null, null], strainer: { present: true, attachedCupIndex: null, heldTea: null } },
      [N, N],
    );
    expect(withStrainer).toContain('STR:STAND:EMPTY');
    expect(withStrainer).not.toContain('#bud:');
    const withHoney = canonicalPuzzleKey(
      { cups: [[M], []] as TeaId[][], floatingIngredients: [null, null], sinkingIngredients: ['honey', null] as ('honey' | null)[] },
      [N, N],
    );
    expect(withHoney).toContain('#sink:honey');
    expect(withHoney).not.toContain('#bud:');
    const withBoth = canonicalPuzzleKey(
      {
        cups: [[M], []] as TeaId[][],
        floatingIngredients: ['lemon', null] as ('lemon' | null)[],
        sinkingIngredients: [null, 'honey'] as ('honey' | null)[],
      },
      [N, N],
    );
    expect(withBoth).toContain('#sink:honey');
    expect(withBoth).not.toContain('#bud:');
    const withIce = canonicalPuzzleKey(
      { cups: [[M], []] as TeaId[][], floatingIngredients: [null, null], iceSlots: ['ice', null] as ('ice' | null)[] },
      [N, N],
    );
    expect(withIce).toContain('#ice:ice');
    expect(withIce).not.toContain('#bud:');
    const withCap = canonicalPuzzleKey(
      { cups: [[M], []] as TeaId[][], floatingIngredients: [null, null], capacityObstacles: ['cinnamon', null] as CapacityObstacleSlot[] },
      [N, N],
    );
    expect(withCap).toContain('#cap:cinnamon');
    expect(withCap).not.toContain('#bud:');
    const thermosPlain = canonicalPuzzleKey(
      { cups: [[M], [K]] as TeaId[][], floatingIngredients: [null, null] },
      [THERMOS, N],
    );
    expect(thermosPlain).toBe(canonicalKey([[M], [K]], [THERMOS, N]));
    expect(thermosPlain).toContain('C5:E');
  });
});
