/**
 * Gauntlet 17 Phase A — paired-tea (TEA PAIR / «Чайная пара») kernel.
 *
 * Focused rule / status / finality / canonical / solver / undo tests for the
 * minimal authoritative pair core. No generator, bank, rollout or UI yet.
 */
import { describe, expect, it } from 'vitest';
import {
  canPourState,
  canonicalKey,
  canonicalPuzzleKey,
  applyPourState,
  cupEndStateSatisfied,
  isConstructiveMoveState,
  isInFinalState,
  isPuzzleDeadlockedState,
  isPuzzleWonState,
  isWonState,
  pourRejectCodeState,
} from '../src/game/logic/rules';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import {
  mechanicCompatibility,
  validateTeaPairCombination,
} from '../src/game/logic/mechanicCompatibility';
import {
  TEA_PAIR_GROUP,
  TEA_PAIR_MEMBER_CAPACITY,
  TEA_PAIR_MEMBER_COUNT,
  hasPairedTea,
  isPairedTeaGoalSatisfied,
  isPairedTeaMemberComplete,
  pairedTeaCommittedTea,
  pairedTeaGroupOf,
  pairedTeaMembers,
  pairedTeaStatus,
  validatePairedTeaConstraints,
} from '../src/game/logic/teaPair';
import {
  cupConstraintSignature,
  type CupConstraint,
  type FloatingIngredientSlot,
  type TeaId,
} from '../src/game/types';

const N: CupConstraint = { mode: 'normal' };
const P: CupConstraint = { mode: 'normal', capacity: 2, pairedTeaGroup: 'tea-pair' };
const T: CupConstraint = { mode: 'normal', capacity: 2, mustEndEmpty: true };
const A: TeaId = 'matcha';
const B: TeaId = 'karkade';
const C: TeaId = 'sea_buckthorn';
const D: TeaId = 'milk_oolong';

const noFloat = (n: number): FloatingIngredientSlot[] => Array.from({ length: n }, () => null);
const state = (cups: TeaId[][], _constraints: CupConstraint[]) => ({
  cups,
  floatingIngredients: noFloat(cups.length),
});

describe('G17 static identity + validation', () => {
  it('one group constant, two members, capacity 2', () => {
    expect(TEA_PAIR_GROUP).toBe('tea-pair');
    expect(TEA_PAIR_MEMBER_COUNT).toBe(2);
    expect(TEA_PAIR_MEMBER_CAPACITY).toBe(2);
    expect(pairedTeaGroupOf(P)).toBe('tea-pair');
    expect(pairedTeaGroupOf(N)).toBeUndefined();
    expect(hasPairedTea([P, P, N])).toBe(true);
    expect(hasPairedTea([N, N])).toBe(false);
    expect(pairedTeaMembers([N, P, P], 'tea-pair')).toEqual([1, 2]);
  });

  it('exactly two valid members; other counts fail closed', () => {
    expect(validatePairedTeaConstraints([P, P, N, N])).toEqual([]);
    expect(validatePairedTeaConstraints([N, N])).toEqual([]);
    expect(validatePairedTeaConstraints([P, N, N]).length).toBeGreaterThan(0);
    expect(validatePairedTeaConstraints([P, P, P, N]).length).toBeGreaterThan(0);
    expect(validatePairedTeaConstraints([P, P])).toEqual([]);
  });

  it('member contract rejects target / end-empty / order / tray / wrong role / wrong capacity', () => {
    const bad: CupConstraint[] = [
      { ...P, targetTeaId: A },
      { ...P, mustEndEmpty: true },
      { ...P, serveOrder: 1 },
      { ...P, sharedCapacityGroup: 'tea-tray' },
      { ...P, mode: 'source-only' },
      { ...P, mode: 'sink-only' },
      { mode: 'normal', pairedTeaGroup: 'tea-pair' }, // implicit cap 4
      { mode: 'normal', capacity: 3, pairedTeaGroup: 'tea-pair' },
    ];
    for (const c of bad) {
      expect(validatePairedTeaConstraints([c, P, N]).length).toBeGreaterThan(0);
    }
  });
});

