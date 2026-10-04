/**
 * Gauntlet 7 — sinking honey core matrix.
 *
 * Covers spec §26 rule matrix A–H, §93–94 win matrix, tea-sorted /
 * honey-wrong deadlock, undo/restart. Uses EXACT APIs from
 * src/game/types.ts, rules.ts and teaSortLogic.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  SINKING_INGREDIENT_TYPES,
  clonePuzzleState,
  countSinkingIngredients,
  emptyFloatingIngredients,
  emptySinkingIngredients,
  normalizeSinkingIngredients,
  sinkingIngredientIndex,
  type CupConstraint,
  type FloatingIngredientSlot,
  type PuzzleState,
  type SinkingIngredientId,
  type SinkingIngredientSlot,
  type TeaId,
} from '../src/game/types';
import {
  applyPour,
  applyPourState,
  canonicalKey,
  canonicalPuzzleKey,
  canonicalPuzzleKeyNoHoney,
  canPourBetween,
  canPourState,
  isDeadlockedState,
  isPuzzleDeadlockedState,
  isPuzzleWonState,
  isWonState,
  listLegalMoves,
  listLegalMovesState,
  pourCountBetween,
  pourCountState,
  pourRejectCodeBetween,
  pourRejectCodeState,
  sinkingIngredientGoalsSatisfied,
  sinkingIngredientHostSatisfied,
} from '../src/game/logic/rules';
import { Cup, TeaSortLogic } from '../src/game/logic/teaSortLogic';

const M: TeaId = 'matcha';
const BW: TeaId = 'buckwheat';
const K: TeaId = 'karkade';

const N: CupConstraint = { mode: 'normal' };
const SRC: CupConstraint = { mode: 'source-only' };
const SNK: CupConstraint = { mode: 'sink-only' };
const TASTING: CupConstraint = { mode: 'normal', capacity: 2, mustEndEmpty: true };
const TARGET_BW: CupConstraint = { mode: 'normal', targetTeaId: 'buckwheat' };

const noSink = (n: number): SinkingIngredientSlot[] => emptySinkingIngredients(n);
const noFloat = (n: number): FloatingIngredientSlot[] => emptyFloatingIngredients(n);

describe('pure sinking state', () => {
  it('SINKING_INGREDIENT_TYPES.honey metadata + helpers', () => {
    expect(SINKING_INGREDIENT_TYPES.honey.id).toBe('honey');
    expect(SINKING_INGREDIENT_TYPES.honey.nameRu).toBe('Мёд');
    expect(SINKING_INGREDIENT_TYPES.honey.targetTeaId).toBe('buckwheat');
    expect(noSink(3)).toEqual([null, null, null]);
    expect(normalizeSinkingIngredients(undefined, 2)).toEqual([null, null]);
    expect(normalizeSinkingIngredients(['honey'], 3)).toEqual(['honey', null, null]);
    expect(normalizeSinkingIngredients(['honey', null, null, 'honey'], 2)).toEqual(['honey', null]);
    const st = { sinkingIngredients: ['honey', null] as SinkingIngredientSlot[] };
    expect(sinkingIngredientIndex(st, 'honey')).toBe(0);
    expect(countSinkingIngredients(st)).toBe(1);
    expect(countSinkingIngredients({ sinkingIngredients: noSink(2) })).toBe(0);
  });

  it('clonePuzzleState does not alias sinking arrays', () => {
    const src: PuzzleState = {
      cups: [[M]],
      floatingIngredients: [null],
      sinkingIngredients: ['honey'],
      strainer: { present: false, attachedCupIndex: null, heldTea: null },
    };
    const c = clonePuzzleState(src);
    expect(c).toEqual(src);
    expect(c.cups).not.toBe(src.cups);
    expect(c.sinkingIngredients).not.toBe(src.sinkingIngredients);
    c.sinkingIngredients[0] = null;
    expect(src.sinkingIngredients[0]).toBe('honey');
  });

  it('Cup carries sinking slot', () => {
    const cup = new Cup(0, [M, M], 0, { mode: 'normal' }, null, 'honey');
    expect(cup.sinkingIngredient).toBe('honey');
    expect(cup.floatingIngredient).toBe(null);
  });
});

describe('A–H. honey movement semantics (§26)', () => {
  it('A. partial outflow stays ([B,A,A]+honey --AA--> [A])', () => {
    const st = {
      cups: [[BW, M, M], [M]],
      floatingIngredients: noFloat(2),
      sinkingIngredients: ['honey', null] as SinkingIngredientSlot[],
    };
    const cons = [N, N];
    expect(canPourState(st, 0, 1, cons)).toBe(true);
    expect(pourRejectCodeState(st, 0, 1, cons)).toBe('ok');
    const res = applyPourState(st, 0, 1, cons);
    expect(res).not.toBe(null);
    expect(res?.transferred).toBe(2);
    expect(res?.layer).toBe(M);
    expect(res?.state.cups).toEqual([[BW], [M, M, M]]);
    expect(res?.state.sinkingIngredients).toEqual(['honey', null]);
    expect(res?.sinkingIngredientMoved).toBe(undefined);
    // Input not mutated (pure transition).
    expect(st.sinkingIngredients).toEqual(['honey', null]);
  });

  it('B. emptying outflow moves ([B]+honey --B--> [B,B,B])', () => {
    const st = {
      cups: [[M], [M, M, M]],
      floatingIngredients: noFloat(2),
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
    expect(res?.state.sinkingIngredients).toEqual([null, 'honey']);
    expect(res?.sinkingIngredientMoved).toBe('honey');
  });

  it('C. inflow keeps ([A] --> [X+honey] compatible)', () => {
    const st = {
      cups: [[M, M], [M]],
      floatingIngredients: noFloat(2),
      sinkingIngredients: [null, 'honey'] as SinkingIngredientSlot[],
    };
    const cons = [N, N];
    expect(canPourState(st, 0, 1, cons)).toBe(true);
    const res = applyPourState(st, 0, 1, cons);
    expect(res).not.toBe(null);
    expect(res?.transferred).toBe(2);
    expect(res?.state.cups).toEqual([[], [M, M, M]]);
    expect(res?.state.sinkingIngredients).toEqual([null, 'honey']);
    expect(res?.sinkingIngredientMoved).toBe(undefined);
  });

  it('D. illegal color mismatch: null, honey unchanged', () => {
    const st = {
      cups: [[M, M], [K]],
      floatingIngredients: noFloat(2),
      sinkingIngredients: ['honey', null] as SinkingIngredientSlot[],
    };
    const cons = [N, N];
    expect(pourRejectCodeState(st, 0, 1, cons)).toBe('color-mismatch');
    expect(canPourState(st, 0, 1, cons)).toBe(false);
    expect(applyPourState(st, 0, 1, cons)).toBe(null);
    expect(st.sinkingIngredients).toEqual(['honey', null]);
    expect(st.cups).toEqual([[M, M], [K]]);
  });

  it('E. full dest: null, honey unchanged', () => {
    const st = {
      cups: [[M], [K, K, K, K]],
      floatingIngredients: noFloat(2),
      sinkingIngredients: ['honey', null] as SinkingIngredientSlot[],
    };
    const cons = [N, N];
    expect(pourRejectCodeState(st, 0, 1, cons)).toBe('target-full');
    expect(applyPourState(st, 0, 1, cons)).toBe(null);
    expect(st.sinkingIngredients).toEqual(['honey', null]);
  });

  it('F. emptying into honey-occupied: target-sinking-occupied, null, no mutation', () => {
    const st = {
      cups: [[M], [M, M]],
      floatingIngredients: noFloat(2),
      sinkingIngredients: ['honey', 'honey'] as SinkingIngredientSlot[],
    };
    const cons = [N, N];
    expect(pourRejectCodeState(st, 0, 1, cons)).toBe('target-sinking-occupied');
    expect(canPourState(st, 0, 1, cons)).toBe(false);
    const beforeCups = st.cups.map((c) => [...c]);
    expect(applyPourState(st, 0, 1, cons)).toBe(null);
    expect(st.sinkingIngredients).toEqual(['honey', 'honey']);
    expect(st.cups).toEqual(beforeCups);
  });

  it('G. no-honey legacy identical (pour/count/key unchanged)', () => {
    const cups: TeaId[][] = [[M, M], [K, K], [], []];
    const st = { cups, floatingIngredients: noFloat(4) };
    for (let f = 0; f < 4; f++) {
      for (let t = 0; t < 4; t++) {
        if (f === t) continue;
        expect(canPourState(st, f, t)).toBe(canPourBetween(cups, f, t));
        expect(pourRejectCodeState(st, f, t)).toBe(pourRejectCodeBetween(cups, f, t));
        expect(pourCountState(st, f, t)).toBe(pourCountBetween(cups, f, t));
      }
    }
    expect(listLegalMovesState(st, true)).toEqual(listLegalMoves(cups, true));
    expect(listLegalMovesState(st, false)).toEqual(listLegalMoves(cups, false));
    expect(isPuzzleWonState(st)).toBe(isWonState(cups));
    // Canonical identity: honey-free key equals pre-honey helpers.
    expect(canonicalPuzzleKey(st)).toBe(canonicalPuzzleKeyNoHoney(st));
    expect(canonicalPuzzleKey(st)).toBe(canonicalKey(cups));
    const cons: CupConstraint[] = [N, SRC, N, N];
    expect(canonicalPuzzleKey(st, cons)).toBe(canonicalPuzzleKeyNoHoney(st, cons));
    expect(canonicalPuzzleKey(st, cons)).toBe(canonicalKey(cups, cons));
    // Tea transfer identical to legacy applyPour.
    const st2 = { cups: [[M, M], [M]], floatingIngredients: noFloat(2) };
    const legacy = applyPour([[M, M], [M]], 0, 1);
    const viaState = applyPourState(st2, 0, 1);
    expect(legacy?.cups).toEqual(viaState?.state.cups);
    expect(legacy?.transferred).toBe(viaState?.transferred);
  });

  it('H. teapot honey follows same emptying rule', () => {
    const cons = [SRC, N, N];
    const start = {
      cups: [[K, M, M, M], [], []] as TeaId[][],
      floatingIngredients: noFloat(3),
      sinkingIngredients: ['honey', null, null] as SinkingIngredientSlot[],
    };
    // First outflow leaves tea behind → honey stays.
    expect(pourRejectCodeState(start, 0, 1, cons)).toBe('ok');
    const first = applyPourState(start, 0, 1, cons);
    expect(first).not.toBe(null);
    expect(first?.transferred).toBe(3);
    expect(first?.state.cups).toEqual([[K], [M, M, M], []]);
    expect(first?.state.sinkingIngredients).toEqual(['honey', null, null]);
    expect(first?.sinkingIngredientMoved).toBe(undefined);
    // Final outflow empties the teapot → honey moves.
    const second = applyPourState(first?.state as PuzzleState, 0, 2, cons);
    expect(second).not.toBe(null);
    expect(second?.transferred).toBe(1);
    expect(second?.layer).toBe(K);
    expect(second?.state.cups).toEqual([[], [M, M, M], [K]]);
    expect(second?.state.sinkingIngredients).toEqual([null, null, 'honey']);
    expect(second?.sinkingIngredientMoved).toBe('honey');
  });
});

describe('honey win matrix (§93–94)', () => {
  it('TRUE only buckwheat×4 standard normal +honey', () => {
    const cups: TeaId[][] = [[BW, BW, BW, BW], []];
    const st = {
      cups,
      floatingIngredients: noFloat(2),
      sinkingIngredients: ['honey', null] as SinkingIngredientSlot[],
    };
    const cons = [N, N];
    expect(sinkingIngredientHostSatisfied('honey', [BW, BW, BW, BW], N)).toBe(true);
    expect(sinkingIngredientGoalsSatisfied(st, cons)).toBe(true);
    expect(isPuzzleWonState(st, cons)).toBe(true);
  });

  it('FALSE: ×3, mixed ×4, wrong tea ×4', () => {
    expect(sinkingIngredientHostSatisfied('honey', [BW, BW, BW], N)).toBe(false);
    expect(
      isPuzzleWonState(
        { cups: [[BW, BW, BW]], floatingIngredients: noFloat(1), sinkingIngredients: ['honey'] },
        [N],
      ),
    ).toBe(false);
    expect(sinkingIngredientHostSatisfied('honey', [BW, BW, M, M], N)).toBe(false);
    expect(
      isPuzzleWonState(
        {
          cups: [[BW, BW, M, M]],
          floatingIngredients: noFloat(1),
          sinkingIngredients: ['honey'],
        },
        [N],
      ),
    ).toBe(false);
    expect(sinkingIngredientHostSatisfied('honey', [M, M, M, M], N)).toBe(false);
    expect(
      isPuzzleWonState(
        { cups: [[M, M, M, M]], floatingIngredients: noFloat(1), sinkingIngredients: ['honey'] },
        [N],
      ),
    ).toBe(false);
  });

  it('FALSE: empty +honey is malformed fail-closed', () => {
    expect(sinkingIngredientHostSatisfied('honey', [], N)).toBe(false);
    const st = {
      cups: [[]] as TeaId[][],
      floatingIngredients: noFloat(1),
      sinkingIngredients: ['honey'] as SinkingIngredientSlot[],
    };
    expect(sinkingIngredientGoalsSatisfied(st, [N])).toBe(false);
    expect(isPuzzleWonState(st, [N])).toBe(false);
  });

  it('FALSE: teapot / sink / tasting hosts', () => {
    expect(sinkingIngredientHostSatisfied('honey', [BW, BW, BW, BW], SRC)).toBe(false);
    expect(sinkingIngredientHostSatisfied('honey', [BW, BW, BW, BW], SNK)).toBe(false);
    expect(sinkingIngredientHostSatisfied('honey', [BW, BW], TASTING)).toBe(false);
    expect(
      isPuzzleWonState(
        { cups: [[BW, BW, BW, BW]], floatingIngredients: noFloat(1), sinkingIngredients: ['honey'] },
        [SRC],
      ),
    ).toBe(false);
    expect(
      isPuzzleWonState(
        { cups: [[BW, BW, BW, BW]], floatingIngredients: noFloat(1), sinkingIngredients: ['honey'] },
        [SNK],
      ),
    ).toBe(false);
    expect(
      isPuzzleWonState(
        { cups: [[BW, BW]], floatingIngredients: noFloat(1), sinkingIngredients: ['honey'] },
        [TASTING],
      ),
    ).toBe(false);
  });

  it('FALSE: target cup, unknown id, duplicate honey', () => {
    expect(sinkingIngredientHostSatisfied('honey', [BW, BW, BW, BW], TARGET_BW)).toBe(false);
    expect(
      isPuzzleWonState(
        { cups: [[BW, BW, BW, BW]], floatingIngredients: noFloat(1), sinkingIngredients: ['honey'] },
        [TARGET_BW],
      ),
    ).toBe(false);
    const caramel = 'caramel' as unknown as SinkingIngredientId;
    expect(sinkingIngredientHostSatisfied(caramel, [BW, BW, BW, BW], N)).toBe(false);
    expect(
      sinkingIngredientGoalsSatisfied(
        {
          cups: [[BW, BW, BW, BW]],
          floatingIngredients: noFloat(1),
          sinkingIngredients: [caramel as unknown as SinkingIngredientSlot],
        },
        [N],
      ),
    ).toBe(false);
    const dup = {
      cups: [[BW, BW, BW, BW], [BW, BW, BW, BW]],
      floatingIngredients: noFloat(2),
      sinkingIngredients: ['honey', 'honey'] as SinkingIngredientSlot[],
    };
    expect(sinkingIngredientGoalsSatisfied(dup, [N, N])).toBe(false);
    expect(isPuzzleWonState(dup, [N, N])).toBe(false);
  });
});

describe('tea-sorted / honey-wrong deadlock', () => {
  it('isWonState true but isPuzzleWonState false AND puzzle-deadlocked', () => {
    const cups: TeaId[][] = [[M, M, M, M], [BW, BW, BW, BW], []];
    const cons: CupConstraint[] = [N, N, N];
    const st = {
      cups,
      floatingIngredients: noFloat(3),
      sinkingIngredients: ['honey', null, null] as SinkingIngredientSlot[],
    };
    expect(isWonState(cups, cons)).toBe(true);
    expect(isPuzzleWonState(st, cons)).toBe(false);
    expect(isDeadlockedState(cups, cons)).toBe(false);
    expect(isPuzzleDeadlockedState(st, cons)).toBe(true);
  });

  it('TeaSortLogic uses puzzle truth: won=false, deadlocked=true', () => {
    const logic = new TeaSortLogic(
      [[M, M, M, M], [BW, BW, BW, BW], []],
      [0, 0, 0],
      [N, N, N],
      undefined,
      undefined,
      ['honey', null, null],
    );
    expect(logic.isWon()).toBe(false);
    expect(logic.isDeadlocked()).toBe(true);
  });
});

describe('undo / restart with honey', () => {
  it('partial outflow → undo restores host + layers', () => {
    const logic = new TeaSortLogic(
      [[BW, M, M], [M]],
      [0, 0],
      [N, N],
      undefined,
      undefined,
      ['honey', null],
    );
    const res = logic.makeMove(0, 1);
    expect(res).not.toBe(null);
    expect(res?.sinkingIngredientMoved).toBe(null);
    expect(logic.cups[0]?.layers).toEqual([BW]);
    expect(logic.cups[0]?.sinkingIngredient).toBe('honey');
    expect(logic.cups[1]?.layers).toEqual([M, M, M]);
    expect(logic.movesCount).toBe(1);
    expect(logic.undo()).not.toBe(null);
    expect(logic.cups[0]?.layers).toEqual([BW, M, M]);
    expect(logic.cups[0]?.sinkingIngredient).toBe('honey');
    expect(logic.cups[1]?.layers).toEqual([M]);
    expect(logic.cups[1]?.sinkingIngredient).toBe(null);
    expect(logic.movesCount).toBe(0);
    expect(logic.toState().sinkingIngredients).toEqual(['honey', null]);
  });

  it('emptying outflow → undo restores honey to source', () => {
    const logic = new TeaSortLogic(
      [[M], [M, M, M]],
      [0, 0],
      [N, N],
      undefined,
      undefined,
      ['honey', null],
    );
    const res = logic.makeMove(0, 1);
    expect(res?.sinkingIngredientMoved).toBe('honey');
    expect(logic.toState().cups).toEqual([[], [M, M, M, M]]);
    expect(logic.toState().sinkingIngredients).toEqual([null, 'honey']);
    expect(logic.undo()).not.toBe(null);
    expect(logic.toState().cups).toEqual([[M], [M, M, M]]);
    expect(logic.toState().sinkingIngredients).toEqual(['honey', null]);
    expect(logic.movesCount).toBe(0);
  });

  it('multi-move route undos exact', () => {
    const init: TeaId[][] = [[BW, M, M], [M], []];
    const initSink: SinkingIngredientSlot[] = ['honey', null, null];
    const logic = new TeaSortLogic(init, [0, 0, 0], [N, N, N], undefined, undefined, initSink);
    expect(logic.makeMove(0, 1)).not.toBe(null);
    expect(logic.toState().sinkingIngredients).toEqual(['honey', null, null]);
    expect(logic.makeMove(0, 2)).not.toBe(null);
    expect(logic.toState().cups).toEqual([[], [M, M, M], [BW]]);
    expect(logic.toState().sinkingIngredients).toEqual([null, null, 'honey']);
    expect(logic.movesCount).toBe(2);
    expect(logic.undo()).not.toBe(null);
    expect(logic.toState().cups).toEqual([[BW], [M, M, M], []]);
    expect(logic.toState().sinkingIngredients).toEqual(['honey', null, null]);
    expect(logic.undo()).not.toBe(null);
    expect(logic.toState().cups).toEqual(init);
    expect(logic.toState().sinkingIngredients).toEqual(initSink);
    expect(logic.movesCount).toBe(0);
  });

  it('restart via initFromState restores initial host, moves 0', () => {
    const init: TeaId[][] = [[BW, M, M], [M]];
    const logic = new TeaSortLogic(init, [0, 0], [N, N], undefined, undefined, ['honey', null]);
    logic.makeMove(0, 1);
    expect(logic.movesCount).toBe(1);
    logic.initFromState(init, [0, 0], [N, N], undefined, undefined, ['honey', null]);
    expect(logic.toState().cups).toEqual(init);
    expect(logic.toState().sinkingIngredients).toEqual(['honey', null]);
    expect(logic.sinkingIngredients).toEqual(['honey', null]);
    expect(logic.movesCount).toBe(0);
  });
});
