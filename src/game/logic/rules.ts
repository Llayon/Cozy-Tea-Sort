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
 * Sink-only guest cup (Gauntlet 3 — «Чашка гостя»):
 * - `sink-only` may RECEIVE under ordinary Water Sort destination rules
 *   but can NEVER act as a source (`source-sink-only` rejection).
 * - Starts empty, must finish FULL + HOMOGENEOUS for victory (any tea —
 *   no named target). Empty / partial / mixed-full sinks are NOT wins.
 * - A full homogeneous NORMAL moved into an empty sink-only cup is LEGAL
 *   and CONSTRUCTIVE (different constraint-signature groups) even though
 *   the same relocation into an ordinary empty is pruned as meaningless.
 *
 * Named serving (Gauntlet 2 — target cups):
 * - a `normal` cup with `targetTeaId` pours EXACTLY like an ordinary cup
 *   during play (temporary wrong colors are legal);
 * - at victory it MUST hold exactly full homogeneous `targetTeaId`.
 *
 * Variable capacity (Gauntlet 4 — tasting bowl):
 * - capacity lives on the constraint (`cupCapacity`), NOT in a global.
 *   A tasting bowl (capacity 2, must-end-empty) pours like a normal cup
 *   in both directions; "full" always means full *for that vessel*.
 * - Tea quantity per color (`TEA_UNITS_PER_COLOR`) is a separate concept
 *   and never shrinks because a small vessel exists.
 *
 * `Cup.canPourInto`, the solver, the generator and deadlock detection
 * must ALL delegate to this module so the rules cannot diverge.
 *
 * No Pixi/React imports here — pure domain logic only.
 */

import {
  CupConstraint,
  STANDARD_CUP_CAPACITY,
  TeaId,
  cupCapacity,
  cupConstraintSignature,
  mustEndEmpty,
  normalizeCupConstraints,
} from '../types';

const PLAIN_NORMAL_CONSTRAINT: CupConstraint = { mode: 'normal' };

/** Machine-readable rejection reason (UI maps codes to localized strings). */
export type PourRejectCode =
  | 'ok'
  | 'same-cup'
  | 'out-of-range'
  | 'source-empty'
  | 'source-sink-only'
  | 'target-full'
  | 'target-source-only'
  | 'complete-to-empty'
  | 'color-mismatch';

/**
 * Whether a vessel may ever act as a pour SOURCE under forward rules.
 * Normal and source-only vessels may; sink-only (guest) cups never may.
 * Undo is timeline reversal, not a forward move, so it bypasses this.
 */
export function canActAsSource(c: CupConstraint | undefined): boolean {
  return (c?.mode ?? 'normal') !== 'sink-only';
}

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

/**
 * Standard-capacity full homogeneous stack (legacy concept: an ordinary
 * 4/4 mono cup). Constraint-aware completion is `cupEndStateSatisfied`
 * below — use that whenever the vessel role matters (tasting bowls,
 * targets, sinks).
 */
export function isCompleteCup(layers: TeaId[]): boolean {
  if (layers.length !== STANDARD_CUP_CAPACITY) return false;
  return isHomogeneous(layers);
}

/**
 * Single shared per-vessel solved semantics (Gauntlet 4 §12):
 * - SOURCE-ONLY → empty.
 * - SINK-ONLY → full *to its capacity* AND homogeneous, no target allowed.
 * - NORMAL + targetTeaId → full *to its capacity*, homogeneous, exactly
 *   the target tea.
 * - NORMAL + mustEndEmpty (tasting bowl) → empty. Even a full homogeneous
 *   bowl is NOT satisfied — it must be emptied before victory.
 * - PLAIN NORMAL → empty, OR full-to-capacity homogeneous.
 * Malformed contradictory combos never satisfy (production validation
 * rejects them outright).
 */
export function cupEndStateSatisfied(layers: TeaId[], c: CupConstraint | undefined): boolean {
  const mode = c?.mode ?? 'normal';
  const cap = cupCapacity(c);
  if (mode === 'source-only') return layers.length === 0;
  if (mode === 'sink-only') {
    if (c?.targetTeaId !== undefined) return false;
    return layers.length === cap && isHomogeneous(layers);
  }
  const target = c?.targetTeaId;
  if (target !== undefined) {
    return layers.length === cap && layers.every((l) => l === target);
  }
  if (mustEndEmpty(c)) return layers.length === 0;
  if (layers.length === 0) return true;
  return layers.length === cap && isHomogeneous(layers);
}

function modeOf(constraints: readonly CupConstraint[] | undefined, idx: number): 'normal' | 'source-only' | 'sink-only' {
  const c = constraints?.[idx];
  return c?.mode ?? 'normal';
}

