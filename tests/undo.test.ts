import { describe, expect, it } from 'vitest';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import { TeaId } from '../src/game/types';

describe('undo / history integrity', () => {
  it('single move + undo restores exact layers and counters', () => {
    const l = new TeaSortLogic(
      [
        ['matcha', 'karkade'],
        ['sea_buckthorn', 'karkade'],
      ],
      [0, 0],
    );
    const before = l.toState();
    const res = l.makeMove(0, 1);
    expect(res).not.toBeNull();
    expect(l.movesCount).toBe(1);
    expect(l.canUndo).toBe(true);

    const undone = l.undo();
    expect(undone).not.toBeNull();
    expect(l.toState()).toEqual(before);
    expect(l.movesCount).toBe(0);
    expect(l.canUndo).toBe(false);
  });

  it('multi-move + multiple undo unwinds in order', () => {
    const l = new TeaSortLogic([
      ['matcha', 'karkade', 'sea_buckthorn'],
      ['matcha', 'karkade'],
      [],
    ]);
    const s0 = l.toState();
    expect(l.makeMove(0, 2)).not.toBeNull();
    const s1 = l.toState();
    expect(l.makeMove(0, 1)).not.toBeNull();
    expect(l.movesCount).toBe(2);
    expect(l.history).toHaveLength(2);

    l.undo();
    expect(l.toState()).toEqual(s1);
    expect(l.movesCount).toBe(1);
    l.undo();
    expect(l.toState()).toEqual(s0);
    expect(l.movesCount).toBe(0);
  });

  it('undo on empty history is safe', () => {
    const l = new TeaSortLogic([['matcha'], []]);
    expect(l.undo()).toBeNull();
    expect(l.movesCount).toBe(0);
    expect(l.canUndo).toBe(false);
  });

  it('undo restores hidden (mystery) state', () => {
    const l = new TeaSortLogic(
      [
        ['karkade', 'matcha', 'matcha'],
        [],
      ],
      [1, 0],
    );
    expect(l.cups[0]?.hiddenCount).toBe(1);
    // Removing the whole visible group leaves 1 layer under foam of 1 -> reveal.
    const res = l.makeMove(0, 1);
    expect(res?.sourceUncovered).toBe(true);
    expect(l.cups[0]?.hiddenCount).toBe(0);
    // Undo must bring the hidden counter back exactly.
    l.undo();
    expect(l.cups[0]?.hiddenCount).toBe(1);
    expect(l.cups[0]?.layers).toEqual(['karkade', 'matcha', 'matcha']);
  });

  it('history shrinks and move count decrements on every undo', () => {
    const l = new TeaSortLogic([
      ['matcha', 'sea_buckthorn'],
      ['karkade', 'sea_buckthorn'],
      [],
    ]);
    l.makeMove(0, 2);
    l.makeMove(1, 2);
    expect(l.history).toHaveLength(2);
    l.undo();
    expect(l.history).toHaveLength(1);
    expect(l.movesCount).toBe(1);
  });

  it('completed state can be undone at logic level', () => {
    const l = new TeaSortLogic([
      ['matcha', 'matcha', 'matcha'],
      ['matcha'],
      [],
    ]);
    // Move single matcha onto the triple -> completes the cup, wins.
    const res = l.makeMove(1, 0);
    expect(res).not.toBeNull();
    expect(l.isWon()).toBe(true);
    // Logic stays sane even after victory (UI may disable the button).
    const undone = l.undo();
    expect(undone).not.toBeNull();
    expect(l.isWon()).toBe(false);
    expect(l.movesCount).toBe(0);
  });

  it('redo through another path after undo does not corrupt state', () => {
    const l = new TeaSortLogic([
      ['matcha', 'karkade'],
      ['sea_buckthorn', 'karkade'],
      [],
    ]);
    l.makeMove(0, 1);
    l.undo();
    const res = l.makeMove(0, 2);
    expect(res?.move.count).toBe(1);
    expect(l.cups[0]?.layers).toEqual(['matcha']);
    expect(l.cups[2]?.layers).toEqual(['karkade']);
    expect(l.history).toHaveLength(1);
  });
});
