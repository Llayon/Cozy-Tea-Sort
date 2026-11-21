/**
 * G28 RESEARCH ONLY — never imported by production app code paths.
 *
 * Stack-transformation shootout: what happens to layer ORDER inside a
 * special vessel after an ordinary receive.
 *
 * - One pure seam: `g28TransformDestination(existing, layer, received,
 *   constraint)` — deterministic, no state, no TeaId change, no quantity
 *   change, no legality change. Only resulting destination order may differ.
 * - Transfer count, source extraction and destination legality are frozen
 *   (verified in rules.ts before this seam runs).
 * - Absent markers => legacy behavior byte-identical.
 * - No mutable transform state, no new action, no new TeaId.
 *
 * Three standalone candidates:
 *  A underpour: incoming layers go BELOW existing layers.
 *  B reverse-on-receive: entire resulting stack is reversed per receive.
 *  C full-flip: reversed only when the receive fills the vessel to capacity.
 */

import {
  STANDARD_CUP_CAPACITY,
  TEA_UNITS_PER_COLOR,
  type CupConstraint,
  type TeaId,
} from '../types';

export const G28_PALETTE: readonly TeaId[] = [
  'matcha',
  'sea_buckthorn',
  'karkade',
  'milk_oolong',
] as const;

export type G28Candidate = 'underpour' | 'reverse-receive' | 'full-flip';

export function hasAnyG28Marker(constraints: readonly CupConstraint[] | undefined): boolean {
  if (!constraints) return false;
  return constraints.some(
    (c) =>
      c?.underpour === true || c?.reverseOnReceive === true || c?.flipWhenFull === true,
  );
}

function isPlainG28Ordinary(c: CupConstraint | undefined): boolean {
  if (!c) return false;
  if (c.mode !== 'normal') return false;
  if (c.targetTeaId !== undefined) return false;
  if (c.serveOrder !== undefined) return false;
  if (c.sharedCapacityGroup !== undefined) return false;
  if (c.pairedTeaGroup !== undefined) return false;
  if (c.steepingFlask === true) return false;
  if (c.underpour === true || c.reverseOnReceive === true || c.flipWhenFull === true) return false;
  const cap = c.capacity;
  if (cap !== undefined && cap !== STANDARD_CUP_CAPACITY) return false;
  if (c.mustEndEmpty === true) return false;
  return true;
}

function hasExactlyOneMarker(c: CupConstraint | undefined, which: 'underpour' | 'reverseOnReceive' | 'flipWhenFull'): boolean {
  if (!c) return false;
  if (which === 'underpour') return c.underpour === true && c.reverseOnReceive !== true && c.flipWhenFull !== true;
  if (which === 'reverseOnReceive') return c.reverseOnReceive === true && c.underpour !== true && c.flipWhenFull !== true;
  return c.flipWhenFull === true && c.underpour !== true && c.reverseOnReceive !== true;
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

export function isValidUnderpourConstraint(c: CupConstraint | undefined): boolean {
  return isSpecialShape(c) && hasExactlyOneMarker(c, 'underpour');
}

export function isValidReverseOnReceiveConstraint(c: CupConstraint | undefined): boolean {
  return isSpecialShape(c) && hasExactlyOneMarker(c, 'reverseOnReceive');
}

export function isValidFlipWhenFullConstraint(c: CupConstraint | undefined): boolean {
  return isSpecialShape(c) && hasExactlyOneMarker(c, 'flipWhenFull');
}

export function isValidG28Special(c: CupConstraint | undefined): boolean {
  return (
    isValidUnderpourConstraint(c) ||
    isValidReverseOnReceiveConstraint(c) ||
    isValidFlipWhenFullConstraint(c)
  );
}

/**
 * SINGLE authoritative destination-transform truth (see §10–§12).
 *
 * Inputs: destination `existing` layers BEFORE the pour, incoming `layer`
 * TeaId, `received` count (already fixed by ordinary transfer-count
 * semantics), and the static destination constraint.
 *
 * Returns the exact next destination layers. Invalid/absent markers behave
 * exactly like CONTROL (ordinary append) — unreachable via legal pours on
 * malformed boards, which fail closed at legality.
 */
export function g28TransformDestination(
  existing: readonly TeaId[],
  layer: TeaId,
  received: number,
  c: CupConstraint | undefined,
): TeaId[] {
  const incoming = new Array<TeaId>(Math.max(0, received)).fill(layer);
  if (isValidUnderpourConstraint(c)) {
    return [...incoming, ...existing];
  }
  if (isValidReverseOnReceiveConstraint(c)) {
    return [...existing, ...incoming].reverse();
  }
  if (isValidFlipWhenFullConstraint(c)) {
    const before = existing.length;
    const after = before + incoming.length;
    if (before < STANDARD_CUP_CAPACITY && after === STANDARD_CUP_CAPACITY) {
      return [...existing, ...incoming].reverse();
    }
    return [...existing, ...incoming];
  }
  return [...existing, ...incoming];
}

/**
 * Research-local standalone guard (fail-closed).
 * True when a G28 board violates standalone composition: not exactly one
 * valid special, any production special on any vessel, any sibling-marker
 * mix, any dynamic tool/ingredient slot, or any blend recipe.
 */
export function isG28BoardMalformed(
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
  if (!hasAnyG28Marker(constraints)) return false;
  if (blendRecipe !== undefined && blendRecipe !== null) return true;
  if (!constraints || constraints.length === 0) return true;
  let specials = 0;
  for (const c of constraints) {
    if (!c) return true;
    const marked =
      c.underpour === true || c.reverseOnReceive === true || c.flipWhenFull === true;
    if (marked) {
      specials++;
      if (!isValidG28Special(c)) return true;
    } else if (!isPlainG28Ordinary(c)) {
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
export function g28StandardInventory(): Record<TeaId, number> {
  const out = {} as Record<TeaId, number>;
  for (const t of G28_PALETTE) out[t] = TEA_UNITS_PER_COLOR;
  return out;
}
