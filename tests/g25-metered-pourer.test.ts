import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import { applyPourState, canPourState, isPuzzleWonState, pourCountState } from '../src/game/logic/rules';

function meteredConstraints(): CupConstraint[] {
  return [
    { mode: 'normal' },
    { mode: 'normal' },
    { mode: 'normal' },
    { mode: 'normal' },
    { mode: 'normal', capacity: 4, mustEndEmpty: true, g25MeteredSource: true },
    { mode: 'normal' },
  ];
}

describe('G25 metered pourer kernel', () => {
  it('special source AAA into empty moves exactly 1', () => {
    const cons = meteredConstraints();
    const cups: TeaId[][] = [[], [], [], [], ['matcha', 'matcha', 'matcha'], []];
    expect(canPourState({ cups, floatingIngredients: undefined }, 4, 5, cons)).toBe(true);
    expect(pourCountState({ cups, floatingIngredients: undefined }, 4, 5, cons)).toBe(1);
    const res = applyPourState({ cups, floatingIngredients: undefined }, 4, 5, cons);
    expect(res!.transferred).toBe(1);
    expect(res!.state.cups[4]).toEqual(['matcha', 'matcha']);
    expect(res!.state.cups[5]).toEqual(['matcha']);
  });

  it('ordinary source AAA moves maximal run', () => {
    const cons = meteredConstraints();
    const cups: TeaId[][] = [['matcha', 'matcha', 'matcha'], [], [], [], [], []];
    expect(pourCountState({ cups, floatingIngredients: undefined }, 0, 1, cons)).toBe(3);
  });

  it('special as destination behaves ordinarily', () => {
    const cons = meteredConstraints();
    const cups: TeaId[][] = [['matcha', 'matcha', 'matcha'], [], [], [], [], []];
    // destination is special but metered-source only caps SOURCE; dest ordinary
    expect(pourCountState({ cups, floatingIngredients: undefined }, 0, 4, cons)).toBe(3);
  });

  it('win requires special empty; undo restores exactly', () => {
    const cons = meteredConstraints();
    const won: TeaId[][] = [
      ['matcha', 'matcha', 'matcha', 'matcha'],
      ['sea_buckthorn', 'sea_buckthorn', 'sea_buckthorn', 'sea_buckthorn'],
      ['karkade', 'karkade', 'karkade', 'karkade'],
      ['milk_oolong', 'milk_oolong', 'milk_oolong', 'milk_oolong'],
      [],
      [],
    ];
    expect(isPuzzleWonState({ cups: won, floatingIngredients: undefined }, cons)).toBe(true);
    const notWon: TeaId[][] = [
      ['matcha', 'matcha', 'matcha', 'matcha'],
      ['sea_buckthorn', 'sea_buckthorn', 'sea_buckthorn', 'sea_buckthorn'],
      ['karkade', 'karkade', 'karkade', 'karkade'],
      ['milk_oolong', 'milk_oolong'],
      ['milk_oolong', 'milk_oolong'],
      [],
    ];
    expect(isPuzzleWonState({ cups: notWon, floatingIngredients: undefined }, cons)).toBe(false);
    // undo: pour 1 then pour back restores
    const cups: TeaId[][] = [[], [], [], [], ['matcha', 'matcha'], []];
    const fwd = applyPourState({ cups, floatingIngredients: undefined }, 4, 5, cons)!;
    expect(fwd.state.cups[5]).toEqual(['matcha']);
    const back = applyPourState(fwd.state, 5, 4, cons)!;
    expect(back.state.cups[4]).toEqual(['matcha', 'matcha']);
    expect(back.state.cups[5]).toEqual([]);
  });
});
