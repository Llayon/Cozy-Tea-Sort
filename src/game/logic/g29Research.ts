/**
 * G29 RESEARCH ONLY — never imported by production app code paths.
 *
 * Compatibility-axis shootout: can ONE special destination temporarily
 * store different TeaIds in a single vessel?
 *
 * - One pure seam: `g29CompatibilityOverride(sourceTea, target, destC)` —
 *   deterministic, no state. It answers ONLY whether the destination
 *   accepts the TeaId; transfer count, source extraction and all other
 *   legality are frozen before it runs.
 * - No TeaId transformation, no quantity change, no finality change.
 * - Absent markers => legacy behavior byte-identical.
 * - No mutable state, no new action, no new TeaId.
 *
 * Three standalone candidates:
 *  A mixedBuffer: nonempty special accepts any TeaId with free capacity.
 *  B twoTeaBuffer: static unordered pair {A,B} with mutual cross-color
 *    acceptance; all other cross-color pairs stay ordinary.
 *  C differentTeaBuffer: nonempty special accepts ONLY a different top
 *    TeaId (same-color receives are rejected).
 */

import {
  STANDARD_CUP_CAPACITY,
  TEA_UNITS_PER_COLOR,
  type CupConstraint,
  type TeaId,
} from '../types';

export const G29_PALETTE: readonly TeaId[] = [
  'matcha',
  'sea_buckthorn',
  'karkade',
  'milk_oolong',
] as const;

export type G29Candidate = 'mixed-buffer' | 'two-tea-buffer' | 'different-tea-buffer';

/** All six unordered static pairs over the research palette (§32). */
export const G29_PAIRS: ReadonlyArray<readonly [TeaId, TeaId]> = [
  ['karkade', 'matcha'],
  ['karkade', 'milk_oolong'],
  ['karkade', 'sea_buckthorn'],
  ['matcha', 'milk_oolong'],
  ['matcha', 'sea_buckthorn'],
  ['milk_oolong', 'sea_buckthorn'],
] as const;

export type G29CompatResult = 'ordinary' | 'accept' | 'reject';

export function hasAnyG29Marker(constraints: readonly CupConstraint[] | undefined): boolean {
  if (!constraints) return false;
  return constraints.some(
    (c) =>
      c?.mixedBuffer === true ||
      c?.twoTeaBuffer !== undefined ||
      c?.differentTeaBuffer === true,
  );
}

function isPlainG29Ordinary(c: CupConstraint | undefined): boolean {
  if (!c) return false;
  if (c.mode !== 'normal') return false;
  if (c.targetTeaId !== undefined) return false;
  if (c.serveOrder !== undefined) return false;
  if (c.sharedCapacityGroup !== undefined) return false;
  if (c.pairedTeaGroup !== undefined) return false;
  if (c.steepingFlask === true) return false;
  if (c.mixedBuffer === true || c.twoTeaBuffer !== undefined || c.differentTeaBuffer === true) {
    return false;
  }
  const cap = c.capacity;
  if (cap !== undefined && cap !== STANDARD_CUP_CAPACITY) return false;
  if (c.mustEndEmpty === true) return false;
  return true;
}

function hasExactlyOneMarker(c: CupConstraint | undefined): c is CupConstraint {
  if (!c) return false;
  const count =
    (c.mixedBuffer === true ? 1 : 0) +
    (c.twoTeaBuffer !== undefined ? 1 : 0) +
    (c.differentTeaBuffer === true ? 1 : 0);
  return count === 1;
}

/** Shared valid special-vessel shape: normal, explicit cap4, must-end-empty. */
function isSpecialShape(c: CupConstraint | undefined): boolean {
  if (!c) return false;
  if (c.mode !== 'normal') return false;
  if (c.targetTeaId !== undefined) return false;
  if (c.serveOrder !== undefined) return false;
  if (c.sharedCapacityGroup !== undefined) return false;
  if (c.pairedTeaGroup !== undefined) return false;
  if (c.steepingFlask === true) return false;
  if (c.capacity !== STANDARD_CUP_CAPACITY) return false;
  if (c.mustEndEmpty !== true) return false;
  return true;
}

function isValidTwoTeaPair(pair: CupConstraint['twoTeaBuffer']): pair is { teaA: TeaId; teaB: TeaId } {
  if (!pair || typeof pair !== 'object') return false;
  const { teaA, teaB } = pair;
  if (typeof teaA !== 'string' || teaA.length === 0) return false;
  if (typeof teaB !== 'string' || teaB.length === 0) return false;
  return teaA !== teaB;
}

export function isValidMixedBufferConstraint(c: CupConstraint | undefined): boolean {
  return isSpecialShape(c) && c?.mixedBuffer === true && c?.twoTeaBuffer === undefined && c?.differentTeaBuffer !== true;
}

