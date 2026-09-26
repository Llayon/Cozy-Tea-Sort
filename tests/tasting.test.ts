/**
 * Gauntlet 4 — tasting-bowl (дегустационная пиала) domain matrix.
 *
 * Covers spec §50–53: default/tasting capacity, pour in/out, full
 * rejection, win + completion semantics, pruning H–M, canonicalization
 * N–S, solver fixture T–Y, undo/restart, Mystery exclusion.
 */
import { describe, expect, it } from 'vitest';
import {
  STANDARD_CUP_CAPACITY,
  TASTING_BOWL_CAPACITY,
  TASTING_BOWL_CONSTRAINT,
  TEA_UNITS_PER_COLOR,
  cloneCupConstraint,
  cupCapacity,
  cupConstraintSignature,
  isTastingCupConstraint,
  mustEndEmpty,
  normalizeCupConstraints,
  type CupConstraint,
  type TeaId,
} from '../src/game/types';
import {
  applyPour,
  canPourBetween,
  canonicalKey,
  cupEndStateSatisfied,
  isConstructiveMove,
  isDeadlockedState,
  isInFinalState,
  isWonState,
  listLegalMoves,
  pourRejectCodeBetween,
} from '../src/game/logic/rules';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import { applySolution, solvePuzzle } from '../src/game/logic/solver';
import {
  countTastingCups,
  requestedTastingCupCount,
  selectMysteryCup,
  validateTastingRequest,
  type GenerateRequest,
} from '../src/game/logic/generator';

const A: TeaId = 'matcha';
const B: TeaId = 'karkade';
const C: TeaId = 'lavender';
const D: TeaId = 'sea_buckthorn';

const N: CupConstraint = { mode: 'normal' };
const SRC: CupConstraint = { mode: 'source-only' };
const SNK: CupConstraint = { mode: 'sink-only' };
const T: CupConstraint = { mode: 'normal', capacity: 2, mustEndEmpty: true };

describe('A. default capacity: implicit == explicit', () => {
  it('capacity 4 is the standard default', () => {
    expect(TEA_UNITS_PER_COLOR).toBe(4);
    expect(STANDARD_CUP_CAPACITY).toBe(4);
    expect(cupCapacity(undefined)).toBe(4);
    expect(cupCapacity(N)).toBe(4);
    expect(cupCapacity({ mode: 'normal', capacity: 4, mustEndEmpty: false })).toBe(4);
    expect(mustEndEmpty(undefined)).toBe(false);
    expect(mustEndEmpty(N)).toBe(false);
  });

  it('normalize/clone preserve all four fields; explicit defaults equal omitted', () => {
    const explicit: CupConstraint = { mode: 'normal', capacity: 4, mustEndEmpty: false };
    expect(normalizeCupConstraints([explicit], 1)).toEqual([explicit]);
    expect(cloneCupConstraint(T)).toEqual(T);
    expect(cloneCupConstraint(T)).not.toBe(T);
    // Same semantics → same signature (no state-key fragmentation).
    expect(cupConstraintSignature(N)).toBe(cupConstraintSignature(explicit));
    expect(cupConstraintSignature(N)).toBe('N:_');
    expect(canonicalKey([[], []], [N, explicit])).toBe(canonicalKey([[], []], [N, N]));
  });
});

describe('B. tasting capacity + identification helper', () => {
  it('tasting bowl reads capacity 2 / must-end-empty', () => {
    expect(TASTING_BOWL_CAPACITY).toBe(2);
    expect(TASTING_BOWL_CONSTRAINT).toEqual({ mode: 'normal', capacity: 2, mustEndEmpty: true });
    expect(cupCapacity(T)).toBe(2);
    expect(mustEndEmpty(T)).toBe(true);
    expect(isTastingCupConstraint(T)).toBe(true);
    expect(isTastingCupConstraint(TASTING_BOWL_CONSTRAINT)).toBe(true);
    expect(isTastingCupConstraint(N)).toBe(false);
    expect(isTastingCupConstraint(SRC)).toBe(false);
    expect(isTastingCupConstraint(SNK)).toBe(false);
    expect(isTastingCupConstraint({ mode: 'normal', targetTeaId: A })).toBe(false);
    expect(isTastingCupConstraint({ mode: 'source-only', capacity: 2, mustEndEmpty: true })).toBe(false);
    expect(isTastingCupConstraint(undefined)).toBe(false);
  });

  it('TeaSortLogic Cup exposes tasting role + dynamic fullness', () => {
    const logic = new TeaSortLogic([[A, A], [A]], [0, 0], [T, N]);
    expect(logic.cups[0]?.isTastingBowl).toBe(true);
    expect(logic.cups[0]?.capacity).toBe(2);
    expect(logic.cups[0]?.isFull).toBe(true);
    expect(logic.cups[0]?.remainingCapacity).toBe(0);
    expect(logic.cups[1]?.capacity).toBe(4);
    expect(logic.cups[1]?.isFull).toBe(false);
  });
});

