import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyWin } from '../src/game/logic/progression';

/**
 * GAUNTLET 0.1 — §8 / tests J & K. Progression semantics are unchanged:
 * N -> N+1 ONLY via victory; reshuffle/restart/replay never advance
 * highestUnlockedLevel; replay rewards stay idempotent.
 */
describe('replay reward idempotency (J)', () => {
  it('second win on the same level reports no new recipe or skin', () => {
    const before = {
      highestUnlockedLevel: 5,
      unlockedRecipes: ['matcha', 'sea_buckthorn', 'karkade', 'saffron'] as Array<
        'matcha' | 'sea_buckthorn' | 'karkade' | 'milk_oolong' | 'lavender' | 'saffron' | 'buckwheat'
      >,
      unlockedSkins: ['glass', 'ceramic'] as Array<'glass' | 'ceramic' | 'porcelain'>,
    };
    const first = applyWin(before, 4, { recipeId: 'saffron', skinId: 'ceramic' });
    // Already owned from earlier wins: nothing new even on "first" application.
    expect(first.isNewRecipe).toBe(false);
    expect(first.isNewSkin).toBe(false);
    const replay = applyWin(first, 4, { recipeId: 'saffron', skinId: 'ceramic' });
    expect(replay.isNewRecipe).toBe(false);
    expect(replay.isNewSkin).toBe(false);
    expect(replay.highestUnlockedLevel).toBe(5);
    expect(replay.unlockedRecipes).toHaveLength(4);
    expect(replay.unlockedSkins).toHaveLength(2);
  });
});

describe('next level only via win (K): App wiring guard', () => {
  const src = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

  it('applyWin is called exactly once, inside the victory flow', () => {
    expect(src.match(/applyWin\(/g)?.length).toBe(1);
    const onWinBlock = src.slice(src.indexOf('onWin:'), src.indexOf('onDeadlock:'));
    expect(onWinBlock).toContain('applyWin(');
  });

  it('startLevel / reshuffle never touch highestUnlockedLevel', () => {
    const startBlock = src.slice(src.indexOf('const startLevel'), src.indexOf('/** Footer action'));
    expect(startBlock).not.toContain('applyWin(');
    expect(startBlock).not.toContain('setHighestUnlockedSafe(');
    const reshuffleBlock = src.slice(
      src.indexOf('const reshuffleCurrentLevel'),
      src.indexOf('useEffect(() => {'),
    );
    expect(reshuffleBlock).not.toContain('applyWin(');
    expect(reshuffleBlock).not.toContain('setHighestUnlockedSafe(');
  });
});
