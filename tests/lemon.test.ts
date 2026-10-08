/**
 * Gauntlet 5 — floating lemon core matrix.
 *
 * Covers spec §76–83: pure state (A–E), movement (F–L), win (M–U),
 * canonicalization (V–Z), hand solver fixture (AA–AH), tea-sorted /
 * lemon-wrong deadlock, pruning proof, undo/restart, request validation.
 */
import { describe, expect, it } from 'vitest';
import {
  FLOATING_INGREDIENT_TYPES,
  clonePuzzleState,
  countFloatingIngredients,
  emptyFloatingIngredients,
  floatingIngredientIndex,
  normalizeFloatingIngredients,
  type CupConstraint,
  type FloatingIngredientSlot,
  type PuzzleState,
  type TeaId,
} from '../src/game/types';
import {
  applyPour,
  applyPourState,
  canonicalKey,
  canonicalPuzzleKey,
  canPourBetween,
  canPourState,
  cupEndStateSatisfied,
  floatingIngredientGoalsSatisfied,
  floatingIngredientHostSatisfied,
  isConstructiveMove,
  isConstructiveMoveState,
  isDeadlockedState,
  isPuzzleDeadlockedState,
  isPuzzleWonState,
  isWonState,
  listLegalMoves,
  listLegalMovesState,
  pourRejectCodeBetween,
  pourRejectCodeState,
} from '../src/game/logic/rules';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import { applySolution, applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import {
  countTastingCups,
  requestedFloatingIngredient,
  validateFloatingIngredientRequest,
  type GenerateRequest,
} from '../src/game/logic/generator';

const M: TeaId = 'matcha';
const SB: TeaId = 'sea_buckthorn';
const K: TeaId = 'karkade';
const L: TeaId = 'lavender';

const N: CupConstraint = { mode: 'normal' };
const SRC: CupConstraint = { mode: 'source-only' };
const SNK: CupConstraint = { mode: 'sink-only' };
const TASTING: CupConstraint = { mode: 'normal', capacity: 2, mustEndEmpty: true };
const TARGET_SB: CupConstraint = { mode: 'normal', targetTeaId: 'sea_buckthorn' };

const noIng = (n: number): FloatingIngredientSlot[] => emptyFloatingIngredients(n);

describe('A–E. pure dynamic state', () => {
  it('A. old board + no ingredients behaves exactly as legacy', () => {
    const cups: TeaId[][] = [[M, M], [K, K], [], []];
    const st = { cups, floatingIngredients: noIng(4) };
    for (let f = 0; f < 4; f++) {
      for (let t = 0; t < 4; t++) {
        if (f === t) continue;
        expect(canPourState(st, f, t)).toBe(canPourBetween(cups, f, t));
        expect(pourRejectCodeState(st, f, t)).toBe(pourRejectCodeBetween(cups, f, t));
      }
    }
    expect(listLegalMovesState(st, true)).toEqual(listLegalMoves(cups, true));
    expect(isPuzzleWonState(st)).toBe(isWonState(cups));
  });

  it('B. floatingIngredients normalize to cup count', () => {
    expect(normalizeFloatingIngredients(undefined, 3)).toEqual([null, null, null]);
    expect(normalizeFloatingIngredients(['lemon'], 3)).toEqual(['lemon', null, null]);
    expect(normalizeFloatingIngredients(['lemon', null, null, 'lemon'], 2)).toEqual(['lemon', null]);
    expect(emptyFloatingIngredients(0)).toEqual([]);
  });

  it('C. one lemon located exactly once', () => {
    const st = { cups: [[M], [SB]], floatingIngredients: [null, 'lemon' as const] };
    expect(floatingIngredientIndex(st, 'lemon')).toBe(1);
    expect(countFloatingIngredients(st)).toBe(1);
    expect(countFloatingIngredients({ floatingIngredients: noIng(3) })).toBe(0);
    expect(FLOATING_INGREDIENT_TYPES.lemon.targetTeaId).toBe('sea_buckthorn');
    expect(FLOATING_INGREDIENT_TYPES.lemon.nameRu).toBe('Лимон');
  });

  it('D. clone does not alias source arrays', () => {
    const src: PuzzleState = { cups: [[M]], floatingIngredients: ['lemon'], sinkingIngredients: [null], strainer: { present: false, attachedCupIndex: null, heldTea: null }, iceSlots: [null] };
    const c = clonePuzzleState(src);
    expect(c).toEqual(src);
    expect(c.cups).not.toBe(src.cups);
    expect(c.cups[0]).not.toBe(src.cups[0]);
    expect(c.floatingIngredients).not.toBe(src.floatingIngredients);
    c.cups[0]?.push(K);
    c.floatingIngredients[0] = null;
    expect(src.cups[0]).toEqual([M]);
    expect(src.floatingIngredients[0]).toBe('lemon');
  });

  it('E. duplicate lemon invalid in production validation (goals fail)', () => {
    const st = {
      cups: [[SB, SB, SB, SB], [SB, SB, SB, SB]],
      floatingIngredients: ['lemon', 'lemon'] as FloatingIngredientSlot[],
    };
    expect(floatingIngredientGoalsSatisfied(st, [N, N])).toBe(false);
    expect(isPuzzleWonState(st, [N, N])).toBe(false);
  });
});

describe('F–L. lemon movement semantics', () => {
  it('F. source with lemon -> legal target: lemon moves (atomic)', () => {
    const st = { cups: [[M, M, SB, SB], [SB]], floatingIngredients: ['lemon', null] as FloatingIngredientSlot[] };
    expect(canPourState(st, 0, 1, [N, N])).toBe(true);
    const res = applyPourState(st, 0, 1, [N, N]);
    expect(res).not.toBe(null);
    expect(res?.state.cups).toEqual([[M, M], [SB, SB, SB]]);
    expect(res?.state.floatingIngredients).toEqual([null, 'lemon']);
    expect(res?.floatingIngredientMoved).toBe('lemon');
    expect(res?.transferred).toBe(2);
    expect(res?.layer).toBe(SB);
  });

  it('G. source without lemon -> target with lemon: tea enters, lemon stays', () => {
    const st = { cups: [[SB, SB], [SB]], floatingIngredients: [null, 'lemon'] as FloatingIngredientSlot[] };
    expect(canPourState(st, 0, 1, [N, N])).toBe(true);
    const res = applyPourState(st, 0, 1, [N, N]);
    expect(res?.state.cups).toEqual([[], [SB, SB, SB]]);
    expect(res?.state.floatingIngredients).toEqual([null, 'lemon']);
    expect(res?.floatingIngredientMoved).toBe(undefined);
  });

  it('H. partial pour: lemon moves even if source keeps tea', () => {
    // AAAA+lemon -> AAA (1 free slot): one A transfers AND lemon transfers.
    const st = {
      cups: [[M, M, M, M], [M, M, M]],
      floatingIngredients: ['lemon', null] as FloatingIngredientSlot[],
    };
    expect(canPourState(st, 0, 1, [N, N])).toBe(true);
    const res = applyPourState(st, 0, 1, [N, N]);
    expect(res?.transferred).toBe(1);
    expect(res?.state.cups).toEqual([[M, M, M], [M, M, M, M]]);
    expect(res?.state.floatingIngredients).toEqual([null, 'lemon']);
    expect(res?.floatingIngredientMoved).toBe('lemon');
  });

  it('I/J. illegal color mismatch / full target: lemon unchanged', () => {
    const mismatch = {
      cups: [[M, M], [K]],
      floatingIngredients: ['lemon', null] as FloatingIngredientSlot[],
    };
    expect(pourRejectCodeState(mismatch, 0, 1, [N, N])).toBe('color-mismatch');
    expect(applyPourState(mismatch, 0, 1, [N, N])).toBe(null);
    expect(mismatch.floatingIngredients).toEqual(['lemon', null]);
    const full = {
      cups: [[M], [K, K, K, K]],
      floatingIngredients: ['lemon', null] as FloatingIngredientSlot[],
    };
    expect(pourRejectCodeState(full, 0, 1, [N, N])).toBe('target-full');
    expect(applyPourState(full, 0, 1, [N, N])).toBe(null);
    expect(full.floatingIngredients).toEqual(['lemon', null]);
  });

  it('K. source-sink illegal: lemon unchanged', () => {
    const st = { cups: [[M, M], []], floatingIngredients: ['lemon', null] as FloatingIngredientSlot[] };
    expect(pourRejectCodeState(st, 0, 1, [SNK, N])).toBe('source-sink-only');
    expect(applyPourState(st, 0, 1, [SNK, N])).toBe(null);
    expect(st.floatingIngredients).toEqual(['lemon', null]);
  });

  it('L. source lemon + occupied target slot: fail closed, no overwrite', () => {
    // Tea itself is legal here (M onto M with room) so the ingredient
    // collision — not color — decides the rejection.
    const st = {
      cups: [[M, M], [M]],
      floatingIngredients: ['lemon', 'lemon'] as FloatingIngredientSlot[],
    };
    expect(pourRejectCodeState(st, 0, 1, [N, N])).toBe('target-floating-occupied');
    expect(applyPourState(st, 0, 1, [N, N])).toBe(null);
    expect(st.floatingIngredients).toEqual(['lemon', 'lemon']);
  });
});

describe('M–U. lemon win matrix', () => {
  const solvedRest = (tea: TeaId): TeaId[][] => [[tea, tea, tea, tea]];
  const wonRest = [N];

  it('M. full sea_buckthorn + lemon + solved rest → win', () => {
    const st = {
      cups: [...solvedRest(SB), ...solvedRest(M)],
      floatingIngredients: ['lemon', null] as FloatingIngredientSlot[],
    };
    expect(isPuzzleWonState(st, [N, N])).toBe(true);
    expect(floatingIngredientHostSatisfied('lemon', [SB, SB, SB, SB], N)).toBe(true);
  });

  it('N/O/P. wrong tea / partial / mixed hosts → not win', () => {
    expect(floatingIngredientHostSatisfied('lemon', [M, M, M, M], N)).toBe(false);
    expect(floatingIngredientHostSatisfied('lemon', [SB, SB, SB], N)).toBe(false);
    expect(floatingIngredientHostSatisfied('lemon', [SB, SB, M, M], N)).toBe(false);
    // Lemon stranded on the full MATCHA cup while buckthorn sits complete
    // elsewhere: tea sorted, puzzle not won.
    expect(
      isPuzzleWonState(
        { cups: [[M, M, M, M], [SB, SB, SB, SB]], floatingIngredients: ['lemon', null] },
        [N, N],
      ),
    ).toBe(false);
    void wonRest;
  });

  it('Q/R/S. teapot / sink / tasting hosts → not win', () => {
    expect(floatingIngredientHostSatisfied('lemon', [SB, SB, SB, SB], SRC)).toBe(false);
    expect(floatingIngredientHostSatisfied('lemon', [SB, SB, SB, SB], SNK)).toBe(false);
    expect(floatingIngredientHostSatisfied('lemon', [SB, SB], TASTING)).toBe(false);
    expect(
      isPuzzleWonState(
        { cups: [[], [SB, SB, SB, SB]], floatingIngredients: [null, 'lemon'] },
        [SRC, N],
      ),
    ).toBe(true); // teapot empty + solved rest + lemon correct IS a win
    expect(
      isPuzzleWonState(
        { cups: [[SB], [SB, SB, SB, SB]], floatingIngredients: ['lemon', null] },
        [SRC, N],
      ),
    ).toBe(false); // lemon stranded on the teapot
  });

  it('T. named target cup + lemon → not win for G5 semantics', () => {
    expect(floatingIngredientHostSatisfied('lemon', [SB, SB, SB, SB], TARGET_SB)).toBe(false);
    expect(
      isPuzzleWonState(
        { cups: [[SB, SB, SB, SB]], floatingIngredients: ['lemon'] },
        [TARGET_SB],
      ),
    ).toBe(false);
  });

  it('U. no-ingredient old level → unchanged win behavior', () => {
    expect(isPuzzleWonState({ cups: [[M, M, M, M], []], floatingIngredients: [null, null] }, [N, N])).toBe(true);
    expect(floatingIngredientGoalsSatisfied({ cups: [[M]], floatingIngredients: [null] }, [N])).toBe(true);
  });
});

describe('V–Z. state canonicalization', () => {
  it('V. same tea, lemon on different-content cups → different keys', () => {
    const cons = [N, N];
    const a = { cups: [[M, M, M, M], []], floatingIngredients: ['lemon', null] as FloatingIngredientSlot[] };
    const b = { cups: [[M, M, M, M], []], floatingIngredients: [null, 'lemon'] as FloatingIngredientSlot[] };
    // Lemon on a full cup vs lemon on an empty cup: semantically different.
    expect(canonicalPuzzleKey(a, cons)).not.toBe(canonicalPuzzleKey(b, cons));
  });

  it('W. physical permutation of AAAA+lemon / empty → SAME key', () => {
    const cons = [N, N];
    const a = { cups: [[M, M, M, M], []], floatingIngredients: ['lemon', null] as FloatingIngredientSlot[] };
    const b = { cups: [[], [M, M, M, M]], floatingIngredients: [null, 'lemon'] as FloatingIngredientSlot[] };
    expect(canonicalPuzzleKey(a, cons)).toBe(canonicalPuzzleKey(b, cons));
  });

  it('X. lemon state vs no-lemon state → different key', () => {
    const cons = [N, N];
    const withLemon = { cups: [[M, M], []], floatingIngredients: ['lemon', null] as FloatingIngredientSlot[] };
    const without = { cups: [[M, M], []], floatingIngredients: noIng(2) };
    expect(canonicalPuzzleKey(withLemon, cons)).not.toBe(canonicalPuzzleKey(without, cons));
  });

  it('Y. constraint grouping still respected with markers', () => {
    const a = { cups: [[], []], floatingIngredients: ['lemon', null] as FloatingIngredientSlot[] };
    // Sink-empty+lemon vs normal-empty+lemon must not collapse (different groups).
    expect(canonicalPuzzleKey(a, [SNK, N])).not.toBe(canonicalPuzzleKey(a, [N, N]));
  });

  it('Z. old all-null state → legacy-equivalent key (byte-identical)', () => {
    const cups: TeaId[][] = [[M, K], [], [K, M, M, K]];
    const cons: CupConstraint[] = [N, SRC, N];
    const st = { cups, floatingIngredients: noIng(3) };
    expect(canonicalPuzzleKey(st, cons)).toBe(canonicalKey(cups, cons));
    expect(canonicalPuzzleKey(st)).toBe(canonicalKey(cups));
  });

  it('pruning proof: AAAA+lemon → empty identical normal is key-invariant', () => {
    // The relocation is (correctly) rejected at legality exactly like the
    // legacy complete-to-empty prune — and the hypothetical before/after
    // pair keys identically, which is WHY the prune stays sound: it only
    // permutes (contents+marker) pairs inside one signature group.
    const cons = [N, N];
    const before = { cups: [[M, M, M, M], []], floatingIngredients: ['lemon', null] as FloatingIngredientSlot[] };
    expect(applyPourState(before, 0, 1, cons)).toBe(null);
    const after = { cups: [[], [M, M, M, M]], floatingIngredients: [null, 'lemon'] as FloatingIngredientSlot[] };
    expect(canonicalPuzzleKey(after, cons)).toBe(canonicalPuzzleKey(before, cons));
    // ...and the move is therefore (correctly) non-constructive.
    expect(isConstructiveMoveState(before, 0, 1, cons)).toBe(false);
    expect(isConstructiveMove([[M, M, M, M], []], 0, 1, cons)).toBe(false);
  });

  it('lemon relocation across tea contents MUST stay constructive', () => {
    // Partial stack + lemon into an empty same-group cup changes the
    // partition (and the key): never pruned.
    const before = { cups: [[M, M, SB, SB], []], floatingIngredients: ['lemon', null] as FloatingIngredientSlot[] };
    const cons = [N, N];
    expect(isConstructiveMoveState(before, 0, 1, cons)).toBe(true);
    const res = applyPourState(before, 0, 1, cons);
    expect(canonicalPuzzleKey(res?.state as PuzzleState, cons)).not.toBe(canonicalPuzzleKey(before, cons));
  });
});

describe('AA–AH. hand fixture: lemon must travel', () => {
  // Compact 3-color fixture (found offline): the lemon rides out of cup 1,
  // then rides home on the finishing buckthorn group. minMoves 7.
  const cups: TeaId[][] = [
    [M, SB, SB, K],
    [K, M, M, SB],
    [SB, K, K, M],
    [],
    [],
  ];
  const slots: FloatingIngredientSlot[] = [null, 'lemon', null, null, null];
  const cons: CupConstraint[] = [N, N, N, N, N];

  it('AA/AB/AG. solver finds a non-truncated solution', () => {
    const solved = solvePuzzle(cups, { cupConstraints: cons, floatingIngredients: slots });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated).not.toBe(true);
    expect(solved.minMoves).toBe(7);
    expect((solved.solution ?? []).length).toBe(7);
  });

  it('AC/AD/AE/AF. solution moves lemon twice, finishes correct, wins', () => {
    const solved = solvePuzzle(cups, { cupConstraints: cons, floatingIngredients: slots });
    const final = applySolutionState({ cups, floatingIngredients: slots }, solved.solution ?? [], cons);
    expect(final).not.toBe(null);
    // Count actual relocations across the replay (not from initial host).
    let board = { cups: cups.map((c) => [...c]), floatingIngredients: [...slots] };
    let relocations = 0;
    for (const m of solved.solution ?? []) {
      if (m.kind !== 'pour') continue;
      const before = floatingIngredientIndex(board, 'lemon');
      const res = applyPourState(board, m.from, m.to, cons);
      expect(res).not.toBe(null);
      board = { cups: res?.state.cups ?? [], floatingIngredients: res?.state.floatingIngredients ?? [] };
      if (floatingIngredientIndex(board, 'lemon') !== before) relocations++;
    }
    expect(relocations).toBe(2);
    const host = floatingIngredientIndex(final as PuzzleState, 'lemon');
    expect((final?.cups[host] as TeaId[])).toEqual([SB, SB, SB, SB]);
    expect(isPuzzleWonState(final as PuzzleState, cons)).toBe(true);
  });

  it('tea-only replay still reproduces the tea board (lemon untracked)', () => {
    const solved = solvePuzzle(cups, { cupConstraints: cons, floatingIngredients: slots });
    const teaFinal = applySolution(cups, solved.solution ?? [], cons);
    expect(teaFinal).not.toBe(null);
    expect(isWonState(teaFinal as TeaId[][], cons)).toBe(true);
  });
});