describe('C–E. dynamic pour capacity', () => {
  it('C. AAAA -> empty tasting moves exactly 2 layers', () => {
    expect(canPourBetween([[A, A, A, A], []], 0, 1, [N, T])).toBe(true);
    const res = applyPour([[A, A, A, A], []], 0, 1, [N, T]);
    expect(res?.transferred).toBe(2);
    expect(res?.cups[0]).toEqual([A, A]);
    expect(res?.cups[1]).toEqual([A, A]);
  });

  it('D. third layer into a 2/2 bowl is target-full', () => {
    expect(pourRejectCodeBetween([[A], [A, A]], 0, 1, [N, T])).toBe('target-full');
    expect(canPourBetween([[A], [A, A]], 0, 1, [N, T])).toBe(false);
  });

  it('E. AA tasting pours back out under normal color rules', () => {
    expect(canPourBetween([[A, A], [A]], 0, 1, [T, N])).toBe(true);
    expect(canPourBetween([[A, A], [B]], 0, 1, [T, N])).toBe(false);
    const res = applyPour([[A, A], []], 0, 1, [T, N]);
    expect(res?.transferred).toBe(2);
    expect(res?.cups[0]).toEqual([]);
  });

  it('bowl never overfills through partial top-ups', () => {
    // [A] in bowl + AA source top-group: only 1 fits.
    const res = applyPour([[A], [A, A]], 1, 0, [T, N]);
    expect(res?.transferred).toBe(1);
    expect(res?.cups[0]).toEqual([A, A]);
    // A 2/2 bowl rejects anything more.
    expect(pourRejectCodeBetween([[A], [A, A]], 0, 1, [N, T])).toBe('target-full');
  });
});

describe('F–G. win + completion semantics', () => {
  it('F. empty tasting satisfied; partial/full/mixed tasting NOT wins', () => {
    expect(cupEndStateSatisfied([], T)).toBe(true);
    expect(cupEndStateSatisfied([A], T)).toBe(false);
    expect(cupEndStateSatisfied([A, A], T)).toBe(false);
    expect(cupEndStateSatisfied([A, B], T)).toBe(false);
    // Empty bowl + solved rest IS a win (bowl satisfied by being empty).
    expect(isWonState([[], [A, A, A, A]], [T, N])).toBe(true);
    expect(isWonState([[A], [A, A, A, A]], [T, N])).toBe(false);
    expect(isWonState([[A, A], [B, B, B, B]], [T, N])).toBe(false);
  });

  it('working bowl beside solved vessels is a win once emptied', () => {
    expect(isWonState([[], [A, A, A, A], [B, B, B, B]], [T, N, N])).toBe(true);
  });

  it('G. completion across all roles', () => {
    expect(cupEndStateSatisfied([A, A, A, A], N)).toBe(true);
    expect(cupEndStateSatisfied([A, A, A, A], SNK)).toBe(true);
    expect(cupEndStateSatisfied([A, A, A, A], SRC)).toBe(false);
    expect(cupEndStateSatisfied([A, A, A, A], { mode: 'normal', targetTeaId: B })).toBe(false);
    expect(cupEndStateSatisfied([B, B, B, B], { mode: 'normal', targetTeaId: B })).toBe(true);
    expect(cupEndStateSatisfied([A, A], T)).toBe(false);
    expect(isInFinalState([A, A], T)).toBe(false);
    expect(isInFinalState([A, A, A, A], N)).toBe(true);
  });
});

