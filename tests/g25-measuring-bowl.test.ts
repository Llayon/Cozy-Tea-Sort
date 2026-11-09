import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import { applyPourState, canPourState, isPuzzleWonState, pourCountState } from '../src/game/logic/rules';

function measuringConstraints(): CupConstraint[] {
  return [
    { mode: 'normal' },
    { mode: 'normal' },
    { mode: 'normal' },
    { mode: 'normal' },
    { mode: 'normal', capacity: 4, mustEndEmpty: true, g25MeteredDestination: true },
    { mode: 'normal' },
  ];
}

describe('G25 measuring bowl kernel', () => {
  it('ordinary AAA into special empty moves exactly 1', () => {
    const cons = measuringConstraints();
    const cups: TeaId[][] = [['matcha', 'matcha', 'matcha'], [], [], [], [], []];
    expect(canPourState({ cups, floatingIngredients: undefined }, 0, 4, cons)).toBe(true);
    expect(pourCountState({ cups, floatingIngredients: undefined }, 0, 4, cons)).toBe(1);
    const res = applyPourState({ cups, floatingIngredients: undefined }, 0, 4, cons);
    expect(res!.transferred).toBe(1);
    expect(res!.state.cups[4]).toEqual(['matcha']);
  });

  it('special source AAA moves maximal run', () => {
    const cons = measuringConstraints();
    const cups: TeaId[][] = [[], [], [], [], ['matcha', 'matcha', 'matcha'], []];
    expect(pourCountState({ cups, floatingIngredients: undefined }, 4, 5, cons)).toBe(3);
  });

  it('win requires special empty; undo restores exactly', () => {
    const cons = measuringConstraints();
    const won: TeaId[][] = [
      ['matcha', 'matcha', 'matcha', 'matcha'],
      ['sea_buckthorn', 'sea_buckthorn', 'sea_buckthorn', 'sea_buckthorn'],
      ['karkade', 'karkade', 'karkade', 'karkade'],
      ['milk_oolong', 'milk_oolong', 'milk_oolong', 'milk_oolong'],
      [],
      [],
    ];
    expect(isPuzzleWonState({ cups: won, floatingIngredients: undefined }, cons)).toBe(true);
    const fwd = applyPourState({ cups: [['matcha', 'matcha'], [], [], [], [], []], floatingIngredients: undefined }, 0, 4, cons)!;
    expect(fwd.state.cups[4]).toEqual(['matcha']);
    const back = applyPourState(fwd.state, 4, 0, cons)!;
    expect(back.state.cups[0]).toEqual(['matcha', 'matcha']);
    expect(back.state.cups[4]).toEqual([]);
  });
});