describe('tea-sorted / lemon-wrong deadlock (integration)', () => {
  it('isWonState true but isPuzzleWonState false AND puzzle-deadlocked', () => {
    // All tea complete: MMMM, KKKK, SBSB... wait — construct: full matcha
    // + lemon, full karkade, full buckthorn WITHOUT lemon, no moves left.
    const cups: TeaId[][] = [
      [M, M, M, M],
      [K, K, K, K],
      [SB, SB, SB, SB],
    ];
    const cons: CupConstraint[] = [N, N, N];
    const st = { cups, floatingIngredients: ['lemon', null, null] as FloatingIngredientSlot[] };
    expect(isWonState(cups, cons)).toBe(true);
    expect(isPuzzleWonState(st, cons)).toBe(false);
    // Tea-only truth sees a victory (no deadlock); puzzle truth sees a
    // stuck wrong-lemon board. This contrast is the integration proof.
    expect(isDeadlockedState(cups, cons)).toBe(false);
    expect(isPuzzleDeadlockedState(st, cons)).toBe(true);
  });

  it('TeaSortLogic uses puzzle truth: won=false, deadlocked=true', () => {
    const logic = new TeaSortLogic(
      [[M, M, M, M], [K, K, K, K], [SB, SB, SB, SB]],
      [0, 0, 0],
      [N, N, N],
      ['lemon', null, null],
    );
    expect(logic.isWon()).toBe(false);
    expect(logic.isDeadlocked()).toBe(true);
  });
});

