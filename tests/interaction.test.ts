/**
 * Gauntlet 8 — lemon + honey interaction matrix.
 *
 * Covers spec §27 split, §28 joint, §29 lemon-into-honey,
 * §30 honey-into-lemon, §14 collision matrix, §15 atomicity,
 * §16 capacity, §32 four keys, §33 permutation, §74-77 undo.
 * Uses EXACT APIs from src/game/types.ts, rules.ts, teaSortLogic.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  cupCapacity,
  emptyFloatingIngredients,
  emptySinkingIngredients,
  type CupConstraint,
  type FloatingIngredientSlot,
  type PuzzleState,
  type SinkingIngredientSlot,
  type TeaId,
} from '../src/game/types';
import {
  applyPourState,
  canonicalKey,
  canonicalPuzzleKey,
  canonicalPuzzleKeyNoHoney,
  canPourState,
  isPuzzleDeadlockedState,
  isPuzzleWonState,
  pourRejectCodeState,
} from '../src/game/logic/rules';
import { Cup, TeaSortLogic } from '../src/game/logic/teaSortLogic';

const M: TeaId = 'matcha';
const K: TeaId = 'karkade';
const BW: TeaId = 'buckwheat';

const N: CupConstraint = { mode: 'normal' };

const noFloat = (n: number): FloatingIngredientSlot[] => emptyFloatingIngredients(n);
const noSink = (n: number): SinkingIngredientSlot[] => emptySinkingIngredients(n);

describe('§27 split: cohost partial moves lemon only', () => {
  it('[B,A,A]+both --AA--> [A] gives [B]+honey and [A,A,A]+lemon', () => {
    const st = {
      cups: [[K, M, M], [M]] as TeaId[][],
      floatingIngredients: ['lemon', null] as FloatingIngredientSlot[],
      sinkingIngredients: ['honey', null] as SinkingIngredientSlot[],
    };
    const cons = [N, N];
    expect(canPourState(st, 0, 1, cons)).toBe(true);
    expect(pourRejectCodeState(st, 0, 1, cons)).toBe('ok');
    const beforeCups = st.cups.map((c) => [...c]);
    const res = applyPourState(st, 0, 1, cons);
    expect(res).not.toBe(null);
    expect(res?.transferred).toBe(2);
    expect(res?.received).toBe(2);
    expect(res?.layer).toBe(M);
    expect(res?.strained).toBe(false);
    expect(res?.state.cups).toEqual([[K], [M, M, M]]);
    expect(res?.state.floatingIngredients).toEqual([null, 'lemon']);
    expect(res?.state.sinkingIngredients).toEqual(['honey', null]);
    expect(res?.floatingIngredientMoved).toBe('lemon');
    expect(res?.sinkingIngredientMoved).toBe(undefined);
    // Pure: input not mutated.
    expect(st.cups).toEqual(beforeCups);
    expect(st.floatingIngredients).toEqual(['lemon', null]);
    expect(st.sinkingIngredients).toEqual(['honey', null]);
  });
});

describe('§28 joint: cohost emptying moves both', () => {
  it('[B]+both --B--> [B,B,B] gives [] and [B,B,B,B]+both', () => {
    const st = {
      cups: [[M], [M, M, M]] as TeaId[][],
      floatingIngredients: ['lemon', null] as FloatingIngredientSlot[],
      sinkingIngredients: ['honey', null] as SinkingIngredientSlot[],
    };
    const cons = [N, N];
    expect(canPourState(st, 0, 1, cons)).toBe(true);
    const res = applyPourState(st, 0, 1, cons);
    expect(res).not.toBe(null);
    expect(res?.transferred).toBe(1);
    expect(res?.received).toBe(1);
    expect(res?.layer).toBe(M);
    expect(res?.state.cups).toEqual([[], [M, M, M, M]]);
    expect(res?.state.floatingIngredients).toEqual([null, 'lemon']);
    expect(res?.state.sinkingIngredients).toEqual([null, 'honey']);
    expect(res?.floatingIngredientMoved).toBe('lemon');
    expect(res?.sinkingIngredientMoved).toBe('honey');
  });
});

describe('§29 lemon-only source into honey host', () => {
  it('A [A,A]+lemon --> B [A]+honey legal; B holds both after', () => {
    const st = {
      cups: [[M, M], [M]] as TeaId[][],
      floatingIngredients: ['lemon', null] as FloatingIngredientSlot[],
      sinkingIngredients: [null, 'honey'] as SinkingIngredientSlot[],
    };
    const cons = [N, N];
    expect(pourRejectCodeState(st, 0, 1, cons)).toBe('ok');
    expect(canPourState(st, 0, 1, cons)).toBe(true);
    const res = applyPourState(st, 0, 1, cons);
    expect(res).not.toBe(null);
    expect(res?.state.cups).toEqual([[], [M, M, M]]);
    // Coexistence: destination holds BOTH after inflow.
    expect(res?.state.floatingIngredients).toEqual([null, 'lemon']);
    expect(res?.state.sinkingIngredients).toEqual([null, 'honey']);
    expect(res?.floatingIngredientMoved).toBe('lemon');
    expect(res?.sinkingIngredientMoved).toBe(undefined);
  });
});

describe('§30 honey emptying into lemon host', () => {
  it('A [B]+honey --> B [B,B,B]+lemon legal; B holds both after', () => {
    const st = {
      cups: [[M], [M, M, M]] as TeaId[][],
      floatingIngredients: [null, 'lemon'] as FloatingIngredientSlot[],
      sinkingIngredients: ['honey', null] as SinkingIngredientSlot[],
    };
    const cons = [N, N];
    expect(pourRejectCodeState(st, 0, 1, cons)).toBe('ok');
    const res = applyPourState(st, 0, 1, cons);
    expect(res).not.toBe(null);
    expect(res?.state.cups).toEqual([[], [M, M, M, M]]);
    expect(res?.state.floatingIngredients).toEqual([null, 'lemon']);
    expect(res?.state.sinkingIngredients).toEqual([null, 'honey']);
    expect(res?.floatingIngredientMoved).toBe(undefined);
    expect(res?.sinkingIngredientMoved).toBe('honey');
  });
});

describe('§14 collision matrix', () => {
  const cons = [N, N];

  it('lemon→empty ok', () => {
    const st = {
      cups: [[K, M, M], []] as TeaId[][],
      floatingIngredients: ['lemon', null] as FloatingIngredientSlot[],
      sinkingIngredients: noSink(2),
    };
    expect(pourRejectCodeState(st, 0, 1, cons)).toBe('ok');
    const res = applyPourState(st, 0, 1, cons);
    expect(res).not.toBe(null);
    expect(res?.state.floatingIngredients).toEqual([null, 'lemon']);
    expect(res?.floatingIngredientMoved).toBe('lemon');
  });

  it('lemon→honey-host ok', () => {
    const st = {
      cups: [[K, M, M], [M]] as TeaId[][],
      floatingIngredients: ['lemon', null] as FloatingIngredientSlot[],
      sinkingIngredients: [null, 'honey'] as SinkingIngredientSlot[],
    };
    expect(pourRejectCodeState(st, 0, 1, cons)).toBe('ok');
    const res = applyPourState(st, 0, 1, cons);
    expect(res).not.toBe(null);
    expect(res?.state.floatingIngredients).toEqual([null, 'lemon']);
    expect(res?.state.sinkingIngredients).toEqual([null, 'honey']);
  });

  it('lemon→lemon-host reject null', () => {
    const st = {
      cups: [[K, M, M], [M]] as TeaId[][],
      floatingIngredients: ['lemon', 'lemon'] as FloatingIngredientSlot[],
      sinkingIngredients: noSink(2),
    };
    expect(pourRejectCodeState(st, 0, 1, cons)).toBe('target-floating-occupied');
    expect(canPourState(st, 0, 1, cons)).toBe(false);
    const before: PuzzleState = {
      cups: st.cups.map((c) => [...c]),
      floatingIngredients: [...st.floatingIngredients],
      sinkingIngredients: [...st.sinkingIngredients],
      strainer: { present: false, attachedCupIndex: null, heldTea: null },
    };
    expect(applyPourState(st, 0, 1, cons)).toBe(null);
    expect(st.cups).toEqual(before.cups);
    expect(st.floatingIngredients).toEqual(before.floatingIngredients);
    expect(st.sinkingIngredients).toEqual(before.sinkingIngredients);
  });

  it('honey-emptying→empty ok', () => {
    const st = {
      cups: [[M], []] as TeaId[][],
      floatingIngredients: noFloat(2),
      sinkingIngredients: ['honey', null] as SinkingIngredientSlot[],
    };
    expect(pourRejectCodeState(st, 0, 1, cons)).toBe('ok');
    const res = applyPourState(st, 0, 1, cons);
    expect(res).not.toBe(null);
    expect(res?.state.sinkingIngredients).toEqual([null, 'honey']);
    expect(res?.sinkingIngredientMoved).toBe('honey');
  });

  it('honey-emptying→lemon-host ok', () => {
    const st = {
      cups: [[M], [M, M]] as TeaId[][],
      floatingIngredients: [null, 'lemon'] as FloatingIngredientSlot[],
      sinkingIngredients: ['honey', null] as SinkingIngredientSlot[],
    };
    expect(pourRejectCodeState(st, 0, 1, cons)).toBe('ok');
    const res = applyPourState(st, 0, 1, cons);
    expect(res).not.toBe(null);
    expect(res?.state.floatingIngredients).toEqual([null, 'lemon']);
    expect(res?.state.sinkingIngredients).toEqual([null, 'honey']);
    expect(res?.sinkingIngredientMoved).toBe('honey');
  });

  it('honey-emptying→honey-host reject null', () => {
    const st = {
      cups: [[M], [M, M]] as TeaId[][],
      floatingIngredients: noFloat(2),
      sinkingIngredients: ['honey', 'honey'] as SinkingIngredientSlot[],
    };
    expect(pourRejectCodeState(st, 0, 1, cons)).toBe('target-sinking-occupied');
    expect(applyPourState(st, 0, 1, cons)).toBe(null);
    expect(st.sinkingIngredients).toEqual(['honey', 'honey']);
  });

  it('cohost partial→neither moves lemon only', () => {
    const st = {
      cups: [[K, M, M], [M]] as TeaId[][],
      floatingIngredients: ['lemon', null] as FloatingIngredientSlot[],
      sinkingIngredients: ['honey', null] as SinkingIngredientSlot[],
    };
    const res = applyPourState(st, 0, 1, cons);
    expect(res).not.toBe(null);
    expect(res?.state.cups).toEqual([[K], [M, M, M]]);
    expect(res?.floatingIngredientMoved).toBe('lemon');
    expect(res?.sinkingIngredientMoved).toBe(undefined);
    expect(res?.state.floatingIngredients).toEqual([null, 'lemon']);
    expect(res?.state.sinkingIngredients).toEqual(['honey', null]);
  });

  it('cohost emptying→neither moves both', () => {
    const st = {
      cups: [[M], [M, M, M]] as TeaId[][],
      floatingIngredients: ['lemon', null] as FloatingIngredientSlot[],
      sinkingIngredients: ['honey', null] as SinkingIngredientSlot[],
    };
    const res = applyPourState(st, 0, 1, cons);
    expect(res).not.toBe(null);
    expect(res?.floatingIngredientMoved).toBe('lemon');
    expect(res?.sinkingIngredientMoved).toBe('honey');
    expect(res?.state.floatingIngredients).toEqual([null, 'lemon']);
    expect(res?.state.sinkingIngredients).toEqual([null, 'honey']);
  });

  it('cohost emptying→lemon-host reject atomic (source still has BOTH)', () => {
    const st = {
      cups: [[M], [M, M]] as TeaId[][],
      floatingIngredients: ['lemon', 'lemon'] as FloatingIngredientSlot[],
      sinkingIngredients: ['honey', null] as SinkingIngredientSlot[],
    };
    expect(pourRejectCodeState(st, 0, 1, cons)).toBe('target-floating-occupied');
    expect(applyPourState(st, 0, 1, cons)).toBe(null);
    // Atomic: source still holds BOTH, destination untouched.
    expect(st.cups).toEqual([[M], [M, M]]);
    expect(st.floatingIngredients).toEqual(['lemon', 'lemon']);
    expect(st.sinkingIngredients).toEqual(['honey', null]);
  });

  it('cohost emptying→honey-host reject atomic (null)', () => {
    const st = {
      cups: [[M], [M, M]] as TeaId[][],
      floatingIngredients: ['lemon', null] as FloatingIngredientSlot[],
      sinkingIngredients: ['honey', 'honey'] as SinkingIngredientSlot[],
    };
    expect(pourRejectCodeState(st, 0, 1, cons)).toBe('target-sinking-occupied');
    expect(applyPourState(st, 0, 1, cons)).toBe(null);
    expect(st.cups).toEqual([[M], [M, M]]);
    expect(st.floatingIngredients).toEqual(['lemon', null]);
    expect(st.sinkingIngredients).toEqual(['honey', 'honey']);
  });
});

describe('§15 illegal atomicity (tea + lemon + honey + strainer unchanged)', () => {
  it('failed pour leaves everything exactly unchanged; attached tool untouched', () => {
    const cups: TeaId[][] = [[M], [M, M], [K, K]];
    const floating: FloatingIngredientSlot[] = ['lemon', 'lemon', null];
    const sinking: SinkingIngredientSlot[] = ['honey', null, null];
    const strainer = { present: true, attachedCupIndex: 2, heldTea: null as TeaId | null };
    const st = {
      cups: cups.map((c) => [...c]),
      floatingIngredients: [...floating],
      sinkingIngredients: [...sinking],
      strainer: { ...strainer },
    };
    const cons3: CupConstraint[] = [N, N, N];
    // 0→1 is lemon-collision (cohost emptying into lemon host).
    expect(pourRejectCodeState(st, 0, 1, cons3)).toBe('target-floating-occupied');
    expect(applyPourState(st, 0, 1, cons3)).toBe(null);
    expect(st.cups).toEqual(cups);
    expect(st.floatingIngredients).toEqual(floating);
    expect(st.sinkingIngredients).toEqual(sinking);
    expect(st.strainer).toEqual(strainer);
  });
});

describe('§16 capacity: ingredients are weightless', () => {
  it('4 tea + lemon + honey still capacity 4; overfill rejected', () => {
    expect(cupCapacity(N)).toBe(4);
    const cup = new Cup(0, [M, M, M, M], 0, { mode: 'normal' }, 'lemon', 'honey');
    expect(cup.capacity).toBe(4);
    expect(cup.isFull).toBe(true);
    const st = {
      cups: [[M], [M, M, M, M]] as TeaId[][],
      floatingIngredients: [null, 'lemon'] as FloatingIngredientSlot[],
      sinkingIngredients: [null, 'honey'] as SinkingIngredientSlot[],
    };
    const cons = [N, N];
    expect(pourRejectCodeState(st, 0, 1, cons)).toBe('target-full');
    expect(canPourState(st, 0, 1, cons)).toBe(false);
    expect(applyPourState(st, 0, 1, cons)).toBe(null);
    expect(st.cups).toEqual([[M], [M, M, M, M]]);
    void BW;
  });
});

describe('§32 four states, same tea → four distinct keys', () => {
  it('none / lemon / honey / both give 4 distinct keys', () => {
    const cups: TeaId[][] = [[M, M], []];
    const cons = [N, N];
    const kNone = canonicalPuzzleKey(
      { cups, floatingIngredients: [null, null], sinkingIngredients: [null, null] },
      cons,
    );
    const kLemon = canonicalPuzzleKey(
      { cups, floatingIngredients: ['lemon', null], sinkingIngredients: [null, null] },
      cons,
    );
    const kHoney = canonicalPuzzleKey(
      { cups, floatingIngredients: [null, null], sinkingIngredients: ['honey', null] },
      cons,
    );
    const kBoth = canonicalPuzzleKey(
      { cups, floatingIngredients: ['lemon', null], sinkingIngredients: ['honey', null] },
      cons,
    );
    expect(new Set([kNone, kLemon, kHoney, kBoth]).size).toBe(4);
  });

  it('no-honey-lemon keys stay byte-identical to legacy', () => {
    const cups: TeaId[][] = [[M, K], [], [K, M, M, K]];
    const cons: CupConstraint[] = [N, { mode: 'normal' }, N];
    const st = { cups, floatingIngredients: [null, null, null] as FloatingIngredientSlot[] };
    expect(canonicalPuzzleKey(st, cons)).toBe(canonicalPuzzleKeyNoHoney(st, cons));
    expect(canonicalPuzzleKey(st, cons)).toBe(canonicalKey(cups, cons));
    expect(canonicalPuzzleKey(st)).toBe(canonicalKey(cups));
  });
});

describe('§33 permutation invariance', () => {
  it('swapped (contents+markers) gives same key; different-content honey differs', () => {
    const cons = [N, N];
    const a = {
      cups: [[M, M], [K, K]] as TeaId[][],
      floatingIngredients: ['lemon', null] as FloatingIngredientSlot[],
      sinkingIngredients: ['honey', null] as SinkingIngredientSlot[],
    };
    const b = {
      cups: [[K, K], [M, M]] as TeaId[][],
      floatingIngredients: [null, 'lemon'] as FloatingIngredientSlot[],
      sinkingIngredients: [null, 'honey'] as SinkingIngredientSlot[],
    };
    expect(canonicalPuzzleKey(a, cons)).toBe(canonicalPuzzleKey(b, cons));

    const c = {
      cups: [[M, M], [K, K]] as TeaId[][],
      floatingIngredients: [null, null] as FloatingIngredientSlot[],
      sinkingIngredients: ['honey', null] as SinkingIngredientSlot[],
    };
    const d = {
      cups: [[M, M], [K, K]] as TeaId[][],
      floatingIngredients: [null, null] as FloatingIngredientSlot[],
      sinkingIngredients: [null, 'honey'] as SinkingIngredientSlot[],
    };
    expect(canonicalPuzzleKey(c, cons)).not.toBe(canonicalPuzzleKey(d, cons));
  });
});

describe('§74 split undo timeline (logic)', () => {
  it('[B,A,A]+both --> [A] then undo restores exact tea + both slots', () => {
    const logic = new TeaSortLogic(
      [[K, M, M], [M]],
      [0, 0],
      [N, N],
      ['lemon', null],
      undefined,
      ['honey', null],
    );
    const res = logic.makeMove(0, 1);
    expect(res).not.toBe(null);
    expect(res?.floatingIngredientMoved).toBe('lemon');
    expect(res?.sinkingIngredientMoved).toBe(null);
    expect(logic.cups[0]?.layers).toEqual([K]);
    expect(logic.cups[0]?.sinkingIngredient).toBe('honey');
    expect(logic.cups[0]?.floatingIngredient).toBe(null);
    expect(logic.cups[1]?.layers).toEqual([M, M, M]);
    expect(logic.cups[1]?.floatingIngredient).toBe('lemon');
    expect(logic.movesCount).toBe(1);
    expect(logic.undo()).not.toBe(null);
    expect(logic.cups[0]?.layers).toEqual([K, M, M]);
    expect(logic.cups[0]?.floatingIngredient).toBe('lemon');
    expect(logic.cups[0]?.sinkingIngredient).toBe('honey');
    expect(logic.cups[1]?.layers).toEqual([M]);
    expect(logic.cups[1]?.floatingIngredient).toBe(null);
    expect(logic.toState().sinkingIngredients).toEqual(['honey', null]);
    expect(logic.movesCount).toBe(0);
  });
});

describe('§75 joint undo (logic)', () => {
  it('[B]+both --> [B,B,B] then undo restores both to source', () => {
    const logic = new TeaSortLogic(
      [[M], [M, M, M]],
      [0, 0],
      [N, N],
      ['lemon', null],
      undefined,
      ['honey', null],
    );
    const res = logic.makeMove(0, 1);
    expect(res?.floatingIngredientMoved).toBe('lemon');
    expect(res?.sinkingIngredientMoved).toBe('honey');
    expect(logic.toState().cups).toEqual([[], [M, M, M, M]]);
    expect(logic.toState().floatingIngredients).toEqual([null, 'lemon']);
    expect(logic.toState().sinkingIngredients).toEqual([null, 'honey']);
    expect(logic.undo()).not.toBe(null);
    expect(logic.toState().cups).toEqual([[M], [M, M, M]]);
    expect(logic.toState().floatingIngredients).toEqual(['lemon', null]);
    expect(logic.toState().sinkingIngredients).toEqual(['honey', null]);
    expect(logic.movesCount).toBe(0);
  });
});

describe('§76 multi-move with undo + §77 restart', () => {
  const initCups: TeaId[][] = [[K, M, M], [M], [M, M], []];
  const initFloat: FloatingIngredientSlot[] = ['lemon', null, null, null];
  const initSink: SinkingIngredientSlot[] = [null, 'honey', null, null];
  const cons: CupConstraint[] = [N, N, N, N];

  it('§76 separate → cohost → split → later honey move; undo step-by-step exact', () => {
    const logic = new TeaSortLogic(initCups, [0, 0, 0, 0], cons, initFloat, undefined, initSink);
    // 1. separate hosts → cohost: lemon rides onto the honey host.
    const r1 = logic.makeMove(0, 1);
    expect(r1?.floatingIngredientMoved).toBe('lemon');
    expect(r1?.sinkingIngredientMoved).toBe(null);
    expect(logic.toState().floatingIngredients).toEqual([null, 'lemon', null, null]);
    expect(logic.toState().sinkingIngredients).toEqual([null, 'honey', null, null]);
    expect(logic.cups[1]?.layers).toEqual([M, M, M]);
    // 2. split: cohost pours partial, lemon moves, honey stays.
    const r2 = logic.makeMove(1, 2);
    expect(r2?.floatingIngredientMoved).toBe('lemon');
    expect(r2?.sinkingIngredientMoved).toBe(null);
    expect(logic.toState().cups).toEqual([[K], [M], [M, M, M, M], []]);
    expect(logic.toState().floatingIngredients).toEqual([null, null, 'lemon', null]);
    expect(logic.toState().sinkingIngredients).toEqual([null, 'honey', null, null]);
    // 3. later honey move: honey host empties, honey relocates.
    const r3 = logic.makeMove(1, 3);
    expect(r3?.floatingIngredientMoved).toBe(null);
    expect(r3?.sinkingIngredientMoved).toBe('honey');
    expect(logic.toState().cups).toEqual([[K], [], [M, M, M, M], [M]]);
    expect(logic.toState().sinkingIngredients).toEqual([null, null, null, 'honey']);
    expect(logic.movesCount).toBe(3);
    // Undo step-by-step to initial exact.
    expect(logic.undo()).not.toBe(null);
    expect(logic.toState().cups).toEqual([[K], [M], [M, M, M, M], []]);
    expect(logic.toState().sinkingIngredients).toEqual([null, 'honey', null, null]);
    expect(logic.undo()).not.toBe(null);
    expect(logic.toState().cups).toEqual([[K], [M, M, M], [M, M], []]);
    expect(logic.toState().floatingIngredients).toEqual([null, 'lemon', null, null]);
    expect(logic.undo()).not.toBe(null);
    expect(logic.toState().cups).toEqual(initCups);
    expect(logic.toState().floatingIngredients).toEqual(initFloat);
    expect(logic.toState().sinkingIngredients).toEqual(initSink);
    expect(logic.movesCount).toBe(0);
  });

  it('§77 restart via initFromState restores initial hosts + moves 0', () => {
    const logic = new TeaSortLogic(initCups, [0, 0, 0, 0], cons, initFloat, undefined, initSink);
    logic.makeMove(0, 1);
    logic.makeMove(1, 2);
    expect(logic.movesCount).toBe(2);
    logic.initFromState(initCups, [0, 0, 0, 0], cons, initFloat, undefined, initSink);
    expect(logic.toState().cups).toEqual(initCups);
    expect(logic.toState().floatingIngredients).toEqual(initFloat);
    expect(logic.toState().sinkingIngredients).toEqual(initSink);
    expect(logic.movesCount).toBe(0);
  });
});

describe('win needs tea + lemon + honey (+ empty hold)', () => {
  it('tea sorted but honey on wrong tea is not won; puzzle deadlock is action-based', () => {
    const cups: TeaId[][] = [[M, M, M, M], [BW, BW, BW, BW], []];
    const cons: CupConstraint[] = [N, N, N];
    const st = {
      cups,
      floatingIngredients: [null, 'lemon', null] as FloatingIngredientSlot[],
      sinkingIngredients: ['honey', null, null] as SinkingIngredientSlot[],
    };
    // Tea alone is won, but lemon on buckwheat + honey on matcha both fail.
    expect(isPuzzleWonState(st, cons)).toBe(false);
    expect(isPuzzleDeadlockedState(st, cons)).toBe(true);
    void isPuzzleWonState;
  });
});
