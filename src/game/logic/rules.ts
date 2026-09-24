/**
 * Single source of truth for Water Sort move legality.
 *
 * Rules (kept from the original game, do not redesign):
 * - source cannot be empty
 * - target cannot be full
 * - same cup forbidden
 * - target empty is allowed
 * - otherwise top colors must match
 * - move the consecutive same-color top group, up to target capacity
 * - complete mono cup -> empty cup is forbidden (meaningless loop)
 *
 * Asymmetric vessels (Gauntlet 1 — source-only teapot):
 * - `normal` may pour out AND receive (existing rules above).
 * - `source-only` may pour out but can NEVER be a destination.
 * - A uniform full teapot is NOT a completed destination: source-only
 *   vessels must be EMPTY for victory.
 *
 * Named serving (Gauntlet 2 — target cups):
 * - a `normal` cup with `targetTeaId` pours EXACTLY like an ordinary cup
 *   during play (temporary wrong colors are legal);
 * - at victory it MUST hold exactly full homogeneous `targetTeaId`.
 *
 * `Cup.canPourInto`, the solver, the generator and deadlock detection
 * must ALL delegate to this module so the rules cannot diverge.
 *
 * No Pixi/React imports here — pure domain logic only.
 */

import {
  CupConstraint,
  MAX_CUP_CAPACITY,
  TeaId,
  cupConstraintSignature,
  normalizeCupConstraints,
} from '../types';

const PLAIN_NORMAL_CONSTRAINT: CupConstraint = { mode: 'normal' };

/** Machine-readable rejection reason (UI maps codes to localized strings). */
export type PourRejectCode =
  | 'ok'
  | 'same-cup'
  | 'out-of-range'
  | 'source-empty'
  | 'target-full'
  | 'target-source-only'
  | 'complete-to-empty'
  | 'color-mismatch';

export function topLayerOf(layers: TeaId[]): TeaId | null {
  if (layers.length === 0) return null;
  return layers[layers.length - 1] as TeaId;
}

export function topCountOf(layers: TeaId[]): number {
  if (layers.length === 0) return 0;
  const top = layers[layers.length - 1];
  let count = 0;
  for (let i = layers.length - 1; i >= 0; i--) {
    if (layers[i] === top) count++;
    else break;
  }
  return count;
}

export function isHomogeneous(layers: TeaId[]): boolean {
  if (layers.length === 0) return true;
  const first = layers[0];
  return layers.every((l) => l === first);
}

export function isCompleteCup(layers: TeaId[]): boolean {
  if (layers.length !== MAX_CUP_CAPACITY) return false;
  return isHomogeneous(layers);
}

function modeOf(constraints: readonly CupConstraint[] | undefined, idx: number): 'normal' | 'source-only' {
  const c = constraints?.[idx];
  return c?.mode ?? 'normal';
}

/**
 * True when a full homogeneous cup already satisfies its own end-state
 * rule: an ordinary complete cup, or a target cup filled with exactly its
 * targetTeaId. A teapot is never "complete" (it must end empty), and a
 * target cup holding the WRONG homogeneous tea is not complete either —
 * emptying it is real progress, not a loop.
 */
export function isInFinalState(layers: TeaId[], c: CupConstraint | undefined): boolean {
  if (layers.length !== MAX_CUP_CAPACITY || !isHomogeneous(layers)) return false;
  if ((c?.mode ?? 'normal') === 'source-only') return false;
  if (c?.targetTeaId !== undefined) return layers[0] === c.targetTeaId;
  return true;
}

/**
 * Homogeneous-stack → empty relocation pruning (shared by legality and
 * constructive-move classification so they can never diverge).
 * Prunes ONLY within one identical constraint signature group, and a FULL
 * stack only when the source is already in its final state. Moving tea
 * OUT OF a wrongly-filled target cup or OUT OF a teapot changes which
 * behavioral/end-state group holds the tea, so it stays legal.
 */
function isPrunableHomogeneousToEmpty(
  source: TeaId[],
  fromC: CupConstraint | undefined,
  toC: CupConstraint | undefined,
): boolean {
  if (!isHomogeneous(source)) return false;
  const fromSig = cupConstraintSignature(fromC ?? PLAIN_NORMAL_CONSTRAINT);
  const toSig = cupConstraintSignature(toC ?? PLAIN_NORMAL_CONSTRAINT);
  if (fromSig !== toSig) return false;
  if (source.length === MAX_CUP_CAPACITY) return isInFinalState(source, fromC);
  return true;
}

/**
 * Full legality reason shared by UI, solver and generator.
 * Returns 'ok' when the pour is legal.
 */