export function isValidTwoTeaBufferConstraint(c: CupConstraint | undefined): boolean {
  return (
    isSpecialShape(c) &&
    c?.mixedBuffer !== true &&
    isValidTwoTeaPair(c?.twoTeaBuffer) &&
    c?.differentTeaBuffer !== true
  );
}

export function isValidDifferentTeaBufferConstraint(c: CupConstraint | undefined): boolean {
  return isSpecialShape(c) && c?.mixedBuffer !== true && c?.twoTeaBuffer === undefined && c?.differentTeaBuffer === true;
}

export function isValidG29Special(c: CupConstraint | undefined): boolean {
  return (
    isValidMixedBufferConstraint(c) ||
    isValidTwoTeaBufferConstraint(c) ||
    isValidDifferentTeaBufferConstraint(c)
  );
}

/**
 * SINGLE authoritative compatibility truth (see §13).
 *
 * Returns 'ordinary' when ordinary destination color rules decide,
 * 'accept' when the candidate exception admits the TeaId, 'reject' when
 * the candidate exception forbids it (C same-color block).
 * Invalid/absent markers fall through to 'ordinary' — unreachable via
 * legal pours on malformed boards, which fail closed at legality.
 */
export function g29CompatibilityOverride(
  sourceTea: TeaId,
  target: readonly TeaId[],
  destC: CupConstraint | undefined,
): G29CompatResult {
  if (!hasExactlyOneMarker(destC)) return 'ordinary';
  if (!isValidG29Special(destC)) return 'ordinary';
  if (target.length === 0) return 'ordinary';
  const top = target[target.length - 1] as TeaId;
  if (destC.mixedBuffer === true) return 'accept';
  if (destC.twoTeaBuffer !== undefined) {
    const { teaA, teaB } = destC.twoTeaBuffer;
    if (sourceTea === top) return 'ordinary';
    if ((top === teaA || top === teaB) && (sourceTea === teaA || sourceTea === teaB)) {
      return 'accept';
    }
    return 'ordinary';
  }
  // differentTeaBuffer: nonempty accepts ONLY a different TeaId.
  return sourceTea === top ? 'reject' : 'accept';
}

/**
 * Research-local standalone guard (fail-closed).
 * True when a G29 board violates standalone composition: not exactly one
 * valid special, any production special on any vessel, any sibling-marker
 * mix, any dynamic tool/ingredient slot, or any blend recipe.
 */
export function isG29BoardMalformed(
  state: {
    cups: readonly TeaId[][];
    floatingIngredients?: readonly (unknown | null)[] | undefined;
    sinkingIngredients?: readonly (unknown | null)[] | undefined;
    strainer?: { present?: boolean } | undefined;
    iceSlots?: readonly (unknown | null)[] | undefined;
    capacityObstacles?: readonly (unknown | null)[] | undefined;
    teaBudSlots?: readonly (unknown | null)[] | undefined;
  },
  constraints: readonly CupConstraint[] | undefined,
  blendRecipe?: unknown,
): boolean {
  if (!hasAnyG29Marker(constraints)) return false;
  if (blendRecipe !== undefined && blendRecipe !== null) return true;
  if (!constraints || constraints.length === 0) return true;
  let specials = 0;
  for (const c of constraints) {
    if (!c) return true;
    const marked =
      c.mixedBuffer === true || c.twoTeaBuffer !== undefined || c.differentTeaBuffer === true;
    if (marked) {
      specials++;
      if (!isValidG29Special(c)) return true;
    } else if (!isPlainG29Ordinary(c)) {
      return true;
    }
  }
  if (specials !== 1) return true;
  const anyNonNull = (arr: readonly (unknown | null)[] | undefined): boolean =>
    arr !== undefined && arr.some((s) => s !== null && s !== undefined);
  if (anyNonNull(state.floatingIngredients as readonly (unknown | null)[] | undefined)) return true;
  if (anyNonNull(state.sinkingIngredients as readonly (unknown | null)[] | undefined)) return true;
  if (anyNonNull(state.iceSlots as readonly (unknown | null)[] | undefined)) return true;
  if (anyNonNull(state.capacityObstacles as readonly (unknown | null)[] | undefined)) return true;
  if (anyNonNull(state.teaBudSlots as readonly (unknown | null)[] | undefined)) return true;
  const strainer = state.strainer as { present?: boolean } | undefined;
  if (strainer && strainer.present === true) return true;
  return false;
}

/** Production inventory truth re-export for research scripts (no hardcode). */
export { STANDARD_CUP_CAPACITY, TEA_UNITS_PER_COLOR };

/** Build a standard 4-color research inventory (4 units each). */
export function g29StandardInventory(): Record<TeaId, number> {
  const out = {} as Record<TeaId, number>;
  for (const t of G29_PALETTE) out[t] = TEA_UNITS_PER_COLOR;
  return out;
}
