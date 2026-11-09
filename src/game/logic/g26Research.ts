/**
 * G26 RESEARCH ONLY — never imported by production app code paths.
 * Source-access axis: which tea inside a vessel is available to source.
 *
 * - No PuzzleState extension, no mutable progress, no new TeaId/action.
 * - Readiness/access always derives from current contents + static constraints.
 * - Absent markers => legacy behavior byte-identical.
 *
 * Three standalone candidates:
 *  A bottom-draw: source transfers BOTTOM contiguous run.
 *  B pair-ready: source locked unless top run length === 2.
 *  C linked gate: S may source only while linked valve V is empty.
 */

import {
  STANDARD_CUP_CAPACITY,
  TEA_UNITS_PER_COLOR,
  type CupConstraint,
  type TeaId,
} from '../types';

export const G26_PALETTE: readonly TeaId[] = [
  'matcha',
  'sea_buckthorn',
  'karkade',
  'milk_oolong',
] as const;

export const G26_LINKED_GROUP = 'link-gate';

export function isBottomDrawMarker(c: CupConstraint | undefined): boolean {
  return c?.bottomDraw === true;
}

export function isPairReadyMarker(c: CupConstraint | undefined): boolean {
  return c?.pairReadySource === true;
}

export function isLinkedSourceMarker(c: CupConstraint | undefined): boolean {
  return c?.linkedSourceGroup !== undefined && c?.linkedSourceRole === 'source';
}

export function isLinkedValveMarker(c: CupConstraint | undefined): boolean {
  return c?.linkedSourceGroup !== undefined && c?.linkedSourceRole === 'valve';
}

export function hasAnyG26Marker(constraints: readonly CupConstraint[] | undefined): boolean {
  if (!constraints) return false;
  return constraints.some(
    (c) =>
      c?.bottomDraw === true ||
      c?.pairReadySource === true ||
      c?.linkedSourceGroup !== undefined,
  );
}

/** Fail-closed static shape for A (standalone only). */
export function isValidBottomDrawConstraint(c: CupConstraint | undefined): boolean {
  if (!c || c.bottomDraw !== true) return false;
  if (c.mode !== 'normal') return false;
  if (c.capacity !== STANDARD_CUP_CAPACITY) return false;
  if (c.mustEndEmpty !== true) return false;
  if (c.targetTeaId !== undefined) return false;
  if (c.serveOrder !== undefined) return false;
  if (c.sharedCapacityGroup !== undefined) return false;
  if (c.pairedTeaGroup !== undefined) return false;
  if (c.steepingFlask === true) return false;
  if (c.pairReadySource === true) return false;
  if (c.linkedSourceGroup !== undefined || c.linkedSourceRole !== undefined) return false;
  return true;
}

/** Fail-closed static shape for B (standalone only). */
export function isValidPairReadyConstraint(c: CupConstraint | undefined): boolean {
  if (!c || c.pairReadySource !== true) return false;
  if (c.mode !== 'normal') return false;
  if (c.capacity !== STANDARD_CUP_CAPACITY) return false;
  if (c.mustEndEmpty !== true) return false;
  if (c.targetTeaId !== undefined) return false;
  if (c.serveOrder !== undefined) return false;
  if (c.sharedCapacityGroup !== undefined) return false;
  if (c.pairedTeaGroup !== undefined) return false;
  if (c.steepingFlask === true) return false;
  if (c.bottomDraw === true) return false;
  if (c.linkedSourceGroup !== undefined || c.linkedSourceRole !== undefined) return false;
  return true;
}

/** Fail-closed static shape for C source vessel. */
export function isValidLinkedSourceConstraint(c: CupConstraint | undefined): boolean {
  if (!c) return false;
  if (c.linkedSourceGroup === undefined || c.linkedSourceRole !== 'source') return false;
  if (typeof c.linkedSourceGroup !== 'string' || c.linkedSourceGroup.length === 0) return false;
  if (c.mode !== 'normal') return false;
  if (c.capacity !== STANDARD_CUP_CAPACITY) return false;
  if (c.mustEndEmpty !== true) return false;
  if (c.targetTeaId !== undefined) return false;
  if (c.serveOrder !== undefined) return false;
  if (c.sharedCapacityGroup !== undefined) return false;
  if (c.pairedTeaGroup !== undefined) return false;
  if (c.steepingFlask === true) return false;
  if (c.bottomDraw === true) return false;
  if (c.pairReadySource === true) return false;
  return true;
}