export function pourRejectCodeBetween(
  cups: readonly TeaId[][],
  fromIdx: number,
  toIdx: number,
  constraints?: readonly CupConstraint[],
): PourRejectCode {
  if (fromIdx === toIdx) return 'same-cup';
  if (fromIdx < 0 || fromIdx >= cups.length) return 'out-of-range';
  if (toIdx < 0 || toIdx >= cups.length) return 'out-of-range';
  // Destination role check FIRST: a teapot can never receive, even from
  // another teapot. This keeps "source-only as destination" always illegal.
  if (modeOf(constraints, toIdx) === 'source-only') return 'target-source-only';
  const source = cups[fromIdx] as TeaId[];
  const target = cups[toIdx] as TeaId[];
  if (source.length === 0) return 'source-empty';
  if (target.length >= MAX_CUP_CAPACITY) return 'target-full';
  // Meaningless loop: moving a FULL homogeneous cup that already satisfies
  // its own end-state rule into an empty cup of the same identical
  // constraint group. Partial homogeneous stacks are ALWAYS legal here
  // (only the constructive-move classification prunes them). Target cups
  // pour exactly like ordinary cups during play (temporary wrong colors
  // are legal) — the target binds ONLY the final state, so no
  // target-specific rejection exists here. Emptying a wrongly-filled
  // target or a teapot is real progress and stays legal.
  if (
    target.length === 0 &&
    source.length === MAX_CUP_CAPACITY &&
    isPrunableHomogeneousToEmpty(source, constraints?.[fromIdx], constraints?.[toIdx])
  ) {
    return 'complete-to-empty';
  }
  if (target.length === 0) return 'ok';
  return topLayerOf(source) === topLayerOf(target) ? 'ok' : 'color-mismatch';
}

/**
 * Full legality check shared by UI, solver and generator.
 * Returns false for out-of-range indices as well.
 * When `constraints` is omitted, all vessels are treated as normal
 * (exact legacy behavior).
 */
export function canPourBetween(
  cups: readonly TeaId[][],
  fromIdx: number,
  toIdx: number,
  constraints?: readonly CupConstraint[],
): boolean {
  return pourRejectCodeBetween(cups, fromIdx, toIdx, constraints) === 'ok';
}

/** Number of layers that would transfer (0 when illegal). */
export function pourCountBetween(
  cups: readonly TeaId[][],
  fromIdx: number,
  toIdx: number,
  constraints?: readonly CupConstraint[],
): number {
  if (!canPourBetween(cups, fromIdx, toIdx, constraints)) return 0;
  const source = cups[fromIdx] as TeaId[];
  const target = cups[toIdx] as TeaId[];
  return Math.min(topCountOf(source), MAX_CUP_CAPACITY - target.length);
}

/**
 * A move is "constructive" when it can change the partition structure.
 * Relocating a homogeneous stack into an empty cup of the same identical
 * constraint group only permutes interchangeable cups, so deadlock
 * detection and the solver both ignore it. This keeps
 * `isDeadlocked == (no solver moves available && !won)`.
 *
 * The permutation argument is valid ONLY within one identical signature
 * group (Gauntlets 1–2): moving tea OUT OF a teapot or OUT OF a
 * wrongly-filled target cup into a normal empty changes which
 * behavioral/end-state group holds the tea, so it IS constructive.
 * Uses the same predicate as legality so the two can never diverge.
 */
export function isConstructiveMove(
  cups: readonly TeaId[][],
  fromIdx: number,
  toIdx: number,
  constraints?: readonly CupConstraint[],
): boolean {
  if (!canPourBetween(cups, fromIdx, toIdx, constraints)) return false;
  const source = cups[fromIdx] as TeaId[];
  const target = cups[toIdx] as TeaId[];
  if (
    target.length === 0 &&
    isPrunableHomogeneousToEmpty(source, constraints?.[fromIdx], constraints?.[toIdx])
  ) {
    return false;
  }
  return true;
}

export function listLegalMoves(
  cups: readonly TeaId[][],
  constructiveOnly = false,
  constraints?: readonly CupConstraint[],
): Array<{ from: number; to: number; count: number }> {
  const out: Array<{ from: number; to: number; count: number }> = [];
  for (let from = 0; from < cups.length; from++) {
    for (let to = 0; to < cups.length; to++) {
      if (from === to) continue;
      const ok = constructiveOnly
        ? isConstructiveMove(cups, from, to, constraints)
        : canPourBetween(cups, from, to, constraints);
      if (!ok) continue;
      out.push({ from, to, count: pourCountBetween(cups, from, to, constraints) });
    }
  }
  return out;
}

/** Pure pour: returns a fresh board or null when illegal. */
export function applyPour(
  cups: readonly TeaId[][],
  fromIdx: number,
  toIdx: number,
  constraints?: readonly CupConstraint[],
): { cups: TeaId[][]; transferred: number; layer: TeaId } | null {
  const count = pourCountBetween(cups, fromIdx, toIdx, constraints);
  if (count <= 0) return null;
  const next: TeaId[][] = cups.map((c) => [...c]);
  const source = next[fromIdx] as TeaId[];
  const target = next[toIdx] as TeaId[];
  const layer = topLayerOf(source) as TeaId;
  for (let i = 0; i < count; i++) {
    source.pop();
    target.push(layer);
  }
  return { cups: next, transferred: count, layer };
}