describe('undo / restart / move metadata with lemon', () => {
  it('pour carries lemon; Undo restores tea + lemon + count exactly', () => {
    const logic = new TeaSortLogic([[M, SB, SB], [SB]], [0, 0], [N, N], ['lemon', null]);
    const res = logic.makeMove(0, 1);
    expect(res).not.toBe(null);
    expect(res?.floatingIngredientMoved).toBe('lemon');
    expect(logic.cups[1]?.floatingIngredient).toBe('lemon');
    expect(logic.cups[0]?.floatingIngredient).toBe(null);
    expect(logic.cups[1]?.layers).toEqual([SB, SB, SB]);
    expect(logic.undo()).not.toBe(null);
    expect(logic.cups[0]?.layers).toEqual([M, SB, SB]);
    expect(logic.cups[0]?.floatingIngredient).toBe('lemon');
    expect(logic.cups[1]?.layers).toEqual([SB]);
    expect(logic.cups[1]?.floatingIngredient).toBe(null);
    expect(logic.movesCount).toBe(0);
    expect(logic.toState().floatingIngredients).toEqual(['lemon', null]);
  });

  it('restart restores initial cups + exact lemon host', () => {
    const logic = new TeaSortLogic([[M, SB, SB], [SB]], [0, 0], [N, N], ['lemon', null]);
    logic.makeMove(0, 1);
    logic.initFromState([[M, SB, SB], [SB]], [0, 0], [N, N], ['lemon', null]);
    expect(logic.cups[0]?.floatingIngredient).toBe('lemon');
    expect(logic.movesCount).toBe(0);
  });

  it('non-carrying pour exposes null metadata', () => {
    const logic = new TeaSortLogic([[M, M], [M]], [0, 0], [N, N], [null, 'lemon']);
    const res = logic.makeMove(0, 1);
    expect(res?.floatingIngredientMoved).toBe(null);
    expect(logic.toState().floatingIngredients).toEqual([null, 'lemon']);
  });
});