describe('H–M. pruning preserves Gauntlets 1–3 and frees the bowl', () => {
  const FULL_A = [A, A, A, A] as TeaId[];

  it('H. AAAA normal -> empty normal still pruned', () => {
    expect(pourRejectCodeBetween([FULL_A, []], 0, 1, [N, N])).toBe('complete-to-empty');
  });

  it('I. AAAA normal -> empty sink still legal + constructive', () => {
    expect(pourRejectCodeBetween([FULL_A, []], 0, 1, [N, SNK])).toBe('ok');
    expect(isConstructiveMove([FULL_A, []], 0, 1, [N, SNK])).toBe(true);
  });

  it('J. AAAA teapot -> empty normal still legal + constructive', () => {
    expect(canPourBetween([FULL_A, []], 0, 1, [SRC, N])).toBe(true);
    expect(isConstructiveMove([FULL_A, []], 0, 1, [SRC, N])).toBe(true);
  });

  it('K. wrong full target -> empty normal still legal + constructive', () => {
    const WT: CupConstraint = { mode: 'normal', targetTeaId: B };
    expect(canPourBetween([FULL_A, []], 0, 1, [WT, N])).toBe(true);
    expect(isConstructiveMove([FULL_A, []], 0, 1, [WT, N])).toBe(true);
  });

  it('L. AA full tasting -> empty normal is REAL progress: legal + constructive', () => {
    expect(pourRejectCodeBetween([[A, A], []], 0, 1, [T, N])).toBe('ok');
    expect(isConstructiveMove([[A, A], []], 0, 1, [T, N])).toBe(true);
  });

  it('L2. AA tasting -> empty tasting NOT removed as "full homogeneous"', () => {
    expect(canPourBetween([[A, A], []], 0, 1, [T, T])).toBe(true);
    expect(isConstructiveMove([[A, A], []], 0, 1, [T, T])).toBe(true);
  });

  it('M. partial homogeneous standard -> empty same-signature semantics preserved', () => {
    // Legal (legacy), but non-constructive within the identical group.
    expect(canPourBetween([[A, A, A], []], 0, 1, [N, N])).toBe(true);
    expect(isConstructiveMove([[A, A, A], []], 0, 1, [N, N])).toBe(false);
  });

  it('no solver state-space blowup: tasting does not create spurious moves', () => {
    // A 2/2 bowl offers no destination for a mismatched top color, and a
    // full bowl offers no room at all — both pruned by shared capacity.
    expect(canPourBetween([[B], [A, A]], 0, 1, [N, T])).toBe(false);
    expect(canPourBetween([[A], [A, A]], 0, 1, [N, T])).toBe(false);
    expect(listLegalMoves([[], []], true, [T, N]).length).toBe(0);
  });
});

describe('N–S. canonicalization with capacity', () => {
  it('N. implicit C4 == explicit C4/false (same key)', () => {
    const explicit: CupConstraint = { mode: 'normal', capacity: 4, mustEndEmpty: false };
    expect(cupConstraintSignature(explicit)).toBe('N:_');
    expect(canonicalKey([[], [A]], [explicit, N])).toBe(canonicalKey([[], [A]], [N, N]));
  });

  it('O. normal C4 != tasting C2/empty-only', () => {
    expect(cupConstraintSignature(T)).toBe('N:_:C2:E');
    expect(cupConstraintSignature(T)).not.toBe(cupConstraintSignature(N));
    expect(canonicalKey([[], []], [N, T])).not.toBe(canonicalKey([[], []], [N, N]));
  });

  it('P/Q/R. tasting differs from sink, source-only, target', () => {
    const keys = new Set([
      canonicalKey([[]], [T]),
      canonicalKey([[]], [SNK]),
      canonicalKey([[]], [SRC]),
      canonicalKey([[]], [{ mode: 'normal', targetTeaId: C }]),
      canonicalKey([[]], [N]),
    ]);
    expect(keys.size).toBe(5);
  });

  it('S. two identical tasting constraints stay symmetric', () => {
    expect(canonicalKey([[A], [B]], [T, T])).toBe(canonicalKey([[B], [A]], [T, T]));
  });
});

describe('T–Y. hand fixture: the bowl works as a buffer', () => {
  // Compact 3-color fixture (found offline): the optimal 6-move path parks
  // 2 lavenders in the bowl, stages matcha elsewhere, then serves them back.
  const cups: TeaId[][] = [
    [C, A, C, C],
    [B, B, B, C],
    [B, A, A, A],
    [],
    [],
  ];
  const constraints: CupConstraint[] = [N, N, N, N, T];
  const TASTING = 4;

  it('T/U/V. optimal solution enters, later exits, finishes bowl empty', () => {
    expect(isWonState(cups, constraints)).toBe(false);
    const solved = solvePuzzle(cups, { cupConstraints: constraints });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated).not.toBe(true);
    expect(solved.minMoves).toBe(6);
    const solution = solved.solution ?? [];
    // T: receives tea.
    expect(solution.some((m) => m.to === TASTING)).toBe(true);
    // U: later pours tea back out.
    const firstIn = solution.findIndex((m) => m.to === TASTING);
    expect(solution.slice(firstIn + 1).some((m) => m.from === TASTING)).toBe(true);
    // X/Y: exact replay, not truncated.
    const final = applySolution(cups, solution, constraints);
    expect(final).not.toBe(null);
    // V: final bowl empty + won.
    expect((final as TeaId[][])[TASTING]).toEqual([]);
    expect(isWonState(final as TeaId[][], constraints)).toBe(true);
  });

  it('W. solver never exceeds tasting capacity 2 on the replay', () => {
    const solved = solvePuzzle(cups, { cupConstraints: constraints });
    let board = cups.map((c) => [...c]);
    for (const step of solved.solution ?? []) {
      const res = applyPour(board, step.from, step.to, constraints);
      expect(res).not.toBe(null);
      board = res?.cups ?? board;
      board.forEach((cup, i) => {
        expect(cup.length).toBeLessThanOrEqual(cupCapacity(constraints[i]));
      });
    }
  });

  it('replays through TeaSortLogic to a win', () => {
    const solved = solvePuzzle(cups, { cupConstraints: constraints });
    const logic = new TeaSortLogic(cups.map((c) => [...c]), [0, 0, 0, 0, 0], constraints);
    for (const m of solved.solution ?? []) {
      expect(logic.makeMove(m.from, m.to)).not.toBe(null);
    }
    expect(logic.isWon()).toBe(true);
    expect(logic.cups[TASTING]?.layers).toEqual([]);
  });
});

