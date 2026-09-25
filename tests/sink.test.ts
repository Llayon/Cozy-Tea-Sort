/**
 * Gauntlet 3 — sink-only guest cup («Чашка гостя») matrix.
 *
 * Covers spec §57–64: domain (CupMode / signature / unsupported combos),
 * legality A–H, complete-to-empty regressions, mutation, win, undo/restart,
 * solver fixtures (sink + teapot+sink), deadlock, mystery interaction.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_CUP_CAPACITY,
  SINK_ONLY_CUP_CONSTRAINT,
  cloneCupConstraint,
  cupConstraintSignature,
  normalizeCupConstraints,
  type CupConstraint,
  type TeaId,
} from '../src/game/types';
import {
  applyPour,
  canActAsSource,
  canonicalKey,
  canPourBetween,
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
  countSinkOnly,
  requestedSinkOnlyCount,
  selectMysteryCup,
  validateLevelStructure,
  validateSinkRequest,
  type GenerateRequest,
} from '../src/game/logic/generator';

const A: TeaId = 'matcha';
const B: TeaId = 'karkade';
const C: TeaId = 'lavender';
const D: TeaId = 'sea_buckthorn';

const N: CupConstraint = { mode: 'normal' };
const SRC: CupConstraint = { mode: 'source-only' };
const SNK: CupConstraint = { mode: 'sink-only' };

describe('A. CupMode domain: normal / source-only / sink-only', () => {
  it('normalizes and clones sink-only constraints', () => {
    expect(normalizeCupConstraints([SNK], 1)).toEqual([{ mode: 'sink-only' }]);
    const c = cloneCupConstraint(SNK);
    expect(c).toEqual({ mode: 'sink-only' });
    expect(c).not.toBe(SNK);
    // Target identity preserved alongside sink mode (domain-level clone).
    expect(cloneCupConstraint({ mode: 'sink-only', targetTeaId: A })).toEqual({
      mode: 'sink-only',
      targetTeaId: A,
    });
  });

  it('canonical frozen sink-only constraint is immutable-shaped', () => {
    expect(SINK_ONLY_CUP_CONSTRAINT).toEqual({ mode: 'sink-only' });
    expect(Object.isFrozen(SINK_ONLY_CUP_CONSTRAINT)).toBe(true);
    expect(countSinkOnly([N, SNK, SRC])).toBe(1);
    expect(requestedSinkOnlyCount({} as unknown as GenerateRequest)).toBe(0);
    expect(requestedSinkOnlyCount({ sinkOnlyCount: 1 } as unknown as GenerateRequest)).toBe(1);
  });

  it('TeaSortLogic Cup exposes sink-only role without a second store', () => {
    const logic = new TeaSortLogic([[A]], [0], [SNK]);
    expect(logic.cups[0]?.mode).toBe('sink-only');
    expect(logic.cups[0]?.isSinkOnly).toBe(true);
    expect(logic.cups[0]?.isSourceOnly).toBe(false);
    expect(logic.cups[0]?.isTargetCup).toBe(false);
    expect(logic.cupConstraints).toEqual([{ mode: 'sink-only' }]);
  });
});

describe('B. constraint signatures keep every role distinct', () => {
  it('N / SRC / SNK / targets are all different groups', () => {
    const sigs = new Set([
      cupConstraintSignature(N),
      cupConstraintSignature(SRC),
      cupConstraintSignature(SNK),
      cupConstraintSignature({ mode: 'normal', targetTeaId: C }),
      cupConstraintSignature({ mode: 'normal', targetTeaId: B }),
    ]);
    expect(sigs.size).toBe(5);
    expect(cupConstraintSignature(SRC)).toBe('SRC:_');
    expect(cupConstraintSignature(SNK)).toBe('SNK:_');
  });

  it('two ordinary normals stay symmetric; two sinks stay symmetric', () => {
    const cups: TeaId[][] = [[], []];
    expect(canonicalKey(cups, [N, N])).toBe(canonicalKey([[], []], [N, N]));
    // Permuted contents within one group collapse.
    const k1 = canonicalKey([[A], [B]], [N, N]);
    const k2 = canonicalKey([[B], [A]], [N, N]);
    expect(k1).toBe(k2);
    const s1 = canonicalKey([[A], [B]], [SNK, SNK]);
    const s2 = canonicalKey([[B], [A]], [SNK, SNK]);
    expect(s1).toBe(s2);
  });

  it('normal empty vs sink empty vs source empty never collapse', () => {
    const cups: TeaId[][] = [[], []];
    const nn = canonicalKey(cups, [N, N]);
    const ns = canonicalKey(cups, [N, SNK]);
    const ss = canonicalKey(cups, [SRC, SNK]);
    const nt = canonicalKey(cups, [N, { mode: 'normal', targetTeaId: C }]);
    expect(new Set([nn, ns, ss, nt]).size).toBe(4);
  });
});

describe('C. unsupported sink+target combos fail loudly', () => {
  it('validateSinkRequest rejects sink+targets and sink>1', () => {
    const base = {
      numColors: 4,
      colors: [A, B, C, D],
      emptyCups: 2,
      hasMysteryLayer: false,
      phase: 'challenge',
    } as unknown as GenerateRequest;
    expect(() => validateSinkRequest({ ...base, sinkOnlyCount: 2 })).toThrow(/max 1/);
    expect(() =>
      validateSinkRequest({ ...base, sinkOnlyCount: 1, targetTeaIds: [A, B] }),
    ).toThrow(/out of scope/);
    expect(() => validateSinkRequest({ ...base, sinkOnlyCount: 1 })).not.toThrow();
  });

  it('validateLevelStructure rejects a sink carrying a target', () => {
    const level = {
      cups: [[A, A, A, A], [B, B, B, B], [C, C, C, C], [D, D, D, D], [], []],
      hiddenCounts: [0, 0, 0, 0, 0, 0],
      cupConstraints: [N, N, N, N, N, { mode: 'sink-only', targetTeaId: A } as CupConstraint],
      seed: 'x',
      minMoves: 5,
      visitedStates: 5,
    };
    const req = {
      numColors: 4,
      colors: [A, B, C, D],
      emptyCups: 2,
      hasMysteryLayer: false,
      phase: 'challenge',
      sinkOnlyCount: 1,
    } as unknown as GenerateRequest;
    expect(validateLevelStructure(level, req).ok).toBe(false);
  });
});

describe('D. legality matrix A–H (single rules source of truth)', () => {
  // A. normal -> normal unchanged
  it('A. normal -> normal follows legacy rules', () => {
    expect(canPourBetween([[A, A], []], 0, 1)).toBe(true);
    expect(canPourBetween([[A], [B]], 0, 1)).toBe(false);
  });

  // B. source-only -> normal unchanged
  it('B. source-only -> normal stays legal', () => {
    expect(canPourBetween([[A, B], []], 0, 1, [SRC, N])).toBe(true);
  });

  // C. normal -> source-only forbidden
  it('C. normal -> source-only forbidden', () => {
    expect(canPourBetween([[A], []], 0, 1, [N, SRC])).toBe(false);
    expect(pourRejectCodeBetween([[A], []], 0, 1, [N, SRC])).toBe('target-source-only');
  });

  // D. normal -> sink-only legal when color/capacity permit
  it('D. normal -> sink-only receives under ordinary rules', () => {
    expect(canPourBetween([[A], []], 0, 1, [N, SNK])).toBe(true);
    expect(pourRejectCodeBetween([[A], []], 0, 1, [N, SNK])).toBe('ok');
    expect(canPourBetween([[A], [B]], 0, 1, [N, SNK])).toBe(false);
    expect(pourRejectCodeBetween([[A], [B]], 0, 1, [N, SNK])).toBe('color-mismatch');
    expect(canPourBetween([[A], [A, A, A, A]], 0, 1, [N, SNK])).toBe(false);
    expect(canPourBetween([[A, A], [A]], 0, 1, [N, SNK])).toBe(true);
  });

  // E. source-only -> sink-only legal when color/capacity permit
  it('E. teapot -> guest cup is a legal thematic serve', () => {
    expect(canPourBetween([[A, B], []], 0, 1, [SRC, SNK])).toBe(true);
    expect(pourRejectCodeBetween([[A, B], []], 0, 1, [SRC, SNK])).toBe('ok');
    expect(canPourBetween([[B], [A]], 0, 1, [SRC, SNK])).toBe(false);
  });

  // F/G/H. sink can never source
  it('F. sink -> normal forbidden (source-sink-only)', () => {
    expect(canPourBetween([[A], []], 0, 1, [SNK, N])).toBe(false);
    expect(pourRejectCodeBetween([[A], []], 0, 1, [SNK, N])).toBe('source-sink-only');
  });

  it('G. sink -> source-only forbidden as sink-source (not target rule)', () => {
    expect(canPourBetween([[A], [B]], 0, 1, [SNK, SRC])).toBe(false);
    // Priority: the guest cup explains the rejection, not the teapot.
    expect(pourRejectCodeBetween([[A], [B]], 0, 1, [SNK, SRC])).toBe('source-sink-only');
  });

  it('H. sink -> sink forbidden (sink cannot source)', () => {
    expect(canPourBetween([[A], []], 0, 1, [SNK, SNK])).toBe(false);
    expect(pourRejectCodeBetween([[A], []], 0, 1, [SNK, SNK])).toBe('source-sink-only');
  });

  it('canActAsSource mirrors the table: normal+teapot yes, guest no', () => {
    expect(canActAsSource(N)).toBe(true);
    expect(canActAsSource(SRC)).toBe(true);
    expect(canActAsSource(SNK)).toBe(false);
    expect(canActAsSource(undefined)).toBe(true);
  });
});

describe('E. complete-to-empty interaction (high-risk regression)', () => {
  const FULL_A = [A, A, A, A] as TeaId[];

  it('full homogeneous NORMAL -> empty NORMAL stays pruned', () => {
    expect(pourRejectCodeBetween([FULL_A, []], 0, 1, [N, N])).toBe('complete-to-empty');
    expect(isConstructiveMove([FULL_A, []], 0, 1, [N, N])).toBe(false);
  });

  it('full homogeneous NORMAL -> empty SINK is LEGAL and CONSTRUCTIVE', () => {
    expect(pourRejectCodeBetween([FULL_A, []], 0, 1, [N, SNK])).toBe('ok');
    expect(isConstructiveMove([FULL_A, []], 0, 1, [N, SNK])).toBe(true);
    const res = applyPour([FULL_A, []], 0, 1, [N, SNK]);
    expect(res?.transferred).toBe(MAX_CUP_CAPACITY);
  });

  it('full homogeneous SOURCE-ONLY -> empty NORMAL stays legal (Gauntlet 1.1)', () => {
    expect(canPourBetween([FULL_A, []], 0, 1, [SRC, N])).toBe(true);
  });

  it('sink as source is always forbidden, even full homogeneous', () => {
    expect(pourRejectCodeBetween([FULL_A, []], 0, 1, [SNK, N])).toBe('source-sink-only');
  });

  it('isInFinalState: sink full homogeneous is final; teapot never is', () => {
    expect(isInFinalState(FULL_A, SNK)).toBe(true);
    expect(isInFinalState(FULL_A, SRC)).toBe(false);
    expect(isInFinalState(FULL_A, N)).toBe(true);
    expect(isInFinalState([A, A, A], SNK)).toBe(false);
    expect(isInFinalState([A, A, B, B], SNK)).toBe(false);
  });
});

describe('F. mutation semantics', () => {
  it('pour OUT of sink changes nothing (cups/moves/history)', () => {
    const logic = new TeaSortLogic([[A, A], []], [0, 0], [SNK, N]);
    const before = logic.toState();
    expect(logic.makeMove(0, 1)).toBe(null);
    const after = logic.toState();
    expect(after.cups).toEqual(before.cups);
    expect(logic.movesCount).toBe(0);
    expect(logic.canUndo).toBe(false);
    expect(after.hiddenCounts).toEqual(before.hiddenCounts);
  });

  it('valid pour INTO sink transfers the top group, counts the move', () => {
    const logic = new TeaSortLogic([[A, B, B], [B]], [0, 0], [N, SNK]);
    const res = logic.makeMove(0, 1);
    expect(res?.move.count).toBe(2);
    expect(logic.cups[0]?.layers).toEqual([A]);
    expect(logic.cups[1]?.layers).toEqual([B, B, B]);
    expect(logic.movesCount).toBe(1);
    expect(logic.canUndo).toBe(true);
  });
});

describe('G. win semantics with sink-only', () => {
  it('sink empty / partial / mixed-full are NOT wins', () => {
    expect(isWonState([[], [A, A, A, A]], [SNK, N])).toBe(false);
    expect(isWonState([[A, A, A], [B, B, B, B]], [SNK, N])).toBe(false);
    expect(isWonState([[A, A, B, B], [A, A, A, A]], [SNK, N])).toBe(false);
  });

  it('sink full homogeneous + solved rest IS a win', () => {
    expect(isWonState([[A, A, A, A], [B, B, B, B]], [SNK, N])).toBe(true);
    expect(isWonState([[], [B, B, B, B]], [SNK, N])).toBe(false);
  });

  it('nonempty teapot beside a complete sink is NOT a win', () => {
    expect(isWonState([[A, B], [], [B, B, B, B]], [SRC, N, SNK])).toBe(false);
  });

  it('source-only empty + sink full + normals solved IS a win', () => {
    expect(isWonState([[], [], [B, B, B, B]], [SRC, N, SNK])).toBe(true);
  });

  it('malformed sink+target never wins', () => {
    expect(
      isWonState([[A, A, A, A]], [{ mode: 'sink-only', targetTeaId: A }]),
    ).toBe(false);
  });
});

describe('H. undo / restart reverse sink commitments exactly', () => {
  it('pour into sink -> Undo restores exact layers + counters', () => {
    const logic = new TeaSortLogic([[A, B, B], []], [0, 0], [N, SNK]);
    expect(logic.makeMove(0, 1)).not.toBe(null);
    expect(logic.cups[1]?.layers).toEqual([B, B]);
    expect(logic.undo()).not.toBe(null);
    expect(logic.cups[0]?.layers).toEqual([A, B, B]);
    expect(logic.cups[1]?.layers).toEqual([]);
    expect(logic.movesCount).toBe(0);
    expect(logic.cupConstraints).toEqual([N, SNK]);
  });

  it('fill sink partially -> Restart restores empty sink + layout', () => {
    const logic = new TeaSortLogic([[A, B, B], []], [0, 0], [N, SNK]);
    logic.makeMove(0, 1);
    logic.initFromState([[A, B, B], []], [0, 0], [N, SNK]);
    expect(logic.cups[1]?.layers).toEqual([]);
    expect(logic.movesCount).toBe(0);
    expect(logic.cupConstraints).toEqual([N, SNK]);
  });
});

describe('I. known sink fixture: solution must serve the guest', () => {
  // cup0 N [B,A,A,A], cup1 N [A,B,B,B], cup2 N [], cup3 SNK [].
  // Win requires routing one finished tea into the guest cup.
  const cups: TeaId[][] = [
    [B, A, A, A],
    [A, B, B, B],
    [],
    [],
  ];
  const constraints: CupConstraint[] = [N, N, N, SNK];

  it('is not won initially and is solvable', () => {
    expect(isWonState(cups, constraints)).toBe(false);
    const solved = solvePuzzle(cups, { cupConstraints: constraints });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated).not.toBe(true);
    // Optimal play serves DIRECTLY into the guest (3 pours):
    // AAA -> sink, BBB -> cup0, A -> sink to complete the serve.
    expect(solved.minMoves).toBe(3);
  });

  it('solution serves a full homogeneous tea into the sink, never sources it', () => {
    const solved = solvePuzzle(cups, { cupConstraints: constraints });
    const solution = solved.solution ?? [];
    expect(solution.length).toBeGreaterThan(0);
    // Required invariant: NO solution move pours OUT of the sink.
    for (const m of solution) expect(m.from).not.toBe(3);
    // The guest must be served (final winning pour into the sink).
    expect(solution.some((m) => m.to === 3)).toBe(true);
    const final = applySolution(cups, solution, constraints);
    expect(final).not.toBe(null);
    expect(isWonState(final as TeaId[][], constraints)).toBe(true);
    expect((final as TeaId[][])[3]).toHaveLength(MAX_CUP_CAPACITY);
  });

  it('replays through TeaSortLogic to a win', () => {
    const solved = solvePuzzle(cups, { cupConstraints: constraints });
    const logic = new TeaSortLogic(cups.map((c) => [...c]), [0, 0, 0, 0], constraints);
    for (const m of solved.solution ?? []) {
      expect(logic.makeMove(m.from, m.to)).not.toBe(null);
    }
    expect(logic.isWon()).toBe(true);
  });
});

describe('J. combined teapot+sink fixture: inverse roles interoperate', () => {
  // cup0 SRC [B,B,B,A], cup1 N [A,A,A,B], cup2 N [], cup3 SNK [].
  // The teapot must empty directly into the guest cup to finish.
  const cups: TeaId[][] = [
    [B, B, B, A],
    [A, A, A, B],
    [],
    [],
  ];
  const constraints: CupConstraint[] = [SRC, N, N, SNK];

  it('is solvable with a teapot -> guest-cup pour in the solution', () => {
    expect(isWonState(cups, constraints)).toBe(false);
    const solved = solvePuzzle(cups, { cupConstraints: constraints });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated).not.toBe(true);
    const solution = solved.solution ?? [];
    for (const m of solution) expect(m.from).not.toBe(3);
    expect(solution.some((m) => m.from === 0 && m.to === 3)).toBe(true);
    const final = applySolution(cups, solution, constraints);
    expect(final).not.toBe(null);
    expect(isWonState(final as TeaId[][], constraints)).toBe(true);
    // Teapot served and empty; guest beautifully filled.
    expect((final as TeaId[][])[0]).toEqual([]);
    expect((final as TeaId[][])[3]).toHaveLength(MAX_CUP_CAPACITY);
  });
});

describe('K. deadlock is sink-aware', () => {
  it('partial sink with no matching movable tea and no escapes is deadlocked', () => {
    // Sink holds [A,A] (stuck: it can never source); both normals are
    // full homogeneous B with nowhere legal to go (each other full,
    // sink top A mismatches B).
    const cups: TeaId[][] = [
      [B, B, B, B],
      [B, B, B, B],
      [A, A],
    ];
    const constraints: CupConstraint[] = [N, N, SNK];
    expect(listLegalMoves(cups, true, constraints).length).toBe(0);
    expect(isWonState(cups, constraints)).toBe(false);
    expect(isDeadlockedState(cups, constraints)).toBe(true);
  });

  it('a sink that can still receive matching tea is NOT deadlocked', () => {
    const cups: TeaId[][] = [[A, A], [B, A], []];
    const constraints: CupConstraint[] = [N, N, SNK];
    // cup1 top A can land on the sink's A.
    expect(canPourBetween(cups, 1, 2, constraints)).toBe(true);
    expect(isDeadlockedState(cups, constraints)).toBe(false);
  });

  it('a fully solved sink puzzle is NOT deadlocked', () => {
    // Teapot empty + normals solved + sink full => won, never deadlocked.
    const won2: TeaId[][] = [[], [], [A, A, A, A], [B, B, B, B]];
    const constraints: CupConstraint[] = [SRC, N, N, SNK];
    expect(isWonState(won2, constraints)).toBe(true);
    expect(isDeadlockedState(won2, constraints)).toBe(false);
  });
});

describe('L. Mystery never touches the guest cup', () => {
  it('selectMysteryCup skips sink-only vessels', () => {
    const cups: TeaId[][] = [
      [B, A, A, A],
      [A, B, B, B],
      [],
      [],
    ];
    const constraints: CupConstraint[] = [N, N, N, SNK];
    for (let i = 0; i < 20; i++) {
      const idx = selectMysteryCup(cups, (cands) => cands[i % cands.length] ?? null, constraints);
      expect(idx).not.toBe(3);
    }
  });

  it('sink + Mystery peak keeps them distinct', () => {
    const cups: TeaId[][] = [
      [B, A, A, A],
      [A, B, B, B],
      [C, C, C, C],
      [B, B, C, C],
      [A, A, C, B],
      [],
      [],
    ];
    const constraints: CupConstraint[] = [N, N, N, N, N, N, SNK];
    const idx = selectMysteryCup(cups, (cands) => cands[0] ?? null, constraints);
    expect(idx).not.toBe(null);
    expect(idx).not.toBe(6);
    expect(constraints[idx as number]?.mode).toBe('normal');
  });
});
