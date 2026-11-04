import { describe, expect, it } from 'vitest';
import {
  CupConstraint,
  TeaId,
  cloneCupConstraint,
  cupConstraintSignature,
  isValidLayeredInfusionConstraint,
  layerRecipeExpectedTea,
} from '../src/game/types';
import {
  applyPourState,
  canonicalKey,
  canonicalPuzzleKey,
  cupEndStateSatisfied,
  isInFinalState,
  isPuzzleWonState,
  pourCountState,
  pourRejectCodeState,
} from '../src/game/logic/rules';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';

const A: TeaId = 'matcha';
const B: TeaId = 'karkade';
const C: TeaId = 'sea_buckthorn';
const N: CupConstraint = { mode: 'normal' };

function recipe2(): CupConstraint {
  return { mode: 'normal', capacity: 2, layerRecipe: [A, B] };
}
function recipe3(): CupConstraint {
  return { mode: 'normal', capacity: 3, layerRecipe: [A, B, C] };
}
function state(cups: TeaId[][]) {
  return { cups, floatingIngredients: cups.map(() => null) };
}

describe('G23 layered infusion — static contract', () => {
  it('valid 2/3-layer recipes are static, cloned and independently encoded', () => {
    const r2 = recipe2();
    const r3 = recipe3();
    expect(isValidLayeredInfusionConstraint(r2)).toBe(true);
    expect(isValidLayeredInfusionConstraint(r3)).toBe(true);
    expect(layerRecipeExpectedTea(r2, 0)).toBe(A);
    expect(layerRecipeExpectedTea(r2, 1)).toBe(B);
    expect(layerRecipeExpectedTea(r2, 2)).toBeNull();
    const clone = cloneCupConstraint(r2);
    expect(clone).toEqual(r2);
    expect(clone.layerRecipe).not.toBe(r2.layerRecipe);
    expect(cupConstraintSignature(r2)).toBe('N:_:C2:D:LR2:matcha>karkade');
    expect(cupConstraintSignature(r3)).toContain(':LR3:matcha>karkade>sea_buckthorn');
  });

  it('malformed recipes fail closed as static identity', () => {
    const cases: CupConstraint[] = [
      { mode: 'normal', capacity: 2, layerRecipe: [A, A] },
      { mode: 'normal', capacity: 3, layerRecipe: [A, B] },
      { mode: 'normal', capacity: 2, layerRecipe: [A, 'unknown' as TeaId] },
      { mode: 'source-only', capacity: 2, layerRecipe: [A, B] },
      { mode: 'normal', capacity: 2, layerRecipe: [A, B], targetTeaId: A },
      { mode: 'normal', capacity: 2, layerRecipe: [A, B], mustEndEmpty: true },
      { mode: 'normal', capacity: 2, layerRecipe: [A, B], steepingFlask: true },
    ];
    for (const c of cases) expect(isValidLayeredInfusionConstraint(c)).toBe(false);
    expect(cupConstraintSignature(cases[0] as CupConstraint)).toContain(':LR2:matcha>matcha');
  });
});

