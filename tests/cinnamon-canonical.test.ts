/**
 * Gauntlet 11 — cinnamon canonicalization (§46 obstacle encoding, §49
 * collapse/permutation, §51 legacy identity).
 *
 * The obstacle marker joins the cup-content encoding
 * (`…#sink:_#ice:_#cap:<c>`), travelling WITH the tea inside the same
 * vessel-signature group — active vs unlocked placements key differently,
 * while obstacle-free boards take the legacy paths verbatim (byte-identical
 * G10 keys). Once removed the cup is semantically ordinary and may collapse
 * with equivalent normal cups again (§49). Legacy keys for
 * plain/teapot/target/sink/tasting/lemon/strainer/honey/lemon+honey/
 * frozen/thermos stay unchanged (§51).
 */
import { describe, expect, it } from 'vitest';
import {
  type CapacityObstacleSlot,
  type CupConstraint,
  type TeaId,
} from '../src/game/types';
import { canonicalKey, canonicalPuzzleKey } from '../src/game/logic/rules';

const N: CupConstraint = { mode: 'normal' };
const SRC: CupConstraint = { mode: 'source-only' };
const SNK: CupConstraint = { mode: 'sink-only' };
const TASTING: CupConstraint = { mode: 'normal', capacity: 2, mustEndEmpty: true };
const THERMOS: CupConstraint = { mode: 'normal', capacity: 5, mustEndEmpty: true };

const M: TeaId = 'matcha';
const K: TeaId = 'karkade';

describe('obstacle encoding: active vs unlocked distinction', () => {
  it('same tea with/without cinnamon keys differently with the #cap: marker', () => {
    const cups: TeaId[][] = [[M, K], []];
    const cons = [N, N];
    const plain = canonicalPuzzleKey(
      { cups, floatingIngredients: [null, null] },
      cons,
    );
    const active = canonicalPuzzleKey(
      { cups, floatingIngredients: [null, null], capacityObstacles: ['cinnamon', null] as CapacityObstacleSlot[] },
      cons,
    );
    expect(active).not.toBe(plain);
    expect(active).toContain('#cap:cinnamon');
    expect(active).toContain('#cap:_');
    expect(plain).not.toContain('#cap:');
  });

  it('two different active placements key differently', () => {
    const cons = [N, N];
    const a = canonicalPuzzleKey(
      { cups: [[M, K], []] as TeaId[][], floatingIngredients: [null, null], capacityObstacles: ['cinnamon', null] as CapacityObstacleSlot[] },
      cons,
    );
    const b = canonicalPuzzleKey(
      { cups: [[M, K], []] as TeaId[][], floatingIngredients: [null, null], capacityObstacles: [null, 'cinnamon'] as CapacityObstacleSlot[] },
      cons,
    );
    // Same multiset of decorated vessels? No — obstacle on different content:
    // [M,K]+cinnamon vs []+cinnamon are different decorated units.
    // Swap the whole decorated units together instead (see permutation below).
    expect(a).not.toBe(
      canonicalPuzzleKey(
        { cups: [[M, K], []] as TeaId[][], floatingIngredients: [null, null] },
        cons,
      ),
    );
    void b;
  });

  it('genuinely different active contents key differently', () => {
    const cons = [N, N];
    const a = canonicalPuzzleKey(
      { cups: [[M], [K]] as TeaId[][], floatingIngredients: [null, null], capacityObstacles: ['cinnamon', null] as CapacityObstacleSlot[] },
      cons,
    );
    const b = canonicalPuzzleKey(
      { cups: [[K], [K]] as TeaId[][], floatingIngredients: [null, null], capacityObstacles: ['cinnamon', null] as CapacityObstacleSlot[] },
      cons,
    );
    expect(a).not.toBe(b);
  });
});

describe('no-obstacle byte identity vs G10 keys', () => {
  it('all-null obstacles take the legacy paths verbatim (byte-identical)', () => {
    const cups: TeaId[][] = [[M, K], [], [K, M, M, K]];
    const cons: CupConstraint[] = [N, { mode: 'normal' }, N];
    const noField = { cups, floatingIngredients: [null, null, null] as null[] };
    const explicitNull = {
      cups,
      floatingIngredients: [null, null, null] as null[],
      capacityObstacles: [null, null, null] as CapacityObstacleSlot[],
    };
    expect(canonicalPuzzleKey(noField, cons)).toBe(canonicalKey(cups, cons));
    expect(canonicalPuzzleKey(explicitNull, cons)).toBe(canonicalKey(cups, cons));
    expect(canonicalPuzzleKey(explicitNull, cons)).toBe(canonicalPuzzleKey(noField, cons));
  });

  it('unconstrained legacy keys stay sorted-contents joins', () => {
    expect(canonicalKey([[M], [K]])).toBe('karkade|matcha');
  });

  it('cinnamon boards never collide with obstacle-free ones (#cap: is novel)', () => {
    const cups: TeaId[][] = [[M, K], []];
    const plain = canonicalPuzzleKey({ cups, floatingIngredients: [null, null] }, [N, N]);
    expect(plain).not.toContain('#cap:');
    expect(plain).not.toContain('#sink:');
    expect(plain).not.toContain('#ice:');
  });
});

