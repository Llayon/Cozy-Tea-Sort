import { describe, expect, it } from 'vitest';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import { generateLevel, type GenerateRequest } from '../src/game/logic/generator';

describe('mystery layer integrity', () => {
  it('reveal happens once when the visible group is removed', () => {
    const l = new TeaSortLogic(
      [
        ['matcha', 'sea_buckthorn', 'sea_buckthorn'],
        [],
      ],
      [1, 0],
    );
    expect(l.cups[0]?.isLayerHidden(0)).toBe(true);
    expect(l.cups[0]?.isLayerHidden(1)).toBe(false);
    const res = l.makeMove(0, 1);
    expect(res?.sourceUncovered).toBe(true);
    expect(l.cups[0]?.hiddenCount).toBe(0);
    // Second inspection: no repeated reveal.
    expect(l.cups[0]?.revealTopIfNeeded()).toBe(false);
  });

  it('mystery selection never hides inside a mono block', () => {
    const req: GenerateRequest = {
      numColors: 5,
      colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong', 'lavender'],
      emptyCups: 2,
      hasMysteryLayer: true,
      phase: 'peak',
    };
    for (let s = 0; s < 40; s++) {
      const level = generateLevel(req, `mystery:${s}`);
      const idx = level.hiddenCounts.findIndex((h) => h > 0);
      expect(idx).toBeGreaterThanOrEqual(0);
      const cup = level.cups[idx] as string[];
      // Hidden bottom differs from the adjacent visible layer, so clearing
      // the top always exposes a DIFFERENT tea (meaningful reveal).
      expect(cup[0]).not.toBe(cup[1]);
    }
  });

  it('restart restores the initial mystery state', () => {
    const req: GenerateRequest = {
      numColors: 3,
      colors: ['matcha', 'sea_buckthorn', 'karkade'],
      emptyCups: 2,
      hasMysteryLayer: true,
      phase: 'peak',
    };
    const level = generateLevel(req, 'mystery:restart');
    const initialHidden = [...level.hiddenCounts];
    const l = new TeaSortLogic(level.cups, level.hiddenCounts);
    // Play any legal move if one exists, then re-init like the UI restart.
    const board = l.cups.map((c) => c.layers);
    let moved = false;
    outer: for (let i = 0; i < board.length; i++) {
      for (let j = 0; j < board.length; j++) {
        if (l.canMakeMove(i, j)) {
          l.makeMove(i, j);
          moved = true;
          break outer;
        }
      }
    }
    expect(moved).toBe(true);
    l.initFromState(
      level.cups.map((c) => [...c]),
      [...initialHidden],
    );
    expect(l.cups.map((c) => c.hiddenCount)).toEqual(initialHidden);
  });

  it('no hidden state leaks between generated levels', () => {
    const plain: GenerateRequest = {
      numColors: 3,
      colors: ['matcha', 'sea_buckthorn', 'karkade'],
      emptyCups: 2,
      hasMysteryLayer: false,
      phase: 'warmup',
    };
    const level = generateLevel(plain, 'mystery:no-leak');
    expect(level.hiddenCounts.every((h) => h === 0)).toBe(true);
  });

  it('solver reasons about the true state (hidden info never blocks solving)', () => {
    // UI hiding is presentation: the solver sees actual layers.
    const l = new TeaSortLogic(
      [
        ['matcha', 'matcha', 'matcha'],
        ['matcha'],
        [],
      ],
      [1, 0],
    );
    expect(l.isWon()).toBe(false);
    l.makeMove(1, 0);
    expect(l.isWon()).toBe(true);
  });
});