describe('G23 layered infusion — destination truth', () => {
  it('accepts only the next expected tea and caps a same-tea run to one layer', () => {
    const cons: CupConstraint[] = [N, recipe2(), N];
    const start = state([[A, A], [], [B]]);
    expect(pourRejectCodeState(start, 0, 1, cons)).toBe('ok');
    expect(pourCountState(start, 0, 1, cons)).toBe(1);
    const first = applyPourState(start, 0, 1, cons);
    expect(first).not.toBeNull();
    expect(first?.state.cups[0]).toEqual([A]);
    expect(first?.state.cups[1]).toEqual([A]);
    expect(first?.transferred).toBe(1);
    expect(first?.received).toBe(1);

    // A is not the next expected layer (B is), even though it is legal for
    // an ordinary cup. No state change.
    expect(pourRejectCodeState(first?.state ?? start, 0, 1, cons)).toBe(
      'target-recipe-wrong-layer',
    );
    expect(applyPourState(first?.state ?? start, 0, 1, cons)).toBeNull();

    const second = applyPourState(first?.state ?? start, 2, 1, cons);
    expect(second?.state.cups[1]).toEqual([A, B]);
    // Filled recipe: no overpour.
    expect(pourRejectCodeState(second?.state ?? start, 0, 1, cons)).toBe('target-full');
    expect(pourCountState(second?.state ?? start, 0, 1, cons)).toBe(0);
  });

  it('draining a recipe cup re-derives the expected position; source is ordinary', () => {
    const cons: CupConstraint[] = [N, recipe2(), N];
    const filled = state([[], [A, B], []]);
    // Special cup may source under ordinary rules.
    expect(pourRejectCodeState(filled, 1, 2, cons)).toBe('ok');
    expect(pourCountState(filled, 1, 2, cons)).toBe(1);
    const drained = applyPourState(filled, 1, 2, cons);
    expect(drained?.state.cups[1]).toEqual([A]);
    expect(drained?.state.cups[2]).toEqual([B]);
    // After removing B, B is expected again; A is wrong.
    expect(pourRejectCodeState(drained?.state ?? filled, 2, 1, cons)).toBe('ok');
    expect(pourRejectCodeState(drained?.state ?? filled, 0, 1, cons)).toBe(
      'source-empty',
    );
    const refill = applyPourState(drained?.state ?? filled, 2, 1, cons);
    expect(refill?.state.cups[1]).toEqual([A, B]);
  });

  it('three-layer recipe enforces the full ordered prefix', () => {
    const cons: CupConstraint[] = [N, recipe3(), N, N];
    const start = state([[A], [], [C], [B]]);
    expect(pourRejectCodeState(start, 2, 1, cons)).toBe('target-recipe-wrong-layer');
    expect(pourRejectCodeState(start, 0, 1, cons)).toBe('ok');
    const s1 = applyPourState(start, 0, 1, cons);
    expect(s1?.state.cups[1]).toEqual([A]);
    expect(pourRejectCodeState(s1?.state ?? start, 2, 1, cons)).toBe(
      'target-recipe-wrong-layer',
    );
    const s2 = applyPourState(s1?.state ?? start, 3, 1, cons);
    expect(s2?.state.cups[1]).toEqual([A, B]);
    const s3 = applyPourState(s2?.state ?? start, 2, 1, cons);
    expect(s3?.state.cups[1]).toEqual([A, B, C]);
    expect(cupEndStateSatisfied([A, B, C], recipe3())).toBe(true);
  });

  it('ordinary cups keep their legacy behavior', () => {
    const cups: TeaId[][] = [[A, A], [B], []];
    expect(pourRejectCodeState(state(cups), 0, 1)).toBe('color-mismatch');
    expect(pourRejectCodeState(state(cups), 0, 2)).toBe('ok');
    expect(pourCountState(state(cups), 0, 2)).toBe(2);
    expect(canonicalKey([[A], [B]])).toBe('karkade|matcha');
  });

  it('control: wrong first ingredient, reversed recipe and disabled mechanic', () => {
    const forward: CupConstraint = { mode: 'normal', capacity: 2, layerRecipe: [A, B] };
    const reversed: CupConstraint = { mode: 'normal', capacity: 2, layerRecipe: [B, A] };
    const emptySpecial = state([[B], []]);
    expect(pourRejectCodeState(emptySpecial, 0, 1, [N, forward])).toBe(
      'target-recipe-wrong-layer',
    );
    expect(pourRejectCodeState(emptySpecial, 0, 1, [N, reversed])).toBe('ok');
    // Disabling the mechanic removes the ordered destination gate entirely:
    // the same B pour is an ordinary legal empty-cup move.
    expect(pourRejectCodeState(emptySpecial, 0, 1, [N, N])).toBe('ok');
  });
});