describe('request validation', () => {
  const base = {
    numColors: 4,
    colors: [M, SB, K, L],
    emptyCups: 2,
    hasMysteryLayer: false,
    phase: 'challenge',
  } as unknown as GenerateRequest;

  it('requestedFloatingIngredient defaults + countTasting unaffected', () => {
    expect(requestedFloatingIngredient(base)).toBe(undefined);
    expect(requestedFloatingIngredient({ ...base, floatingIngredient: 'lemon' })).toBe('lemon');
    expect(countTastingCups([N, N])).toBe(0);
  });

  it('lemon requires buckthorn palette; rejects sink/targets/tasting', () => {
    expect(() => validateFloatingIngredientRequest({ ...base, floatingIngredient: 'lemon' })).not.toThrow();
    expect(() =>
      validateFloatingIngredientRequest({
        ...base,
        colors: [M, K, L, 'milk_oolong'],
        floatingIngredient: 'lemon',
      }),
    ).toThrow(/palette/);
    expect(() =>
      validateFloatingIngredientRequest({ ...base, floatingIngredient: 'lemon', sinkOnlyCount: 1 }),
    ).toThrow(/sink/);
    expect(() =>
      validateFloatingIngredientRequest({ ...base, floatingIngredient: 'lemon', targetTeaIds: [SB, K] }),
    ).toThrow(/targets/);
    expect(() =>
      validateFloatingIngredientRequest({ ...base, floatingIngredient: 'lemon', tastingCupCount: 1 }),
    ).toThrow(/tasting/);
    // teapot + Mystery MAY coexist.
    expect(() =>
      validateFloatingIngredientRequest({
        ...base, floatingIngredient: 'lemon', sourceOnlyCount: 1, hasMysteryLayer: true,
      }),
    ).not.toThrow();
  });

  it('cupEndStateSatisfied still governs tea; host rule governs lemon', () => {
    expect(cupEndStateSatisfied([SB, SB, SB, SB], N)).toBe(true);
    expect(floatingIngredientHostSatisfied('lemon', [SB, SB, SB, SB], N)).toBe(true);
  });
});