/**
 * Per-cup target presentation state (pure domain helper so the view never
 * decides target semantics itself):
 * - `no-target`  : ordinary cup or teapot (their own visuals apply).
 * - `working`    : target cup, not yet correctly served (any non-final content).
 * - `correct`    : full homogeneous targetTeaId — soft confirmation glow.
 * - `wrong-full` : full homogeneous WRONG tea — gentle mismatch indication.
 */
export type TargetCupState = 'no-target' | 'working' | 'correct' | 'wrong-full';

export function targetCupState(
  layers: TeaId[],
  constraint: CupConstraint | undefined,
): TargetCupState {
  const target = constraint?.targetTeaId;
  if (target === undefined || constraint?.mode !== 'normal') return 'no-target';
  if (layers.length === MAX_CUP_CAPACITY && isHomogeneous(layers)) {
    return layers[0] === target ? 'correct' : 'wrong-full';
  }
  return 'working';
}

/**
 * Win semantics with asymmetric vessels and named serving:
 * - SOURCE-ONLY: must be EMPTY. A uniform full teapot is NOT a win.
 * - NORMAL WITHOUT target: same existing rule (empty, or full uniform).
 * - NORMAL WITH targetTeaId: MUST be exactly full homogeneous of its
 *   target tea. Empty, partial, or wrong-homogeneous targets are NOT wins.
 * The target binds ONLY the final state — during play the cup pours
 * exactly like an ordinary cup.
 * When `constraints` is omitted, all vessels are normal (legacy).
 */
export function isWonState(
  cups: readonly TeaId[][],
  constraints?: readonly CupConstraint[],
): boolean {
  let completed = 0;
  for (let i = 0; i < cups.length; i++) {
    const cup = cups[i] as TeaId[];
    const c = constraints?.[i];
    const mode = c?.mode ?? 'normal';
    if (mode === 'source-only') {
      if (cup.length !== 0) return false;
      continue;
    }
    const target = c?.targetTeaId;
    if (target !== undefined) {
      if (cup.length !== MAX_CUP_CAPACITY) return false;
      if (!cup.every((l) => l === target)) return false;
      completed++;
      continue;
    }
    if (cup.length === 0) continue;
    if (!isCompleteCup(cup)) return false;
    completed++;
  }
  return completed > 0;
}

/**
 * Runtime deadlock definition (documented):
 * `deadlock = won ? false : no constructive legal move exists`.
 * This is a LOCAL check — it does not prove the puzzle is globally
 * unsolvable. Full solvability is the solver's job at generation time.
 * Constraint-aware: moves into source-only never count as escapes.
 */
export function isDeadlockedState(
  cups: readonly TeaId[][],
  constraints?: readonly CupConstraint[],
): boolean {
  if (isWonState(cups, constraints)) return false;
  return listLegalMoves(cups, true, constraints).length === 0;
}

/**
 * Canonical state key: cups are unlabeled, so sort cup encodings.
 * This collapses permutations of empty / identical cups and keeps
 * BFS visited sets small.
 *
 * Constraint-aware rule (Gauntlets 1–2): symmetry reduction is valid
 * ONLY among vessels with identical behavioral + end-state constraints.
 * A normal empty cup, a source-only empty teapot, a lavender target and
 * a karkade target MUST NOT collapse to the same identity. Cups are
 * grouped by full constraint signature (`N:_`, `N:<tea>`, `S:_`);
 * contents are sorted WITHIN each group, groups stay distinct.
 *
 * When `constraints` is omitted (or all normal), this is exactly the
 * legacy key (all encodings sorted together).
 */
export function canonicalKey(
  cups: readonly TeaId[][],
  constraints?: readonly CupConstraint[],
): string {
  if (!constraints) {
    const parts = cups.map((c) => c.join(','));
    parts.sort();
    return parts.join('|');
  }
  const normalized = normalizeCupConstraints(constraints, cups.length);
  const groups = new Map<string, string[]>();
  cups.forEach((cup, idx) => {
    const sig = cupConstraintSignature(normalized[idx] as CupConstraint);
    const enc = cup.join(',');
    const arr = groups.get(sig);
    if (arr) arr.push(enc);
    else groups.set(sig, [enc]);
  });
  const orderedSigs = [...groups.keys()].sort();
  const sections = orderedSigs.map((sig) => {
    const arr = groups.get(sig) as string[];
    arr.sort();
    return `${sig}:${arr.join('|')}`;
  });
  return sections.join('||');
}
