/**
 * Serving-order dependency kernel (Gauntlet 14 Phase A — feasibility only).
 *
 * ORDER / DEPENDENCY («Порядок подачи»): exactly two otherwise-normal cups
 * sit on ordered serving saucers ① and ②. Both stay fully usable while
 * sorting, but they must COMPLETE in order — ① first, ② second — and a
 * served cup becomes source-locked.
 *
 * DERIVED STATE ONLY: no served flags, no counters, no history live in
 * PuzzleState. The served prefix derives from current tea contents + static
 * constraints, which is sound because valid transitions can only grow the
 * prefix monotonically (early completion of ② is rejected; served sources
 * are locked), so the board always encodes its own progress.
 *
 * No Pixi/React imports here — pure domain logic only.
 */

import {
  STANDARD_CUP_CAPACITY,
  CupConstraint,
  ReadonlyPuzzleState,
  TeaId,
  cupCapacity,
  mustEndEmpty,
} from '../types';

/** Local homogeneity check (rules.ts owns the shared one; this module must
 * stay importable from rules.ts, so no rules imports here — no cycles). */
function layersHomogeneous(layers: TeaId[]): boolean {
  if (layers.length === 0) return true;
  const first = layers[0];
  return layers.every((l) => l === first);
}

/** Serving order of one vessel (`undefined` = ordinary cup, no ordering). */
export function serveOrderOf(c: CupConstraint | undefined): number | undefined {
  return c?.serveOrder ?? undefined;
}

/**
 * Vessel indices carrying a serving order, sorted by order ascending
 * (production: exactly [idxOf1, idxOf2]). Presence of any order —
 * valid or not — counts here; production validation restricts values.
 */
export function orderedServeIndices(constraints: readonly CupConstraint[] | undefined): number[] {
  if (!constraints) return [];
  const out: number[] = [];
  constraints.forEach((c, idx) => {
    if (c?.serveOrder !== undefined) out.push(idx);
  });
  out.sort((a, b) => {
    const oa = constraints[a]?.serveOrder as number;
    const ob = constraints[b]?.serveOrder as number;
    return oa - ob;
  });
  return out;
}

/** True when any serving-order constraint is present (valid or not). */
export function hasServeOrder(constraints: readonly CupConstraint[] | undefined): boolean {
  if (!constraints) return false;
  return constraints.some((c) => c?.serveOrder !== undefined);
}

/**
 * Static validity of one serving-order cup (§11): normal mode, standard
 * capacity 4, no named target, must not end empty. Says nothing about
 * uniqueness/contiguity — that is `validateServeOrderConstraints`.
 */
export function isValidServeCupConstraint(c: CupConstraint | undefined): boolean {
  if (!c || c.serveOrder === undefined) return false;
  if (c.mode !== 'normal') return false;
  if (cupCapacity(c) !== STANDARD_CUP_CAPACITY) return false;
  if (c.targetTeaId !== undefined) return false;
  if (mustEndEmpty(c)) return false;
  return true;
}

/**
 * Production static contract (§§11-13): exactly one order 1 and one
 * order 2 (no duplicates, no gaps, no other values), each on a valid
 * serving-order cup. Returns human-readable reasons (empty = valid).
 * Dynamic specials/tools are validated at request level, not here.
 */
export function validateServeOrderConstraints(
  constraints: readonly CupConstraint[] | undefined,
): string[] {
  const reasons: string[] = [];
  if (!constraints) return reasons;
  const orders: number[] = [];
  constraints.forEach((c, idx) => {
    const o = c?.serveOrder;
    if (o === undefined) return;
    if (!Number.isInteger(o)) {
      reasons.push(`vessel ${idx} serveOrder must be an integer (got ${String(o)})`);
      return;
    }
    orders.push(o);
    if (o !== 1 && o !== 2) {
      reasons.push(`vessel ${idx} serveOrder ${o} unsupported (production exactly 1 + 2)`);
    }
    if (c?.mode !== 'normal') reasons.push(`serveOrder vessel ${idx} must be normal (got ${c?.mode})`);
    if (c && cupCapacity(c) !== STANDARD_CUP_CAPACITY) {
      reasons.push(`serveOrder vessel ${idx} must keep base capacity 4`);
    }
    if (c?.targetTeaId !== undefined) reasons.push(`serveOrder vessel ${idx} must not carry a target`);
    if (c && mustEndEmpty(c)) reasons.push(`serveOrder vessel ${idx} must not require ending empty`);
  });
  const sorted = [...orders].sort((a, b) => a - b);
  if (orders.length > 0 && JSON.stringify(sorted) !== JSON.stringify([1, 2])) {
    const ones = orders.filter((o) => o === 1).length;
    const twos = orders.filter((o) => o === 2).length;
    if (ones !== 1 || twos !== 1) {
      reasons.push(`serving order requires exactly one 1 and one 2 (got [${sorted.join(',')}])`);
    }
  }
  return reasons;
}

/**
 * Completion of one ordered serving cup (§§4, 15): the cup carries a
 * (statically valid) serving order AND holds exactly 4 homogeneous tea
 * layers. Any tea color may serve. An empty ordered cup is never complete.
 * This is NOT served-ness (which additionally needs all earlier orders).
 */
export function isServeCupComplete(layers: TeaId[], c: CupConstraint | undefined): boolean {
  if (!isValidServeCupConstraint(c)) return false;
  if (layers.length !== STANDARD_CUP_CAPACITY) return false;
  return layersHomogeneous(layers);
}

/**
 * Derived served prefix (§6): number of leading orders currently served.
 * ① mixed / ② mixed → 0; ① full-homogeneous / ② mixed → 1;
 * ① + ② full-homogeneous → 2; ① mixed / ② full-homogeneous → 0
 * (malformed/unreachable through valid transitions — ② is NOT served).
 * Monotone 0→1→2 along every legal forward replay.
 */
export function servedPrefixLength(
  state: ReadonlyPuzzleState,
  constraints: readonly CupConstraint[] | undefined,
): number {
  const ordered = orderedServeIndices(constraints);
  let prefix = 0;
  for (const idx of ordered) {
    if (isServeCupComplete(state.cups[idx] as TeaId[], constraints?.[idx])) {
      prefix++;
    } else {
      break;
    }
  }
  return prefix;
}

/**
 * Served-ness of one vessel (§5): an ordered cup is served iff its order
 * is within the derived prefix. Ordinary cups are never "served". A full
 * homogeneous ② with incomplete ① reports NOT served (prefix 0), so the
 * malformed state stays source-capable and repairable (§28).
 */
export function isServedCupState(
  state: ReadonlyPuzzleState,
  cupIndex: number,
  constraints: readonly CupConstraint[] | undefined,
): boolean {
  const order = serveOrderOf(constraints?.[cupIndex]);
  if (order === undefined) return false;
  return servedPrefixLength(state, constraints) >= order;
}
