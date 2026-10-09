/**
 * Gauntlet 12 — Tea Bloom («Чайный бутон») domain kernel (§§52-63).
 *
 * Route objective: one ordinary capacity-4 cup hosts a dormant bud at its
 * physical bottom. The bud blooms ONLY when a successful POUR outflow from
 * that host leaves source tea count at zero. After bloom the vessel is an
 * ordinary normal cup. Bud is NOT a TeaId, consumes no capacity, changes no
 * pour legality; win requires all buds cleared.
 */
import { describe, expect, it } from 'vitest';
import {
  STANDARD_CUP_CAPACITY,
  TEA_UNITS_PER_COLOR,
  countTeaBuds,
  emptyTeaBudSlots,
  normalizeTeaBudSlots,
  teaBudIndex,
  type CupConstraint,
  type TeaBudSlot,
  type TeaId,
} from '../src/game/types';
import {
  applyPourState,
  canPourState,
  canonicalPuzzleKey,
  canonicalKey,
  isConstructiveMoveState,
  isPuzzleWonState,
  pourRejectCodeState,
} from '../src/game/logic/rules';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import { solvePuzzle } from '../src/game/logic/solver';

const A: TeaId = 'matcha';
const B: TeaId = 'karkade';
const C: TeaId = 'lavender';
const D: TeaId = 'sea_buckthorn';

const N: CupConstraint = { mode: 'normal' };

function budState(cups: TeaId[][], buds: TeaBudSlot[], cons?: CupConstraint[]) {
  return {
    cups,
    floatingIngredients: cups.map(() => null),
    teaBudSlots: [...buds],
  };
}

describe('A. state truth + normalization (one aligned row, no duplicates)', () => {
  it('TeaBudSlot is tea_bud|null; helpers normalize legacy missing to all-null', () => {
    expect(TEA_UNITS_PER_COLOR).toBe(4);
    expect(STANDARD_CUP_CAPACITY).toBe(4);
    expect(emptyTeaBudSlots(3)).toEqual([null, null, null]);
    expect(normalizeTeaBudSlots(undefined, 2)).toEqual([null, null]);
    expect(normalizeTeaBudSlots(['tea_bud', null], 2)).toEqual(['tea_bud', null]);
    expect(countTeaBuds({ teaBudSlots: ['tea_bud', null, null] })).toBe(1);
    expect(countTeaBuds({ teaBudSlots: [null, null] })).toBe(0);
    expect(teaBudIndex({ teaBudSlots: [null, 'tea_bud'] })).toBe(1);
    expect(teaBudIndex({ teaBudSlots: [null, null] })).toBe(-1);
  });

  it('single authoritative location: aligned array, no cupIndex duplicate', () => {
    const logic = new TeaSortLogic([[A, B], []], [0, 0], [N, N], undefined, undefined, undefined, undefined, undefined, [
      'tea_bud',
      null,
    ]);
    expect(logic.teaBudSlots).toEqual(['tea_bud', null]);
    const st = logic.toState() as unknown as Record<string, unknown>;
    expect('teaBudCupIndex' in st).toBe(false);
    expect('bloomCupIndex' in st).toBe(false);
    expect('hasTeaBud' in st).toBe(false);
    expect('bloomedCupIndex' in st).toBe(false);
    expect(logic.cups[0]?.teaBud).toBe('tea_bud');
    expect(logic.cups[1]?.teaBud).toBe(null);
  });

  it('bud does not consume capacity: host still holds 4 tea layers max', () => {
    const logic = new TeaSortLogic(
      [[A, B, C, D], []],
      [0, 0],
      [N, N],
      undefined, undefined, undefined, undefined, undefined,
      ['tea_bud', null],
    );
    expect(logic.cups[0]?.layers.length).toBe(4);
    expect(logic.cups[0]?.capacity).toBe(4);
  });
});

