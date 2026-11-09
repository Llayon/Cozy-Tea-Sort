import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import {
  applyPourState,
  canPourState,
  canonicalPuzzleKey,
  isPuzzleWonState,
  pourCountState,
} from '../src/game/logic/rules';
import {
  G25_MIRROR_A,
  G25_MIRROR_B,
  g25MirrorRecipeForSlot,
} from '../src/game/logic/g25Research';

function mirrorConstraints(): CupConstraint[] {
  return [
    { mode: 'normal' },
    { mode: 'normal' },
    { mode: 'normal' },
    { mode: 'normal' },
    { mode: 'normal', capacity: 4, g25MirrorGroup: 'mirror-pair', g25MirrorRecipe: [...g25MirrorRecipeForSlot(0)] },
    { mode: 'normal', capacity: 4, g25MirrorGroup: 'mirror-pair', g25MirrorRecipe: [...g25MirrorRecipeForSlot(1)] },
  ];
}

describe('G25 mirror pair kernel', () => {
  it('accepts correct first layer, rejects wrong tea', () => {
    const cons = mirrorConstraints();
    // cup0 empty mirror expects A; cup1 has A run.
    const cups: TeaId[][] = [[G25_MIRROR_A, G25_MIRROR_A], [], [], [], [], []];
    expect(canPourState({ cups, floatingIngredients: undefined }, 0, 4, cons)).toBe(true);
    const wrong: TeaId[][] = [[G25_MIRROR_B, G25_MIRROR_B], [], [], [], [], []];
    expect(canPourState({ cups: wrong, floatingIngredients: undefined }, 0, 4, cons)).toBe(false);
  });

  it('accepts correct second layer and then expects B', () => {
    const cons = mirrorConstraints();
    const cups: TeaId[][] = [[G25_MIRROR_A], [], [], [], [G25_MIRROR_A], []];
    // dest [A] expects A; source [A] top A -> ok, count 1
    expect(canPourState({ cups, floatingIngredients: undefined }, 0, 4, cons)).toBe(true);
    expect(pourCountState({ cups, floatingIngredients: undefined }, 0, 4, cons)).toBe(1);
    // after [A,A], next must be B: A source must now be rejected
    const full2: TeaId[][] = [[G25_MIRROR_A], [], [], [], [G25_MIRROR_A, G25_MIRROR_A], []];
    expect(canPourState({ cups: full2, floatingIngredients: undefined }, 0, 4, cons)).toBe(false);
    const bSrc: TeaId[][] = [[G25_MIRROR_B, G25_MIRROR_B], [], [], [], [G25_MIRROR_A, G25_MIRROR_A], []];
    expect(canPourState({ cups: bSrc, floatingIngredients: undefined }, 0, 4, cons)).toBe(true);
  });

  it('bounds transfer by remaining recipe run (not just free space)', () => {
    const cons = mirrorConstraints();
    // dest [A] (len1, free3) expects one more A; source AAAA run 4 -> must cap to 1
    const cups: TeaId[][] = [
      [G25_MIRROR_A, G25_MIRROR_A, G25_MIRROR_A, G25_MIRROR_A],
      [],
      [],
      [],
      [G25_MIRROR_A],
      [],
    ];
    expect(pourCountState({ cups, floatingIngredients: undefined }, 0, 4, cons)).toBe(1);
    // dest [] expects AA run 2; source AAAA -> cap to 2
    const cups2: TeaId[][] = [
      [G25_MIRROR_A, G25_MIRROR_A, G25_MIRROR_A, G25_MIRROR_A],
      [],
      [],
      [],
      [],
      [],
    ];
    expect(pourCountState({ cups: cups2, floatingIngredients: undefined }, 0, 4, cons)).toBe(2);
  });

  it('mirror source can drain and progress regresses', () => {
    const cons = mirrorConstraints();
    const cups: TeaId[][] = [[], [], [], [], [G25_MIRROR_A, G25_MIRROR_A, G25_MIRROR_B], []];
    // drain B back to ordinary empty
    expect(canPourState({ cups, floatingIngredients: undefined }, 4, 0, cons)).toBe(true);
    const res = applyPourState({ cups, floatingIngredients: undefined }, 4, 0, cons);
    expect(res).not.toBeNull();
    expect(res!.state.cups[4]).toEqual([G25_MIRROR_A, G25_MIRROR_A]);
    // now expects B again
    expect(canPourState(res!.state, 4, 0, cons)).toBe(false); // dest ordinary [B] top B vs source A -> mismatch
  });

  it('exact final recipe wins; reversed does not', () => {
    const cons = mirrorConstraints();
    const A = G25_MIRROR_A;
    const B = G25_MIRROR_B;
    const won: TeaId[][] = [
      ['karkade', 'karkade', 'karkade', 'karkade'],
      ['milk_oolong', 'milk_oolong', 'milk_oolong', 'milk_oolong'],
      [],
      [],
      [A, A, B, B],
      [B, B, A, A],
    ];
    expect(isPuzzleWonState({ cups: won, floatingIngredients: undefined }, cons)).toBe(true);
    const reversed: TeaId[][] = [
      ['karkade', 'karkade', 'karkade', 'karkade'],
      ['milk_oolong', 'milk_oolong', 'milk_oolong', 'milk_oolong'],
      [],
      [],
      [B, B, A, A],
      [A, A, B, B],
    ];
    // recipes are slot-specific: cup4 must be [A,A,B,B], cup5 [B,B,A,A]; swapped fails
    expect(isPuzzleWonState({ cups: reversed, floatingIngredients: undefined }, cons)).toBe(false);
  });

  it('canonical keys separate mirrors from ordinary cups', () => {
    const cons = mirrorConstraints();
    const cups: TeaId[][] = [[], [], [], [], [], []];
    const keyFull = canonicalPuzzleKey({ cups, floatingIngredients: undefined }, cons);
    const ordinary: CupConstraint[] = [{ mode: 'normal' }, { mode: 'normal' }, { mode: 'normal' }, { mode: 'normal' }, { mode: 'normal' }, { mode: 'normal' }];
    const keyOrd = canonicalPuzzleKey({ cups, floatingIngredients: undefined }, ordinary);
    expect(keyFull).not.toBe(keyOrd);
    expect(keyFull).toContain('MIR');
  });

  it('control (no markers) uses ordinary color rules', () => {
    const ordinary: CupConstraint[] = [{ mode: 'normal' }, { mode: 'normal' }, { mode: 'normal' }, { mode: 'normal' }, { mode: 'normal' }, { mode: 'normal' }];
    // B onto [A,A] must be rejected ordinarily but allowed in mirror
    const cups: TeaId[][] = [[G25_MIRROR_B], [], [], [], [G25_MIRROR_A, G25_MIRROR_A], []];
    expect(canPourState({ cups, floatingIngredients: undefined }, 0, 4, ordinary)).toBe(false);
    expect(canPourState({ cups, floatingIngredients: undefined }, 0, 4, mirrorConstraints())).toBe(true);
  });
});