describe('G23 layered infusion — victory and canonical identity', () => {
  it('victory requires the exact full recipe, not a prefix or wrong order', () => {
    const cons: CupConstraint[] = [N, N, recipe2()];
    const win = state([[A, A, A, A], [B, B, B, B], [A, B]]);
    expect(isPuzzleWonState(win, cons)).toBe(true);
    expect(isPuzzleWonState({ ...win, cups: [[A, A, A, A], [B, B, B, B], [A]] }, cons)).toBe(
      false,
    );
    expect(isPuzzleWonState({ ...win, cups: [[A, A, A, A], [B, B, B, B], [B, A]] }, cons)).toBe(
      false,
    );
    expect(isInFinalState([A, B], recipe2())).toBe(true);
    expect(isInFinalState([A], recipe2())).toBe(false);
    expect(isInFinalState([A, B], { mode: 'normal', capacity: 2, layerRecipe: [A, A] })).toBe(
      false,
    );
  });

  it('legacy canonical strings stay byte-identical without recipes', () => {
    const cups: TeaId[][] = [[A], [B], []];
    const plain: CupConstraint[] = [N, N, N];
    // Exact pre-G23 grouped key (all-normal constraint rows have always
    // carried the `N:_` section signature).
    expect(canonicalKey(cups, plain)).toBe('N:_:|karkade|matcha');
    expect(canonicalPuzzleKey(state(cups), plain)).toBe('N:_:|karkade|matcha');
    expect(canonicalKey(cups)).toBe('|karkade|matcha');
    expect(canonicalKey(cups, plain)).not.toContain(':LR');
  });

  it('distinguishes recipe length, sequence and special-cup position', () => {
    const cups: TeaId[][] = [[A], [B], [], []];
    const r2ab: CupConstraint = { mode: 'normal', capacity: 2, layerRecipe: [A, B] };
    const r2ba: CupConstraint = { mode: 'normal', capacity: 2, layerRecipe: [B, A] };
    const r3: CupConstraint = { mode: 'normal', capacity: 3, layerRecipe: [A, B, C] };
    const at2 = canonicalKey(cups, [N, N, r2ab, N]);
    const at3 = canonicalKey(cups, [N, N, N, r2ab]);
    const reversed = canonicalKey(cups, [N, N, r2ba, N]);
    const three = canonicalKey(cups, [N, N, r3, N]);
    expect(new Set([at2, at3, reversed, three]).size).toBe(4);
    expect(at2).toContain(':LR2:matcha>karkade@2');
    expect(at3).toContain(':LR2:matcha>karkade@3');
  });

  it('malformed recipes never satisfy and never behave like ordinary cups', () => {
    const bad: CupConstraint = { mode: 'normal', capacity: 2, layerRecipe: [A, A] };
    const cons: CupConstraint[] = [N, bad];
    expect(cupEndStateSatisfied([A, A], bad)).toBe(false);
    expect(isPuzzleWonState(state([[A, A, A, A], [A, A]]), cons)).toBe(false);
    expect(pourRejectCodeState(state([[B], []]), 0, 1, cons)).toBe(
      'target-recipe-invalid',
    );
  });
});

describe('G23 layered infusion — solver / undo integration', () => {
  it('solver uses the same pour truth and reaches exact win parity', () => {
    // Diagnostic minimal pool (not a feasibility-profile board): two units,
    // both destined for the recipe. Proves integration, not balance.
    const cups: TeaId[][] = [[B, A], [], []];
    const cons: CupConstraint[] = [N, N, recipe2()];
    const solved = solvePuzzle(cups, { cupConstraints: cons, maxVisited: 10_000, maxDepth: 20 });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated).toBeFalsy();
    expect(solved.minMoves).toBe(2);
    expect(solved.solution).toHaveLength(2);
    const final = applySolutionState(state(cups), solved.solution ?? [], cons);
    expect(final).not.toBeNull();
    expect(isPuzzleWonState(final ?? state(cups), cons)).toBe(true);
    expect(final?.cups[2]).toEqual([A, B]);
  });

  it('TeaSortLogic undo/restart restore recipe cup and constraints without extra state', () => {
    const cups: TeaId[][] = [[B, A], [], []];
    const cons: CupConstraint[] = [N, N, recipe2()];
    const logic = new TeaSortLogic(cups, [], cons);
    expect(logic.cupConstraints[2]?.layerRecipe).toEqual([A, B]);
    expect(logic.makeMove(0, 2)).not.toBeNull();
    expect(logic.cups[2]?.layers).toEqual([A]);
    expect(logic.cups[2]?.isComplete).toBe(false);
    expect(logic.makeMove(0, 2)).not.toBeNull();
    expect(logic.cups[2]?.layers).toEqual([A, B]);
    expect(logic.cups[2]?.isComplete).toBe(true);
    expect(logic.isWon()).toBe(true);
    expect(logic.undo()).not.toBeNull();
    expect(logic.cups[2]?.layers).toEqual([A]);
    expect(logic.cupConstraints[2]?.layerRecipe).toEqual([A, B]);
    expect(logic.isWon()).toBe(false);
    const restarted = new TeaSortLogic(cups, [], cons);
    expect(restarted.cups[0]?.layers).toEqual([B, A]);
    expect(restarted.cupConstraints[2]?.layerRecipe).toEqual([A, B]);
  });
});
