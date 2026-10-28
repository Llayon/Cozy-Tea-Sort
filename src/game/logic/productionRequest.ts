/**
 * ONE production mapping from a rollout LevelConfig to the generator request.
 *
 * G18 maintainability extraction: App previously duplicated this exact
 * mapping in two places, and audit scripts a third time. This is a pure
 * projection (no rules, no generation policy); the generator remains the
 * single gameplay/generation truth.
 */
import type { LevelConfig } from '../../types/tea';
import type { GenerateRequest } from './generator';

export function generateRequestForLevelConfig(cfg: LevelConfig): GenerateRequest {
  return {
    numColors: cfg.numColors,
    colors: [...cfg.colors],
    emptyCups: cfg.emptyCups,
    hasMysteryLayer: cfg.hasMysteryLayer,
    sourceOnlyCount: cfg.hasSourceOnlyTeapot ? 1 : 0,
    sinkOnlyCount: cfg.hasSinkGuestCup ? 1 : 0,
    tastingCupCount: cfg.hasTastingBowl ? 1 : 0,
    floatingIngredient: cfg.floatingIngredient,
    hasStrainer: cfg.hasStrainer,
    sinkingIngredient: cfg.sinkingIngredient,
    frozenCupCount: cfg.hasFrozenCup ? 1 : 0,
    thermosCupCount: cfg.hasThermos ? 1 : 0,
    cinnamonCupCount: cfg.hasCinnamon ? 1 : 0,
    teaBudCount: cfg.hasTeaBloom ? 1 : 0,
    blendRecipeId: cfg.hasBlend ? 'milk-tea' : undefined,
    serveOrderCount: cfg.hasServingOrder ? 2 : 0,
    sharedTrayCount: cfg.hasSharedTray ? 1 : 0,
    teaPairCount: cfg.hasTeaPair ? 1 : 0,
    targetTeaIds: [...cfg.targetTeaIds],
    phase: cfg.phase,
  };
}
