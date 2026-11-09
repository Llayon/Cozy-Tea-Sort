/**
 * G27 RESEARCH ONLY — never imported by production app code paths.
 *
 * Transfer-graph shootout: which vessels may legally interact.
 *
 * - One pure seam: `isTransferEdgeAllowed(fromC, toC)` — directional,
 *   deterministic, no state, no TeaId/color/capacity logic.
 * - Routing is evaluated BEFORE ordinary pour semantics (see rules.ts).
 * - Absent markers => legacy behavior byte-identical.
 * - No mutable routing state, no new action, no graph DSL.
 *
 * Three standalone candidates:
 *  A tea-bridge (g27-a): LEFT | RIGHT | BRIDGE, bidirectional, cross-group
 *    pours only via the bridge.
 *  B one-way bridge (g27-b): LEFT -> BRIDGE -> RIGHT only.
 *  C two-lane routing (g27-c): bridgeA links left-low <-> right-low,
 *    bridgeB links left-high <-> right-high; same-side pours ordinary.
 */

import {
  STANDARD_CUP_CAPACITY,
  TEA_UNITS_PER_COLOR,
  type CupConstraint,
  type TeaId,
} from '../types';

export const G27_PALETTE: readonly TeaId[] = [
  'matcha',
  'sea_buckthorn',
  'karkade',
  'milk_oolong',
] as const;

export type G27GraphId = 'g27-a' | 'g27-b' | 'g27-c';

export const G27_GRAPH_A: G27GraphId = 'g27-a';
export const G27_GRAPH_B: G27GraphId = 'g27-b';
export const G27_GRAPH_C: G27GraphId = 'g27-c';

/** Preferred research reject code (single code for all graph blocks). */
export const G27_REJECT_CODE = 'transfer-edge-blocked' as const;

function roleOf(c: CupConstraint | undefined): string | undefined {
  return c?.transferRole;
}

function graphOf(c: CupConstraint | undefined): string | undefined {
  return c?.transferGraph;
}

export function hasAnyG27Marker(constraints: readonly CupConstraint[] | undefined): boolean {
  if (!constraints) return false;
  return constraints.some(
    (c) => c?.transferGraph !== undefined || c?.transferRole !== undefined,
  );
}

/**
 * SINGLE authoritative edge truth (see §11-§13).
 *
 * Directional: `isTransferEdgeAllowed(from, to)` answers "may these two
 * vessels interact?". Self-pairs are never allowed here (existing
 * same-cup rule stays authoritative; this helper returns false for
 * identical roles only when the graph forbids the loop — callers still
 * check indices first).
 *
 * Fail-closed: any malformed marker combination returns false.
 * Marker-absent pairs (both undefined) return true (legacy identical) —
 * but callers only consult this helper when a G27 board is present; the
 * legacy path never observes a new rejection (see rules.ts).
 */
export function isTransferEdgeAllowed(
  fromC: CupConstraint | undefined,
  toC: CupConstraint | undefined,
): boolean {
  const fg = graphOf(fromC);
  const tg = graphOf(toC);
  const fr = roleOf(fromC);
  const tr = roleOf(toC);
  // Fully unmarked pair: ordinary connectivity.
  if (fg === undefined && tg === undefined && fr === undefined && tr === undefined) return true;
  // Half-marked pairs are malformed: fail closed.
  if (fg === undefined || tg === undefined || fr === undefined || tr === undefined) return false;
  // Graphs must agree.
  if (fg !== tg) return false;
  if (fg === G27_GRAPH_A) return isEdgeAllowedA(fr, tr);
  if (fg === G27_GRAPH_B) return isEdgeAllowedB(fr, tr);
  if (fg === G27_GRAPH_C) return isEdgeAllowedC(fr, tr);
  return false;
}

/** Candidate A edge matrix (§24), directional but symmetric. */
function isEdgeAllowedA(fr: string, tr: string): boolean {
  if (fr !== 'left' && fr !== 'right' && fr !== 'bridge') return false;
  if (tr !== 'left' && tr !== 'right' && tr !== 'bridge') return false;
  if (fr === tr) return true; // left<->left, right<->right (bridge self handled by same-cup rule)
  if (fr === 'bridge' || tr === 'bridge') return true; // left<->bridge, right<->bridge
  return false; // left<->right forbidden
}

/** Candidate B strict directional form (§47-§48). */
function isEdgeAllowedB(fr: string, tr: string): boolean {
  if (fr !== 'left' && fr !== 'right' && fr !== 'bridge') return false;
  if (tr !== 'left' && tr !== 'right' && tr !== 'bridge') return false;
  if (fr === 'left' && tr === 'left') return true;
  if (fr === 'right' && tr === 'right') return true;
  if (fr === 'left' && tr === 'bridge') return true;
  if (fr === 'bridge' && tr === 'right') return true;
  return false; // right->bridge, bridge->left, left<->right all forbidden
}

/**
 * Candidate C two-lane graph (§58).
 * Roles: 'left-low' | 'left-high' | 'right-low' | 'right-high' | 'bridgeA' | 'bridgeB'.
 * Same-side pours (any left <-> any left, any right <-> any right) ordinary.
 * Cross-side only via the designated lane bridge.
 */
