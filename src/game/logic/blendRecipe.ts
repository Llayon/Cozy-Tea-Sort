/**
 * Generic blend-reaction kernel (Gauntlet 13 Phase A — feasibility only).
 *
 * REACTION / CRAFTING: two different liquid layers may chemically combine
 * into ONE layer of a THIRD identity. This is the first mechanic that breaks
 * the G1–G12 invariant (a TeaId layer never transforms into another TeaId).
 *
 * FEASIBILITY FIRST: Phase A proves the GENERIC kernel using EXISTING TeaIds
 * only (matcha + karkade → saffron). No production IDs (black_tea/milk/
 * milk_tea), no art, no tutorial, no templates, no rollout are added here.
 *
 * - `BlendRecipe` is IMMUTABLE level data (static context, never PuzzleState).
 * - Chemistry exists ONLY when a level explicitly carries a recipe. When the
 *   recipe is undefined every function behaves exactly as before (legacy
 *   byte-identical).
 * - ONE authoritative pair truth (`isReactivePair`); ONE authoritative pour
 *   truth (`applyPourState` in rules.ts); NO second solver, NO craft action.
 *
 * No Pixi/React imports here — pure domain logic only.
 */

import type { TeaId } from '../types';

/** Production recipe identity (single recipe supported in G13). */
export type BlendRecipeId = 'milk-tea';

/**
 * Static immutable recipe configuration (never PuzzleState, never mutated).
 *
 * - `reactantA` + `reactantB` combine into `product` on contact.
 * - `targetProductCount` is the required final product total (4 in G13).
 * - Progress derives from current tea contents (A+P, B+P invariants), never
 *   from a dynamic counter.
 */
export interface BlendRecipe {
  id: BlendRecipeId;
  reactantA: TeaId;
  reactantB: TeaId;
  product: TeaId;
  targetProductCount: number;
}

/**
 * Presentation/trace metadata for a single reaction inside an otherwise
 * ordinary POUR (cost 1, kind 'pour'). Metadata only — replay re-derives
 * chemistry from state + from/to + static recipe, never trusts this.
 */
export interface BlendReactionMetadata {
  recipeId: BlendRecipeId;
  sourceReactant: TeaId;
  targetReactant: TeaId;
  product: TeaId;
}

/**
 * DEV-ONLY abstract recipe for Phase A feasibility (existing TeaIds only).
 * Mathematical mapping only — never player-facing («матча + каркаде» is NOT
 * exposed to players). Production IDs arrive in Phase B only if the gate
 * passes.
 *
 * - A = matcha, B = karkade, P = saffron (starts at ZERO layers).
 * - Fillers C/D use sea_buckthorn / buckwheat (or equivalent non-product).
 */
export const DEV_ABSTRACT_BLEND_RECIPE: BlendRecipe = {
  id: 'milk-tea',
  reactantA: 'matcha',
  reactantB: 'karkade',
  product: 'saffron',
  targetProductCount: 4,
};

/**
 * Production recipe (Phase B): BLACK TEA + MILK → MILK TEA.
 * Single source of truth for generation, rules, solver, UI and rollout.
 * Immutable — never PuzzleState, never mutated, never counted dynamically.
 */
export const MILK_TEA_BLEND_RECIPE: BlendRecipe = {
  id: 'milk-tea',
  reactantA: 'black_tea',
  reactantB: 'milk',
  product: 'milk_tea',
  targetProductCount: 4,
};

/** Resolve an explicit recipe request to its immutable definition. */
export function resolveBlendRecipe(id: BlendRecipeId | undefined | null): BlendRecipe | undefined {
  if (id === 'milk-tea') return MILK_TEA_BLEND_RECIPE;
  return undefined;
}

/**
 * ONE authoritative reactive-pair truth. Returns true iff the unordered pair
 * {sourceTop, targetTop} equals {reactantA, reactantB}. Symmetric by design:
 * both A→B and B→A react. Product is inert (never reacts, even with itself
 * or its reactants). No duplicated pair logic elsewhere.
 */
export function isReactivePair(
  sourceTop: TeaId | null | undefined,
  targetTop: TeaId | null | undefined,
  recipe: BlendRecipe | undefined | null,
): boolean {
  if (!recipe) return false;
  if (sourceTop == null || targetTop == null) return false;
  const { reactantA, reactantB } = recipe;
  return (
    (sourceTop === reactantA && targetTop === reactantB) ||
    (sourceTop === reactantB && targetTop === reactantA)
  );
}

/** Total layers of one TeaId across all vessels. */
export function countTeaLayers(cups: readonly TeaId[][], tea: TeaId): number {
  let n = 0;
  for (const cup of cups) {
    for (const layer of cup as TeaId[]) {
      if (layer === tea) n++;
    }
  }
  return n;
}

/** Total tea layers across all vessels. */
export function countTotalLayers(cups: readonly TeaId[][]): number {
  let n = 0;
  for (const cup of cups) n += (cup as TeaId[]).length;
  return n;
}

/**
 * Recipe completion derives from CURRENT contents (authoritative). True iff
 * both reactants are gone and the product total equals the target. Never
 * trust a dynamic reaction counter.
 */
export function isBlendRecipeComplete(
  cups: readonly TeaId[][],
  recipe: BlendRecipe | undefined | null,
): boolean {
  if (!recipe) return true;
  return (
    countTeaLayers(cups, recipe.reactantA) === 0 &&
    countTeaLayers(cups, recipe.reactantB) === 0 &&
    countTeaLayers(cups, recipe.product) === recipe.targetProductCount
  );
}

/**
 * Structural recipe validation (fail-fast for programming errors, not luck).
 * Production rejects malformed recipes loudly; the core treats them as
 * non-reactive (fail-closed) rather than inventing semantics.
 */
export function isValidBlendRecipe(recipe: BlendRecipe | undefined | null): boolean {
  if (!recipe) return false;
  if (recipe.reactantA === recipe.reactantB) return false;
  if (recipe.reactantA === recipe.product) return false;
  if (recipe.reactantB === recipe.product) return false;
  if (!Number.isInteger(recipe.targetProductCount) || recipe.targetProductCount <= 0) return false;
  return true;
}
