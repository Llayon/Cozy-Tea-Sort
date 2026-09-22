import { describe, expect, it } from 'vitest';
import { getLevelConfig } from '../src/utils/difficultyCurve';
import { applyWin } from '../src/game/logic/progression';
import { TEA_RECIPES } from '../src/data/teaRecipes';

/**
 * P0 regression: the Pixi view lives across levels (useEffect([])), so the
 * win callback must NEVER use a captured initial React `level` for rewards.
 * The view now passes the completed level explicitly (boundLevel) and the
 * handler reads live refs. This test pins the reward path that the handler
 * implements: completing visible level 2 must reward level 2, even when a
 * stale closure still holds level 1.
 */
describe('stale level reward regression (P0)', () => {
  it('reward lookup uses the explicitly completed level, not the stale one', () => {
    const staleCapturedLevel = 1;
    const actuallyCompletedLevel = 2;

    const staleCfg = getLevelConfig(staleCapturedLevel);
    const freshCfg = getLevelConfig(actuallyCompletedLevel);

    // Level 1 rewards matcha (already owned from the start); level 2
    // rewards sea_buckthorn (genuinely new). A stale lookup is observable.
    expect(staleCfg.rewardRecipeId).toBe('matcha');
    expect(freshCfg.rewardRecipeId).toBe('sea_buckthorn');

    const before = {
      highestUnlockedLevel: 2,
      unlockedRecipes: ['matcha'] as Array<(typeof TEA_RECIPES)[number]['id']>,
      unlockedSkins: ['glass'] as Array<'glass' | 'ceramic' | 'porcelain'>,
    };

    const staleResult = applyWin(before, staleCapturedLevel, {
      recipeId: staleCfg.rewardRecipeId,
    });
    const freshResult = applyWin(before, actuallyCompletedLevel, {
      recipeId: freshCfg.rewardRecipeId,
    });

    // Stale path: "new unlock" for an already-owned recipe would be a lie
    // (and the old code showed the banner unconditionally).
    expect(staleResult.isNewRecipe).toBe(false);
    // Correct path: the actually completed level yields its own new reward.
    expect(freshResult.isNewRecipe).toBe(true);
    expect(freshResult.unlockedRecipes).toContain('sea_buckthorn');
    expect(freshResult.highestUnlockedLevel).toBe(3);
  });

  it('replaying the same level keeps identifying it (no N+1 creep)', () => {
    const before = {
      highestUnlockedLevel: 3,
      unlockedRecipes: ['matcha', 'sea_buckthorn'] as Array<(typeof TEA_RECIPES)[number]['id']>,
      unlockedSkins: ['glass'] as Array<'glass' | 'ceramic' | 'porcelain'>,
    };
    const replay = applyWin(before, 2, { recipeId: getLevelConfig(2).rewardRecipeId });
    expect(replay.highestUnlockedLevel).toBe(3);
    expect(replay.isNewRecipe).toBe(false);
  });
});
