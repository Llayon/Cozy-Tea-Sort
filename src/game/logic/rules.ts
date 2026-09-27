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
 * Floating ingredients (Gauntlet 5 — lemon slice):
 * - the lemon is dynamic CONTENT state (`PuzzleState.floatingIngredients`,
 *   an aligned array — the one authoritative location), never a TeaId,
 *   never capacity, never a constraint.
 * - it rides the surface: any legal outflow from its host carries it to
 *   the destination; inflow never pushes it away; illegal pours leave it
 *   untouched (atomic transition).
 * - it must finish on a full homogeneous standard sea_buckthorn cup.
 * - the `*State` functions below are the single transition truth; the
 *   legacy tea-only APIs delegate with all-null slots and behave exactly
 *   as before (including identical canonical strings for lemon-free
 *   boards).
 *
 * `Cup.canPourInto`, the solver, the generator and deadlock detection
 * must ALL delegate to this module so the rules cannot diverge.
 *
 * No Pixi/React imports here — pure domain logic only.
 */

import {
  CupConstraint,
  FLOATING_INGREDIENT_TYPES,
  FloatingIngredientId,
  PuzzleState,
  ReadonlyPuzzleState,
  STANDARD_CUP_CAPACITY,
  TeaId,
  cupCapacity,
  cupConstraintSignature,
  emptyFloatingIngredients,
  mustEndEmpty,
  normalizeCupConstraints,
  normalizeFloatingIngredients,
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
  | 'target-floating-occupied'
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
  const target = c?.targetTeaId;
  const endEmpty = mustEndEmpty(c);
  if (mode === 'source-only') {
    // Fail-closed (Gauntlet 4.1): a teapot carrying a named target is a
    // contradictory constraint — never satisfied, even when empty.
    // Production validation rejects the combo outright.
    if (target !== undefined) return false;
    return layers.length === 0;
  }
  if (mode === 'sink-only') {
    // Fail-closed: a guest cup with a named target, or one simultaneously
    // required to end empty, is contradictory — never satisfied.
    if (target !== undefined || endEmpty) return false;
    return layers.length === cap && isHomogeneous(layers);
  }
  if (target !== undefined) {
    // Fail-closed: named-serving destinations are standard vessels. A
    // capacity deviation or a simultaneous must-end-empty flag contradicts
    // the full-homogeneous-target rule — never satisfied.
    if (cap !== STANDARD_CUP_CAPACITY || endEmpty) return false;
    return layers.length === cap && layers.every((l) => l === target);
  }
  if (endEmpty) return layers.length === 0;
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
 * Tea-only legality core (private): color/capacity/role rules WITHOUT
 * floating-ingredient interaction. The state-aware
 * `pourRejectCodeState` below is the single truth; legacy callers reach
 * this core through it with all-null slots.
 */
function teaRejectCodeBetween(
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
 * State-aware legality (single truth): tea rules first, then
 * floating-ingredient collision. The lemon never alters color/capacity
 * legality — but a source ingredient meeting an already-occupied target
 * slot is rejected fail-closed (`target-floating-occupied`) rather than
 * overwriting. Illegal tea pours leave ingredient state untouched.
 */
export function pourRejectCodeState(
  state: ReadonlyPuzzleState,
  fromIdx: number,
  toIdx: number,
  constraints?: readonly CupConstraint[],
): PourRejectCode {
  const tea = teaRejectCodeBetween(state.cups, fromIdx, toIdx, constraints);
  if (tea !== 'ok') return tea;
  const slots = normalizeFloatingIngredients(state.floatingIngredients, state.cups.length);
  const srcIng = slots[fromIdx];
  const dstIng = slots[toIdx];
  if (srcIng != null && dstIng != null) return 'target-floating-occupied';
  return 'ok';
}

/**
 * Full legality reason shared by UI, solver and generator.
 * Returns 'ok' when the pour is legal. Legacy wrapper: delegates to the
 * state-aware truth with all-null slots (identical behavior).
 */
export function pourRejectCodeBetween(
  cups: readonly TeaId[][],
  fromIdx: number,
  toIdx: number,
  constraints?: readonly CupConstraint[],
): PourRejectCode {
  return pourRejectCodeState(
    { cups, floatingIngredients: emptyFloatingIngredients(cups.length) },
    fromIdx,
    toIdx,
    constraints,
  );
}

/**
 * State-aware legality check. Legacy wrapper below delegates with
 * all-null slots.
 */
export function canPourState(
  state: ReadonlyPuzzleState,
  fromIdx: number,
  toIdx: number,
  constraints?: readonly CupConstraint[],
): boolean {
  return pourRejectCodeState(state, fromIdx, toIdx, constraints) === 'ok';
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

/** State-aware transfer count (0 when illegal). Ingredient is weightless. */
export function pourCountState(
  state: ReadonlyPuzzleState,
  fromIdx: number,
  toIdx: number,
  constraints?: readonly CupConstraint[],
): number {
  if (!canPourState(state, fromIdx, toIdx, constraints)) return 0;
  const source = state.cups[fromIdx] as TeaId[];
  const target = state.cups[toIdx] as TeaId[];
  // Transfer is bounded by the DESTINATION's free space: AAAA into an
  // empty tasting bowl moves exactly 2 layers, never 4.
  return Math.min(topCountOf(source), cupCapacity(constraints?.[toIdx]) - target.length);
}

/** Number of layers that would transfer (0 when illegal). */
export function pourCountBetween(
  cups: readonly TeaId[][],
  fromIdx: number,
  toIdx: number,
  constraints?: readonly CupConstraint[],
): number {
  return pourCountState(
    { cups, floatingIngredients: emptyFloatingIngredients(cups.length) },
    fromIdx,
    toIdx,
    constraints,
  );
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
/**
 * State-aware constructive-move classification (single truth). The lemon
 * does NOT automatically make a move constructive: a homogeneous stack
 * (with its riding ingredient, if any) relocated into an empty cup of the
 * SAME signature group merely permutes interchangeable vessels — the
 * canonical state key is invariant, so the prune stays sound. Any move
 * that changes the ingredient relative to different tea contents or a
 * different vessel group stays constructive.
 */
export function isConstructiveMoveState(
  state: ReadonlyPuzzleState,
  fromIdx: number,
  toIdx: number,
  constraints?: readonly CupConstraint[],
): boolean {
  if (!canPourState(state, fromIdx, toIdx, constraints)) return false;
  const source = state.cups[fromIdx] as TeaId[];
  const target = state.cups[toIdx] as TeaId[];
  if (
    target.length === 0 &&
    isPrunableHomogeneousToEmpty(source, constraints?.[fromIdx], constraints?.[toIdx])
  ) {
    return false;
  }
  return true;
}

export function isConstructiveMove(
  cups: readonly TeaId[][],
  fromIdx: number,
  toIdx: number,
  constraints?: readonly CupConstraint[],
): boolean {
  return isConstructiveMoveState(
    { cups, floatingIngredients: emptyFloatingIngredients(cups.length) },
    fromIdx,
    toIdx,
    constraints,
  );
}

export function listLegalMovesState(
  state: ReadonlyPuzzleState,
  constructiveOnly = false,
  constraints?: readonly CupConstraint[],
): Array<{ from: number; to: number; count: number }> {
  const out: Array<{ from: number; to: number; count: number }> = [];
  for (let from = 0; from < state.cups.length; from++) {
    for (let to = 0; to < state.cups.length; to++) {
      if (from === to) continue;
      const ok = constructiveOnly
        ? isConstructiveMoveState(state, from, to, constraints)
        : canPourState(state, from, to, constraints);
      if (!ok) continue;
      out.push({ from, to, count: pourCountState(state, from, to, constraints) });
    }
  }
  return out;
}

export function listLegalMoves(
  cups: readonly TeaId[][],
  constructiveOnly = false,
  constraints?: readonly CupConstraint[],
): Array<{ from: number; to: number; count: number }> {
  return listLegalMovesState(
    { cups, floatingIngredients: emptyFloatingIngredients(cups.length) },
    constructiveOnly,
    constraints,
  );
}

export interface PourStateResult {
  state: PuzzleState;
  transferred: number;
  layer: TeaId;
  /** Ingredient that rode this pour, if any (for animation metadata). */
  floatingIngredientMoved?: FloatingIngredientId;
}

/**
 * Atomic pure state transition (single truth): tea movement plus the
 * ingredient ride in ONE operation. The source's ingredient (if any)
 * moves to the destination; an ingredient-free source leaves slots
 * unchanged; inflow never displaces a destination ingredient (collision
 * is rejected in legality, never overwritten here).
 */
export function applyPourState(
  state: ReadonlyPuzzleState,
  fromIdx: number,
  toIdx: number,
  constraints?: readonly CupConstraint[],
): PourStateResult | null {
  const count = pourCountState(state, fromIdx, toIdx, constraints);
  if (count <= 0) return null;
  const nextCups: TeaId[][] = state.cups.map((c) => [...c]);
  const nextSlots = normalizeFloatingIngredients(state.floatingIngredients, state.cups.length);
  const source = nextCups[fromIdx] as TeaId[];
  const target = nextCups[toIdx] as TeaId[];
  const layer = topLayerOf(source) as TeaId;
  for (let i = 0; i < count; i++) {
    source.pop();
    target.push(layer);
  }
  const moved = nextSlots[fromIdx] ?? null;
  let floatingIngredientMoved: FloatingIngredientId | undefined;
  if (moved != null) {
    nextSlots[toIdx] = moved;
    nextSlots[fromIdx] = null;
    floatingIngredientMoved = moved;
  }
  return {
    state: { cups: nextCups, floatingIngredients: nextSlots },
    transferred: count,
    layer,
    floatingIngredientMoved,
  };
}

/** Pure pour: returns a fresh board or null when illegal. */
export function applyPour(
  cups: readonly TeaId[][],
  fromIdx: number,
  toIdx: number,
  constraints?: readonly CupConstraint[],
): { cups: TeaId[][]; transferred: number; layer: TeaId } | null {
  const res = applyPourState(
    { cups, floatingIngredients: emptyFloatingIngredients(cups.length) },
    fromIdx,
    toIdx,
    constraints,
  );
  if (!res) return null;
  return { cups: res.state.cups, transferred: res.transferred, layer: res.layer };
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
 * Tea-only win core (private): every vessel satisfies
 * `cupEndStateSatisfied`, plus at least one non-empty completed vessel.
 */
function teaWonState(cups: readonly TeaId[][], constraints?: readonly CupConstraint[]): boolean {
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
 * Win semantics with asymmetric vessels, named serving and tasting bowls.
 * (Tea-only legacy: ingredient-free boards behave exactly as before.)
 * When `constraints` is omitted, all vessels are normal (legacy).
 */
export function isWonState(
  cups: readonly TeaId[][],
  constraints?: readonly CupConstraint[],
): boolean {
  return teaWonState(cups, constraints);
}

/**
 * Lemon final-host rule, fail-closed (Gauntlet 5 §20): the host must be a
 * plain standard normal vessel (no target, standard capacity, no
 * must-end-empty) holding exactly full homogeneous target tea. Teapots,
 * sinks, tasting bowls, named targets, partial/mixed/empty cups and wrong
 * teas all fail — as do unknown future ingredient ids.
 */
export function floatingIngredientHostSatisfied(
  id: FloatingIngredientId,
  layers: TeaId[],
  c: CupConstraint | undefined,
): boolean {
  const known = (FLOATING_INGREDIENT_TYPES as Record<string, { targetTeaId: TeaId } | undefined>)[id];
  if (!known) return false;
  if (!c || c.mode !== 'normal') return false;
  if (c.targetTeaId !== undefined) return false;
  if (cupCapacity(c) !== STANDARD_CUP_CAPACITY) return false;
  if (mustEndEmpty(c)) return false;
  if (layers.length !== STANDARD_CUP_CAPACITY) return false;
  if (!isHomogeneous(layers)) return false;
  return layers[0] === known.targetTeaId;
}

/**
 * Floating-ingredient victory goals: no-ingredient boards pass; otherwise
 * every present ingredient must sit on a satisfying host, with no
 * duplicates and no unknown ids. Malformed states fail closed.
 */
export function floatingIngredientGoalsSatisfied(
  state: ReadonlyPuzzleState,
  constraints?: readonly CupConstraint[],
): boolean {
  const slots = normalizeFloatingIngredients(state.floatingIngredients, state.cups.length);
  const present = slots.filter((s): s is FloatingIngredientId => s != null);
  if (new Set(present).size !== present.length) return false;
  for (let i = 0; i < slots.length; i++) {
    const id = slots[i];
    if (id == null) continue;
    if (!floatingIngredientHostSatisfied(id, state.cups[i] as TeaId[], constraints?.[i])) {
      return false;
    }
  }
  return true;
}

/**
 * Canonical puzzle win: tea sorted AND every floating ingredient on its
 * correct completed tea. A tea-sorted board with the lemon on matcha is
 * NOT won.
 */
export function isPuzzleWonState(
  state: ReadonlyPuzzleState,
  constraints?: readonly CupConstraint[],
): boolean {
  if (!teaWonState(state.cups, constraints)) return false;
  return floatingIngredientGoalsSatisfied(state, constraints);
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
  if (teaWonState(cups, constraints)) return false;
  return listLegalMoves(cups, true, constraints).length === 0;
}

/**
 * Puzzle deadlock (single truth for runtime): a tea-sorted board with the
 * lemon on the wrong tea is NOT won — and with no constructive puzzle
 * move left, it IS deadlocked. TeaSortLogic must use this, never the
 * tea-only helper, on ingredient levels.
 */
export function isPuzzleDeadlockedState(
  state: ReadonlyPuzzleState,
  constraints?: readonly CupConstraint[],
): boolean {
  if (isPuzzleWonState(state, constraints)) return false;
  return listLegalMovesState(state, true, constraints).length === 0;
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
 * Floating ingredients (Gauntlet 5) join the encoding as content
 * markers (`A,A,B,B#_` vs `A,A,B,B#lemon`): the marker travels WITH the
 * tea as one unit and sorts inside the same vessel-signature group, so
 * permuting interchangeable vessels (contents + marker together) stays
 * canonical, while genuinely different ingredient placements key
 * differently. Lemon-free boards produce byte-identical legacy keys.
 *
 * When `constraints` is omitted (or all normal), this is exactly the
 * legacy key (all encodings sorted together).
 */
function teaCanonicalKey(cups: readonly TeaId[][], constraints?: readonly CupConstraint[]): string {
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

export function canonicalKey(
  cups: readonly TeaId[][],
  constraints?: readonly CupConstraint[],
): string {
  return teaCanonicalKey(cups, constraints);
}

/**
 * Canonical puzzle key (single truth for the solver): tea contents +
 * vessel signatures + floating-ingredient markers. With no ingredients
 * present this returns EXACTLY the legacy key (same strings, same BFS
 * state counts — no representation-driven explosion for old levels).
 */
export function canonicalPuzzleKey(
  state: ReadonlyPuzzleState,
  constraints?: readonly CupConstraint[],
): string {
  const slots = normalizeFloatingIngredients(state.floatingIngredients, state.cups.length);
  if (!slots.some((s) => s != null)) {
    return teaCanonicalKey(state.cups, constraints);
  }
  const normalized = normalizeCupConstraints(constraints, state.cups.length);
  const groups = new Map<string, string[]>();
  state.cups.forEach((cup, idx) => {
    const sig = cupConstraintSignature(normalized[idx] as CupConstraint);
    const marker = slots[idx] ?? '_';
    const enc = `${cup.join(',')}#${marker}`;
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
