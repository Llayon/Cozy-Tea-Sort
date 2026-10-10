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
  CapacityObstacleId,
  CapacityObstacleSlot,
  CupConstraint,
  FLOATING_INGREDIENT_TYPES,
  FloatingIngredientId,
  FloatingIngredientSlot,
  ICE_MELT_TEA,
  IceId,
  IceSlot,
  PuzzleAction,
  PuzzleState,
  ReadonlyPuzzleState,
  SINKING_INGREDIENT_TYPES,
  SinkingIngredientId,
  SinkingIngredientSlot,
  STANDARD_CUP_CAPACITY,
  TeaBudId,
  TeaBudSlot,
  TeaId,
  cupCapacity,
  cupConstraintSignature,
  effectiveCupCapacity,
  emptyFloatingIngredients,
  emptySinkingIngredients,
  emptyStrainerState,
  isPlaceStrainerAction,
  isReleaseStrainerAction,
  mustEndEmpty,
  normalizeCapacityObstacles,
  normalizeCupConstraints,
  normalizeFloatingIngredients,
  normalizeIceSlots,
  normalizeSinkingIngredients,
  normalizeStrainerState,
  normalizeTeaBudSlots,
} from '../types';
import {
  BlendReactionMetadata,
  BlendRecipe,
  countTeaLayers,
  isReactivePair,
  isValidBlendRecipe,
} from './blendRecipe';

const PLAIN_NORMAL_CONSTRAINT: CupConstraint = { mode: 'normal' };

/**
 * Fail-closed unsupported-composition gate for blend reactions (G13 §46).
 *
 * Production blend is standalone chemistry only (no Mystery/teapot/targets/
 * sink/tasting/thermos/lemon/honey/strainer/ice/cinnamon/tea-bloom). If a
 * malformed/manual state enables BlendRecipe together with any dynamic
 * special/tool or non-standard vessel role, the core does NOT invent
 * composition semantics — reactive pours are disabled (treated as ordinary
 * color-mismatch, since A≠B can never ordinarily pour).
 *
 * Conservative: ANY special anywhere blocks ALL reactions (not just the two
 * vessels involved). Phase A topology (6 standard normal vessels, no specials)
 * never triggers this.
 */
function isBlendCompositionBlocked(
  state: ReadonlyPuzzleState,
  constraints?: readonly CupConstraint[],
): boolean {
  const n = state.cups.length;
  const strainer = normalizeStrainerState(state.strainer);
  if (strainer.present) return true;
  const floating = normalizeFloatingIngredients(state.floatingIngredients, n);
  if (floating.some((s) => s != null)) return true;
  const sinking = normalizeSinkingIngredients(state.sinkingIngredients, n);
  if (sinking.some((s) => s != null)) return true;
  const ice = normalizeIceSlots(state.iceSlots, n);
  if (ice.some((s) => s != null)) return true;
  const obstacles = normalizeCapacityObstacles(state.capacityObstacles, n);
  if (obstacles.some((s) => s != null)) return true;
  const buds = normalizeTeaBudSlots(state.teaBudSlots, n);
  if (buds.some((s) => s != null)) return true;
  if (constraints) {
    for (const c of constraints) {
      if (!c) continue;
      if (c.mode !== 'normal') return true;
      if (c.targetTeaId !== undefined) return true;
      if (cupCapacity(c) !== STANDARD_CUP_CAPACITY) return true;
      if (mustEndEmpty(c)) return true;
    }
  }
  return false;
}

/**
 * Whether a reactive pour is attempted (both tops present forming the recipe
 * pair with a non-empty destination). Legality still requires the
 * composition gate to pass; this helper only detects the chemical contact.
 */
function isBlendReactionAttempt(
  state: ReadonlyPuzzleState,
  fromIdx: number,
  toIdx: number,
  recipe: BlendRecipe | undefined | null,
): boolean {
  if (!recipe || !isValidBlendRecipe(recipe)) return false;
  if (fromIdx < 0 || fromIdx >= state.cups.length) return false;
  if (toIdx < 0 || toIdx >= state.cups.length) return false;
  const source = state.cups[fromIdx] as TeaId[] | undefined;
  const target = state.cups[toIdx] as TeaId[] | undefined;
  if (!source || !target) return false;
  if (source.length === 0 || target.length === 0) return false;
  return isReactivePair(topLayerOf(source), topLayerOf(target), recipe);
}

/** Build reaction metadata for a legal reactive pour (presentation only). */
function blendReactionMetadata(
  state: ReadonlyPuzzleState,
  fromIdx: number,
  _toIdx: number,
  recipe: BlendRecipe,
): BlendReactionMetadata {
  const source = state.cups[fromIdx] as TeaId[];
  const sourceReactant = topLayerOf(source) as TeaId;
  const targetReactant = sourceReactant === recipe.reactantA ? recipe.reactantB : recipe.reactantA;
  return {
    recipeId: recipe.id,
    sourceReactant,
    targetReactant,
    product: recipe.product,
  };
}

/** Machine-readable rejection reason (UI maps codes to localized strings). */
export type PourRejectCode =
  | 'ok'
  | 'same-cup'
  | 'out-of-range'
  | 'source-empty'
  | 'source-sink-only'
  | 'source-frozen'
  | 'target-full'
  | 'target-source-only'
  | 'target-floating-occupied'
  | 'target-sinking-occupied'
  | 'target-frozen-needs-hot'
  | 'complete-to-empty'
  | 'color-mismatch'
  | 'strainer-needs-two-layers'
  | 'strainer-loaded';

/** Machine-readable strainer placement rejection. */
export type StrainerPlaceRejectCode =
  | 'ok'
  | 'no-strainer'
  | 'strainer-loaded'
  | 'out-of-range'
  | 'target-empty'
  | 'target-sink-only'
  | 'same-host'
  | 'target-floating-occupied-by-tool-conflict';

/** Machine-readable strainer release rejection. */
export type StrainerReleaseRejectCode =
  | 'ok'
  | 'no-strainer'
  | 'strainer-empty'
  | 'out-of-range'
  | 'target-full'
  | 'target-source-only'
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
 *
 * Dynamic capacity (Gauntlet 11): a NON-EMPTY vessel with an active
 * capacity obstacle is NEVER final — even a homogeneous stack full
 * relative to its effective capacity (e.g. `[A,A]` + cinnamon) still
 * requires unlocking. Pass the vessel's obstacle when known; legacy
 * callers without obstacles behave exactly as before.
 */