describe('undo / restart preserve tasting invariants', () => {
  it('AAAA -> 2 into tasting -> Undo restores exactly', () => {
    const logic = new TeaSortLogic([[A, A, A, A], []], [0, 0], [N, T]);
    expect(logic.makeMove(0, 1)?.move.count).toBe(2);
    expect(logic.cups[1]?.layers).toEqual([A, A]);
    expect(logic.undo()).not.toBe(null);
    expect(logic.cups[0]?.layers).toEqual([A, A, A, A]);
    expect(logic.cups[1]?.layers).toEqual([]);
    expect(logic.movesCount).toBe(0);
    expect(logic.cupConstraints).toEqual([N, T]);
  });

  it('restart restores tasting slot, capacity, emptiness', () => {
    const logic = new TeaSortLogic([[A, B, B], []], [0, 0], [N, T]);
    logic.makeMove(0, 1);
    logic.initFromState([[A, B, B], []], [0, 0], [N, T]);
    expect(logic.cups[1]?.layers).toEqual([]);
    expect(logic.cups[1]?.capacity).toBe(2);
    expect(logic.cups[1]?.isTastingBowl).toBe(true);
    expect(logic.movesCount).toBe(0);
  });
});

describe('request validation + Mystery exclusion', () => {
  const base = {
    numColors: 4,
    colors: [A, B, C, D],
    emptyCups: 2,
    hasMysteryLayer: false,
    phase: 'challenge',
  } as unknown as GenerateRequest;

  it('requestedTastingCupCount / countTastingCups', () => {
    expect(requestedTastingCupCount(base)).toBe(0);
    expect(requestedTastingCupCount({ ...base, tastingCupCount: 1 })).toBe(1);
    expect(countTastingCups([N, T])).toBe(1);
  });

  it('validateTastingRequest fails loudly on unsupported combos', () => {
    expect(() => validateTastingRequest({ ...base, tastingCupCount: 2 })).toThrow(/max 1/);
    expect(() => validateTastingRequest({ ...base, tastingCupCount: 1, emptyCups: 1 })).toThrow(/>= 2/);
    expect(() =>
      validateTastingRequest({ ...base, tastingCupCount: 1, sinkOnlyCount: 1 }),
    ).toThrow(/sink/);
    expect(() =>
      validateTastingRequest({ ...base, tastingCupCount: 1, targetTeaIds: [A, B] }),
    ).toThrow(/targets/);
    expect(() => validateTastingRequest({ ...base, tastingCupCount: 1 })).not.toThrow();
    // Teapot + tasting is the supported combo.
    expect(() =>
      validateTastingRequest({ ...base, tastingCupCount: 1, sourceOnlyCount: 1 }),
    ).not.toThrow();
  });

  it('selectMysteryCup never picks the tasting bowl', () => {
    const cups: TeaId[][] = [[B, A, A, A], [A, B, B, B], [], []];
    const constraints: CupConstraint[] = [N, N, N, T];
    for (let i = 0; i < 10; i++) {
      const idx = selectMysteryCup(cups, (cands) => cands[i % cands.length] ?? null, constraints);
      expect(idx).not.toBe(3);
    }
  });

  it('deadlock stays capacity-aware: a full bowl sources like a normal cup', () => {
    // Bowl [A,A] (full 2/2) may still pour out under normal color rules;
    // nothing may pour INTO it (target-full).
    const cups: TeaId[][] = [[A, A], [B, A], []];
    const constraints: CupConstraint[] = [T, N, N];
    expect(canPourBetween(cups, 0, 1, constraints)).toBe(true);
    expect(pourRejectCodeBetween(cups, 1, 0, constraints)).toBe('target-full');
    expect(canPourBetween(cups, 0, 2, constraints)).toBe(true);
    expect(isDeadlockedState(cups, constraints)).toBe(false);
  });
});
