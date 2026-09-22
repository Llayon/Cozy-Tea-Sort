import { describe, expect, it } from 'vitest';
import { applyWin, isLevelUnlocked } from '../src/game/logic/progression';

describe('progression (pure)', () => {
  it('completing level N advances highestUnlockedLevel to at least N+1', () => {
    const res = applyWin(
      { highestUnlockedLevel: 1, unlockedRecipes: ['matcha'], unlockedSkins: ['glass'] },
      1,
      { recipeId: 'sea_buckthorn' },
    );
    expect(res.highestUnlockedLevel).toBe(2);
    expect(res.isNewRecipe).toBe(true);
    expect(res.unlockedRecipes).toContain('sea_buckthorn');
  });

  it('replay does not advance again and emits no duplicate reward', () => {
    const afterFirst = applyWin(
      { highestUnlockedLevel: 2, unlockedRecipes: ['matcha', 'sea_buckthorn'], unlockedSkins: ['glass'] },
      1,
      { recipeId: 'sea_buckthorn' },
    );
    expect(afterFirst.highestUnlockedLevel).toBe(2);
    expect(afterFirst.isNewRecipe).toBe(false);
    expect(afterFirst.unlockedRecipes).toEqual(['matcha', 'sea_buckthorn']);
  });

  it('skin reward is emitted only once', () => {
    const first = applyWin(
      { highestUnlockedLevel: 3, unlockedRecipes: ['matcha'], unlockedSkins: ['glass'] },
      3,
      { recipeId: 'karkade', skinId: 'ceramic' },
    );
    expect(first.isNewSkin).toBe(true);
    const replay = applyWin(first, 3, { recipeId: 'karkade', skinId: 'ceramic' });
    expect(replay.isNewSkin).toBe(false);
    expect(replay.unlockedSkins.filter((s) => s === 'ceramic')).toHaveLength(1);
  });

  it('skipping the current puzzle must not unlock future levels (pure rule)', () => {
    // applyWin is only ever called from the victory flow with the explicitly
    // completed level; merely starting level N+1 never touches highest.
    // This test pins the gate used by the UI layer.
    expect(isLevelUnlocked(2, 1)).toBe(false);
    expect(isLevelUnlocked(1, 1)).toBe(true);
    const res = applyWin(
      { highestUnlockedLevel: 1, unlockedRecipes: ['matcha'], unlockedSkins: ['glass'] },
      1,
      {},
    );
    expect(isLevelUnlocked(2, res.highestUnlockedLevel)).toBe(true);
  });

  it('recipe/skin persistence stays stable across repeated wins', () => {
    let state = {
      highestUnlockedLevel: 5,
      unlockedRecipes: ['matcha', 'sea_buckthorn', 'karkade', 'saffron', 'milk_oolong'] as const,
      unlockedSkins: ['glass', 'ceramic', 'porcelain'] as const,
    };
    const res = applyWin(
      {
        highestUnlockedLevel: state.highestUnlockedLevel,
        unlockedRecipes: [...state.unlockedRecipes],
        unlockedSkins: [...state.unlockedSkins],
      },
      5,
      { recipeId: 'milk_oolong', skinId: 'porcelain' },
    );
    expect(res.isNewRecipe).toBe(false);
    expect(res.isNewSkin).toBe(false);
    expect(res.unlockedRecipes).toHaveLength(state.unlockedRecipes.length);
    expect(res.unlockedSkins).toHaveLength(state.unlockedSkins.length);
  });

  it('win without rewards only advances the level gate', () => {
    const res = applyWin(
      { highestUnlockedLevel: 7, unlockedRecipes: ['matcha'], unlockedSkins: ['glass'] },
      7,
      {},
    );
    expect(res.highestUnlockedLevel).toBe(8);
    expect(res.isNewRecipe).toBe(false);
    expect(res.isNewSkin).toBe(false);
  });
});
