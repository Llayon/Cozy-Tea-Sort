/**
 * Gauntlet 13 Phase A — canonical + legacy regression (§§68-70).
 *
 * No new dynamic state: canonical tea contents already encode A/B/P.
 * Recipe is fixed per solver invocation, so state keys do NOT repeat it.
 * All pre-G13 canonical fixtures remain byte-identical.
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import { canonicalKey, canonicalPuzzleKey } from '../src/game/logic/rules';
import { DEV_ABSTRACT_BLEND_RECIPE } from '../src/game/logic/blendRecipe';

const A: TeaId = 'matcha';
const B: TeaId = 'karkade';
const N: CupConstraint = { mode: 'normal' };

describe('reaction progress via tea contents (no #reaction markers)', () => {
  it('pre/post reaction keys differ by tea only, no reaction counter segment', () => {
    const before = canonicalPuzzleKey(
      { cups: [[A], [B]] as TeaId[][], floatingIngredients: [null, null] },
      [N, N],
    );
    const after = canonicalPuzzleKey(
      { cups: [[], ['saffron']] as TeaId[][], floatingIngredients: [null, null] },
      [N, N],
    );
    expect(before).not.toBe(after);
    expect(before).not.toContain('#reaction');
    expect(after).not.toContain('#reaction');
    expect(before).not.toContain('reactionCount');
    expect(after).not.toContain('recipeProgress');
  });

  it('same tea board keys identically with and without recipe (static context, not key)', () => {
    const cups: TeaId[][] = [[A, B], [B, A]];
    const noRecipe = canonicalPuzzleKey({ cups, floatingIngredients: [null, null] }, [N, N]);
    // Recipe is invocation-fixed: the state key itself is recipe-agnostic.
    // Cross-context comparisons must use a higher-level wrapper; legacy
    // strings never change globally.
    expect(noRecipe).toBe(canonicalKey(cups, [N, N]));
    void DEV_ABSTRACT_BLEND_RECIPE;
  });
});

describe('legacy byte-identity (recipe absent)', () => {
  it('plain boards keep exact legacy keys', () => {
    const cups: TeaId[][] = [[A, B], [], [B, A, A, B]];
    const cons: CupConstraint[] = [N, { mode: 'normal' }, N];
    const noField = { cups, floatingIngredients: [null, null, null] as null[] };
    expect(canonicalPuzzleKey(noField, cons)).toBe(canonicalKey(cups, cons));
  });

  it('vessel permutation still collapses (reaction adds no key fragments)', () => {
    const cons = [N, N];
    const a = canonicalPuzzleKey(
      { cups: [[A], [B]] as TeaId[][], floatingIngredients: [null, null] },
      cons,
    );
    const b = canonicalPuzzleKey(
      { cups: [[B], [A]] as TeaId[][], floatingIngredients: [null, null] },
      cons,
    );
    expect(a).toBe(b);
  });
});