describe('§66–70 derived pair status', () => {
  it('uncommitted when neither member is locally complete', () => {
    const cases: TeaId[][][] = [
      [
        [A, B],
        [C, D],
      ],
      [[A], []],
      [[A], [B]],
      [[], []],
    ];
    for (const cups of cases) {
      expect(pairedTeaStatus(state(cups, [P, P]), [P, P])).toEqual({ kind: 'uncommitted' });
    }
  });

  it('exactly one [X,X] → committed(X) with anchor/partner indices', () => {
    const first = pairedTeaStatus(state([[A, A], [B, C]], [P, P]), [P, P]);
    expect(first).toEqual({ kind: 'committed', tea: A, anchorIndex: 0, partnerIndex: 1 });
    const second = pairedTeaStatus(state([[B, C], [A, A]], [P, P]), [P, P]);
    expect(second).toEqual({ kind: 'committed', tea: A, anchorIndex: 1, partnerIndex: 0 });
    expect(pairedTeaCommittedTea(state([[A, A], [B, C]], [P, P]), [P, P])).toBe(A);
  });

  it('committed with empty partner is not matched (single complete cannot win)', () => {
    const s = state([[A, A], []], [P, P]);
    expect(pairedTeaStatus(s, [P, P])).toEqual({
      kind: 'committed',
      tea: A,
      anchorIndex: 0,
      partnerIndex: 1,
    });
    expect(isPairedTeaGoalSatisfied(s, [P, P])).toBe(false);
  });

  it('matched only for same tea on both sides', () => {
    const s = state([[A, A], [A, A]], [P, P]);
    expect(pairedTeaStatus(s, [P, P])).toEqual({ kind: 'matched', tea: A });
    expect(isPairedTeaGoalSatisfied(s, [P, P])).toBe(true);
    expect(pairedTeaCommittedTea(s, [P, P])).toBe(A);
  });

  it('conflict for different full homogeneous teas; no committed tea', () => {
    const s = state([[A, A], [B, B]], [P, P]);
    expect(pairedTeaStatus(s, [P, P])).toEqual({ kind: 'conflict', teaA: A, teaB: B });
    expect(isPairedTeaGoalSatisfied(s, [P, P])).toBe(false);
    expect(pairedTeaCommittedTea(s, [P, P])).toBeNull();
  });

  it('malformed member counts never match', () => {
    const one = state([[A, A], [B]], [P, N]);
    expect(pairedTeaStatus(one, [P, N])).toEqual({ kind: 'uncommitted' });
    expect(isPairedTeaGoalSatisfied(one, [P, N])).toBe(false);
    const three = state([[A, A], [A, A], []], [P, P, P]);
    expect(isPairedTeaGoalSatisfied(three, [P, P, P])).toBe(false);
  });

  it('complete means 2/2 homogeneous; empty/partial/mixed are not complete', () => {
    expect(isPairedTeaMemberComplete([], P)).toBe(false);
    expect(isPairedTeaMemberComplete([A], P)).toBe(false);
    expect(isPairedTeaMemberComplete([A, B], P)).toBe(false);
    expect(isPairedTeaMemberComplete([A, A], P)).toBe(true);
    expect(isPairedTeaMemberComplete([A, A], N)).toBe(false);
  });
});

