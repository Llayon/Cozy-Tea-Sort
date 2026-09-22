/**
 * Pure progression helpers — testable without React.
 *
 * Semantics:
 * - `currentLevel`      = the puzzle currently being played.
 * - `highestUnlockedLevel` = furthest progression legitimately earned.
 * - Completing level N sets highest to at least N+1 (unlocks next).
 * - Replaying N never advances beyond N+1 and never re-emits rewards.
 * - Skipping (starting N+1 without winning N) must not change highest.
 */

import { CupSkinId, TeaId } from '../types';

export interface WinRewards {
  recipeId?: TeaId;
  skinId?: CupSkinId;
}

export interface ProgressCollections {
  highestUnlockedLevel: number;
  unlockedRecipes: TeaId[];
  unlockedSkins: CupSkinId[];
}

export interface WinApplication extends ProgressCollections {
  /** True only when the persistent collection actually gained an entry. */
  isNewRecipe: boolean;
  isNewSkin: boolean;
}

export function sanitizeLevel(n: unknown, fallback = 1): number {
  const v = typeof n === 'number' ? n : typeof n === 'string' ? parseInt(n, 10) : NaN;
  if (!Number.isFinite(v)) return fallback;
  return Math.max(1, Math.min(999, Math.floor(v as number)));
}

export function isLevelUnlocked(level: number, highestUnlockedLevel: number): boolean {
  return level >= 1 && level <= highestUnlockedLevel;
}

/**
 * Apply a victory on `completedLevel`. Pure — persistence is the caller's job.
 * Reward "newness" is derived from the collections BEFORE the win, so replaying
 * an already-completed level never reports a duplicate "new reward".
 */
export function applyWin(
  prev: ProgressCollections,
  completedLevel: number,
  rewards: WinRewards,
): WinApplication {
  const completed = sanitizeLevel(completedLevel);
  const highestUnlockedLevel = Math.max(
    sanitizeLevel(prev.highestUnlockedLevel),
    completed + 1,
  );

  let unlockedRecipes = prev.unlockedRecipes;
  let isNewRecipe = false;
  if (rewards.recipeId) {
    if (!prev.unlockedRecipes.includes(rewards.recipeId)) {
      unlockedRecipes = [...prev.unlockedRecipes, rewards.recipeId];
      isNewRecipe = true;
    }
  }

  let unlockedSkins = prev.unlockedSkins;
  let isNewSkin = false;
  if (rewards.skinId) {
    if (!prev.unlockedSkins.includes(rewards.skinId)) {
      unlockedSkins = [...prev.unlockedSkins, rewards.skinId];
      isNewSkin = true;
    }
  }

  return { highestUnlockedLevel, unlockedRecipes, unlockedSkins, isNewRecipe, isNewSkin };
}