/**
 * True when a NON-EMPTY homogeneous stack already satisfies its own
 * end-state rule (shared with `cupEndStateSatisfied`, so pruning and
 * victory can never diverge). A full tasting bowl is NOT final (it must
 * end empty) — emptying it stays legal. A teapot is never final, and a
 * target cup holding the WRONG homogeneous tea is not final either —
 * emptying those is real progress, not a loop.
 */
export function isInFinalState(layers: TeaId[], c: CupConstraint | undefined): boolean {
  if (layers.length === 0 || !isHomogeneous(layers)) return false;
  return cupEndStateSatisfied(layers, c);
}

/**
 * Homogeneous-stack → empty relocation pruning (shared by legality and
 * constructive-move classification so they can never diverge).
 * Prunes ONLY within one identical constraint signature group, and a
 * FULL stack (full *for its own vessel capacity*) only when the source
 * is already in its final state. Moving tea OUT OF a wrongly-filled
 * target cup, OUT OF a teapot, OUT OF a tasting bowl (which must end
 * empty), or INTO a different signature group changes the game state
 * irreversibly-in-partition terms, so it stays legal and constructive.
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
  if (source.length === cupCapacity(fromC)) return isInFinalState(source, fromC);
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
  // Source role check FIRST: a guest cup can never pour out, even into a
  // teapot. "Guest cannot source" outranks destination properties so
  // sink → teapot explains the sink, not the teapot.
  if (modeOf(constraints, fromIdx) === 'sink-only') return 'source-sink-only';
  // Destination role check: a teapot can never receive, even from another
  // teapot or from a (hypothetically sourcing) guest. Sink-only vessels
  // receive under ordinary Water Sort target rules — no rejection here.
  if (modeOf(constraints, toIdx) === 'source-only') return 'target-source-only';
  const source = cups[fromIdx] as TeaId[];
  const target = cups[toIdx] as TeaId[];
  if (source.length === 0) return 'source-empty';
  // "Full" is relative to the DESTINATION vessel (a 2/2 bowl is full).
  if (target.length >= cupCapacity(constraints?.[toIdx])) return 'target-full';
  // Meaningless loop: moving a FULL homogeneous cup that already satisfies
  // its own end-state rule into an empty cup of the same identical
  // constraint group. Partial homogeneous stacks are ALWAYS legal here
  // (only the constructive-move classification prunes them). Target cups
  // pour exactly like ordinary cups during play (temporary wrong colors
  // are legal) — the target binds ONLY the final state, so no
  // target-specific rejection exists here. Emptying a wrongly-filled
  // target, a teapot, or a tasting bowl (must end empty) is real progress
  // and stays legal.
  if (
    target.length === 0 &&
    source.length === cupCapacity(constraints?.[fromIdx]) &&
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
  // Transfer is bounded by the DESTINATION's free space: AAAA into an
  // empty tasting bowl moves exactly 2 layers, never 4.
  return Math.min(topCountOf(source), cupCapacity(constraints?.[toIdx]) - target.length);
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
  if (layers.length === cupCapacity(constraint) && isHomogeneous(layers)) {
    return layers[0] === target ? 'correct' : 'wrong-full';
  }
  return 'working';
}

/**
 * Win semantics with asymmetric vessels, named serving and tasting bowls.
 * Every vessel must satisfy the single shared `cupEndStateSatisfied`
 * helper (no duplicated completion logic): source-only vessels empty,
 * sink-only full-to-capacity homogeneous, targets full-to-capacity of
 * exactly their tea, tasting bowls (must-end-empty) empty, plain normals
 * empty or full-to-capacity homogeneous. At least one non-empty vessel
 * must be completed (an all-empty board is not a win).
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
    if (!cupEndStateSatisfied(cup, c)) return false;
    if (cup.length === 0) continue;
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
 * Constraint-aware rule (Gauntlets 1–4): symmetry reduction is valid
 * ONLY among vessels with identical behavioral + end-state constraints.
 * A normal empty cup, a source-only empty teapot, a sink-only empty
 * guest cup, a tasting bowl, a lavender target and a karkade target MUST
 * NOT collapse to the same identity. Cups are grouped by full constraint
 * signature (`N:_`, `N:<tea>`, `SRC:_`, `SNK:_`, `N:_:C2:E`); contents are
 * sorted WITHIN each group, groups stay distinct. A full homogeneous
 * NORMAL moved into an empty SINK stays legal + constructive (different
 * groups), while the same relocation into an ordinary empty is pruned.
 * Tea OUT OF a full tasting bowl into an empty normal is real progress
 * (the bowl must end empty), never a symmetric relocation.
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
