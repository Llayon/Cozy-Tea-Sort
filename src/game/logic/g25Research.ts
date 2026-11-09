/**
 * G25 RESEARCH ONLY — never imported by production app code.
 * Minimal static markers + derived helpers for the mechanic shootout.
 *
 * - No PuzzleState extension, no mutable progress, no new TeaId/action.
 * - Progress always derives from current contents + static constraints.
 * - Absent markers => legacy behavior byte-identical.
 */
import {
  STANDARD_CUP_CAPACITY,
  TEA_UNITS_PER_COLOR,
  type CupConstraint,
  type TeaId,
} from '../types';

export const G25_PALETTE: readonly TeaId[] = [
  'matcha',
  'sea_buckthorn',
  'karkade',
  'milk_oolong',
] as const;

export const G25_MIRROR_A: TeaId = 'matcha';
export const G25_MIRROR_B: TeaId = 'sea_buckthorn';
export const G25_MIRROR_GROUP = 'mirror-pair';

export function g25MirrorRecipeForSlot(slot: 0 | 1): readonly TeaId[] {
  if (slot === 0) return [G25_MIRROR_A, G25_MIRROR_A, G25_MIRROR_B, G25_MIRROR_B];
  return [G25_MIRROR_B, G25_MIRROR_B, G25_MIRROR_A, G25_MIRROR_A];
}

export function isG25MeteredSource(c: CupConstraint | undefined): boolean {
  return c?.g25MeteredSource === true;
}

export function isG25MeteredDestination(c: CupConstraint | undefined): boolean {
  return c?.g25MeteredDestination === true;
}

export function isG25Mirror(c: CupConstraint | undefined): boolean {
  return c?.g25MirrorRecipe !== undefined || c?.g25MirrorGroup !== undefined;
}

/** Fail-closed validity: normal, cap4, recipe length 4, no other mechanics. */
export function isValidG25MirrorConstraint(c: CupConstraint | undefined): boolean {
  if (!c || c.g25MirrorRecipe === undefined) return false;
  if (c.mode !== 'normal') return false;
  if ((c.capacity ?? STANDARD_CUP_CAPACITY) !== STANDARD_CUP_CAPACITY) return false;
  if (c.targetTeaId !== undefined) return false;
  if (c.mustEndEmpty === true) return false;
  if (c.serveOrder !== undefined) return false;
  if (c.sharedCapacityGroup !== undefined) return false;
  if (c.pairedTeaGroup !== undefined) return false;
  if (c.steepingFlask === true) return false;
  if (c.g25MeteredSource === true || c.g25MeteredDestination === true) return false;
  const r = c.g25MirrorRecipe;
  if (!Array.isArray(r) || r.length !== STANDARD_CUP_CAPACITY) return false;
  if (r.some((t) => typeof t !== 'string' || t.length === 0)) return false;
  return true;
}

export function hasAnyG25Marker(constraints: readonly CupConstraint[] | undefined): boolean {
  if (!constraints) return false;
  return constraints.some(
    (c) =>
      c?.g25MeteredSource === true ||
      c?.g25MeteredDestination === true ||
      c?.g25MirrorRecipe !== undefined ||
      c?.g25MirrorGroup !== undefined,
  );
}

/** True when layers are a strict prefix (possibly full) of recipe. */
export function isG25MirrorPrefix(layers: readonly TeaId[], recipe: readonly TeaId[]): boolean {
  if (layers.length > recipe.length) return false;
  for (let i = 0; i < layers.length; i++) {
    if (layers[i] !== recipe[i]) return false;
  }
  return true;
}

/** Exact final match. */
export function isG25MirrorComplete(layers: readonly TeaId[], recipe: readonly TeaId[]): boolean {
  if (layers.length !== recipe.length) return false;
  return isG25MirrorPrefix(layers, recipe);
}

/** Next expected tea, or null when complete. Null also when not a prefix (fail-closed). */
export function g25MirrorNextExpected(
  layers: readonly TeaId[],
  recipe: readonly TeaId[],
): TeaId | null {
  if (layers.length >= recipe.length) return null;
  if (!isG25MirrorPrefix(layers, recipe)) return null;
  return recipe[layers.length] as TeaId;
}

/**
 * Contiguous remaining run of the expected tea from current length.
 * e.g. recipe [A,A,B,B], layers [A] => 1 (one more A before B).
 */
export function g25MirrorRemainingRun(
  layers: readonly TeaId[],
  recipe: readonly TeaId[],
): number {
  const next = g25MirrorNextExpected(layers, recipe);
  if (next === null) return 0;
  let n = 0;
  for (let i = layers.length; i < recipe.length; i++) {
    if (recipe[i] !== next) break;
    n++;
  }
  return n;
}

/**
 * SINGLE transfer-bound truth for G25 research.
 * mOrdinary is the already-computed min(topRun, free, sharedBound).
 * Applies metered 1-caps + mirror remaining-run cap. Never increases m.
 */
export function g25BoundTransfer(
  mOrdinary: number,
  source: readonly TeaId[],
  target: readonly TeaId[],
  fromC: CupConstraint | undefined,
  toC: CupConstraint | undefined,
): number {
  let m = mOrdinary;
  if (m <= 0) return 0;
  if (isG25MeteredSource(fromC)) m = Math.min(m, 1);
  if (isG25MeteredDestination(toC)) m = Math.min(m, 1);
  if (toC?.g25MirrorRecipe !== undefined) {
    if (!isValidG25MirrorConstraint(toC)) return 0;
    const recipe = toC.g25MirrorRecipe as readonly TeaId[];
    // Must currently be a prefix and incoming must equal next expected.
    // (Legality layer guarantees this; bound stays fail-closed.)
    if (!isG25MirrorPrefix(target, recipe)) return 0;
    const next = g25MirrorNextExpected(target, recipe);
    if (next === null) return 0;
    if (source.length === 0) return 0;
    if ((source[source.length - 1] as TeaId) !== next) return 0;
    m = Math.min(m, g25MirrorRemainingRun(target, recipe));
  }
  return m;
}

/** Production inventory truth re-export for research scripts (no hardcode). */
export { STANDARD_CUP_CAPACITY, TEA_UNITS_PER_COLOR };

/** Build a standard 4-color research inventory (4 units each). */
export function g25StandardInventory(): Record<TeaId, number> {
  const out = {} as Record<TeaId, number>;
  for (const t of G25_PALETTE) out[t] = TEA_UNITS_PER_COLOR;
  return out;
}