export function isInFinalState(
  layers: TeaId[],
  c: CupConstraint | undefined,
  obstacle?: CapacityObstacleSlot | undefined | null,
  teaBud?: TeaBudSlot | undefined | null,
): boolean {
  if (layers.length === 0 || !isHomogeneous(layers)) return false;
  if (obstacle != null) return false;
  if (teaBud != null) return false;
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
 *
 * Dynamic capacity (Gauntlet 11): any pour touching an active capacity
 * obstacle is NEVER pruned — emptying an active source may REMOVE the
 * obstacle (a semantic state change, never a mere permutation), and
 * receiving into one changes decorated-vessel contents. Fail-closed:
 * active obstacle on either side disables the prune.
 */
function isPrunableHomogeneousToEmpty(
  source: TeaId[],
  fromC: CupConstraint | undefined,
  toC: CupConstraint | undefined,
  fromObstacle?: CapacityObstacleSlot | undefined | null,
  toObstacle?: CapacityObstacleSlot | undefined | null,
  fromBud?: TeaBudSlot | undefined | null,
  toBud?: TeaBudSlot | undefined | null,
): boolean {
  if (!isHomogeneous(source)) return false;
  if (fromObstacle != null || toObstacle != null) return false;
  if (fromBud != null || toBud != null) return false;
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
 *
 * Dynamic capacity (Gauntlet 11): pass the normalized obstacle row when
 * known — destination "full" and source "full" are evaluated against
 * EFFECTIVE capacity. Absent obstacles behave exactly as before.
 */
function teaRejectCodeBetween(
  cups: readonly TeaId[][],
  fromIdx: number,
  toIdx: number,
  constraints?: readonly CupConstraint[],
  obstacles?: readonly (CapacityObstacleSlot | undefined | null)[] | undefined,
  buds?: readonly (TeaBudSlot | undefined | null)[] | undefined,
  blendRecipe?: BlendRecipe | undefined | null,
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
  // "Full" is relative to the DESTINATION vessel's EFFECTIVE capacity
  // (a 2/2 bowl is full; a 2/2 active cinnamon cup is full).
  const destCap = obstacles
    ? effectiveCupCapacity(constraints?.[toIdx], obstacles[toIdx])
    : cupCapacity(constraints?.[toIdx]);
  if (target.length >= destCap) return 'target-full';
  // Meaningless loop: moving a FULL homogeneous cup that already satisfies
  // its own end-state rule into an empty cup of the same identical
  // constraint group. Partial homogeneous stacks are ALWAYS legal here
  // (only the constructive-move classification prunes them). Target cups
  // pour exactly like ordinary cups during play (temporary wrong colors
  // are legal) — the target binds ONLY the final state, so no
  // target-specific rejection exists here. Emptying a wrongly-filled
  // target, a teapot, or a tasting bowl (must end empty) is real progress
  // and stays legal. Emptying an ACTIVE obstacle source removes the
  // obstacle — never a meaningless loop (fail-closed inside the prune).
  const srcCap = obstacles
    ? effectiveCupCapacity(constraints?.[fromIdx], obstacles[fromIdx])
    : cupCapacity(constraints?.[fromIdx]);
  // G13 safe pruning option (§34): when a BlendRecipe is active, the
  // homogeneous→empty legality prune is DISABLED (a full homogeneous
  // reactant cup is NOT globally final while the recipe still requires those
  // reactants to disappear). Legacy levels (recipe absent) keep the exact
  // prune. This slightly enlarges the recipe-enabled state space; the
  // feasibility harness reports the cost.
  if (
    target.length === 0 &&
    blendRecipe != null &&
    isValidBlendRecipe(blendRecipe)
  ) {
    // Fall through to ordinary empty-target legality below (no prune).
  } else if (
    target.length === 0 &&
    source.length === srcCap &&
    isPrunableHomogeneousToEmpty(
      source,
      constraints?.[fromIdx],
      constraints?.[toIdx],
      obstacles?.[fromIdx],
      obstacles?.[toIdx],
      buds?.[fromIdx],
      buds?.[toIdx],
    )
  ) {
    return 'complete-to-empty';
  }
  if (target.length === 0) return 'ok';
  return topLayerOf(source) === topLayerOf(target) ? 'ok' : 'color-mismatch';
}

/**
 * Whether the strained catch mode is active for a pour FROM `fromIdx`
 * (empty tool attached to the source, nothing held).
 */
export function isStrainedCatchSource(state: ReadonlyPuzzleState, fromIdx: number): boolean {
  const s = normalizeStrainerState(state.strainer);
  return s.present && s.heldTea === null && s.attachedCupIndex === fromIdx;
}

/**
 * Ordinary transfer count ignoring any attached tool (the `m` in the
 * catch-one spec): min(top run, destination free) when the ordinary tea
 * pour is legal, else 0. Used to gate strained pours (m >= 2) and to
 * prove meaningfulness.
 */
export function unstrainedPourCountState(
  state: ReadonlyPuzzleState,
  fromIdx: number,
  toIdx: number,
  constraints?: readonly CupConstraint[],
  blendRecipe?: BlendRecipe | undefined | null,
): number {
  // Reaction transfer is exactly ONE layer (no top-run, no capacity bound).
  if (blendRecipe && isBlendReactionAttempt(state, fromIdx, toIdx, blendRecipe)) {
    if (isBlendCompositionBlocked(state, constraints)) return 0;
    // Role/empty preconditions mirror pourRejectCodeState priority.
    if (fromIdx === toIdx) return 0;
    if (fromIdx < 0 || fromIdx >= state.cups.length) return 0;
    if (toIdx < 0 || toIdx >= state.cups.length) return 0;
    const srcMode = constraints?.[fromIdx]?.mode ?? 'normal';
    const dstMode = constraints?.[toIdx]?.mode ?? 'normal';
    if (srcMode === 'sink-only' || dstMode === 'source-only') return 0;
    if ((state.cups[fromIdx] as TeaId[]).length === 0) return 0;
    return 1;
  }
  const obstacles = normalizeCapacityObstacles(state.capacityObstacles, state.cups.length);
  const buds = normalizeTeaBudSlots(state.teaBudSlots, state.cups.length);
  const tea = teaRejectCodeBetween(state.cups, fromIdx, toIdx, constraints, obstacles, buds, blendRecipe);
  if (tea !== 'ok') {
    // Melt exemption mirrors pourRejectCodeState (§52): the transfer count
    // for a genuine melt pour is computed normally below.
    if (
      tea !== 'complete-to-empty' ||
      !completeToEmptyMeltExempt(state, fromIdx, toIdx, constraints)
    ) {
      return 0;
    }
  }
  const slots = normalizeFloatingIngredients(state.floatingIngredients, state.cups.length);
  if (slots[fromIdx] != null && slots[toIdx] != null) return 0;
  const source = state.cups[fromIdx] as TeaId[];
  const target = state.cups[toIdx] as TeaId[];
  const m = Math.min(
    topCountOf(source),
    effectiveCupCapacity(constraints?.[toIdx], obstacles[toIdx]) - target.length,
  );
  if (m <= 0) return 0;
  // Fail-closed like the state-aware truth: a honey move into an
  // already honey-occupied destination is not a legal ordinary transfer.
  const sink = normalizeSinkingIngredients(state.sinkingIngredients, state.cups.length);
  if (sink[fromIdx] != null && source.length - m === 0 && sink[toIdx] != null) return 0;
  return m;
}

/**
 * Frozen-cup melt exemption (Gauntlet 9 §19/§52): the legacy
 * complete-homogeneous → empty rejection assumes an ordinary symmetric
 * relocation, but a hot-tea pour into a FROZEN empty vessel melts ice —
 * a semantic state change that is never a mere permutation. Returns true
 * exactly when the tea core rejects `complete-to-empty` yet the pour
 * would be a genuine melt (frozen destination, hot tea on top, capacity
 * already verified by the core before it reached the prune).
 */
function completeToEmptyMeltExempt(
  state: ReadonlyPuzzleState,
  fromIdx: number,
  toIdx: number,
  constraints?: readonly CupConstraint[],
): boolean {
  if (fromIdx < 0 || fromIdx >= state.cups.length) return false;
  if (toIdx < 0 || toIdx >= state.cups.length) return false;
  const ice = normalizeIceSlots(state.iceSlots, state.cups.length);
  if (ice[toIdx] == null) return false;
  if (topLayerOf(state.cups[fromIdx] as TeaId[]) !== ICE_MELT_TEA) return false;
  return (
    teaRejectCodeBetween(
      state.cups,
      fromIdx,
      toIdx,
      constraints,
      normalizeCapacityObstacles(state.capacityObstacles, state.cups.length),
      normalizeTeaBudSlots(state.teaBudSlots, state.cups.length),
    ) === 'complete-to-empty'
  );
}

/**
 * State-aware legality (single truth): tea rules first, then
 * floating-ingredient collision, then catch-one strainer gating. The lemon
 * never alters color/capacity legality — but a source ingredient meeting
 * an already-occupied target slot is rejected fail-closed
 * (`target-floating-occupied`) rather than overwriting.
 *
 * Frozen cups (Gauntlet 9 — «Замёрзшая чашка»): a frozen source can never
 * pour (`source-frozen`); a frozen destination accepts ONLY the designated
 * hot tea (`target-frozen-needs-hot`). Hot tea bypasses no ordinary rule —
 * a melt is an ordinary legal transfer plus an ice-state transition.
 * Priority notes: `source-sink-only` still outranks `source-frozen` (a
 * frozen guest cup reports its source-incapability first, §30);
 * `target-full` still outranks melting (ice creates no space, §18).
 *
 * Catch-one gating (preferred §I semantics — every actual strainer use is
 * meaningful): when the EMPTY tool is attached to the pour source, the
 * pour is legal only when the ordinary count m >= 2 (it will catch one).
 * A would-be single-layer pour while attached is rejected with
 * `strainer-needs-two-layers` (gentle UX message, no state change, tool
 * stays attached; relocate the free tool to unblock). Malformed
 * loaded+attached states fail closed (`strainer-loaded`).
 */
export function pourRejectCodeState(
  state: ReadonlyPuzzleState,
  fromIdx: number,
  toIdx: number,
  constraints?: readonly CupConstraint[],
  blendRecipe?: BlendRecipe | undefined | null,
): PourRejectCode {
  // G13 reaction priority (§35): same/out-of-range, source role, destination
  // role, source empty, then reactive-pair detection. A genuine reactive
  // contact is legal EVEN when the destination is full (no fifth layer is
  // created — the top is REPLACED). All other capacity/pruning/color rules
  // apply only to non-reactive pours.
  if (blendRecipe && isValidBlendRecipe(blendRecipe)) {
    if (fromIdx === toIdx) return 'same-cup';
    if (fromIdx < 0 || fromIdx >= state.cups.length) return 'out-of-range';
    if (toIdx < 0 || toIdx >= state.cups.length) return 'out-of-range';
    const srcModeEarly = constraints?.[fromIdx]?.mode ?? 'normal';
    const dstModeEarly = constraints?.[toIdx]?.mode ?? 'normal';
    if (srcModeEarly === 'sink-only') return 'source-sink-only';
    if (dstModeEarly === 'source-only') return 'target-source-only';
    const srcEarly = state.cups[fromIdx] as TeaId[] | undefined;
    if (!srcEarly || srcEarly.length === 0) return 'source-empty';
    if (isBlendReactionAttempt(state, fromIdx, toIdx, blendRecipe)) {
      // Fail-closed (§46): any sibling special/tool/role blocks chemistry.
      if (isBlendCompositionBlocked(state, constraints)) return 'color-mismatch';
      return 'ok';
    }
    // Non-reactive with an active recipe falls through to ordinary logic
    // below (with the homogeneous→empty prune disabled via tea core).
  }
  const obstacles = normalizeCapacityObstacles(state.capacityObstacles, state.cups.length);
  const buds = normalizeTeaBudSlots(state.teaBudSlots, state.cups.length);
  const tea = teaRejectCodeBetween(state.cups, fromIdx, toIdx, constraints, obstacles, buds, blendRecipe);
  const n = state.cups.length;
  const ice = normalizeIceSlots(state.iceSlots, n);
  const fromIn = fromIdx >= 0 && fromIdx < n;
  const toIn = toIdx >= 0 && toIdx < n;
  // A frozen vessel can never source (§14) — this outranks every tea-level
  // reason except addressing/role identity (same-cup, out-of-range, and
  // source-sink-only per §30: a frozen guest cup still reports its
  // source-incapability first).
  if (fromIn && ice[fromIdx] != null && tea !== 'same-cup' && tea !== 'out-of-range' && tea !== 'source-sink-only') {
    return 'source-frozen';
  }
  // Vessel capacity and destination roles win over melting: ice creates no
  // space (§18), and a teapot never receives (§16).
  if (tea === 'target-full' || tea === 'target-source-only') return tea;
  // A frozen destination accepts ONLY hot tea (§15, §20) — this outranks
  // color/prune detail, but never the capacity/role rejections above.
  if (toIn && fromIn && ice[toIdx] != null && topLayerOf(state.cups[fromIdx] as TeaId[]) !== ICE_MELT_TEA) {
    return 'target-frozen-needs-hot';
  }
  if (tea !== 'ok') {
    // Melt pours are never mere permutations (§52): a hot full-homogeneous
    // source into a frozen empty vessel proceeds to the checks below.
    if (tea === 'complete-to-empty' && completeToEmptyMeltExempt(state, fromIdx, toIdx, constraints)) {
      // fall through to floating/honey/strainer validation
    } else {
      return tea;
    }
  }
  const slots = normalizeFloatingIngredients(state.floatingIngredients, state.cups.length);
  const srcIng = slots[fromIdx];
  const dstIng = slots[toIdx];
  if (srcIng != null && dstIng != null) return 'target-floating-occupied';
  // Honey moves ONLY with the final outflow that completely empties its
  // host (source loses ALL m layers, strained or not). Such a move into
  // an already honey-occupied destination is rejected fail-closed
  // (`target-sinking-occupied`) rather than overwriting. Inflow into a
  // honey vessel never displaces it (no rejection here — honey stays).
  const sink = normalizeSinkingIngredients(state.sinkingIngredients, state.cups.length);
  if (sink[fromIdx] != null && sink[toIdx] != null) {
    const src = state.cups[fromIdx] as TeaId[];
    const dst = state.cups[toIdx] as TeaId[];
    const m = Math.min(
      topCountOf(src),
      effectiveCupCapacity(constraints?.[toIdx], obstacles[toIdx]) - dst.length,
    );
    if (m > 0 && src.length - m === 0) return 'target-sinking-occupied';
  }
  const s = normalizeStrainerState(state.strainer);
  if (!s.present) return 'ok';
  if (s.heldTea !== null && s.attachedCupIndex !== null) return 'strainer-loaded';
  if (s.heldTea === null && s.attachedCupIndex === fromIdx) {
    const m = Math.min(
      topCountOf(state.cups[fromIdx] as TeaId[]),
      effectiveCupCapacity(constraints?.[toIdx], obstacles[toIdx]) -
        (state.cups[toIdx] as TeaId[]).length,
    );
    if (m < 2) return 'strainer-needs-two-layers';
  }
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
  blendRecipe?: BlendRecipe | undefined | null,
): boolean {
  return pourRejectCodeState(state, fromIdx, toIdx, constraints, blendRecipe) === 'ok';
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
  blendRecipe?: BlendRecipe | undefined | null,
): number {
  if (!canPourState(state, fromIdx, toIdx, constraints, blendRecipe)) return 0;
  // Reaction moves exactly ONE layer (no top-run, no capacity bound).
  if (blendRecipe && isBlendReactionAttempt(state, fromIdx, toIdx, blendRecipe)) {
    return 1;
  }
  const source = state.cups[fromIdx] as TeaId[];
  const target = state.cups[toIdx] as TeaId[];
  // Transfer is bounded by the DESTINATION's EFFECTIVE free space: AAAA
  // into an empty tasting bowl moves exactly 2 layers, never 4; only one
  // layer fits into a cinnamon cup holding one layer.
  const obstacles = normalizeCapacityObstacles(state.capacityObstacles, state.cups.length);
  return Math.min(
    topCountOf(source),
    effectiveCupCapacity(constraints?.[toIdx], obstacles[toIdx]) - target.length,
  );
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
  blendRecipe?: BlendRecipe | undefined | null,
): boolean {
  if (!canPourState(state, fromIdx, toIdx, constraints, blendRecipe)) return false;
  // G13: every legal reactive contact changes chemistry (2 layers → 1
  // product layer) — never a mere vessel permutation. Reactions are always
  // constructive.
  if (blendRecipe && isBlendReactionAttempt(state, fromIdx, toIdx, blendRecipe)) {
    return true;
  }
  // G13 safe pruning option (§34): with an active recipe the
  // homogeneous→empty prune is DISABLED entirely (reactant full cups must
  // stay searchable). Every other legal non-reactive pour stays
  // constructive — this enlarges the recipe-enabled state space slightly;
  // the harness reports the cost. Legacy (recipe absent) keeps the exact
  // prune below.
  if (blendRecipe && isValidBlendRecipe(blendRecipe)) {
    // Still honor the strained/melt/honey/bud early-true paths implicitly
    // (they all return true below as well); the prune below is skipped.
    return true;
  }
  // Strained catches change the partition AND external hold — never the
  // symmetry-only full-group relocation the legacy prune targets.
  if (isStrainedCatchSource(state, fromIdx)) return true;
  // Melt pours always change semantic state (ice overlay removed) — never
  // a mere vessel permutation, even full-homogeneous hot tea into an
  // empty frozen cup of the same signature group (§41).
  if (toIdx >= 0 && toIdx < state.cups.length) {
    const ice = normalizeIceSlots(state.iceSlots, state.cups.length);
    if (ice[toIdx] != null && topLayerOf(state.cups[fromIdx] as TeaId[]) === ICE_MELT_TEA) {
      return true;
    }
  }
  // Honey audit (§30): a move that relocates honey is constructive UNLESS
  // the COMPLETE canonical state is invariant (e.g. AAAA+honey into an
  // empty identical normal cup merely swaps the whole decorated vessel
  // between interchangeable cups). Never disable the legacy prune
  // globally — compare keys for honey-moving pours only.
  const sink = normalizeSinkingIngredients(state.sinkingIngredients, state.cups.length);
  if (sink[fromIdx] != null) {
    const src = state.cups[fromIdx] as TeaId[];
    const dst = state.cups[toIdx] as TeaId[];
    const obstacles = normalizeCapacityObstacles(state.capacityObstacles, state.cups.length);
    const m = Math.min(
      topCountOf(src),
      effectiveCupCapacity(constraints?.[toIdx], obstacles[toIdx]) - dst.length,
    );
    if (m > 0 && src.length - m === 0) {
      const after = applyPourState(state, fromIdx, toIdx, constraints);
      if (!after) return false;
      return canonicalPuzzleKey(state, constraints) !== canonicalPuzzleKey(after.state, constraints);
    }
  }
  // Tea-bud bloom (Gauntlet 12 §39–40): a pour that empties the
  // dormant-bud host changes objective state — never a mere vessel
  // permutation, even full-homogeneous bud tea into an empty normal cup.
  // Fail-closed: any pour touching an active bud stays constructive here,
  // and the prune below also disables on either side.
  const buds = normalizeTeaBudSlots(state.teaBudSlots, state.cups.length);
  if (buds[fromIdx] != null) {
    const src = state.cups[fromIdx] as TeaId[];
    const dst = state.cups[toIdx] as TeaId[];
    const obsForM = normalizeCapacityObstacles(state.capacityObstacles, state.cups.length);
    const m = Math.min(
      topCountOf(src),
      effectiveCupCapacity(constraints?.[toIdx], obsForM[toIdx]) - dst.length,
    );
    if (m > 0 && src.length - m === 0) return true;
  }
  const source = state.cups[fromIdx] as TeaId[];
  const target = state.cups[toIdx] as TeaId[];
  const obstacles = normalizeCapacityObstacles(state.capacityObstacles, state.cups.length);
  if (
    target.length === 0 &&
    isPrunableHomogeneousToEmpty(
      source,
      constraints?.[fromIdx],
      constraints?.[toIdx],
      obstacles[fromIdx],
      obstacles[toIdx],
      buds[fromIdx],
      buds[toIdx],
    )
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
  blendRecipe?: BlendRecipe | undefined | null,
): Array<{ from: number; to: number; count: number }> {
  const out: Array<{ from: number; to: number; count: number }> = [];
  for (let from = 0; from < state.cups.length; from++) {
    for (let to = 0; to < state.cups.length; to++) {
      if (from === to) continue;
      const ok = constructiveOnly
        ? isConstructiveMoveState(state, from, to, constraints, blendRecipe)
        : canPourState(state, from, to, constraints, blendRecipe);
      if (!ok) continue;
      out.push({ from, to, count: pourCountState(state, from, to, constraints, blendRecipe) });
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
  /** Layers leaving the source (ordinary m; strained m — source exposed equally). */
  transferred: number;
  /** Layers arriving in the destination (ordinary m; strained m-1). */
  received: number;
  layer: TeaId;
  /** True when the tool caught one layer (m >= 2 gated). */
  strained: boolean;
  /** Tea caught by the tool, when strained. */
  caughtTea?: TeaId;
  /** Ingredient that rode this pour, if any (for animation metadata). */
  floatingIngredientMoved?: FloatingIngredientId;
  /** Sinking ingredient that moved with the emptying outflow, if any. */
  sinkingIngredientMoved?: SinkingIngredientId;
  /** Ice cleared by this pour, when a melt occurred (animation metadata only). */
  iceMelted?: IceId;
  /** Capacity obstacle removed by this pour, when the source emptied (animation metadata only). */
  capacityObstacleRemoved?: CapacityObstacleId;
  /** Tea bud bloomed by this pour, when the dormant host emptied (presentation metadata only). */
  teaBudBloomed?: TeaBudId | null;
  /** Blend reaction metadata, when this pour performed chemistry (presentation/trace only). */
  reaction?: BlendReactionMetadata;
}

/**
 * Atomic pure state transition (single truth): tea movement plus the
 * floating ride, the sinking rule, the catch-one tool update and the
 * frozen-cup melt in ONE operation.
 *
 * - Ordinary: source loses m, destination gains m.
 * - Strained (empty tool attached to source, m >= 2): source loses ALL m,
 *   destination gains m-1, tool catches exactly 1 of the same tea and
 *   returns to its stand LOADED (attached null, heldTea set).
 * - Honey: the source's sinking ingredient moves to the destination IFF
 *   this successful pour completely empties the source; outflows that
 *   leave tea behind (and all inflow) leave honey untouched.
 * - Ice (Gauntlet 9): a successful hot-tea (sea_buckthorn) inflow into a
 *   frozen destination melts the ice atomically with the tea transfer.
 *   Tea is conserved (nothing consumed/produced); the melt is one-way.
 * - Cinnamon (Gauntlet 11): a successful outflow that leaves the source
 *   COMPLETELY EMPTY removes the source's capacity obstacle atomically
 *   with the tea transfer (any m, strained or not). Partial outflows and
 *   all inflows leave it untouched; receiving never removes. One-way.
 * - Tea bud (Gauntlet 12): a successful POUR outflow that leaves the source
 *   COMPLETELY EMPTY clears the source's dormant bud atomically with the
 *   tea transfer (any m, strained or not; `teaBudBloomed: 'tea_bud'`).
 *   Partial outflows (tea remains) and all inflows leave it untouched;
 *   receiving never blooms; rejected pours never bloom. One-way (undo
 *   restores it exactly). The bud changes NO pour legality.
 * - Illegal pours (including would-be single-layer pours while attached,
 *   `strainer-needs-two-layers`, `target-sinking-occupied`, `source-frozen`
 *   and `target-frozen-needs-hot`) return null with NO mutation.
 */
export function applyPourState(
  state: ReadonlyPuzzleState,
  fromIdx: number,
  toIdx: number,
  constraints?: readonly CupConstraint[],
  blendRecipe?: BlendRecipe | undefined | null,
): PourStateResult | null {
  if (!canPourState(state, fromIdx, toIdx, constraints, blendRecipe)) return null;
  // G13 reaction path (ONE authoritative transition truth — no second
  // applyReactionPour implementation). Exactly ONE pair reacts per move:
  // source.pop() once, destination top REPLACED by product, no push.
  // Destination occupancy unchanged; source decreases by one; global layers -1.
  if (blendRecipe && isBlendReactionAttempt(state, fromIdx, toIdx, blendRecipe)) {
    if (isBlendCompositionBlocked(state, constraints)) return null;
    const nextCups: TeaId[][] = state.cups.map((c) => [...c]);
    const nextSlots = normalizeFloatingIngredients(state.floatingIngredients, state.cups.length);
    const nextSink = normalizeSinkingIngredients(state.sinkingIngredients, state.cups.length);
    const nextStrainer = normalizeStrainerState(state.strainer);
    const nextIce = normalizeIceSlots(state.iceSlots, state.cups.length);
    const nextObstacles = normalizeCapacityObstacles(state.capacityObstacles, state.cups.length);
    const nextBuds = normalizeTeaBudSlots(state.teaBudSlots, state.cups.length);
    const source = nextCups[fromIdx] as TeaId[];
    const target = nextCups[toIdx] as TeaId[];
    if (source.length === 0 || target.length === 0) return null;
    const sourceReactant = topLayerOf(source) as TeaId;
    const targetReactant = topLayerOf(target) as TeaId;
    if (!isReactivePair(sourceReactant, targetReactant, blendRecipe)) return null;
    source.pop();
    target[target.length - 1] = blendRecipe.product;
    const reaction: BlendReactionMetadata = {
      recipeId: blendRecipe.id,
      sourceReactant,
      targetReactant,
      product: blendRecipe.product,
    };
    return {
      state: { cups: nextCups, floatingIngredients: nextSlots, sinkingIngredients: nextSink, strainer: nextStrainer, iceSlots: nextIce, capacityObstacles: nextObstacles, teaBudSlots: nextBuds },
      transferred: 1,
      received: 0,
      layer: sourceReactant,
      strained: false,
      reaction,
    };
  }
  const strained = isStrainedCatchSource(state, fromIdx);
  const m = unstrainedPourCountState(state, fromIdx, toIdx, constraints, blendRecipe);
  if (m <= 0) return null;
  if (strained && m < 2) return null;
  const nextCups: TeaId[][] = state.cups.map((c) => [...c]);
  const nextSlots = normalizeFloatingIngredients(state.floatingIngredients, state.cups.length);
  const nextSink = normalizeSinkingIngredients(state.sinkingIngredients, state.cups.length);
  const nextStrainer = normalizeStrainerState(state.strainer);
  const nextIce = normalizeIceSlots(state.iceSlots, state.cups.length);
  const nextObstacles = normalizeCapacityObstacles(state.capacityObstacles, state.cups.length);
  const nextBuds = normalizeTeaBudSlots(state.teaBudSlots, state.cups.length);
  const source = nextCups[fromIdx] as TeaId[];
  const target = nextCups[toIdx] as TeaId[];
  const layer = topLayerOf(source) as TeaId;
  const honey = nextSink[fromIdx] ?? null;
  const emptiesSource = source.length - m === 0;
  if (honey != null && emptiesSource && nextSink[toIdx] != null) return null;
  for (let i = 0; i < m; i++) source.pop();
  const received = strained ? m - 1 : m;
  for (let i = 0; i < received; i++) target.push(layer);
  let caughtTea: TeaId | undefined;
  if (strained) {
    nextStrainer.attachedCupIndex = null;
    nextStrainer.heldTea = layer;
    caughtTea = layer;
  }
  const moved = nextSlots[fromIdx] ?? null;
  let floatingIngredientMoved: FloatingIngredientId | undefined;
  if (moved != null) {
    nextSlots[toIdx] = moved;
    nextSlots[fromIdx] = null;
    floatingIngredientMoved = moved;
  }
  let sinkingIngredientMoved: SinkingIngredientId | undefined;
  if (honey != null && emptiesSource) {
    nextSink[toIdx] = honey;
    nextSink[fromIdx] = null;
    sinkingIngredientMoved = honey;
  }
  // Melt (Gauntlet 9 §27–28): hot-tea inflow into a frozen destination
  // clears ice in the SAME atomic transition. Legality above already
  // guarantees the inflow is hot tea; the layer check stays as a
  // fail-closed belt (ice never clears without hot tea actually entering).
  let iceMelted: IceId | undefined;
  if (nextIce[toIdx] != null && layer === ICE_MELT_TEA) {
    nextIce[toIdx] = null;
    iceMelted = 'ice';
  }
  // Unlock (Gauntlet 11 §7/§22–24): a successful outflow that leaves the
  // source COMPLETELY EMPTY removes the source obstacle in the SAME
  // atomic transition. Partial outflows (tea remains) and all inflows
  // leave it untouched. One-way (undo restores it exactly).
  let capacityObstacleRemoved: CapacityObstacleId | undefined;
  if (nextObstacles[fromIdx] != null && nextCups[fromIdx]?.length === 0) {
    capacityObstacleRemoved = nextObstacles[fromIdx] as CapacityObstacleId;
    nextObstacles[fromIdx] = null;
  }
  // Bloom (Gauntlet 12 §9–12): dormant bud + successful outflow + post-source
  // tea count === 0 → clear atomically. Any m; partial outflows and all
  // inflows leave the bud dormant.
  let teaBudBloomed: TeaBudId | null = null;
  if (nextBuds[fromIdx] != null && nextCups[fromIdx]?.length === 0) {
    nextBuds[fromIdx] = null;
    teaBudBloomed = 'tea_bud';
  }
  return {
    state: { cups: nextCups, floatingIngredients: nextSlots, sinkingIngredients: nextSink, strainer: nextStrainer, iceSlots: nextIce, capacityObstacles: nextObstacles, teaBudSlots: nextBuds },
    transferred: m,
    received,
    layer,
    strained,
    caughtTea,
    floatingIngredientMoved,
    sinkingIngredientMoved,
    iceMelted,
    capacityObstacleRemoved,
    teaBudBloomed,
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

// ---------------------------------------------------------------------------
// Catch-one strainer (feasibility spike) — single authoritative action truth.
// Costs: place 0, pour 1, release 1. Solver uses 0-1 BFS.
// ---------------------------------------------------------------------------

export function placeStrainerRejectCodeState(
  state: ReadonlyPuzzleState,
  toIdx: number,
  constraints?: readonly CupConstraint[],
): StrainerPlaceRejectCode {
  const s = normalizeStrainerState(state.strainer);
  if (!s.present) return 'no-strainer';
  if (s.heldTea !== null) return 'strainer-loaded';
  if (!Number.isInteger(toIdx) || toIdx < 0 || toIdx >= state.cups.length) return 'out-of-range';
  const host = state.cups[toIdx] as TeaId[] | undefined;
  if (!host || host.length === 0) return 'target-empty';
  const c = constraints?.[toIdx];
  if ((c?.mode ?? 'normal') === 'sink-only') return 'target-sink-only';
  if (s.attachedCupIndex === toIdx) return 'same-host';
  const slots = normalizeFloatingIngredients(state.floatingIngredients, state.cups.length);
  if (slots[toIdx] != null) return 'target-floating-occupied-by-tool-conflict';
  return 'ok';
}

export function canPlaceStrainerState(
  state: ReadonlyPuzzleState,
  toIdx: number,
  constraints?: readonly CupConstraint[],
): boolean {
  return placeStrainerRejectCodeState(state, toIdx, constraints) === 'ok';
}

export function applyPlaceStrainerState(
  state: ReadonlyPuzzleState,
  toIdx: number,
  constraints?: readonly CupConstraint[],
): PuzzleState | null {
  if (!canPlaceStrainerState(state, toIdx, constraints)) return null;
  return {
    cups: state.cups.map((c) => [...c]),
    floatingIngredients: normalizeFloatingIngredients(state.floatingIngredients, state.cups.length),
    sinkingIngredients: normalizeSinkingIngredients(state.sinkingIngredients, state.cups.length),
    strainer: { present: true, attachedCupIndex: toIdx, heldTea: null },
    iceSlots: normalizeIceSlots(state.iceSlots, state.cups.length),
    capacityObstacles: normalizeCapacityObstacles(state.capacityObstacles, state.cups.length),
    teaBudSlots: normalizeTeaBudSlots(state.teaBudSlots, state.cups.length),
  };
}

export function releaseStrainerRejectCodeState(
  state: ReadonlyPuzzleState,
  toIdx: number,
  constraints?: readonly CupConstraint[],
): StrainerReleaseRejectCode {
  const s = normalizeStrainerState(state.strainer);
  if (!s.present) return 'no-strainer';
  if (s.heldTea === null) return 'strainer-empty';
  if (s.attachedCupIndex !== null) return 'strainer-empty';
  if (!Number.isInteger(toIdx) || toIdx < 0 || toIdx >= state.cups.length) return 'out-of-range';
  const dest = state.cups[toIdx] as TeaId[] | undefined;
  if (!dest) return 'out-of-range';
  if ((constraints?.[toIdx]?.mode ?? 'normal') === 'source-only') return 'target-source-only';
  // Release carries one tea layer: the destination must have EFFECTIVE
  // free space (an active 2/2 cinnamon cup is full).
  if (
    dest.length >=
    effectiveCupCapacity(
      constraints?.[toIdx],
      normalizeCapacityObstacles(state.capacityObstacles, state.cups.length)[toIdx],
    )
  )
    return 'target-full';
  if (dest.length === 0) return 'ok';
  return dest[dest.length - 1] === s.heldTea ? 'ok' : 'color-mismatch';
}

export function canReleaseStrainerState(
  state: ReadonlyPuzzleState,
  toIdx: number,
  constraints?: readonly CupConstraint[],
): boolean {
  return releaseStrainerRejectCodeState(state, toIdx, constraints) === 'ok';
}

export interface ReleaseStateResult {
  state: PuzzleState;
  layer: TeaId;
}

export function applyReleaseStrainerState(
  state: ReadonlyPuzzleState,
  toIdx: number,
  constraints?: readonly CupConstraint[],
): ReleaseStateResult | null {
  if (!canReleaseStrainerState(state, toIdx, constraints)) return null;
  const s = normalizeStrainerState(state.strainer);
  const held = s.heldTea as TeaId;
  const nextCups = state.cups.map((c) => [...c]);
  (nextCups[toIdx] as TeaId[]).push(held);
  return {
    state: {
      cups: nextCups,
      floatingIngredients: normalizeFloatingIngredients(state.floatingIngredients, state.cups.length),
      sinkingIngredients: normalizeSinkingIngredients(state.sinkingIngredients, state.cups.length),
      strainer: { present: true, attachedCupIndex: null, heldTea: null },
      iceSlots: normalizeIceSlots(state.iceSlots, state.cups.length),
      capacityObstacles: normalizeCapacityObstacles(state.capacityObstacles, state.cups.length),
      teaBudSlots: normalizeTeaBudSlots(state.teaBudSlots, state.cups.length),
    },
    layer: held,
  };
}

/**
 * Productive placement (strong): placing the EMPTY tool onto `toIdx`
 * enables at least one subsequent legal strained pour with ordinary m>=2
 * (destination capacity considered; topCount alone insufficient).
 */
export function isProductiveStrainerPlacement(
  state: ReadonlyPuzzleState,
  toIdx: number,
  constraints?: readonly CupConstraint[],
): boolean {
  if (!canPlaceStrainerState(state, toIdx, constraints)) return false;
  const source = state.cups[toIdx] as TeaId[];
  if (topCountOf(source) < 2) return false;
  for (let dest = 0; dest < state.cups.length; dest++) {
    if (dest === toIdx) continue;
    if (unstrainedPourCountState(state, toIdx, dest, constraints) >= 2) return true;
  }
  return false;
}

export function isConstructiveReleaseState(
  state: ReadonlyPuzzleState,
  toIdx: number,
  constraints?: readonly CupConstraint[],
): boolean {
  return canReleaseStrainerState(state, toIdx, constraints);
}

export function listLegalActionsState(
  state: ReadonlyPuzzleState,
  constraints?: readonly CupConstraint[],
  blendRecipe?: BlendRecipe | undefined | null,
): PuzzleAction[] {
  const out: PuzzleAction[] = [];
  for (let from = 0; from < state.cups.length; from++) {
    for (let to = 0; to < state.cups.length; to++) {
      if (from === to) continue;
      if (canPourState(state, from, to, constraints, blendRecipe)) out.push({ kind: 'pour', from, to });
    }
  }
  const s = normalizeStrainerState(state.strainer);
  if (s.present && s.heldTea === null) {
    for (let to = 0; to < state.cups.length; to++) {
      if (canPlaceStrainerState(state, to, constraints)) out.push({ kind: 'place-strainer', to });
    }
  }
  if (s.present && s.heldTea !== null) {
    for (let to = 0; to < state.cups.length; to++) {
      if (canReleaseStrainerState(state, to, constraints)) out.push({ kind: 'release-strainer', to });
    }
  }
  return out;
}

export function listConstructiveActionsState(
  state: ReadonlyPuzzleState,
  constraints?: readonly CupConstraint[],
  blendRecipe?: BlendRecipe | undefined | null,
): PuzzleAction[] {
  const out: PuzzleAction[] = [];
  for (let from = 0; from < state.cups.length; from++) {
    for (let to = 0; to < state.cups.length; to++) {
      if (from === to) continue;
      if (isConstructiveMoveState(state, from, to, constraints, blendRecipe)) out.push({ kind: 'pour', from, to });
    }
  }
  const s = normalizeStrainerState(state.strainer);
  if (s.present && s.heldTea === null) {
    for (let to = 0; to < state.cups.length; to++) {
      if (isProductiveStrainerPlacement(state, to, constraints)) out.push({ kind: 'place-strainer', to });
    }
  }
  if (s.present && s.heldTea !== null) {
    for (let to = 0; to < state.cups.length; to++) {
      if (isConstructiveReleaseState(state, to, constraints)) out.push({ kind: 'release-strainer', to });
    }
  }
  return out;
}

export interface ApplyPuzzleActionResult {
  state: PuzzleState;
  transferred?: number;
  received?: number;
  layer?: TeaId;
  strained?: boolean;
  caughtTea?: TeaId;
  floatingIngredientMoved?: FloatingIngredientId;
  sinkingIngredientMoved?: SinkingIngredientId;
  iceMelted?: IceId;
  capacityObstacleRemoved?: CapacityObstacleId;
  teaBudBloomed?: TeaBudId | null;
  reaction?: BlendReactionMetadata;
}

export function applyPuzzleActionState(
  state: ReadonlyPuzzleState,
  action: PuzzleAction,
  constraints?: readonly CupConstraint[],
  blendRecipe?: BlendRecipe | undefined | null,
): ApplyPuzzleActionResult | null {
  if (isPlaceStrainerAction(action)) {
    const next = applyPlaceStrainerState(state, action.to, constraints);
    if (!next) return null;
    return { state: next };
  }
  if (isReleaseStrainerAction(action)) {
    const res = applyReleaseStrainerState(state, action.to, constraints);
    if (!res) return null;
    return { state: res.state, transferred: 1, received: 1, layer: res.layer, strained: false };
  }
  const res = applyPourState(state, action.from, action.to, constraints, blendRecipe);
  if (!res) return null;
  return {
    state: res.state,
    transferred: res.transferred,
    received: res.received,
    layer: res.layer,
    strained: res.strained,
    caughtTea: res.caughtTea,
    floatingIngredientMoved: res.floatingIngredientMoved,
    sinkingIngredientMoved: res.sinkingIngredientMoved,
    iceMelted: res.iceMelted,
    capacityObstacleRemoved: res.capacityObstacleRemoved,
    teaBudBloomed: res.teaBudBloomed,
    reaction: res.reaction,
  };
}

/** Action cost: place 0, pour/release 1. */
export function puzzleActionCost(action: PuzzleAction): number {
  return action.kind === 'place-strainer' ? 0 : 1;
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
 * Honey final-host rule, fail-closed (Gauntlet 7 §4): the host must be a
 * plain standard normal vessel (no target, standard capacity, no
 * must-end-empty) holding exactly full homogeneous buckwheat. Teapots,
 * sinks, tasting bowls, named targets, partial/mixed/empty cups and wrong
 * teas all fail — as do unknown future sinking ids and duplicates.
 */
export function sinkingIngredientHostSatisfied(
  id: SinkingIngredientId,
  layers: TeaId[],
  c: CupConstraint | undefined,
): boolean {
  const known = (SINKING_INGREDIENT_TYPES as Record<string, { targetTeaId: TeaId } | undefined>)[id];
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
 * Sinking-ingredient victory goals: no-honey boards pass; otherwise the
 * single present honey must sit under a satisfying host, with no
 * duplicates and no unknown ids. Malformed states fail closed.
 */
export function sinkingIngredientGoalsSatisfied(
  state: ReadonlyPuzzleState,
  constraints?: readonly CupConstraint[],
): boolean {
  const slots = normalizeSinkingIngredients(state.sinkingIngredients, state.cups.length);
  const present = slots.filter((s): s is SinkingIngredientId => s != null);
  if (new Set(present).size !== present.length) return false;
  for (let i = 0; i < slots.length; i++) {
    const id = slots[i];
    if (id == null) continue;
    if (!sinkingIngredientHostSatisfied(id, state.cups[i] as TeaId[], constraints?.[i])) {
      return false;
    }
  }
  return true;
}

/**
 * Canonical puzzle win: tea sorted AND every floating ingredient on its
 * correct completed tea AND the strainer holding nothing (a caught layer
 * outside the vessels means tea counts are incomplete) AND every sinking
 * ingredient under its correct completed tea AND no active ice (a frozen
 * vessel is never a finished vessel, §38–39) AND no active capacity
 * obstacle (a blocked vessel is never finished — the player must unlock
 * it, Gauntlet 11) AND no dormant tea bud (the route objective must have
 * bloomed — a dormant bud blocks victory, Gauntlet 12). An
 * attached-but-empty tool may be anywhere at victory.
 */
export function isPuzzleWonState(
  state: ReadonlyPuzzleState,
  constraints?: readonly CupConstraint[],
  blendRecipe?: BlendRecipe | undefined | null,
): boolean {
  if (!teaWonState(state.cups, constraints)) return false;
  // G13 recipe win (§28): ordinary vessel end-state AND recipe complete
  // (A==0, B==0, P==target). An ordinarily-sorted A4/B4/C4/D4 board with an
  // active recipe is NOT won — A and B must still be crafted.
  if (blendRecipe && isValidBlendRecipe(blendRecipe)) {
    if (
      countTeaLayers(state.cups, blendRecipe.reactantA) !== 0 ||
      countTeaLayers(state.cups, blendRecipe.reactantB) !== 0 ||
      countTeaLayers(state.cups, blendRecipe.product) !== blendRecipe.targetProductCount
    ) {
      return false;
    }
  }
  if (!floatingIngredientGoalsSatisfied(state, constraints)) return false;
  if (!sinkingIngredientGoalsSatisfied(state, constraints)) return false;
  const s = normalizeStrainerState(state.strainer);
  if (s.present && s.heldTea !== null) return false;
  const ice = normalizeIceSlots(state.iceSlots, state.cups.length);
  if (ice.some((slot) => slot !== null)) return false;
  const obstacles = normalizeCapacityObstacles(state.capacityObstacles, state.cups.length);
  if (obstacles.some((slot) => slot !== null)) return false;
  const buds = normalizeTeaBudSlots(state.teaBudSlots, state.cups.length);
  if (buds.some((slot) => slot !== null)) return false;
  return true;
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
 * Puzzle deadlock (single truth): won → false; otherwise deadlocked only
 * when no constructive pour AND no productive placement AND no
 * constructive release exist. Free placement alone never rescues — only
 * productive preparation counts.
 */
export function isPuzzleDeadlockedState(
  state: ReadonlyPuzzleState,
  constraints?: readonly CupConstraint[],
  blendRecipe?: BlendRecipe | undefined | null,
): boolean {
  if (isPuzzleWonState(state, constraints, blendRecipe)) return false;
  return listConstructiveActionsState(state, constraints, blendRecipe).length === 0;
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
 * vessel signatures + floating-ingredient markers + strainer tool.
 *
 * - NO strainer present → byte-identical legacy/G5 key (lemon-only boards
 *   keep exact G5 keys; plain boards keep the legacy key).
 * - Empty tool on stand → base + `||STR:STAND:EMPTY`.
 * - Empty tool attached → tool marker joins the CUP CONTENT encoding
 *   (`tea#lemon#STR` vs `#_`), so swapping interchangeable vessels (contents
 *   + tool together) stays canonical.
 * - Loaded tool (heldTea, always on stand by invariant) → base +
 *   `||STR:STAND:HOLD:<tea>`. Malformed loaded+attached states encode both
 *   markers fail-closed (production validation rejects them).
 *
 * Honey-free boards take this path verbatim (G6 byte-identity); honey
 * boards use the grouped honey path in `canonicalPuzzleKey`, and any board
 * carrying ice uses `groupedIceKey` (G9) — both keep ice-free keys
 * byte-identical.
 */
export function canonicalPuzzleKeyNoHoney(
  state: ReadonlyPuzzleState,
  constraints?: readonly CupConstraint[],
): string {
  const strainer = normalizeStrainerState(state.strainer);
  const slots = normalizeFloatingIngredients(state.floatingIngredients, state.cups.length);
  const hasLemon = slots.some((s) => s != null);
  const baseKey = (): string => {
    if (!hasLemon) return teaCanonicalKey(state.cups, constraints);
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
    return orderedSigs
      .map((sig) => {
        const arr = groups.get(sig) as string[];
        arr.sort();
        return `${sig}:${arr.join('|')}`;
      })
      .join('||');
  };
  if (!strainer.present) return baseKey();
  if (strainer.heldTea !== null) {
    return `${baseKey()}||STR:STAND:HOLD:${strainer.heldTea}`;
  }
  if (strainer.attachedCupIndex === null) {
    return `${baseKey()}||STR:STAND:EMPTY`;
  }
  const normalized = normalizeCupConstraints(constraints, state.cups.length);
  const groups = new Map<string, string[]>();
  state.cups.forEach((cup, idx) => {
    const sig = cupConstraintSignature(normalized[idx] as CupConstraint);
    const lemonMarker = slots[idx] ?? '_';
    const toolMarker = strainer.attachedCupIndex === idx ? 'STR' : '_';
    const enc = hasLemon
      ? `${cup.join(',')}#${lemonMarker}#${toolMarker}`
      : `${cup.join(',')}#${toolMarker}`;
    const arr = groups.get(sig);
    if (arr) arr.push(enc);
    else groups.set(sig, [enc]);
  });
  const orderedSigs = [...groups.keys()].sort();
  return orderedSigs
    .map((sig) => {
      const arr = groups.get(sig) as string[];
      arr.sort();
      return `${sig}:${arr.join('|')}`;
    })
    .join('||');
}

/**
 * Honey-aware canonical key (Gauntlet 7 §32): the sinking marker joins the
 * CUP CONTENT encoding (`contents#…#sink:honey`), so it travels WITH the
 * tea as one unit and sorts inside the same vessel-signature group —
 * swapping interchangeable vessels (contents + honey together) stays
 * canonical, while genuinely different placements key differently. Legacy
 * `#sink:` segments never appear in pre-G7 keys, so honey states can never
 * collide with honey-free ones; honey+lemon malformed combos compose
 * deterministically. Strainer suffixes match the honey-free shapes.
 */
function groupedHoneyKey(
  state: ReadonlyPuzzleState,
  slots: FloatingIngredientSlot[],
  sinkSlots: SinkingIngredientSlot[],
  hasLemon: boolean,
  toolMarkerAt: (idx: number) => string | null,
  constraints?: readonly CupConstraint[],
): string {
  const normalized = normalizeCupConstraints(constraints, state.cups.length);
  const groups = new Map<string, string[]>();
  state.cups.forEach((cup, idx) => {
    const sig = cupConstraintSignature(normalized[idx] as CupConstraint);
    const lemonMarker = slots[idx] ?? '_';
    const sinkMarker = sinkSlots[idx] ?? '_';
    let enc = hasLemon ? `${cup.join(',')}#${lemonMarker}` : cup.join(',');
    const tool = toolMarkerAt(idx);
    if (tool !== null) enc += `#${tool}`;
    enc += `#sink:${sinkMarker}`;
    const arr = groups.get(sig);
    if (arr) arr.push(enc);
    else groups.set(sig, [enc]);
  });
  const orderedSigs = [...groups.keys()].sort();
  return orderedSigs
    .map((sig) => {
      const arr = groups.get(sig) as string[];
      arr.sort();
      return `${sig}:${arr.join('|')}`;
    })
    .join('||');
}

/**
 * Ice-aware canonical key (Gauntlet 9 §31): the ice marker joins the CUP
 * CONTENT encoding (`…#sink:<m>#ice:<i>`), travelling WITH the tea as one
 * unit inside the same vessel-signature group — swapping interchangeable
 * vessels (contents + ice together) stays canonical, while frozen vs
 * unfrozen placements key differently. `#ice:ice` segments never appear in
 * pre-G9 keys, so frozen states can never collide with unfrozen ones.
 * Ice-free boards take the legacy paths verbatim (byte-identical G8 keys,
 * §32); honey-only boards keep the exact honey path below.
 */
function groupedIceKey(
  state: ReadonlyPuzzleState,
  slots: FloatingIngredientSlot[],
  sinkSlots: SinkingIngredientSlot[],
  iceArr: IceSlot[],
  hasLemon: boolean,
  toolMarkerAt: (idx: number) => string | null,
  constraints?: readonly CupConstraint[],
): string {
  const normalized = normalizeCupConstraints(constraints, state.cups.length);
  const groups = new Map<string, string[]>();
  state.cups.forEach((cup, idx) => {
    const sig = cupConstraintSignature(normalized[idx] as CupConstraint);
    const lemonMarker = slots[idx] ?? '_';
    const sinkMarker = sinkSlots[idx] ?? '_';
    const iceMarker = iceArr[idx] ?? '_';
    let enc = hasLemon ? `${cup.join(',')}#${lemonMarker}` : cup.join(',');
    const tool = toolMarkerAt(idx);
    if (tool !== null) enc += `#${tool}`;
    enc += `#sink:${sinkMarker}#ice:${iceMarker}`;
    const arr = groups.get(sig);
    if (arr) arr.push(enc);
    else groups.set(sig, [enc]);
  });
  const orderedSigs = [...groups.keys()].sort();
  return orderedSigs
    .map((sig) => {
      const arr = groups.get(sig) as string[];
      arr.sort();
      return `${sig}:${arr.join('|')}`;
    })
    .join('||');
}

/**
 * Capacity-obstacle-aware canonical key (Gauntlet 11 §46): the obstacle
 * marker joins the CUP CONTENT encoding (`…#sink:<m>#ice:<i>#cap:<c>`),
 * travelling WITH the tea as one unit inside the same vessel-signature
 * group — swapping interchangeable vessels (contents + obstacle together)
 * stays canonical, while active vs unlocked placements key differently.
 * `#cap:` segments never appear in pre-G11 keys, so obstacle boards can
 * never collide with obstacle-free ones. Boards with all-null obstacles
 * take the legacy paths verbatim (byte-identical G10 keys). Once the
 * obstacle is removed the cup is semantically ordinary and may collapse
 * with equivalent normal cups again (§49).
 */
function groupedCapacityKey(
  state: ReadonlyPuzzleState,
  slots: FloatingIngredientSlot[],
  sinkSlots: SinkingIngredientSlot[],
  iceArr: IceSlot[],
  capArr: CapacityObstacleSlot[],
  hasLemon: boolean,
  toolMarkerAt: (idx: number) => string | null,
  constraints?: readonly CupConstraint[],
): string {
  const normalized = normalizeCupConstraints(constraints, state.cups.length);
  const groups = new Map<string, string[]>();
  state.cups.forEach((cup, idx) => {
    const sig = cupConstraintSignature(normalized[idx] as CupConstraint);
    const lemonMarker = slots[idx] ?? '_';
    const sinkMarker = sinkSlots[idx] ?? '_';
    const iceMarker = iceArr[idx] ?? '_';
    const capMarker = capArr[idx] ?? '_';
    let enc = hasLemon ? `${cup.join(',')}#${lemonMarker}` : cup.join(',');
    const tool = toolMarkerAt(idx);
    if (tool !== null) enc += `#${tool}`;
    enc += `#sink:${sinkMarker}#ice:${iceMarker}#cap:${capMarker}`;
    const arr = groups.get(sig);
    if (arr) arr.push(enc);
    else groups.set(sig, [enc]);
  });
  const orderedSigs = [...groups.keys()].sort();
  return orderedSigs
    .map((sig) => {
      const arr = groups.get(sig) as string[];
      arr.sort();
      return `${sig}:${arr.join('|')}`;
    })
    .join('||');
}

/**
 * Tea-bud-aware canonical key (Gauntlet 12 §30): the dormant-bud marker
 * joins the CUP CONTENT encoding (`…#sink:<m>#ice:<i>#cap:<c>#bud:<b>`),
 * travelling WITH the tea as one unit inside the same vessel-signature
 * group — swapping interchangeable vessels (contents + bud together) stays
 * canonical, while active vs cleared placements key differently.
 * `#bud:tea_bud` segments never appear in pre-G12 keys, so bud boards can
 * never collide with bud-free ones. Boards with all-null buds take the
 * legacy paths verbatim (byte-identical G11 keys). Once the bud clears the
 * cup is semantically ordinary and may collapse with equivalent normal cups
 * again (§33).
 */
function groupedTeaBudKey(
  state: ReadonlyPuzzleState,
  slots: FloatingIngredientSlot[],
  sinkSlots: SinkingIngredientSlot[],
  iceArr: IceSlot[],
  capArr: CapacityObstacleSlot[],
  budArr: TeaBudSlot[],
  hasLemon: boolean,
  toolMarkerAt: (idx: number) => string | null,
  constraints?: readonly CupConstraint[],
): string {
  const normalized = normalizeCupConstraints(constraints, state.cups.length);
  const groups = new Map<string, string[]>();
  state.cups.forEach((cup, idx) => {
    const sig = cupConstraintSignature(normalized[idx] as CupConstraint);
    const lemonMarker = slots[idx] ?? '_';
    const sinkMarker = sinkSlots[idx] ?? '_';
    const iceMarker = iceArr[idx] ?? '_';
    const capMarker = capArr[idx] ?? '_';
    const budMarker = budArr[idx] ?? '_';
    let enc = hasLemon ? `${cup.join(',')}#${lemonMarker}` : cup.join(',');
    const tool = toolMarkerAt(idx);
    if (tool !== null) enc += `#${tool}`;
    enc += `#sink:${sinkMarker}#ice:${iceMarker}#cap:${capMarker}#bud:${budMarker}`;
    const arr = groups.get(sig);
    if (arr) arr.push(enc);
    else groups.set(sig, [enc]);
  });
  const orderedSigs = [...groups.keys()].sort();
  return orderedSigs
    .map((sig) => {
      const arr = groups.get(sig) as string[];
      arr.sort();
      return `${sig}:${arr.join('|')}`;
    })
    .join('||');
}

export function canonicalPuzzleKey(
  state: ReadonlyPuzzleState,
  constraints?: readonly CupConstraint[],
): string {
  const sinkSlots = normalizeSinkingIngredients(state.sinkingIngredients, state.cups.length);
  const iceArr = normalizeIceSlots(state.iceSlots, state.cups.length);
  const capArr = normalizeCapacityObstacles(state.capacityObstacles, state.cups.length);
  const budArr = normalizeTeaBudSlots(state.teaBudSlots, state.cups.length);
  const hasBud = budArr.some((s) => s != null);
  if (hasBud) {
    const strainer = normalizeStrainerState(state.strainer);
    const slots = normalizeFloatingIngredients(state.floatingIngredients, state.cups.length);
    const hasLemon = slots.some((s) => s != null);
    const noTool = (_idx: number): string | null => null;
    if (!strainer.present) {
      return groupedTeaBudKey(state, slots, sinkSlots, iceArr, capArr, budArr, hasLemon, noTool, constraints);
    }
    if (strainer.heldTea !== null) {
      const base = groupedTeaBudKey(state, slots, sinkSlots, iceArr, capArr, budArr, hasLemon, noTool, constraints);
      const host =
        strainer.attachedCupIndex === null ? 'STAND' : `CUP:${strainer.attachedCupIndex}`;
      return `${base}||STR:${host}:HOLD:${strainer.heldTea}`;
    }
    if (strainer.attachedCupIndex === null) {
      const base = groupedTeaBudKey(state, slots, sinkSlots, iceArr, capArr, budArr, hasLemon, noTool, constraints);
      return `${base}||STR:STAND:EMPTY`;
    }
    return groupedTeaBudKey(
      state,
      slots,
      sinkSlots,
      iceArr,
      capArr,
      budArr,
      hasLemon,
      (idx) => (strainer.attachedCupIndex === idx ? 'STR' : '_'),
      constraints,
    );
  }
  const hasCap = capArr.some((s) => s != null);
  if (!sinkSlots.some((s) => s != null) && !iceArr.some((s) => s != null) && !hasCap) {
    return canonicalPuzzleKeyNoHoney(state, constraints);
  }
  if (hasCap) {
    const strainer = normalizeStrainerState(state.strainer);
    const slots = normalizeFloatingIngredients(state.floatingIngredients, state.cups.length);
    const hasLemon = slots.some((s) => s != null);
    const noTool = (_idx: number): string | null => null;
    if (!strainer.present) {
      return groupedCapacityKey(state, slots, sinkSlots, iceArr, capArr, hasLemon, noTool, constraints);
    }
    if (strainer.heldTea !== null) {
      const base = groupedCapacityKey(state, slots, sinkSlots, iceArr, capArr, hasLemon, noTool, constraints);
      const host =
        strainer.attachedCupIndex === null ? 'STAND' : `CUP:${strainer.attachedCupIndex}`;
      return `${base}||STR:${host}:HOLD:${strainer.heldTea}`;
    }
    if (strainer.attachedCupIndex === null) {
      const base = groupedCapacityKey(state, slots, sinkSlots, iceArr, capArr, hasLemon, noTool, constraints);
      return `${base}||STR:STAND:EMPTY`;
    }
    return groupedCapacityKey(
      state,
      slots,
      sinkSlots,
      iceArr,
      capArr,
      hasLemon,
      (idx) => (strainer.attachedCupIndex === idx ? 'STR' : '_'),
      constraints,
    );
  }
  if (iceArr.some((s) => s != null)) {
    const strainer = normalizeStrainerState(state.strainer);
    const slots = normalizeFloatingIngredients(state.floatingIngredients, state.cups.length);
    const hasLemon = slots.some((s) => s != null);
    const noTool = (_idx: number): string | null => null;
    if (!strainer.present) {
      return groupedIceKey(state, slots, sinkSlots, iceArr, hasLemon, noTool, constraints);
    }
    if (strainer.heldTea !== null) {
      const base = groupedIceKey(state, slots, sinkSlots, iceArr, hasLemon, noTool, constraints);
      const host =
        strainer.attachedCupIndex === null ? 'STAND' : `CUP:${strainer.attachedCupIndex}`;
      return `${base}||STR:${host}:HOLD:${strainer.heldTea}`;
    }
    if (strainer.attachedCupIndex === null) {
      const base = groupedIceKey(state, slots, sinkSlots, iceArr, hasLemon, noTool, constraints);
      return `${base}||STR:STAND:EMPTY`;
    }
    return groupedIceKey(
      state,
      slots,
      sinkSlots,
      iceArr,
      hasLemon,
      (idx) => (strainer.attachedCupIndex === idx ? 'STR' : '_'),
      constraints,
    );
  }
  const strainer = normalizeStrainerState(state.strainer);
  const slots = normalizeFloatingIngredients(state.floatingIngredients, state.cups.length);
  const hasLemon = slots.some((s) => s != null);
  const noTool = (_idx: number): string | null => null;
  if (!strainer.present) {
    return groupedHoneyKey(state, slots, sinkSlots, hasLemon, noTool, constraints);
  }
  if (strainer.heldTea !== null) {
    const base = groupedHoneyKey(state, slots, sinkSlots, hasLemon, noTool, constraints);
    const host =
      strainer.attachedCupIndex === null ? 'STAND' : `CUP:${strainer.attachedCupIndex}`;
    return `${base}||STR:${host}:HOLD:${strainer.heldTea}`;
  }
  if (strainer.attachedCupIndex === null) {
    const base = groupedHoneyKey(state, slots, sinkSlots, hasLemon, noTool, constraints);
    return `${base}||STR:STAND:EMPTY`;
  }
  return groupedHoneyKey(
    state,
    slots,
    sinkSlots,
    hasLemon,
    (idx) => (strainer.attachedCupIndex === idx ? 'STR' : '_'),
    constraints,
  );
}