describe('B. partial outflow keeps bud (§52)', () => {
  it('[A,B]+bud pour B away -> [A]+bud, metadata null', () => {
    const st = budState([[A, B], []], [null, 'tea_bud'] as TeaBudSlot[]);
    // cups[0]=[A,B]? Bud host is index 1: [A,B]+bud. Pour top B (index1) into empty index0.
    const cups: TeaId[][] = [[], [A, B]];
    const s2 = budState(cups, [null, 'tea_bud']);
    const res = applyPourState(s2, 1, 0, [N, N]);
    expect(res).not.toBe(null);
    expect(res?.state.cups[1]).toEqual([A]);
    expect(res?.state.teaBudSlots).toEqual([null, 'tea_bud']);
    expect(res?.teaBudBloomed ?? null).toBe(null);
    void st;
  });
});

describe('C. final single-layer bloom (§53)', () => {
  it('[A]+bud successful outflow -> [] no bud, metadata tea_bud, atomic', () => {
    const s = budState([[], [A]], [null, 'tea_bud']);
    const res = applyPourState(s, 1, 0, [N, N]);
    expect(res).not.toBe(null);
    expect(res?.transferred).toBe(1);
    expect(res?.state.cups[1]).toEqual([]);
    expect(res?.state.cups[0]).toEqual([A]);
    expect(res?.state.teaBudSlots).toEqual([null, null]);
    expect(res?.teaBudBloomed).toBe('tea_bud');
  });

  it('TeaSortLogic single bloom reports metadata, moves+1, exact undo', () => {
    const logic = new TeaSortLogic([[], [A]], [0, 0], [N, N], undefined, undefined, undefined, undefined, undefined, [null, 'tea_bud']);
    const mv = logic.makeMove(1, 0);
    expect(mv).not.toBe(null);
    expect(mv?.teaBudBloomed).toBe('tea_bud');
    expect(logic.toState().teaBudSlots).toEqual([null, null]);
    expect(logic.toState().cups).toEqual([[A], []]);
    expect(logic.movesCount).toBe(1);
    expect(logic.undo()).not.toBe(null);
    expect(logic.toState().teaBudSlots).toEqual([null, 'tea_bud']);
    expect(logic.toState().cups).toEqual([[], [A]]);
    expect(logic.movesCount).toBe(0);
  });
});

describe('D. final multi-layer bloom (§54)', () => {
  it('[A,A]+bud m=2 outflow -> [] no bud', () => {
    const s = budState([[], [A, A]], [null, 'tea_bud']);
    const res = applyPourState(s, 1, 0, [N, N]);
    expect(res).not.toBe(null);
    expect(res?.transferred).toBe(2);
    expect(res?.state.cups[1]).toEqual([]);
    expect(res?.state.teaBudSlots).toEqual([null, null]);
    expect(res?.teaBudBloomed).toBe('tea_bud');
  });
});

describe('E. inflow never blooms (§55)', () => {
  it('pouring INTO bud host leaves bud dormant', () => {
    const s = budState([[A], [B]], [null, 'tea_bud']);
    // A onto? B vs A mismatch — use matching: [[A],[A]] dest bud host index1.
    const s2 = budState([[A], [A]], [null, 'tea_bud']);
    const res = applyPourState(s2, 0, 1, [N, N]);
    expect(res).not.toBe(null);
    expect(res?.state.cups[1]).toEqual([A, A]);
    expect(res?.state.teaBudSlots).toEqual([null, 'tea_bud']);
    expect(res?.teaBudBloomed ?? null).toBe(null);
    void s;
  });
});

describe('F. invalid pour never blooms (§56)', () => {
  it('rejected outflow leaves bud, tea, moves unchanged', () => {
    // color mismatch: [B] -> [A]+bud? source [B] onto [A] mismatches.
    const s = budState([[B], [A]], [null, 'tea_bud']);
    expect(pourRejectCodeState(s, 0, 1, [N, N])).toBe('color-mismatch');
    expect(canPourState(s, 0, 1, [N, N])).toBe(false);
    expect(applyPourState(s, 0, 1, [N, N])).toBe(null);
    expect(s.cups).toEqual([[B], [A]]);
    expect(s.teaBudSlots).toEqual([null, 'tea_bud']);
    const logic = new TeaSortLogic([[B], [A]], [0, 0], [N, N], undefined, undefined, undefined, undefined, undefined, [null, 'tea_bud']);
    expect(logic.makeMove(0, 1)).toBe(null);
    expect(logic.movesCount).toBe(0);
    expect(logic.toState().teaBudSlots).toEqual([null, 'tea_bud']);
    expect(logic.toState().cups).toEqual([[B], [A]]);
  });
});

