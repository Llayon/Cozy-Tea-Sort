import { describe, expect, it } from 'vitest';
import { CUP_SKINS, TEA_RECIPES } from '../src/data/teaRecipes';
import { getLevelConfig } from '../src/utils/difficultyCurve';

describe('reward source-of-truth consistency', () => {
  it('every rewardRecipeId exists in TEA_RECIPES', () => {
    const ids = new Set(TEA_RECIPES.map((r) => r.id));
    for (let lvl = 1; lvl <= 16; lvl++) {
      const cfg = getLevelConfig(lvl);
      if (cfg.rewardRecipeId) {
        expect(ids.has(cfg.rewardRecipeId)).toBe(true);
      }
    }
  });

  it('every rewardSkinId exists in CUP_SKINS', () => {
    const ids = new Set(CUP_SKINS.map((s) => s.id));
    for (let lvl = 1; lvl <= 16; lvl++) {
      const cfg = getLevelConfig(lvl);
      if (cfg.rewardSkinId) {
        expect(ids.has(cfg.rewardSkinId)).toBe(true);
      }
    }
  });

  it('reward levels match unlockLevel metadata (no silent drift)', () => {
    const recipeById = new Map(TEA_RECIPES.map((r) => [r.id, r]));
    const skinById = new Map(CUP_SKINS.map((s) => [s.id, s]));
    for (let lvl = 1; lvl <= 12; lvl++) {
      const cfg = getLevelConfig(lvl);
      if (cfg.rewardRecipeId) {
        expect(recipeById.get(cfg.rewardRecipeId)?.unlockLevel).toBe(lvl);
      }
      if (cfg.rewardSkinId) {
        expect(skinById.get(cfg.rewardSkinId)?.unlockLevel).toBe(lvl);
      }
    }
  });

  it('no duplicate reward assignment across the first 12 levels', () => {
    const seenRecipes = new Set<string>();
    const seenSkins = new Set<string>();
    for (let lvl = 1; lvl <= 12; lvl++) {
      const cfg = getLevelConfig(lvl);
      if (cfg.rewardRecipeId) {
        expect(seenRecipes.has(cfg.rewardRecipeId)).toBe(false);
        seenRecipes.add(cfg.rewardRecipeId);
      }
      if (cfg.rewardSkinId) {
        expect(seenSkins.has(cfg.rewardSkinId)).toBe(false);
        seenSkins.add(cfg.rewardSkinId);
      }
    }
  });
});