describe('§71–73 reopening + commit switch (derived only)', () => {
  it('reopening a completed anchor is legal, constructive and clears commitment', () => {
    const cons = [P, P, N];
    const s = state([[A, A], [B, C], []], cons);
    expect(isInFinalState([A, A], P)).toBe(false);
    expect(pourRejectCodeState(s, 0, 2, cons)).toBe('ok');
    expect(canPourState(s, 0, 2, cons)).toBe(true);
    expect(isConstructiveMoveState(s, 0, 2, cons)).toBe(true);
    const after = applyPourState(s, 0, 2, cons);
    expect(after?.state.cups).toEqual([[], [B, C], [A, A]]);
    expect(pairedTeaStatus(after!.state, cons)).toEqual({ kind: 'uncommitted' });
  });

  it('exact full pair→empty-partner relocation stays legal (canonical self-loop)', () => {
    const cons = [P, P];
    const s = state([[A, A], []], cons);
    expect(isInFinalState([A, A], P)).toBe(false);
    expect(pourRejectCodeState(s, 0, 1, cons)).toBe('ok');
    expect(canPourState(s, 0, 1, cons)).toBe(true);
    const after = applyPourState(s, 0, 1, cons);
    expect(after).not.toBeNull();
    expect(canonicalPuzzleKey(s, cons)).toBe(canonicalPuzzleKey(after!.state, cons));
  });

  it('wrong partner tea is ordinary-legal (no pair-specific rejection)', () => {
    const cons = [P, P, N];
    const s = state([[A, A], [B], [B, B, B]], cons);
    // B may receive B even though pair A is already committed.
    expect(pourRejectCodeState(s, 2, 1, cons)).toBe('ok');
    const after = applyPourState(s, 2, 1, cons);
    expect(after?.state.cups[1]).toEqual([B, B]);
    expect(pairedTeaStatus(after!.state, cons)).toEqual({
      kind: 'conflict',
      teaA: A,
      teaB: B,
    });
  });

  it('commit can switch from X to Y with no stored history', () => {
    const cons = [P, P, N, N, N];
    let s = state([[A, A], [B, C], [], [], [B, B, B]], cons);
    expect(pairedTeaStatus(s, cons)).toMatchObject({ kind: 'committed', tea: A, anchorIndex: 0 });

    const reopen = applyPourState(s, 0, 2, cons);
    expect(reopen).not.toBeNull();
    s = reopen!.state;
    expect(pairedTeaStatus(s, cons)).toEqual({ kind: 'uncommitted' });

    const dropC = applyPourState(s, 1, 3, cons);
    expect(dropC?.state.cups[1]).toEqual([B]);
    s = dropC!.state;

    const lateCommit = applyPourState(s, 4, 1, cons);
    expect(lateCommit?.state.cups[1]).toEqual([B, B]);
    s = lateCommit!.state;
    expect(pairedTeaStatus(s, cons)).toEqual({
      kind: 'committed',
      tea: B,
      anchorIndex: 1,
      partnerIndex: 0,
    });
  });
});

describe('§74–78 relational win', () => {
  it('matched same tea + all other vessels solved → win', () => {
    const cons = [P, P, N, N];
    const s = state([[A, A], [A, A], [B, B, B, B], []], cons);
    expect(isWonState(s.cups, cons)).toBe(true);
    expect(isPuzzleWonState(s, cons)).toBe(true);
  });

  it('empty pair cannot win even when every other vessel is sorted', () => {
    const cons = [P, P, N, N];
    const s = state([[], [], [A, A, A, A], [B, B, B, B]], cons);
    expect(isPuzzleWonState(s, cons)).toBe(false);
  });

  it('one full + one empty cannot win', () => {
    const cons = [P, P, N, N];
    const s = state([[A, A], [], [B, B, B, B], []], cons);
    expect(isPuzzleWonState(s, cons)).toBe(false);
  });

  it('conflict cannot win', () => {
    const cons = [P, P, N, N];
    const s = state([[A, A], [B, B], [], []], cons);
    expect(isPuzzleWonState(s, cons)).toBe(false);
  });

  it('matched pair still fails when another vessel is unsolved', () => {
    const cons = [P, P, N];
    const s = state([[A, A], [A, A], [B]], cons);
    expect(isPuzzleWonState(s, cons)).toBe(false);
  });

  it('pair members never contribute ordinary empty-cup victory by themselves', () => {
    const cons = [P, P, N];
    const s = state([[], [], [A, A, A, A]], cons);
    expect(isPuzzleWonState(s, cons)).toBe(false);
  });
});