describe('G. win blocked by dormant bud (§57) + post-bloom win (§58)', () => {
  it('otherwise-finished tea board with one dormant bud is NOT won', () => {
    const cups: TeaId[][] = [[A, A, A, A], [B, B, B, B], [], []];
    const cons = [N, N, N, N];
    const active = { cups, floatingIngredients: [null, null, null, null], teaBudSlots: ['tea_bud', null, null, null] as TeaBudSlot[] };
    expect(isPuzzleWonState(active, cons)).toBe(false);
  });

  it('same state after valid bloom resolution may win when tea satisfied', () => {
    const cups: TeaId[][] = [[A, A, A, A], [B, B, B, B], [], []];
    const cons = [N, N, N, N];
    const cleared = { cups, floatingIngredients: [null, null, null, null], teaBudSlots: [null, null, null, null] as TeaBudSlot[] };
    expect(isPuzzleWonState(cleared, cons)).toBe(true);
  });
});

describe('H. malformed empty+bud (§59)', () => {
  it('[]+bud is not auto-cleared on read and is not a win', () => {
    const cups: TeaId[][] = [[A, A, A, A], []];
    const s = { cups, floatingIngredients: [null, null], teaBudSlots: [null, 'tea_bud'] as TeaBudSlot[] };
    // Reading/normalizing must not clear.
    expect(normalizeTeaBudSlots(s.teaBudSlots, 2)).toEqual([null, 'tea_bud']);
    expect(isPuzzleWonState(s, [N, N])).toBe(false);
    // Even a fully sorted board with empty+bud elsewhere is blocked.
    const cups2: TeaId[][] = [[A, A, A, A], [B, B, B, B], []];
    const s2 = { cups: cups2, floatingIngredients: [null, null, null], teaBudSlots: [null, null, 'tea_bud'] as TeaBudSlot[] };
    expect(isPuzzleWonState(s2, [N, N, N])).toBe(false);
  });
});

describe('I. post-bloom ordinary behavior (§60)', () => {
  it('after bloom the cup receives, sources, becomes 4/4 homogeneous with no special behavior', () => {
    const logic = new TeaSortLogic([[], [A]], [0, 0], [N, N], undefined, undefined, undefined, undefined, undefined, [null, 'tea_bud']);
    expect(logic.makeMove(1, 0)).not.toBe(null);
    expect(logic.toState().teaBudSlots).toEqual([null, null]);
    // Former host (index1, now empty) receives tea normally.
    const logic2 = new TeaSortLogic([[A, A, A], [A], []], [0, 0, 0], [N, N, N]);
    expect(logic2.makeMove(0, 2)).not.toBe(null);
    expect(logic2.cups[2]?.layers).toEqual([A, A, A]);
    expect(logic2.makeMove(1, 2)).not.toBe(null);
    expect(logic2.cups[2]?.layers).toEqual([A, A, A, A]);
    // Former bud cup after bloom behaves identically: use bloomed logic's empty cup.
    // logic has cups [[A],[]] with no buds; pour A back into former host.
    expect(logic.makeMove(0, 1)).not.toBe(null);
    expect(logic.toState().cups[1]).toEqual([A]);
    expect(logic.toState().teaBudSlots).toEqual([null, null]);
    expect(logic.makeMove(1, 0)).not.toBe(null);
    expect(logic.toState().cups[1]).toEqual([]);
  });
});