/** Fail-closed static shape for C valve vessel (ordinary finality). */
export function isValidLinkedValveConstraint(c: CupConstraint | undefined): boolean {
  if (!c) return false;
  if (c.linkedSourceGroup === undefined || c.linkedSourceRole !== 'valve') return false;
  if (typeof c.linkedSourceGroup !== 'string' || c.linkedSourceGroup.length === 0) return false;
  if (c.mode !== 'normal') return false;
  if (c.capacity !== undefined && c.capacity !== STANDARD_CUP_CAPACITY) return false;
  if (c.mustEndEmpty === true) return false;
  if (c.targetTeaId !== undefined) return false;
  if (c.serveOrder !== undefined) return false;
  if (c.sharedCapacityGroup !== undefined) return false;
  if (c.pairedTeaGroup !== undefined) return false;
  if (c.steepingFlask === true) return false;
  if (c.bottomDraw === true) return false;
  if (c.pairReadySource === true) return false;
  return true;
}

function localTopLayer(layers: readonly TeaId[]): TeaId | null {
  if (layers.length === 0) return null;
  return layers[layers.length - 1] as TeaId;
}

function localTopCount(layers: readonly TeaId[]): number {
  if (layers.length === 0) return 0;
  const top = layers[layers.length - 1];
  let n = 0;
  for (let i = layers.length - 1; i >= 0; i--) {
    if (layers[i] === top) n++;
    else break;
  }
  return n;
}

export function bottomLayerOf(layers: readonly TeaId[]): TeaId | null {
  if (layers.length === 0) return null;
  return layers[0] as TeaId;
}

export function bottomRunCountOf(layers: readonly TeaId[]): number {
  if (layers.length === 0) return 0;
  const bottom = layers[0];
  let n = 0;
  for (let i = 0; i < layers.length; i++) {
    if (layers[i] === bottom) n++;
    else break;
  }
  return n;
}

export type SourceAccessKind = 'top' | 'bottom';

export interface SourceTransferPlan {
  tea: TeaId | null;
  available: number;
  kind: SourceAccessKind;
}

/**
 * SINGLE source-extraction truth for G26 (see §14).
 * Ordinary (and B/C when unlocked): top run.
 * Valid bottom-draw: bottom run.
 * Invalid/empty: tea null, available 0.
 */
export function sourceTransferPlan(
  layers: readonly TeaId[],
  c: CupConstraint | undefined,
): SourceTransferPlan {
  if (layers.length === 0) return { tea: null, available: 0, kind: 'top' };
  if (isValidBottomDrawConstraint(c)) {
    return { tea: bottomLayerOf(layers), available: bottomRunCountOf(layers), kind: 'bottom' };
  }
  return { tea: localTopLayer(layers), available: localTopCount(layers), kind: 'top' };
}

/** Derived pair-ready state: top run exactly 2 (never stored). */
export function isPairReadyNow(layers: readonly TeaId[], c: CupConstraint | undefined): boolean {
  if (!isValidPairReadyConstraint(c)) return false;
  return localTopCount(layers) === 2;
}

/** Partner valve index for a linked source, or -1 when malformed/ambiguous. */
export function findLinkedValveIndex(
  constraints: readonly CupConstraint[] | undefined,
  fromIdx: number,
): number {
  if (!constraints) return -1;
  const src = constraints[fromIdx];
  if (!isValidLinkedSourceConstraint(src)) return -1;
  const group = src.linkedSourceGroup as string;
  let found = -1;
  for (let i = 0; i < constraints.length; i++) {
    if (i === fromIdx) continue;
    const c = constraints[i];
    if (c?.linkedSourceGroup === group && c?.linkedSourceRole === 'valve') {
      if (found !== -1) return -1;
      found = i;
    }
  }
  if (found === -1) return -1;
  if (!isValidLinkedValveConstraint(constraints[found])) return -1;
  return found;
}

