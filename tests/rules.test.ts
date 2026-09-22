import { describe, expect, it } from 'vitest';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import { MAX_CUP_CAPACITY, TeaId } from '../src/game/types';
import { canPourBetween, isDeadlockedState, isWonState } from '../src/game/logic/rules';

function logic(cups: TeaId[][], hidden: number[] = []): TeaSortLogic {
  return new TeaSortLogic(cups, hidden);
}

describe('cup rules (single source of truth)', () => {
  it('empty source cannot pour', () => {
    const l = logic([[], ['matcha']]);
    expect(l.canMakeMove(0, 1)).toBe(false);
    expect(l.makeMove(0, 1)).toBeNull();
  });

  it('full target cannot receive', () => {
    const full: TeaId[] = ['matcha', 'matcha', 'matcha', 'matcha'];
    const l = logic([['karkade'], full]);
    expect(l.canMakeMove(0, 1)).toBe(false);
  });

  it('cup cannot pour into itself', () => {
    const l = logic([['matcha', 'karkade']]);
    expect(l.canMakeMove(0, 0)).toBe(false);
  });

  it('empty target accepts a valid source', () => {
    const l = logic([['matcha', 'karkade'], []]);
    expect(l.canMakeMove(0, 1)).toBe(true);
  });

  it('different top colors reject', () => {
    const l = logic([
      ['matcha', 'karkade'],
      ['sea_buckthorn', 'matcha'],
    ]);
    expect(l.canMakeMove(0, 1)).toBe(false);
  });

  it('same top colors accept', () => {
    const l = logic([
      ['matcha', 'karkade'],
      ['sea_buckthorn', 'karkade'],
    ]);
    expect(l.canMakeMove(0, 1)).toBe(true);
  });

  it('moves the whole consecutive top group at once', () => {
    const l = logic([
      ['matcha', 'karkade', 'karkade'],
      ['sea_buckthorn'],
      [],
    ]);
    const res = l.makeMove(0, 2);
    expect(res?.move.count).toBe(2);
    expect(l.cups[0]?.layers).toEqual(['matcha']);
    expect(l.cups[2]?.layers).toEqual(['karkade', 'karkade']);
  });

  it('capacity limits the transferred count', () => {
    const l = logic([
      ['karkade', 'karkade', 'karkade'],
      ['matcha', 'matcha', 'karkade'],
    ]);
    // target has 1 free slot, source top group is 3 -> only 1 moves
    const res = l.makeMove(0, 1);
    expect(res?.move.count).toBe(1);
    expect(l.cups[1]?.layers).toHaveLength(MAX_CUP_CAPACITY);
  });

  it('complete cup is recognized only when full and mono', () => {
    const l = logic([
      ['matcha', 'matcha', 'matcha', 'matcha'],
      ['matcha', 'matcha', 'matcha'],
      ['matcha', 'matcha', 'karkade', 'matcha'],
      [],
    ]);
    expect(l.cups[0]?.isComplete).toBe(true);
    expect(l.cups[1]?.isComplete).toBe(false);
    expect(l.cups[2]?.isComplete).toBe(false);
    expect(l.cups[3]?.isComplete).toBe(false);
  });

  it('complete mono cup -> empty cup is forbidden (documented loop rule)', () => {
    const l = logic([
      ['matcha', 'matcha', 'matcha', 'matcha'],
      [],
    ]);
    expect(l.canMakeMove(0, 1)).toBe(false);
    expect(canPourBetween([['matcha', 'matcha', 'matcha', 'matcha'], []], 0, 1)).toBe(false);
  });

  it('win requires every non-empty cup to be complete', () => {
    expect(
      isWonState([
        ['matcha', 'matcha', 'matcha', 'matcha'],
        ['karkade', 'karkade', 'karkade', 'karkade'],
        [],
      ]),
    ).toBe(true);
    expect(
      isWonState([
        ['matcha', 'matcha', 'matcha', 'matcha'],
        ['karkade', 'karkade', 'karkade'],
        [],
      ]),
    ).toBe(false);
    expect(isWonState([[], []])).toBe(false);
  });

  it('deadlock ignores homogeneous-stack -> empty relocations (documented)', () => {
    // Only move available: homogeneous partial stack to empty (non-constructive).
    expect(
      isDeadlockedState([
        ['matcha', 'matcha'],
        ['karkade', 'karkade'],
        [],
      ]),
    ).toBe(true);
    // A constructive move exists here (karkade onto karkade).
    expect(
      isDeadlockedState([
        ['matcha', 'karkade'],
        ['sea_buckthorn', 'karkade'],
        [],
      ]),
    ).toBe(false);
  });

  it('out-of-range indices are illegal, never throw', () => {
    const l = logic([['matcha']]);
    expect(l.canMakeMove(-1, 0)).toBe(false);
    expect(l.canMakeMove(0, 5)).toBe(false);
    expect(l.makeMove(0, 5)).toBeNull();
  });
});