describe('J. pruning: bud emptying stays searchable (§61)', () => {
  it('homogeneous [A,A]+bud -> empty normal is constructive (control prunes without bud)', () => {
    const cons = [N, N];
    expect(
      isConstructiveMoveState({ cups: [[A, A, A, A], []] as TeaId[][], floatingIngredients: [null, null] }, 0, 1, cons),
    ).toBe(false);
    expect(
      isConstructiveMoveState(
        { cups: [[A, A], []] as TeaId[][], floatingIngredients: [null, null], teaBudSlots: ['tea_bud', null] as TeaBudSlot[] },
        0, 1, cons,
      ),
    ).toBe(true);
  });

  it('full homogeneous [A,A,A,A]+bud -> empty is LEGAL (not complete-to-empty)', () => {
    const s = budState([[A, A, A, A], []], ['tea_bud', null]);
    expect(canPourState(s, 0, 1, [N, N])).toBe(true);
    expect(pourRejectCodeState(s, 0, 1, [N, N])).toBe('ok');
    const res = applyPourState(s, 0, 1, [N, N]);
    expect(res).not.toBe(null);
    expect(res?.teaBudBloomed).toBe('tea_bud');
    expect(res?.state.teaBudSlots).toEqual([null, null]);
  });
});

describe('K. canonical: active vs cleared, byte identity, post-bloom collapse (§62)', () => {
  it('active vs cleared keys differ with #bud: marker', () => {
    const cups: TeaId[][] = [[A, B], []];
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

  it('all-null bud row is byte-identical to G11 key', () => {
    const cups: TeaId[][] = [[A, B], [], [B, A, A, B]];
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

  it('after clear ordinary permutation equivalence is restored', () => {
    const cons = [N, N];
    const unlocked = canonicalPuzzleKey(
      { cups: [[A, B], []] as TeaId[][], floatingIngredients: [null, null], teaBudSlots: [null, null] as TeaBudSlot[] },
      cons,
    );
    const plain = canonicalPuzzleKey({ cups: [[A, B], []] as TeaId[][], floatingIngredients: [null, null] }, cons);
    expect(unlocked).toBe(plain);
    // Swapping whole decorated vessels stays canonical.
    const a = canonicalPuzzleKey(
      { cups: [[A, B], [A]] as TeaId[][], floatingIngredients: [null, null], teaBudSlots: ['tea_bud', null] as TeaBudSlot[] },
      cons,
    );
    const b = canonicalPuzzleKey(
      { cups: [[A], [A, B]] as TeaId[][], floatingIngredients: [null, null], teaBudSlots: [null, 'tea_bud'] as TeaBudSlot[] },
      cons,
    );
    expect(a).toBe(b);
  });
});

describe('L. solver threads bud identity (same tea before/after bloom are distinct)', () => {
  it('solver distinguishes pre/post bloom and finds bloom in optimal path', () => {
    // Tiny solvable: [A,A]+bud + [A,A] + empties -> needs emptying host then sorting.
    const cups: TeaId[][] = [[A, A], [A, A], [], []];
    const buds: TeaBudSlot[] = ['tea_bud', null, null, null];
    const cons = [N, N, N, N];
    const withBud = solvePuzzle(cups, { cupConstraints: cons, teaBudSlots: buds });
    expect(withBud.solvable).toBe(true);
    expect(withBud.truncated ?? false).toBe(false);
    expect(withBud.solution).toBeDefined();
    // Replay and verify bloom occurs and final buds cleared + win.
    let board = cups.map((c) => [...c]);
    let b = [...buds];
    let bloomed = 0;
    for (const step of withBud.solution ?? []) {
      if (step.kind !== 'pour') continue;
      const res = applyPourState({ cups: board, floatingIngredients: board.map(() => null), teaBudSlots: [...b] }, step.from, step.to, cons);
      expect(res).not.toBe(null);
      if (res?.teaBudBloomed === 'tea_bud') bloomed++;
      board = res?.state.cups as TeaId[][];
      b = [...(res?.state.teaBudSlots as TeaBudSlot[])];
    }
    expect(bloomed).toBe(1);
    expect(b.every((s) => s === null)).toBe(true);
    expect(isPuzzleWonState({ cups: board, floatingIngredients: board.map(() => null), teaBudSlots: [...b] }, cons)).toBe(true);
  });
});