describe('§56 conflict is not deadlock; pair sources remain available', () => {
  it('conflict with an empty ordinary cup is not deadlocked', () => {
    const cons = [P, P, N];
    const s = state([[A, A], [B, B], []], cons);
    expect(isPuzzleDeadlockedState(s, cons)).toBe(false);
    expect(canPourState(s, 0, 2, cons)).toBe(true);
  });

  it('a full pair member is not locally final for pruning', () => {
    expect(isInFinalState([A, A], P)).toBe(false);
    expect(cupEndStateSatisfied([A, A], P)).toBe(false);
    expect(isInFinalState([A, A], T)).toBe(false);
    expect(isInFinalState([A, A], { mode: 'normal', capacity: 2 })).toBe(true);
  });
});

describe('§48–53 canonical identity', () => {
  it('pair signature is cap2 + :P, distinct from ordinary cap2 and tasting', () => {
    expect(cupConstraintSignature(P)).toBe('N:_:C2:D:P');
    expect(cupConstraintSignature(T)).toBe('N:_:C2:E');
    expect(cupConstraintSignature({ mode: 'normal', capacity: 2 })).toBe('N:_:C2:D');
    expect(cupConstraintSignature(N)).toBe('N:_');
  });

  it('two pair members are symmetric and permute', () => {
    const cons = [P, P, N];
    const x = state([[A, A], [B, C], [D]], cons);
    const y = state([[B, C], [A, A], [D]], cons);
    expect(canonicalPuzzleKey(x, cons)).toBe(canonicalPuzzleKey(y, cons));
    expect(canonicalKey(x.cups, cons)).toBe(canonicalKey(y.cups, cons));
  });

  it('pair never collapses with ordinary cap2 or tasting cap2', () => {
    const s = state([[A, A], []], [P, P]);
    expect(canonicalPuzzleKey(s, [P, P])).not.toBe(canonicalPuzzleKey(s, [N, N]));
    expect(canonicalPuzzleKey(s, [P, P])).not.toBe(
      canonicalPuzzleKey(s, [{ mode: 'normal', capacity: 2 }, { mode: 'normal', capacity: 2 }]),
    );
    expect(canonicalPuzzleKey(s, [P, P])).not.toBe(canonicalPuzzleKey(s, [T, T]));
  });

  it('absent pair marker keeps legacy and G16 keys byte-identical', () => {
    const cups: TeaId[][] = [[A, B], [], [B, A, A, B]];
    const cons: CupConstraint[] = [N, N, N];
    const s = state(cups, cons);
    expect(cupConstraintSignature(N)).toBe('N:_');
    expect(canonicalPuzzleKey(s, cons)).toBe(canonicalKey(cups, cons));
    const tray: CupConstraint = { mode: 'normal', sharedCapacityGroup: 'tea-tray' };
    expect(cupConstraintSignature(tray)).toBe('N:_:G6');
  });
});