function isEdgeAllowedC(fr: string, tr: string): boolean {
  const valid = new Set(['left-low', 'left-high', 'right-low', 'right-high', 'bridgeA', 'bridgeB']);
  if (!valid.has(fr) || !valid.has(tr)) return false;
  const isLeft = (r: string): boolean => r === 'left-low' || r === 'left-high';
  const isRight = (r: string): boolean => r === 'right-low' || r === 'right-high';
  // Same-side ordinary.
  if (isLeft(fr) && isLeft(tr)) return true;
  if (isRight(fr) && isRight(tr)) return true;
  // Lane A: left-low <-> bridgeA <-> right-low.
  if ((fr === 'left-low' && tr === 'bridgeA') || (fr === 'bridgeA' && tr === 'left-low')) return true;
  if ((fr === 'right-low' && tr === 'bridgeA') || (fr === 'bridgeA' && tr === 'right-low')) return true;
  // Lane B: left-high <-> bridgeB <-> right-high.
  if ((fr === 'left-high' && tr === 'bridgeB') || (fr === 'bridgeB' && tr === 'left-high')) return true;
  if ((fr === 'right-high' && tr === 'bridgeB') || (fr === 'bridgeB' && tr === 'right-high')) return true;
  return false;
}

/** Valid ordinary (non-bridge) G27 vessel shape: plain standard normal. */
function isOrdinaryG27Vessel(c: CupConstraint | undefined): boolean {
  if (!c) return false;
  if (c.mode !== 'normal') return false;
  if (c.targetTeaId !== undefined) return false;
  if (c.serveOrder !== undefined) return false;
  if (c.sharedCapacityGroup !== undefined) return false;
  if (c.pairedTeaGroup !== undefined) return false;
  if (c.steepingFlask === true) return false;
  const cap = c.capacity;
  if (cap !== undefined && cap !== STANDARD_CUP_CAPACITY) return false;
  if (c.mustEndEmpty === true) return false;
  return true;
}

/** Valid bridge vessel shape: normal, cap4, mustEndEmpty (ordinary workspace). */
function isBridgeG27Vessel(c: CupConstraint | undefined): boolean {
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

/** Per-vessel static shape for graph A/B (standalone only). */
export function isValidG27ABConstraint(
  c: CupConstraint | undefined,
  graph: G27GraphId,
): boolean {
  if (!c) return false;
  if (c.transferGraph !== graph) return false;
  const role = c.transferRole;
  if (role === 'bridge') return isBridgeG27Vessel(c);
  if (role === 'left' || role === 'right') return isOrdinaryG27Vessel(c);
  return false;
}

/** Per-vessel static shape for graph C (standalone only). */
export function isValidG27CConstraint(c: CupConstraint | undefined): boolean {
  if (!c) return false;
  if (c.transferGraph !== G27_GRAPH_C) return false;
  const role = c.transferRole;
  if (role === 'bridgeA' || role === 'bridgeB') return isBridgeG27Vessel(c);
  if (
    role === 'left-low' ||
    role === 'left-high' ||
    role === 'right-low' ||
    role === 'right-high'
  ) {
    return isOrdinaryG27Vessel(c);
  }
  return false;
}

function isValidG27Vessel(c: CupConstraint | undefined): boolean {
  if (!c) return false;
  const g = c.transferGraph;
  if (g === G27_GRAPH_A || g === G27_GRAPH_B) return isValidG27ABConstraint(c, g);
  if (g === G27_GRAPH_C) return isValidG27CConstraint(c);
  return false;
}

/**
 * Research-local standalone guard (fail-closed).
 * True when a G27 board violates standalone composition: mixed graphs,
 * wrong role census, any production special on any vessel, any dynamic
 * tool/ingredient slot, or any blend recipe.
 */
export function isG27BoardMalformed(
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
  if (!hasAnyG27Marker(constraints)) return false;
  if (blendRecipe !== undefined && blendRecipe !== null) return true;
  if (!constraints || constraints.length === 0) return true;
  // Every vessel on a G27 board must carry a valid marker.
  for (const c of constraints) {
    if (!c) return true;
    if (c.transferGraph === undefined || c.transferRole === undefined) return true;
    if (!isValidG27Vessel(c)) return true;
    // No production specials beyond the checked shapes (shapes already
    // enforce plain/bridge-only), plus no foreign research markers.
    const foreign = c as unknown as Record<string, unknown>;
    if (foreign['bottomDraw'] === true) return true;
    if (foreign['pairReadySource'] === true) return true;
    if (foreign['linkedSourceGroup'] !== undefined) return true;
    if (foreign['linkedSourceRole'] !== undefined) return true;
  }
  // Single graph per board + exact frozen census.
  const graphs = new Set(constraints.map((c) => c?.transferGraph));
  if (graphs.size !== 1) return true;
  const graph = [...graphs][0] as string;
  const roles = constraints.map((c) => String(c?.transferRole));
  const count = (r: string): number => roles.filter((x) => x === r).length;
  if (graph === G27_GRAPH_A || graph === G27_GRAPH_B) {
    // Preferred frozen topology: 3 left + 3 right + 1 bridge = 7 vessels.
    if (constraints.length !== 7) return true;
    if (count('left') !== 3 || count('right') !== 3 || count('bridge') !== 1) return true;
  } else if (graph === G27_GRAPH_C) {
    // Preferred frozen topology: 2+1 per side + 2 bridges = 8 vessels.
    if (constraints.length !== 8) return true;
    if (
      count('left-low') !== 2 ||
      count('left-high') !== 1 ||
      count('right-low') !== 2 ||
      count('right-high') !== 1 ||
      count('bridgeA') !== 1 ||
      count('bridgeB') !== 1
    ) {
      return true;
    }
  } else {
    return true;
  }
  // Dynamic: no floating/sinking/strainer/ice/obstacle/bud on G27 boards.
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
export function g27StandardInventory(): Record<TeaId, number> {
  const out = {} as Record<TeaId, number>;
  for (const t of G27_PALETTE) out[t] = TEA_UNITS_PER_COLOR;
  return out;
}