/** Derived linked-gate state: S may source iff its valve is empty. */
export function isLinkedSourceReady(
  cups: readonly TeaId[][],
  fromIdx: number,
  constraints: readonly CupConstraint[] | undefined,
): boolean {
  const valve = findLinkedValveIndex(constraints, fromIdx);
  if (valve === -1) return false;
  return (cups[valve] as TeaId[] | undefined)?.length === 0;
}

/**
 * Research-local standalone guard (fail-closed).
 * True when a G26 board violates standalone composition: any malformed
 * static shape, any production special on any vessel, any dynamic tool/
 * ingredient slot, or any blend recipe.
 */
export function isG26BoardMalformed(
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
  if (!hasAnyG26Marker(constraints)) return false;
  if (blendRecipe !== undefined && blendRecipe !== null) return true;
  const n = state.cups.length;
  // Static: every G26-marked vessel must have exactly one valid role.
  if (constraints) {
    let sourceCount = 0;
    let valveCount = 0;
    const groups = new Map<string, { source: number; valve: number }>();
    for (let i = 0; i < constraints.length; i++) {
      const c = constraints[i];
      if (!c) continue;
      const marked =
        c.bottomDraw === true ||
        c.pairReadySource === true ||
        c.linkedSourceGroup !== undefined ||
        c.linkedSourceRole !== undefined;
      if (marked) {
        const validA = isValidBottomDrawConstraint(c);
        const validB = isValidPairReadyConstraint(c);
        const validS = isValidLinkedSourceConstraint(c);
        const validV = isValidLinkedValveConstraint(c);
        const validCount = [validA, validB, validS, validV].filter(Boolean).length;
        if (validCount !== 1) return true;
        if (validS) sourceCount++;
        if (validV) valveCount++;
        if (c.linkedSourceGroup !== undefined) {
          const g = String(c.linkedSourceGroup);
          const entry = groups.get(g) ?? { source: 0, valve: 0 };
          if (c.linkedSourceRole === 'source') entry.source++;
          else if (c.linkedSourceRole === 'valve') entry.valve++;
          else return true;
          groups.set(g, entry);
        }
      } else {
        // Ordinary vessels on a G26 board must be plain standard normal.
        if (c.mode !== 'normal') return true;
        if (c.targetTeaId !== undefined) return true;
        if (c.serveOrder !== undefined) return true;
        if (c.sharedCapacityGroup !== undefined) return true;
        if (c.pairedTeaGroup !== undefined) return true;
        if (c.steepingFlask === true) return true;
        const cap = c.capacity;
        if (cap !== undefined && cap !== STANDARD_CUP_CAPACITY) return true;
        if (c.mustEndEmpty === true) return true;
      }
    }
    // Linked boards must have exactly one S and one V sharing one group.
    const hasLinked = sourceCount + valveCount > 0;
    if (hasLinked) {
      if (sourceCount !== 1 || valveCount !== 1) return true;
      if (groups.size !== 1) return true;
      for (const entry of groups.values()) {
        if (entry.source !== 1 || entry.valve !== 1) return true;
      }
    }
  }
  // Dynamic: no floating/sinking/strainer/ice/obstacle/bud on G26 boards.
  const anyNonNull = (arr: readonly (unknown | null)[] | undefined): boolean =>
    arr !== undefined && arr.some((s) => s !== null && s !== undefined);
  if (anyNonNull(state.floatingIngredients as readonly (unknown | null)[] | undefined)) return true;
  if (anyNonNull(state.sinkingIngredients as readonly (unknown | null)[] | undefined)) return true;
  if (anyNonNull(state.iceSlots as readonly (unknown | null)[] | undefined)) return true;
  if (anyNonNull(state.capacityObstacles as readonly (unknown | null)[] | undefined)) return true;
  if (anyNonNull(state.teaBudSlots as readonly (unknown | null)[] | undefined)) return true;
  const strainer = state.strainer as { present?: boolean } | undefined;
  if (strainer && strainer.present === true) return true;
  void n;
  return false;
}

/** Production inventory truth re-export for research scripts (no hardcode). */
export { STANDARD_CUP_CAPACITY, TEA_UNITS_PER_COLOR };

/** Build a standard 4-color research inventory (4 units each). */
export function g26StandardInventory(): Record<TeaId, number> {
  const out = {} as Record<TeaId, number>;
  for (const t of G26_PALETTE) out[t] = TEA_UNITS_PER_COLOR;
  return out;
}