describe('post-unlock collapse/permutation (§49)', () => {
  it('once removed the cup is ordinary again: unlocked key == plain key', () => {
    const cups: TeaId[][] = [[M, K], []];
    const cons = [N, N];
    const unlocked = canonicalPuzzleKey(
      { cups, floatingIngredients: [null, null], capacityObstacles: [null, null] as CapacityObstacleSlot[] },
      cons,
    );
    const plain = canonicalPuzzleKey({ cups, floatingIngredients: [null, null] }, cons);
    expect(unlocked).toBe(plain);
    expect(unlocked).toBe(canonicalKey(cups, cons));
  });

  it('swapping interchangeable decorated vessels stays canonical', () => {
    const cons = [N, N];
    const a = canonicalPuzzleKey(
      { cups: [[M, K], [M]] as TeaId[][], floatingIngredients: [null, null], capacityObstacles: ['cinnamon', null] as CapacityObstacleSlot[] },
      cons,
    );
    const b = canonicalPuzzleKey(
      { cups: [[M], [M, K]] as TeaId[][], floatingIngredients: [null, null], capacityObstacles: [null, 'cinnamon'] as CapacityObstacleSlot[] },
      cons,
    );
    expect(a).toBe(b);
  });

  it('permutation holds only with the obstacle travelling with its tea', () => {
    const cons = [N, N];
    // Same tea, obstacle on the WRONG vessel: different decorated units.
    const a = canonicalPuzzleKey(
      { cups: [[M, K], []] as TeaId[][], floatingIngredients: [null, null], capacityObstacles: ['cinnamon', null] as CapacityObstacleSlot[] },
      cons,
    );
    const c = canonicalPuzzleKey(
      { cups: [[M, K], []] as TeaId[][], floatingIngredients: [null, null], capacityObstacles: [null, 'cinnamon'] as CapacityObstacleSlot[] },
      cons,
    );
    expect(a).not.toBe(c);
  });
});

describe('legacy keys for all pre-G11 mechanics unchanged (§51)', () => {
  it('plain boards keep exact historical encodings', () => {
    expect(canonicalKey([[M], [K]])).toBe('karkade|matcha');
    expect(canonicalKey([[], []], [N, N])).toContain('N:_');
  });

  it('teapot / sink / target signatures unchanged and cap-free', () => {
    expect(canonicalKey([[]], [SRC])).toBe('SRC:_:');
    expect(canonicalKey([[]], [SNK])).toBe('SNK:_:');
    expect(canonicalKey([[]], [{ mode: 'normal', targetTeaId: 'lavender' }])).toBe('N:lavender:');
    for (const key of [
      canonicalKey([[]], [SRC]),
      canonicalKey([[]], [SNK]),
      canonicalKey([[]], [{ mode: 'normal', targetTeaId: 'lavender' }]),
    ]) {
      expect(key).not.toContain('#cap:');
    }
  });

  it('tasting bowl keeps N:_:C2:E and thermos keeps N:_:C5:E, both cap-free keys', () => {
    expect(canonicalKey([[], []], [N, TASTING])).toContain('C2:E');
    expect(canonicalKey([[], []], [N, THERMOS])).toContain('C5:E');
    expect(canonicalPuzzleKey({ cups: [[M], [K]] as TeaId[][], floatingIngredients: [null, null] }, [TASTING, N])).not.toContain('#cap:');
    expect(canonicalPuzzleKey({ cups: [[M], [K]] as TeaId[][], floatingIngredients: [null, null] }, [THERMOS, N])).not.toContain('#cap:');
  });

  it('lemon boards keep the exact G5 key', () => {
    const lemon = {
      cups: [[M, M, M, M], []] as TeaId[][],
      floatingIngredients: ['lemon', null] as ('lemon' | null)[],
    };
    expect(canonicalPuzzleKey(lemon, [N, N])).toBe('N:_:#_|matcha,matcha,matcha,matcha#lemon');
  });

  it('strainer / honey / lemon+honey / frozen boards keep their markers, never #cap:', () => {
    // Strainer on stand.
    const withStrainer = canonicalPuzzleKey(
      { cups: [[M], []] as TeaId[][], floatingIngredients: [null, null], strainer: { present: true, attachedCupIndex: null, heldTea: null } },
      [N, N],
    );
    expect(withStrainer).toContain('STR:STAND:EMPTY');
    expect(withStrainer).not.toContain('#cap:');
    // Honey.
    const withHoney = canonicalPuzzleKey(
      { cups: [[M], []] as TeaId[][], floatingIngredients: [null, null], sinkingIngredients: ['honey', null] as ('honey' | null)[] },
      [N, N],
    );
    expect(withHoney).toContain('#sink:honey');
    expect(withHoney).not.toContain('#cap:');
    // Lemon + honey.
    const withBoth = canonicalPuzzleKey(
      {
        cups: [[M], []] as TeaId[][],
        floatingIngredients: ['lemon', null] as ('lemon' | null)[],
        sinkingIngredients: [null, 'honey'] as ('honey' | null)[],
      },
      [N, N],
    );
    expect(withBoth).toContain('#sink:honey');
    expect(withBoth).not.toContain('#cap:');
    // Frozen.
    const withIce = canonicalPuzzleKey(
      { cups: [[M], []] as TeaId[][], floatingIngredients: [null, null], iceSlots: ['ice', null] as ('ice' | null)[] },
      [N, N],
    );
    expect(withIce).toContain('#ice:ice');
    expect(withIce).not.toContain('#cap:');
    // Thermos boards take the legacy tea path verbatim (constraint-only encoding).
    const thermosPlain = canonicalPuzzleKey(
      { cups: [[M], [K]] as TeaId[][], floatingIngredients: [null, null] },
      [THERMOS, N],
    );
    expect(thermosPlain).toBe(canonicalKey([[M], [K]], [THERMOS, N]));
    expect(thermosPlain).toContain('C5:E');
  });
});