describe('§54–55 solver uses relational goal + undo/restart', () => {
  it('legacy-sorted board now requires real moves to split tea into the pair', () => {
    const cons = [P, P, N, N];
    const cups: TeaId[][] = [[], [], [A, A, A, A], [B, B, B, B]];
    const r = solvePuzzle(cups, { cupConstraints: cons, maxVisited: 50_000, maxDepth: 20 });
    expect(r.truncated).not.toBe(true);
    expect(r.solvable).toBe(true);
    expect(r.minMoves).toBe(2);
    const fin = applySolutionState(state(cups, cons), r.solution ?? [], cons);
    expect(fin).not.toBeNull();
    expect(isPuzzleWonState(fin!, cons)).toBe(true);
    expect(pairedTeaStatus(fin!, cons).kind).toBe('matched');
  });

  it('tiny mixed pair board solves and replays to a relational win', () => {
    // Pair P0 [A,B], P1 [B,A]; outside O2 [A,A], O3 [B,B].
    const cons = [P, P, N, N];
    const cups: TeaId[][] = [[A, B], [B, A], [A, A], [B, B]];
    const r = solvePuzzle(cups, { cupConstraints: cons, maxVisited: 50_000, maxDepth: 20 });
    expect(r.truncated).not.toBe(true);
    expect(r.solvable).toBe(true);
    const fin = applySolutionState(state(cups, cons), r.solution ?? [], cons);
    expect(fin).not.toBeNull();
    expect(isPuzzleWonState(fin!, cons)).toBe(true);
  });

  it('undo restores pair contents and derived status exactly', () => {
    const cons = [P, P, N];
    const logic = new TeaSortLogic([[A, A], [B, C], []], [0, 0, 0], cons);
    expect(logic.isWon()).toBe(false);
    expect(pairedTeaStatus(logic.toState(), cons)).toMatchObject({ kind: 'committed', tea: A });
    expect(logic.makeMove(0, 2)).not.toBeNull();
    expect(pairedTeaStatus(logic.toState(), cons)).toEqual({ kind: 'uncommitted' });
    expect(logic.undo()).not.toBeNull();
    expect(logic.toState().cups).toEqual([[A, A], [B, C], []]);
    expect(pairedTeaStatus(logic.toState(), cons)).toMatchObject({ kind: 'committed', tea: A });
    expect(logic.movesCount).toBe(0);
  });

  it('restart/init restores the original pair board without stale commitment', () => {
    const cons = [P, P, N];
    const logic = new TeaSortLogic([[A, A], [B, C], []], [0, 0, 0], cons);
    expect(logic.makeMove(0, 2)).not.toBeNull();
    logic.initFromState([[A], [B], [C]], [0, 0, 0], cons);
    expect(pairedTeaStatus(logic.toState(), cons)).toEqual({ kind: 'uncommitted' });
    expect(logic.movesCount).toBe(0);
    expect(logic.isWon()).toBe(false);
  });
});

describe('§58–61 compatibility policy', () => {
  it('pair+blend is forbidden in both dimensions', () => {
    const v = mechanicCompatibility('teaPair', 'blend');
    expect(v.sameLevel).toBe('forbid');
    expect(v.sameCup).toBe('forbid');
    expect(mechanicCompatibility('blend', 'teaPair')).toEqual(v);
  });

  it('pair+other composition mechanics is research level / forbid cup', () => {
    for (const other of ['servingOrder', 'mystery', 'tasting', 'honey', 'strainer', 'sharedTray'] as const) {
      const v = mechanicCompatibility('teaPair', other);
      expect(v.sameLevel).toBe('research');
      expect(v.sameCup).toBe('forbid');
    }
  });

  it('standalone pair request validates; every sibling rejects', () => {
    const base = {
      teaPair: true,
      servingOrder: false,
      mystery: false,
      tastingCount: 0,
      honey: false,
      strainer: false,
      blend: false,
      sharedTray: false,
    };
    expect(validateTeaPairCombination(base)).toEqual([]);
    expect(validateTeaPairCombination({ ...base, servingOrder: true }).length).toBeGreaterThan(0);
    expect(validateTeaPairCombination({ ...base, mystery: true }).length).toBeGreaterThan(0);
    expect(validateTeaPairCombination({ ...base, tastingCount: 1 }).length).toBeGreaterThan(0);
    expect(validateTeaPairCombination({ ...base, honey: true }).length).toBeGreaterThan(0);
    expect(validateTeaPairCombination({ ...base, strainer: true }).length).toBeGreaterThan(0);
    expect(validateTeaPairCombination({ ...base, sharedTray: true }).length).toBeGreaterThan(0);
    const blend = validateTeaPairCombination({ ...base, blend: true });
    expect(blend.some((r) => r.includes('forbidden'))).toBe(true);
    expect(validateTeaPairCombination({ ...base, teaPair: false })).toEqual([]);
  });
});
