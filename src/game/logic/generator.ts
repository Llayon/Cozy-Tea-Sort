/**
 * Solver-validated level generation (Option B).
 *
 * Strategy:
 *   generate (seeded random deal)
 *     -> solve
 *       -> unsolvable / truncated / out-of-band / invalid -> reject, regenerate
 *       -> accepted -> track best (closest to TARGET), early-exit on sweet spot
 *   retries exhausted
 *     -> best ACCEPTED candidate, else validated phase fallback
 *
 * Hard production contract — EVERY return path satisfies ALL of:
 *   A. correct number of cups
 *   B. capacity respected
 *   C. exactly 4 units per color
 *   D. not already solved
 *   E. hiddenCounts length correct (+ exactly one hidden cup iff mystery)
 *   F. mystery cup: length >= 3, cup[0] !== cup[1], hiddenCount == 1,
 *      hidden cup is NORMAL (never inside the teapot)
 *   G. solver says solvable (constraint-aware)
 *   H. solver is not truncated
 *   I. minMoves exists
 *   J. depthAccepted(minMoves, phase) === true
 *   K. valid cupConstraints length
 *   L. exact requested count of source-only vessels
 *   M. source-only initial state: non-empty, full, mixed (>= 2 TeaIds)
 *   V. exact requested sink-only count
 *   W. sink starts empty
 *   X. sink has no target
 *   Y. sink has no Mystery
 *   Z. sink occupies a valid empty-role configuration (originally-empty
 *      slot, stable last index; total cup count unchanged)
 *   AA. canonical production keeps at least one ordinary empty
 *   AB. exact requested tasting-bowl count
 *   AC. production max one tasting bowl
 *   AD. tasting mode === normal
 *   AE. tasting effective capacity === 2
 *   AF. tasting mustEndEmpty === true
 *   AG. tasting carries no targetTeaId
 *   AH. tasting starts empty
 *   AI. tasting hosts no Mystery
 *   AJ. tasting at the stable last slot
 *   AK. at least one ordinary STANDARD-capacity empty vessel remains
 *   AL. no sink + tasting
 *   AM. no target + tasting
 *   AN. every vessel holds at most ITS OWN capacity
 *   AO. floatingIngredients length == cups length
 *   AP. exact requested floating ingredient count
 *   AQ. only supported ingredient ids
 *   AR. lemon target tea exists in active palette
 *   AS. exactly one lemon when requested
 *   AT. lemon initial host non-empty
 *   AU. lemon initial host full standard capacity
 *   AV. lemon initial host mixed
 *   AW. host constraint plain standard normal
 *   AX. host carries no target
 *   AY. host is not teapot/sink/tasting
 *   AZ. initial lemon host != Mystery host
 *   BA. lemon initial state is not already satisfied
 *   BB. unsupported lemon combinations absent
 *   BC. solver validates INCLUDING lemon goal
 *   BD. solver not truncated
 *   BE. real minMoves in hard band
 *
 * TARGET (desired sweet spot) and ACCEPTANCE (hard safety band) are kept
 * explicit: generation prefers candidates closest to target, but ONLY among
 * candidates inside acceptance. An out-of-band `best` is never returned.
 *
 * Bounded: at most maxRetries deals + a small fixed fallback ladder.
 * Deterministic for a given (request, seed).
 */

import {
  CapacityObstacleSlot,
  CupConstraint,
  FLOATING_INGREDIENT_TYPES,
  FloatingIngredientSlot,
  ICE_MELT_TEA,
  SINKING_INGREDIENT_TYPES,
  STANDARD_CUP_CAPACITY,
  StrainerState,
  TASTING_BOWL_CAPACITY,
  TEA_UNITS_PER_COLOR,
  THERMOS_CAPACITY,
  TeaId,
  cloneCupConstraint,
  countFloatingIngredients,
  countSinkingIngredients,
  cupCapacity,
  defaultCupConstraints,
  emptyCapacityObstacles,
  emptyFloatingIngredients,
  emptyIceSlots,
  emptySinkingIngredients,
  emptyStrainerState,
  floatingIngredientIndex,
  isReleaseStrainerAction,
  isTastingCupConstraint,
  isThermosCupConstraint,
  mustEndEmpty,
  normalizeCapacityObstacles,
  normalizeFloatingIngredients,
  normalizeIceSlots,
  normalizeSinkingIngredients,
  normalizeStrainerState,
  sinkingIngredientIndex,
  standStrainerState,
  type FloatingIngredientId,
  type IceSlot,
  type SinkingIngredientId,
  type SinkingIngredientSlot,
  type SolverAction,
} from '../types';
import {
  applyPourState,
  applyPuzzleActionState,
  floatingIngredientHostSatisfied,
  isHomogeneous,
  isInFinalState,
  isPuzzleWonState,
  isWonState,
  sinkingIngredientHostSatisfied,
} from './rules';
import { createRng, Rng, SeedInput, shuffleInPlace } from './rng';
import { applySolutionState, solvePuzzle } from './solver';
import {
  TARGET_TEMPLATE_ATTEMPTS,
  TARGET_TEMPLATE_BANK,
  TargetTemplateKind,
  instantiateTargetTemplate,
} from './targetTemplates';
import {
  SINK_TEMPLATE_ATTEMPTS,
  SINK_TEMPLATE_BANK,
  SinkTemplateKind,
  instantiateSinkTemplate,
} from './sinkTemplates';
import {
  TASTING_TEMPLATE_ATTEMPTS,
  TASTING_TEMPLATE_BANK,
  TastingTemplateKind,
  instantiateTastingTemplate,
} from './tastingTemplates';
import {
  LEMON_TEMPLATE_ATTEMPTS,
  LEMON_TEMPLATE_BANK,
  LEMON_TARGET_TEA,
  LemonTemplateKind,
  instantiateLemonTemplate,
} from './lemonTemplates';
import {
  STRAINER_DEPTH_ACCEPT,
  STRAINER_TEMPLATE_ATTEMPTS,
  STRAINER_TEMPLATE_BANK,
  StrainerTemplateKind,
  instantiateStrainerTemplate,
} from './strainerTemplates';
import {
  HONEY_DEPTH_ACCEPT,
  HONEY_TARGET_TEA,
  HONEY_TEMPLATE_ATTEMPTS,
  HONEY_TEMPLATE_BANK,
  HoneyTemplateKind,
  instantiateHoneyTemplate,
} from './honeyTemplates';
import {
  LEMON_HONEY_DEPTH_ACCEPT,
  LEMON_HONEY_TARGET_TEAS,
  LEMON_HONEY_TEMPLATE_ATTEMPTS,
  LEMON_HONEY_TEMPLATE_BANK,
  LemonHoneyTemplateKind,
  instantiateLemonHoneyTemplate,
} from './lemonHoneyTemplates';
import {
  FROZEN_CUP_DEPTH_ACCEPT,
  FROZEN_CUP_TARGET_TEA,
  FROZEN_CUP_TEMPLATE_ATTEMPTS,
  FROZEN_CUP_TEMPLATE_BANK,
  FrozenCupTemplateKind,
  instantiateFrozenCupTemplate,
} from './frozenCupTemplates';
import {
  THERMOS_DEPTH_ACCEPT,
  THERMOS_TEMPLATE_ATTEMPTS,
  THERMOS_TEMPLATE_BANK,
  ThermosTemplateKind,
  instantiateThermosTemplate,
} from './thermosTemplates';
import {
  CINNAMON_DEPTH_ACCEPT,
  CINNAMON_TEMPLATE_ATTEMPTS,
  CINNAMON_TEMPLATE_BANK,
  CinnamonTemplateKind,
  instantiateCinnamonTemplate,
} from './cinnamonTemplates';
import {
  depthDistance,
  RhythmPhase,
  depthAccepted,
} from './difficulty';

export interface GenerateRequest {
  numColors: number;
  colors: TeaId[];
  emptyCups: number;
  hasMysteryLayer: boolean;
  phase: RhythmPhase;
  /**
   * Number of source-only (teapot) vessels requested. 0 = standard level.
   * Gauntlet 1 uses exactly 1. The teapot REPLACES one ordinary filled
   * vessel: total cup count stays `numColors + emptyCups`.
   */
  sourceOnlyCount?: number;
  /**
   * Named-serving destinations (Gauntlet 2). Explicit TeaIds — not just a
   * count — so reshuffling the SAME level preserves its destination
   * identity, the validator can prove every requested target exists, and
   * future authored levels stay possible. Requirements: unique, each in
   * the active palette, each receiving exactly ONE normal target cup.
   * Target count never changes the total cup count.
   */
  targetTeaIds?: TeaId[];
  /**
   * Number of sink-only (guest cup) vessels requested. 0 = standard level.
   * Gauntlet 3 uses exactly 1. The guest cup REPLACES one ordinary empty
   * vessel: total cup count stays `numColors + emptyCups`. Starts empty at
   * the stable last slot, must finish full + homogeneous (any tea).
   * Production supports max 1; anything more is rejected loudly.
   */
  sinkOnlyCount?: number;
  /**
   * Number of tasting-bowl (дегустационная пиала) vessels requested.
   * 0 = standard level. Gauntlet 4 uses exactly 1. The bowl REPLACES one
   * originally-empty vessel: total cup count stays `numColors + emptyCups`.
   * Capacity 2, normal flow both directions, starts empty at the stable
   * last slot, MUST finish empty. Requires emptyCups >= 2 so one ordinary
   * standard empty buffer remains. Production supports max 1; tasting +
   * sink and tasting + targets are rejected loudly.
   */
  tastingCupCount?: number;
  /**
   * Floating ingredient requested (Gauntlet 5). `undefined` = classic
   * level without floating objects; `'lemon'` = exactly ONE lemon slice
   * riding a liquid surface, destined for full homogeneous sea_buckthorn.
   * Count >1 is out of scope (no count field exists yet on purpose).
   */
  floatingIngredient?: FloatingIngredientId;
  /**
   * Catch-one movable strainer requested (Gauntlet 6). `true` = exactly
   * ONE empty tool on its stand. Tight dedicated topologies only
   * (4c/5v/1e, 5c/6v/1e+mystery, teapot 4c/5v/1e); lemon / sink / tasting
   * / targets are rejected loudly (future Gauntlets).
   */
  hasStrainer?: boolean;
  /**
   * Sinking ingredient requested (Gauntlet 7 — «Мёд на дне»).
   * `undefined` = classic level without sinking objects; `'honey'` =
   * exactly ONE honey blob under the tea of one vessel, destined for
   * full homogeneous buckwheat. Count >1 is out of scope (no count field
   * exists yet on purpose).
   */
  sinkingIngredient?: SinkingIngredientId;
  /**
   * Number of frozen-cup (ice overlay) vessels requested (Gauntlet 9 —
   * «Замёрзшая чашка»). 0 = standard level. Gauntlet 9 uses exactly 1:
   * one standard normal 3/4 mixed vessel (sea_buckthorn on top) carrying
   * the ice overlay, inside the authored 4,4,4,3,1,0 topology. Production
   * supports max 1; every sibling special is rejected loudly.
   */
  frozenCupCount?: number;
  /**
   * Number of high-thermos (capacity-5, must-end-empty) vessels requested
   * (Gauntlet 10 — «Высокий термос»). 0 = standard level. G10 uses exactly
   * 1: one normal cap5/mustEndEmpty vessel starting PARTIALLY FILLED + MIXED
   * (T3 profile: length 3, top tea exactly once inside), inside the authored
   * 4,4,3,2,0 + thermos-3 topology (global 4,4,3,3,2,0). Production supports
   * max 1; every sibling special is rejected loudly. No thermos+tasting.
   */
  thermosCupCount?: number;
  /**
   * Number of cinnamon-stick (dynamic capacity 2→4) vessels requested
   * (Gauntlet 11 — «Палочка корицы»). 0 = standard level. G11 uses exactly
   * 1: one standard normal base-cap4 vessel starting with exactly 2 MIXED
   * tea layers + active cinnamon (effective cap 2), inside the authored
   * 4,4,3,3,2,0 topology. Emptying it removes the stick (effective cap 4).
   * Production supports max 1; every sibling special is rejected loudly.
   */
  cinnamonCupCount?: number;
}

export interface GeneratedLevel {
  cups: TeaId[][];
  hiddenCounts: number[];
  /** Immutable per-vessel roles, aligned with `cups` indices. */
  cupConstraints: CupConstraint[];
  /**
   * Dynamic floating-ingredient slots, aligned with `cups` indices.
   * ALWAYS returned (all-null for pre-lemon levels) so runtime never
   * guesses whether the field exists.
   */
  floatingIngredients: FloatingIngredientSlot[];
  /**
   * Movable strainer state (Gauntlet 6). Production ALWAYS returns it so
   * runtime never guesses: absent for ordinary levels, empty-on-stand
   * initially for G6. Optional only for legacy manual constructions in
   * older tests (normalized as absent).
   */
  strainer?: StrainerState;
  /**
   * Dynamic sinking-ingredient slots, aligned with `cups` indices.
   * ALWAYS returned in production (all-null for pre-honey levels) so
   * runtime never guesses whether the field exists.
   */
  sinkingIngredients?: SinkingIngredientSlot[];
  /**
   * Dynamic ice-overlay slots, aligned with `cups` indices (Gauntlet 9).
   * ALWAYS returned in production (all-null for pre-ice levels) so
   * runtime never guesses whether the field exists.
   */
  iceSlots?: IceSlot[];
  /**
   * Dynamic capacity-obstacle slots, aligned with `cups` indices
   * (Gauntlet 11). ALWAYS returned in production (all-null for
   * pre-cinnamon levels) so runtime never guesses whether the field
   * exists. No duplicate cinnamon index anywhere.
   */
  capacityObstacles?: CapacityObstacleSlot[];
  /** Echo of the seed used, for bug reports / sharing bad puzzles. */
  seed: string;
  /** Solver-verified minimum solution depth. */
  minMoves: number;
  visitedStates: number;
}

export interface GenerateOptions {
  maxRetries?: number;
  /**
   * Optional diagnostics collector (dev/test only — React never depends
   * on it). When provided, generation fills in structural counters:
   * how many random candidates were tried, how many production solver
   * calls ran, how many template instantiations were attempted, and
   * whether the result came from the fallback ladder.
   */
  stats?: GenerateStats;
}

/**
 * Structural generation diagnostics (no wall-clock data — CI hardware
 * varies, so performance gates assert THESE counters, never milliseconds).
 */
export interface GenerateStats {
  /** Random deals pulled from the rng (0 on a pure template path). */
  candidatesTried: number;
  /** Production solvePuzzle invocations across all paths. */
  solverCalls: number;
  /** Special-template instantiations attempted (target-/sink-/tasting-bank; 0 otherwise). */
  templateAttempts: number;
  /** True when the returned level came from the fallback ladder. */
  usedFallback: boolean;
}

/** Fresh zeroed stats (also useful for callers that only read results). */
export function createGenerateStats(): GenerateStats {
  return { candidatesTried: 0, solverCalls: 0, templateAttempts: 0, usedFallback: false };
}

export const GENERATOR_MAX_RETRIES = 150;
const SOLVER_BUDGET_PER_CANDIDATE = 120_000;
/** Bounded safety-net scan inside the fallback ladder. */
const FALLBACK_SCAN_ATTEMPTS = 25;

/** Requested teapot count, normalized (default 0, clamped to >= 0). */
export function requestedSourceOnlyCount(req: GenerateRequest): number {
  const v = req.sourceOnlyCount ?? 0;
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.floor(v));
}

/** Requested guest-cup count, normalized (default 0, clamped to >= 0). */
export function requestedSinkOnlyCount(req: GenerateRequest): number {
  const v = req.sinkOnlyCount ?? 0;
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.floor(v));
}

/** Requested tasting-bowl count, normalized (default 0, clamped to >= 0). */
export function requestedTastingCupCount(req: GenerateRequest): number {
  const v = req.tastingCupCount ?? 0;
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.floor(v));
}

/** Requested named-serving destinations, in stable slot order (default []). */
export function requestedTargetTeas(req: GenerateRequest): TeaId[] {
  return [...(req.targetTeaIds ?? [])];
}

/** Requested floating ingredient (`undefined` = classic level). */
export function requestedFloatingIngredient(req: GenerateRequest): FloatingIngredientId | undefined {
  return req.floatingIngredient ?? undefined;
}

/** Requested catch-one strainer (`true` = exactly one empty tool on stand). */
export function requestedHasStrainer(req: GenerateRequest): boolean {
  return req.hasStrainer === true;
}

/** Requested sinking ingredient (`undefined` = classic level). */
export function requestedSinkingIngredient(req: GenerateRequest): SinkingIngredientId | undefined {
  return req.sinkingIngredient ?? undefined;
}

/** Requested frozen-cup count, normalized (default 0, clamped to >= 0). */
export function requestedFrozenCupCount(req: GenerateRequest): number {
  const v = req.frozenCupCount ?? 0;
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.floor(v));
}

/** Requested high-thermos count, normalized (default 0, clamped to >= 0). */
export function requestedThermosCupCount(req: GenerateRequest): number {
  const v = (req as GenerateRequest).thermosCupCount ?? 0;
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.floor(v));
}

/** Requested cinnamon-stick count, normalized (default 0, clamped to >= 0). */
export function requestedCinnamonCupCount(req: GenerateRequest): number {
  const v = req.cinnamonCupCount ?? 0;
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.floor(v));
}

/**
 * A G8 request is recognized when BOTH are requested: floating 'lemon'
 * AND sinking 'honey' (existing fields — interaction is composition of
 * existing mechanics, not a new mechanic identity field, §65).
 */
export function isLemonHoneyInteractionRequest(req: GenerateRequest): boolean {
  return requestedFloatingIngredient(req) === 'lemon' && requestedSinkingIngredient(req) === 'honey';
}

/**
 * Fail-fast request validation for sinking honey (programming errors,
 * not generation luck). Gauntlet 7 supports: honey (+ optional Mystery,
 * + optional single teapot). Rejected loudly: lemon (except the exact
 * Gauntlet 8 interaction below), strainer, sink, tasting, targets,
 * multi-teapot, missing buckwheat in the active palette.
 */
export function validateSinkingIngredientRequest(req: GenerateRequest): void {
  const honey = requestedSinkingIngredient(req);
  if (honey === undefined) return;
  const known = (SINKING_INGREDIENT_TYPES as Record<string, { targetTeaId: TeaId } | undefined>)[honey];
  if (!known) {
    throw new Error(`validateSinkingIngredientRequest: unsupported ingredient ${honey}`);
  }
  const palette = req.colors.slice(0, req.numColors);
  if (!palette.includes(known.targetTeaId)) {
    throw new Error(
      `validateSinkingIngredientRequest: ${honey} target tea ${known.targetTeaId} not in active palette`,
    );
  }
  if (requestedFloatingIngredient(req) !== undefined) {
    // Gauntlet 8 interaction carve-out (§67): ONLY lemon + the exact G8
    // topology (4c/6v/2e, no Mystery, no teapot, no third special).
    if (!isLemonHoneyInteractionRequest(req)) {
      throw new Error(
        `validateSinkingIngredientRequest: ${honey} + ${requestedFloatingIngredient(req)} is out of scope`,
      );
    }
    if (requestedHasStrainer(req)) {
      throw new Error(`validateSinkingIngredientRequest: lemon+honey + strainer is out of scope for Gauntlet 8`);
    }
    if (requestedSinkOnlyCount(req) > 0) {
      throw new Error(`validateSinkingIngredientRequest: lemon+honey + sink-only is out of scope for Gauntlet 8`);
    }
    if (requestedTastingCupCount(req) > 0) {
      throw new Error(
        `validateSinkingIngredientRequest: lemon+honey + tasting bowl is out of scope for Gauntlet 8`,
      );
    }
    if (requestedTargetTeas(req).length > 0) {
      throw new Error(`validateSinkingIngredientRequest: lemon+honey + targets is out of scope for Gauntlet 8`);
    }
    if (req.numColors !== 4 || req.emptyCups !== 2 || req.hasMysteryLayer || requestedSourceOnlyCount(req) !== 0) {
      throw new Error(
        'validateSinkingIngredientRequest: lemon+honey interaction requires 4 colors, 6 vessels, 2 empties, no Mystery, no teapot',
      );
    }
    return;
  }
  if (requestedHasStrainer(req)) {
    throw new Error(`validateSinkingIngredientRequest: ${honey} + strainer is out of scope for Gauntlet 7`);
  }
  if (requestedSinkOnlyCount(req) > 0) {
    throw new Error(`validateSinkingIngredientRequest: ${honey} + sink-only is out of scope for Gauntlet 7`);
  }
  if (requestedTastingCupCount(req) > 0) {
    throw new Error(`validateSinkingIngredientRequest: ${honey} + tasting bowl is out of scope for Gauntlet 7`);
  }
  if (requestedTargetTeas(req).length > 0) {
    throw new Error(`validateSinkingIngredientRequest: ${honey} + targets is out of scope for Gauntlet 7`);
  }
  if (requestedSourceOnlyCount(req) > 1) {
    throw new Error(
      `validateSinkingIngredientRequest: sourceOnlyCount ${requestedSourceOnlyCount(req)} unsupported (production max 1)`,
    );
  }
}

/**
 * Fail-fast request validation for frozen cups (programming errors, not
 * generation luck). Gauntlet 9 supports exactly the standalone
 * interaction: one ice overlay inside the authored 4c/6v 4,4,4,3,1,0
 * topology (numColors 4, nominal emptyCups 2 → 6 vessels), sea_buckthorn
 * in the active palette, no Mystery/teapot/targets/sink/tasting/
 * lemon/honey/strainer. Production max 1; anything more is rejected
 * loudly (ER/ES).
 */
export function validateFrozenCupRequest(req: GenerateRequest): void {
  const frozen = requestedFrozenCupCount(req);
  if (frozen === 0) return;
  if (frozen > 1) {
    throw new Error(`validateFrozenCupRequest: frozenCupCount ${frozen} unsupported (production max 1)`);
  }
  const palette = req.colors.slice(0, req.numColors);
  if (!palette.includes(FROZEN_CUP_TARGET_TEA)) {
    throw new Error(
      `validateFrozenCupRequest: melt tea ${FROZEN_CUP_TARGET_TEA} not in active palette`,
    );
  }
  if (req.numColors !== 4 || req.emptyCups !== 2 || req.hasMysteryLayer || requestedSourceOnlyCount(req) !== 0) {
    throw new Error(
      'validateFrozenCupRequest: frozen cup requires 4 colors, 6 vessels, 2 nominal empties, no Mystery, no teapot',
    );
  }
  if (requestedTargetTeas(req).length > 0) {
    throw new Error('validateFrozenCupRequest: frozen cup + targets is out of scope for Gauntlet 9');
  }
  if (requestedSinkOnlyCount(req) > 0) {
    throw new Error('validateFrozenCupRequest: frozen cup + sink-only is out of scope for Gauntlet 9');
  }
  if (requestedTastingCupCount(req) > 0) {
    throw new Error('validateFrozenCupRequest: frozen cup + tasting bowl is out of scope for Gauntlet 9');
  }
  if (requestedFloatingIngredient(req) !== undefined) {
    throw new Error(
      `validateFrozenCupRequest: frozen cup + ${requestedFloatingIngredient(req)} is out of scope for Gauntlet 9`,
    );
  }
  if (requestedSinkingIngredient(req) !== undefined) {
    throw new Error(
      `validateFrozenCupRequest: frozen cup + ${requestedSinkingIngredient(req)} is out of scope for Gauntlet 9`,
    );
  }
  if (requestedHasStrainer(req)) {
    throw new Error('validateFrozenCupRequest: frozen cup + strainer is out of scope for Gauntlet 9');
  }
  if (requestedThermosCupCount(req) > 0) {
    throw new Error('validateFrozenCupRequest: frozen cup + thermos is out of scope for Gauntlet 9');
  }
  if (requestedCinnamonCupCount(req) > 0) {
    throw new Error('validateFrozenCupRequest: frozen cup + cinnamon is out of scope for Gauntlet 9');
  }
}

/**
 * Fail-fast request validation for high thermos (programming errors, not
 * generation luck). Gauntlet 10 supports exactly the standalone
 * interaction: one cap5/mustEndEmpty vessel inside the authored 4c/6v
 * 4,4,3,3,2,0 topology (numColors 4, nominal emptyCups 2 → 6 vessels),
 * no Mystery/teapot/targets/sink/tasting/lemon/honey/strainer/frozen.
 * Production max 1; anything more is rejected loudly (FM/FN).
 */
export function validateThermosRequest(req: GenerateRequest): void {
  const thermos = requestedThermosCupCount(req);
  if (thermos === 0) return;
  if (thermos > 1) {
    throw new Error(`validateThermosRequest: thermosCupCount ${thermos} unsupported (production max 1)`);
  }
  if (req.numColors !== 4 || req.emptyCups !== 2 || req.hasMysteryLayer || requestedSourceOnlyCount(req) !== 0) {
    throw new Error(
      'validateThermosRequest: thermos requires 4 colors, 6 vessels, 2 nominal empties, no Mystery, no teapot',
    );
  }
  if (requestedTargetTeas(req).length > 0) {
    throw new Error('validateThermosRequest: thermos + targets is out of scope for Gauntlet 10');
  }
  if (requestedSinkOnlyCount(req) > 0) {
    throw new Error('validateThermosRequest: thermos + sink-only is out of scope for Gauntlet 10');
  }
  if (requestedTastingCupCount(req) > 0) {
    throw new Error('validateThermosRequest: thermos + tasting bowl is out of scope for Gauntlet 10');
  }
  if (requestedFloatingIngredient(req) !== undefined) {
    throw new Error(
      `validateThermosRequest: thermos + ${requestedFloatingIngredient(req)} is out of scope for Gauntlet 10`,
    );
  }
  if (requestedSinkingIngredient(req) !== undefined) {
    throw new Error(
      `validateThermosRequest: thermos + ${requestedSinkingIngredient(req)} is out of scope for Gauntlet 10`,
    );
  }
  if (requestedHasStrainer(req)) {
    throw new Error('validateThermosRequest: thermos + strainer is out of scope for Gauntlet 10');
  }
  if (requestedFrozenCupCount(req) > 0) {
    throw new Error('validateThermosRequest: thermos + frozen cup is out of scope for Gauntlet 10');
  }
  if (requestedCinnamonCupCount(req) > 0) {
    throw new Error('validateThermosRequest: thermos + cinnamon is out of scope for Gauntlet 10');
  }
}

/**
 * Fail-fast request validation for cinnamon sticks (programming errors,
 * not generation luck). Gauntlet 11 supports exactly the standalone
 * interaction: one active cinnamon obstacle on a standard normal base-4
 * vessel holding exactly 2 mixed layers, inside the authored 4c/6v
 * 4,4,3,3,2,0 topology (numColors 4, nominal emptyCups 2 → 6 vessels),
 * no Mystery/teapot/targets/sink/tasting/lemon/honey/strainer/frozen/
 * thermos. Production max 1; anything more is rejected loudly (GI/GJ).
 */
export function validateCinnamonRequest(req: GenerateRequest): void {
  const cinnamon = requestedCinnamonCupCount(req);
  if (cinnamon === 0) return;
  if (cinnamon > 1) {
    throw new Error(`validateCinnamonRequest: cinnamonCupCount ${cinnamon} unsupported (production max 1)`);
  }
  if (req.numColors !== 4 || req.emptyCups !== 2 || req.hasMysteryLayer || requestedSourceOnlyCount(req) !== 0) {
    throw new Error(
      'validateCinnamonRequest: cinnamon requires 4 colors, 6 vessels, 2 nominal empties, no Mystery, no teapot',
    );
  }
  if (requestedTargetTeas(req).length > 0) {
    throw new Error('validateCinnamonRequest: cinnamon + targets is out of scope for Gauntlet 11');
  }
  if (requestedSinkOnlyCount(req) > 0) {
    throw new Error('validateCinnamonRequest: cinnamon + sink-only is out of scope for Gauntlet 11');
  }
  if (requestedTastingCupCount(req) > 0) {
    throw new Error('validateCinnamonRequest: cinnamon + tasting bowl is out of scope for Gauntlet 11');
  }
  if (requestedFloatingIngredient(req) !== undefined) {
    throw new Error(
      `validateCinnamonRequest: cinnamon + ${requestedFloatingIngredient(req)} is out of scope for Gauntlet 11`,
    );
  }
  if (requestedSinkingIngredient(req) !== undefined) {
    throw new Error(
      `validateCinnamonRequest: cinnamon + ${requestedSinkingIngredient(req)} is out of scope for Gauntlet 11`,
    );
  }
  if (requestedHasStrainer(req)) {
    throw new Error('validateCinnamonRequest: cinnamon + strainer is out of scope for Gauntlet 11');
  }
  if (requestedFrozenCupCount(req) > 0) {
    throw new Error('validateCinnamonRequest: cinnamon + frozen cup is out of scope for Gauntlet 11');
  }
  if (requestedThermosCupCount(req) > 0) {
    throw new Error('validateCinnamonRequest: cinnamon + thermos is out of scope for Gauntlet 11');
  }
}

/**
 * Fail-fast request validation for the catch-one strainer (programming
 * errors, not generation luck). Tight dedicated topologies only; rejects
 * loudly: lemon, sink, tasting, targets, multiple strainers (boolean).
 * Mystery and one teapot MAY coexist (the three canonical configs).
 */
export function validateStrainerRequest(req: GenerateRequest): void {
  if (!requestedHasStrainer(req)) return;
  if (requestedFloatingIngredient(req) !== undefined) {
    throw new Error('validateStrainerRequest: strainer + lemon is out of scope for Gauntlet 6');
  }
  if (requestedSinkOnlyCount(req) > 0) {
    throw new Error('validateStrainerRequest: strainer + sink-only is out of scope for Gauntlet 6');
  }
  if (requestedTastingCupCount(req) > 0) {
    throw new Error('validateStrainerRequest: strainer + tasting bowl is out of scope for Gauntlet 6');
  }
  if (requestedTargetTeas(req).length > 0) {
    throw new Error('validateStrainerRequest: strainer + targets is out of scope for Gauntlet 6');
  }
}

/**
 * Fail-fast request validation for floating ingredients (programming
 * errors, not generation luck). For lemon Gauntlet 5 requires:
 * sea_buckthorn in the active palette; no sink-only, no target cups, no
 * tasting bowl (all rejected loudly, never silently dropped). A
 * source-only teapot and Mystery MAY coexist. Only one ingredient exists.
 */
export function validateFloatingIngredientRequest(req: GenerateRequest): void {
  const ing = requestedFloatingIngredient(req);
  if (ing === undefined) return;
  const known = (FLOATING_INGREDIENT_TYPES as Record<string, { targetTeaId: TeaId } | undefined>)[ing];
  if (!known) {
    throw new Error(`validateFloatingIngredientRequest: unsupported ingredient ${ing}`);
  }
  const palette = req.colors.slice(0, req.numColors);
  if (!palette.includes(known.targetTeaId)) {
    throw new Error(
      `validateFloatingIngredientRequest: ${ing} target tea ${known.targetTeaId} not in active palette`,
    );
  }
  if (requestedSinkOnlyCount(req) > 0) {
    throw new Error(`validateFloatingIngredientRequest: ${ing} + sink-only is out of scope for Gauntlet 5`);
  }
  if (requestedTargetTeas(req).length > 0) {
    throw new Error(`validateFloatingIngredientRequest: ${ing} + targets is out of scope for Gauntlet 5`);
  }
  if (requestedTastingCupCount(req) > 0) {
    throw new Error(`validateFloatingIngredientRequest: ${ing} + tasting bowl is out of scope for Gauntlet 5`);
  }
}

/**
 * Fail-fast request validation for target serving (programming errors,
 * not generation luck): duplicates, teas outside the active palette, or
 * more targets than available filled normal vessels. Called at the top
 * of generateLevel/fallbackLevel so bad requests throw loudly instead of
 * silently producing weaker puzzles.
 */
export function validateTargetRequest(req: GenerateRequest): void {
  const teas = requestedTargetTeas(req);
  const seen = new Set<TeaId>();
  for (const t of teas) {
    if (seen.has(t)) {
      throw new Error(`validateTargetRequest: duplicate targetTeaId ${t}`);
    }
    seen.add(t);
  }
  const palette = req.colors.slice(0, req.numColors);
  for (const t of teas) {
    if (!palette.includes(t)) {
      throw new Error(`validateTargetRequest: targetTeaId ${t} not in active palette`);
    }
  }
  const filledNormals = req.numColors - requestedSourceOnlyCount(req);
  if (teas.length > filledNormals) {
    throw new Error(
      `validateTargetRequest: ${teas.length} targets exceed ${filledNormals} filled normal vessels`,
    );
  }
}

/** Count source-only vessels in a constraints array. */
export function countSourceOnly(constraints: readonly CupConstraint[]): number {
  return constraints.filter((c) => c.mode === 'source-only').length;
}

/** Count sink-only vessels in a constraints array. */
export function countSinkOnly(constraints: readonly CupConstraint[]): number {
  return constraints.filter((c) => c.mode === 'sink-only').length;
}

/** Count tasting-bowl vessels in a constraints array. */
export function countTastingCups(constraints: readonly CupConstraint[]): number {
  return constraints.filter(isTastingCupConstraint).length;
}

/** Count high-thermos vessels in a constraints array (Gauntlet 10). */
export function countThermosCups(constraints: readonly CupConstraint[]): number {
  return constraints.filter(isThermosCupConstraint).length;
}

/**
 * Fail-fast request validation for tasting bowls (programming errors,
 * not generation luck): production supports max 1, the bowl consumes one
 * originally-empty slot while keeping an ordinary standard empty buffer
 * (hence emptyCups >= 2), and tasting + sink / tasting + targets are OUT
 * OF SCOPE for Gauntlet 4 (rejected loudly — never silently degraded).
 * Tasting may combine with source-only (teapot + tasting bowl).
 */
export function validateTastingRequest(req: GenerateRequest): void {
  const tasting = requestedTastingCupCount(req);
  if (tasting === 0) return;
  if (tasting > 1) {
    throw new Error(`validateTastingRequest: tastingCupCount ${tasting} unsupported (production max 1)`);
  }
  if (req.emptyCups < 2) {
    throw new Error(
      `validateTastingRequest: tasting needs emptyCups >= 2 (got ${req.emptyCups}) to keep an ordinary empty buffer`,
    );
  }
  if (tasting > req.emptyCups) {
    throw new Error(
      `validateTastingRequest: tastingCupCount ${tasting} exceeds emptyCups ${req.emptyCups}`,
    );
  }
  if (requestedSinkOnlyCount(req) > 0) {
    throw new Error('validateTastingRequest: tasting + sink-only is out of scope for Gauntlet 4');
  }
  const targets = requestedTargetTeas(req);
  if (targets.length > 0) {
    throw new Error(
      `validateTastingRequest: tasting + targets [${targets.join(',')}] is out of scope for Gauntlet 4`,
    );
  }
}

/**
 * Fail-fast request validation for sink-only guest cups (programming
 * errors, not generation luck): production supports max 1, the sink
 * needs an originally-empty slot, and sink + named targets is OUT OF
 * SCOPE for Gauntlet 3 (rejected loudly — never silently degraded).
 * Sink may combine with source-only (teapot + guest cup).
 */
export function validateSinkRequest(req: GenerateRequest): void {
  const sink = requestedSinkOnlyCount(req);
  if (sink === 0) return;
  if (sink > 1) {
    throw new Error(`validateSinkRequest: sinkOnlyCount ${sink} unsupported (production max 1)`);
  }
  if (sink > req.emptyCups) {
    throw new Error(
      `validateSinkRequest: sinkOnlyCount ${sink} exceeds emptyCups ${req.emptyCups}`,
    );
  }
  const targets = requestedTargetTeas(req);
  if (targets.length > 0) {
    throw new Error(
      `validateSinkRequest: sink-only + targets [${targets.join(',')}] is out of scope for Gauntlet 3`,
    );
  }
}

/**
 * True when a cup qualifies as a starting teapot: full (standard
 * capacity — teapots are always standard vessels) + mixed.
 */
export function isMixedFullCup(cup: TeaId[]): boolean {
  if (cup.length === 0) return false;
  if (cup.length !== STANDARD_CUP_CAPACITY) return false;
  const first = cup[0];
  return cup.some((t) => t !== first);
}

/**
 * Mystery selection rule (meaningful reveal):
 * hide exactly one bottom layer in an UNTARGETED NORMAL cup with >= 3
 * layers where the hidden layer DIFFERS from the immediately adjacent
 * visible layer. That way removing the visible top group always exposes
 * a DIFFERENT tea instead of silently pouring away one long mono block.
 * Neither the teapot NOR a target cup NOR a tasting bowl is ever a
 * mystery candidate — the target motif and hidden-bottom information
 * must not visually compete, and tasting bowls start empty at capacity
 * 2. The tasting exclusion is an explicit semantic contract, not just a
 * consequence of the length >= 3 shape rule.
 */
export function selectMysteryCup(
  cups: TeaId[][],
  pick: (candidates: number[]) => number | null,
  cupConstraints?: readonly CupConstraint[],
): number | null {
  const candidates: number[] = [];
  cups.forEach((cup, idx) => {
    const c = cupConstraints?.[idx];
    if (c && (c.mode !== 'normal' || c.targetTeaId !== undefined)) return;
    if (c && isTastingCupConstraint(c)) return;
    if (cup.length >= 3 && cup[0] !== cup[1]) candidates.push(idx);
  });
  if (candidates.length === 0) return null;
  return pick(candidates);
}

interface DealResult {
  cups: TeaId[][];
  cupConstraints: CupConstraint[];
  /** Initial lemon host chosen by the deal, or null when not requested. */
  lemonHost: number | null;
}

/**
 * Lemon host selection (Gauntlet 5 §33): a FULL MIXED plain-standard
 * normal vessel — full standard capacity, mixed (never pre-solved, never
 * already satisfying the lemon goal), no target, never teapot/sink/
 * tasting. Mystery exclusion happens at the caller (host must differ
 * from the Mystery cup). Returns null when this deal cannot host.
 */
export function selectLemonHost(
  cups: TeaId[][],
  cupConstraints: readonly CupConstraint[],
  pick: (candidates: number[]) => number | null,
  excludeIndices: readonly number[] = [],
): number | null {
  const excluded = new Set(excludeIndices);
  const candidates: number[] = [];
  cups.forEach((cup, idx) => {
    if (excluded.has(idx)) return;
    const c = cupConstraints[idx];
    if (!c || c.mode !== 'normal' || c.targetTeaId !== undefined) return;
    if (cupCapacity(c) !== STANDARD_CUP_CAPACITY || mustEndEmpty(c)) return;
    if (isTastingCupConstraint(c)) return;
    if (!isMixedFullCup(cup)) return;
    candidates.push(idx);
  });
  if (candidates.length === 0) return null;
  return pick(candidates);
}

/**
 * Honey host selection (Gauntlet 7 §21–22): a FULL MIXED plain-standard
 * normal vessel — full standard capacity, mixed (never pre-solved, and a
 * mixed host guarantees the first outflow leaves tea behind, so every
 * solution naturally demonstrates HONEY-STAY before HONEY-MOVE), no
 * target, never teapot/sink/tasting. Mystery exclusion happens at the
 * caller (host must differ from the Mystery cup). Returns null when this
 * deal cannot host.
 */
export function selectHoneyHost(
  cups: TeaId[][],
  cupConstraints: readonly CupConstraint[],
  pick: (candidates: number[]) => number | null,
  excludeIndices: readonly number[] = [],
): number | null {
  const excluded = new Set(excludeIndices);
  const candidates: number[] = [];
  cups.forEach((cup, idx) => {
    if (excluded.has(idx)) return;
    const c = cupConstraints[idx];
    if (!c || c.mode !== 'normal' || c.targetTeaId !== undefined) return;
    if (cupCapacity(c) !== STANDARD_CUP_CAPACITY || mustEndEmpty(c)) return;
    if (isTastingCupConstraint(c)) return;
    if (!isMixedFullCup(cup)) return;
    candidates.push(idx);
  });
  if (candidates.length === 0) return null;
  return pick(candidates);
}

export interface HoneyParticipation {
  stays: number;
  moves: number;
  firstMoveDepth: number | null;
}

/**
 * Replay an optimal WITH-honey solution and count HONEY-STAY events (a
 * successful pour from the current honey host that leaves the source
 * non-empty, honey stays) and HONEY-MOVE events (honey relocates because
 * its host emptied). Production templates require stays >= 1 AND
 * moves >= 1 AND a satisfied final honey goal (§38–39).
 */
export function analyzeHoneyParticipation(
  startCups: TeaId[][],
  startHoney: readonly SinkingIngredientSlot[],
  solution: readonly SolverAction[],
  cupConstraints: readonly CupConstraint[],
): HoneyParticipation {
  let cups = startCups.map((c) => [...c]);
  let slots = normalizeSinkingIngredients(startHoney, startCups.length);
  let stays = 0;
  let moves = 0;
  let firstMoveDepth: number | null = null;
  for (let i = 0; i < solution.length; i++) {
    const a = solution[i] as SolverAction;
    if (a.kind !== 'pour') {
      const res = applyPuzzleActionState({ cups, floatingIngredients: emptyFloatingIngredients(cups.length), sinkingIngredients: slots }, a, cupConstraints);
      if (!res) return { stays, moves, firstMoveDepth };
      cups = res.state.cups;
      slots = res.state.sinkingIngredients;
      continue;
    }
    const hostBefore = slots.findIndex((s) => s === 'honey');
    const res = applyPourState(
      { cups, floatingIngredients: emptyFloatingIngredients(cups.length), sinkingIngredients: slots },
      (a as { from: number }).from,
      (a as { to: number }).to,
      cupConstraints,
    );
    if (!res) return { stays, moves, firstMoveDepth };
    const hostAfter = res.state.sinkingIngredients.findIndex((s) => s === 'honey');
    if (hostBefore === (a as { from: number }).from) {
      if (hostAfter === hostBefore && res.state.cups[(a as { from: number }).from]?.length !== 0) stays++;
      if (hostAfter !== hostBefore) {
        moves++;
        if (firstMoveDepth === null) firstMoveDepth = i;
      }
    }
    cups = res.state.cups;
    slots = [...res.state.sinkingIngredients];
  }
  return { stays, moves, firstMoveDepth };
}

export interface IceParticipation {
  melts: number;
  sourceUses: number;
  deepUnlocks: number;
  firstMeltDepth: number | null;
  firstSourceUseDepth: number | null;
  firstDeepUnlockDepth: number | null;
  finalIceCleared: boolean;
  win: boolean;
}

/**
 * Replay an optimal WITH-ice solution and count MELT events (a successful
 * hot-tea inflow clearing the overlay), SOURCE_USE events (a later pour
 * from the formerly frozen vessel) and DEEP_UNLOCK events (that vessel
 * later dropping below its initial 3 tea layers — proving originally
 * trapped content moved), plus final ice/win verdicts. Production
 * templates require melt >= 1 AND source-use >= 1 AND cleared ice AND win
 * (FI–FL); deep unlock is preferred quality (bank is 18/18 L3).
 */
export function analyzeIceParticipation(
  startCups: TeaId[][],
  startIce: readonly IceSlot[],
  frozenHost: number,
  solution: readonly SolverAction[],
  cupConstraints: readonly CupConstraint[],
): IceParticipation {
  const out: IceParticipation = {
    melts: 0,
    sourceUses: 0,
    deepUnlocks: 0,
    firstMeltDepth: null,
    firstSourceUseDepth: null,
    firstDeepUnlockDepth: null,
    finalIceCleared: false,
    win: false,
  };
  let cups = startCups.map((c) => [...c]);
  let ice = normalizeIceSlots(startIce, startCups.length);
  let melted = false;
  for (let i = 0; i < solution.length; i++) {
    const a = solution[i] as SolverAction;
    if (a.kind !== 'pour') continue;
    const res = applyPourState(
      { cups, floatingIngredients: emptyFloatingIngredients(cups.length), iceSlots: [...ice] },
      (a as { from: number }).from,
      (a as { to: number }).to,
      cupConstraints,
    );
    if (!res) return out;
    cups = res.state.cups;
    ice = [...res.state.iceSlots];
    if (res.iceMelted === 'ice') {
      out.melts++;
      if (out.firstMeltDepth === null) out.firstMeltDepth = i;
      melted = true;
    }
    if (melted && (a as { from: number }).from === frozenHost) {
      out.sourceUses++;
      if (out.firstSourceUseDepth === null) out.firstSourceUseDepth = i;
    }
    if (melted && (cups[frozenHost] as TeaId[]).length < 3) {
      out.deepUnlocks++;
      if (out.firstDeepUnlockDepth === null) out.firstDeepUnlockDepth = i;
    }
  }
  out.finalIceCleared = ice.every((s) => s === null);
  out.win = isPuzzleWonState(
    { cups, floatingIngredients: emptyFloatingIngredients(cups.length), iceSlots: [...ice] },
    cupConstraints,
  );
  return out;
}

export interface ThermosParticipation {
  fifthSlotUses: number;
  drainsAfterFifth: number;
  firstFifthSlotDepth: number | null;
  firstDrainAfterFifthDepth: number | null;
  finalThermosEmpty: boolean;
  win: boolean;
}

/**
 * Replay an optimal thermos solution and count FIFTH_SLOT_USE events (a
 * successful POUR causing thermos 4→5) and THERMOS_DRAIN events (a later
 * POUR sourcing from the thermos back below 5), plus final empty/win.
 * Production templates require fifth >= 1 AND drain >= 1 AND final empty
 * AND win (GE–GG). Analysis only — never PuzzleState.
 */
export function analyzeThermosParticipation(
  startCups: TeaId[][],
  thermosHost: number,
  solution: readonly SolverAction[],
  cupConstraints: readonly CupConstraint[],
): ThermosParticipation {
  const out: ThermosParticipation = {
    fifthSlotUses: 0,
    drainsAfterFifth: 0,
    firstFifthSlotDepth: null,
    firstDrainAfterFifthDepth: null,
    finalThermosEmpty: false,
    win: false,
  };
  let cups = startCups.map((c) => [...c]);
  for (let i = 0; i < solution.length; i++) {
    const a = solution[i] as SolverAction;
    if (a.kind !== 'pour') continue;
    const from = (a as { from: number }).from;
    const to = (a as { to: number }).to;
    const before = (cups[thermosHost] as TeaId[]).length;
    const res = applyPourState(
      { cups, floatingIngredients: emptyFloatingIngredients(cups.length) },
      from,
      to,
      cupConstraints,
    );
    if (!res) return out;
    cups = res.state.cups;
    const after = (cups[thermosHost] as TeaId[]).length;
    if (to === thermosHost && before === 4 && after === 5) {
      out.fifthSlotUses++;
      if (out.firstFifthSlotDepth === null) out.firstFifthSlotDepth = i;
    }
    if (out.firstFifthSlotDepth !== null && i > (out.firstFifthSlotDepth as number) && from === thermosHost && after < 5) {
      out.drainsAfterFifth++;
      if (out.firstDrainAfterFifthDepth === null) out.firstDrainAfterFifthDepth = i;
    }
  }
  out.finalThermosEmpty = (cups[thermosHost] as TeaId[]).length === 0;
  out.win = isPuzzleWonState(
    { cups, floatingIngredients: emptyFloatingIngredients(cups.length) },
    cupConstraints,
  );
  return out;
}

export interface CinnamonParticipation {
  unlocks: number;
  expandedUses: number;
  fourthSlotUses: number;
  expandedDrains: number;
  finalRepurpose: boolean;
  firstUnlockDepth: number | null;
  firstExpandedUseDepth: number | null;
  firstFourthSlotDepth: number | null;
  firstExpandedDrainDepth: number | null;
  maxPostUnlockOccupancy: number;
  finalObstacleCleared: boolean;
  win: boolean;
}

/**
 * Replay an optimal cinnamon solution and count CAPACITY_UNLOCK events (a
 * successful outflow emptying the active host, removing cinnamon),
 * EXPANDED_USE events (later pours leaving the host at >=3),
 * FOURTH_SLOT_USE (host reaches 4), EXPANDED_DRAIN (later source uses
 * after expansion) and FINAL_REPURPOSE (host ends 4 homogeneous), plus
 * final cleared/win verdicts. Production templates require unlock >= 1
 * AND expanded use >= 1 AND cleared obstacle AND win (GX–HA); L3A/L3B is
 * offline curation truth (§109). Analysis only — never PuzzleState.
 */
export function analyzeCinnamonParticipation(
  startCups: TeaId[][],
  startObstacles: readonly CapacityObstacleSlot[],
  cinnamonHost: number,
  solution: readonly SolverAction[],
  cupConstraints: readonly CupConstraint[],
): CinnamonParticipation {
  const out: CinnamonParticipation = {
    unlocks: 0,
    expandedUses: 0,
    fourthSlotUses: 0,
    expandedDrains: 0,
    finalRepurpose: false,
    firstUnlockDepth: null,
    firstExpandedUseDepth: null,
    firstFourthSlotDepth: null,
    firstExpandedDrainDepth: null,
    maxPostUnlockOccupancy: 0,
    finalObstacleCleared: false,
    win: false,
  };
  let cups = startCups.map((c) => [...c]);
  let obstacles = normalizeCapacityObstacles(startObstacles, startCups.length);
  for (let i = 0; i < solution.length; i++) {
    const a = solution[i] as SolverAction;
    if (a.kind !== 'pour') continue;
    const from = (a as { from: number }).from;
    const res = applyPourState(
      { cups, floatingIngredients: emptyFloatingIngredients(cups.length), capacityObstacles: [...obstacles] },
      from,
      (a as { to: number }).to,
      cupConstraints,
    );
    if (!res) return out;
    cups = res.state.cups;
    obstacles = [...res.state.capacityObstacles];
    if (res.capacityObstacleRemoved === 'cinnamon') {
      out.unlocks++;
      if (out.firstUnlockDepth === null) out.firstUnlockDepth = i;
    }
    if (out.firstUnlockDepth !== null && i > (out.firstUnlockDepth as number)) {
      const occ = (cups[cinnamonHost] as TeaId[]).length;
      out.maxPostUnlockOccupancy = Math.max(out.maxPostUnlockOccupancy, occ);
      if (occ >= 3) {
        out.expandedUses++;
        if (out.firstExpandedUseDepth === null) out.firstExpandedUseDepth = i;
      }
      if (occ === 4 && out.firstFourthSlotDepth === null) {
        out.fourthSlotUses++;
        out.firstFourthSlotDepth = i;
      }
      if (
        from === cinnamonHost &&
        out.firstExpandedUseDepth !== null &&
        i > (out.firstExpandedUseDepth as number)
      ) {
        out.expandedDrains++;
        if (out.firstExpandedDrainDepth === null) out.firstExpandedDrainDepth = i;
      }
    }
  }
  const hostFinal = cups[cinnamonHost] as TeaId[];
  out.finalRepurpose = hostFinal.length === 4 && hostFinal.every((t) => t === hostFinal[0]);
  out.finalObstacleCleared = obstacles.every((s) => s === null);
  out.win = isPuzzleWonState(
    { cups, floatingIngredients: emptyFloatingIngredients(cups.length), capacityObstacles: [...obstacles] },
    cupConstraints,
  );
  return out;
}

/**
 * Multi-ingredient interaction trace (Gauntlet 8 §38, ANALYSIS ONLY —
 * never gameplay state). Replays a solution and counts, at deterministic
 * action boundaries, cohost states (one vessel holding BOTH lemon and
 * honey), SPLIT events (cohost source pours: lemon moves, honey stays
 * because tea remains) and JOINT MOVE events (cohost source empties:
 * lemon AND honey relocate together), plus final goal/win verdicts.
 */
export interface IngredientInteractionTrace {
  lemonMoves: number;
  honeyStays: number;
  honeyMoves: number;
  cohostStates: number;
  splitEvents: number;
  jointMoveEvents: number;
  firstCohostDepth: number | null;
  firstSplitDepth: number | null;
  firstJointMoveDepth: number | null;
  finalLemonOk: boolean;
  finalHoneyOk: boolean;
  /** Final lemon host index (-1 when absent). */
  finalLemonHost: number;
  /** Final honey host index (-1 when absent). */
  finalHoneyHost: number;
  win: boolean;
}

function isCohostBoard(
  floating: readonly (FloatingIngredientSlot | null)[],
  sinking: readonly (SinkingIngredientSlot | null)[],
): boolean {
  for (let i = 0; i < floating.length; i++) {
    if (floating[i] === 'lemon' && sinking[i] === 'honey') return true;
  }
  return false;
}

export function analyzeIngredientInteraction(
  startCups: TeaId[][],
  startFloating: readonly FloatingIngredientSlot[],
  startSinking: readonly SinkingIngredientSlot[],
  solution: readonly SolverAction[],
  cupConstraints: readonly CupConstraint[],
): IngredientInteractionTrace {
  const empty: IngredientInteractionTrace = {
    lemonMoves: 0,
    honeyStays: 0,
    honeyMoves: 0,
    cohostStates: 0,
    splitEvents: 0,
    jointMoveEvents: 0,
    firstCohostDepth: null,
    firstSplitDepth: null,
    firstJointMoveDepth: null,
    finalLemonOk: false,
    finalHoneyOk: false,
    finalLemonHost: -1,
    finalHoneyHost: -1,
    win: false,
  };
  let cups = startCups.map((c) => [...c]);
  let floating = normalizeFloatingIngredients(startFloating, startCups.length);
  let sinking = normalizeSinkingIngredients(startSinking, startCups.length);
  const noteCohost = (depth: number): void => {
    if (!isCohostBoard(floating, sinking)) return;
    empty.cohostStates++;
    if (empty.firstCohostDepth === null) empty.firstCohostDepth = depth;
  };
  noteCohost(0);
  for (let i = 0; i < solution.length; i++) {
    const a = solution[i] as SolverAction;
    if (a.kind !== 'pour') {
      const sync = applyPuzzleActionState(
        { cups, floatingIngredients: floating, sinkingIngredients: sinking },
        a,
        cupConstraints,
      );
      if (!sync) return empty;
      cups = sync.state.cups;
      floating = [...sync.state.floatingIngredients];
      sinking = [...sync.state.sinkingIngredients];
      noteCohost(i + 1);
      continue;
    }
    const from = (a as { from: number }).from;
    const cohostBefore = floating[from] === 'lemon' && sinking[from] === 'honey';
    const res = applyPourState(
      { cups, floatingIngredients: floating, sinkingIngredients: sinking },
      from,
      (a as { to: number }).to,
      cupConstraints,
    );
    if (!res) return empty;
    const lemonMoved = res.floatingIngredientMoved === 'lemon';
    const honeyMoved = res.sinkingIngredientMoved === 'honey';
    if (lemonMoved) empty.lemonMoves++;
    if (sinking[from] === 'honey') {
      if (honeyMoved) {
        empty.honeyMoves++;
        if (cohostBefore && lemonMoved) {
          empty.jointMoveEvents++;
          if (empty.firstJointMoveDepth === null) empty.firstJointMoveDepth = i;
        }
      } else if (res.state.cups[from]?.length !== 0) {
        empty.honeyStays++;
        if (cohostBefore && lemonMoved) {
          empty.splitEvents++;
          if (empty.firstSplitDepth === null) empty.firstSplitDepth = i;
        }
      }
    }
    cups = res.state.cups;
    floating = [...res.state.floatingIngredients];
    sinking = [...res.state.sinkingIngredients];
    noteCohost(i + 1);
  }
  const lemonHost = floating.findIndex((s) => s === 'lemon');
  const honeyHost = sinking.findIndex((s) => s === 'honey');
  empty.finalLemonHost = lemonHost;
  empty.finalHoneyHost = honeyHost;
  empty.finalLemonOk =
    lemonHost >= 0 &&
    floatingIngredientHostSatisfied('lemon', cups[lemonHost] as TeaId[], cupConstraints[lemonHost]);
  empty.finalHoneyOk =
    honeyHost >= 0 &&
    sinkingIngredientHostSatisfied('honey', cups[honeyHost] as TeaId[], cupConstraints[honeyHost]);
  empty.win = isPuzzleWonState({ cups, floatingIngredients: floating, sinkingIngredients: sinking }, cupConstraints);
  return empty;
}

/**
 * Assign named-serving roles onto an already-dealt board (teapot already
 * placed at slot 0 when requested). Each requested tea receives exactly
 * one filled FULL normal cup that is NOT already complete with its own
 * tea (a pre-solved target would teach nothing), preferably mixed;
 * chosen cups are swapped into stable visual slots right after any
 * source-only slot (indices 0,1 without teapot; 1,2 with teapot).
 * Identity lives in the returned constraints, never in contents alone.
 * Returns null when this deal cannot host the requested targets.
 */
function assignTargetConstraints(
  cups: TeaId[][],
  baseConstraints: CupConstraint[],
  targetTeas: TeaId[],
  hasTeapot: boolean,
  pick: (candidates: number[]) => number,
): CupConstraint[] | null {
  const constraints = baseConstraints.map(cloneCupConstraint);
  const used = new Set<number>();
  // Reserve role slots so targets never land on the teapot.
  for (let i = 0; i < constraints.length; i++) {
    if (constraints[i]?.mode === 'source-only') used.add(i);
  }
  const base = hasTeapot ? 1 : 0;
  for (let k = 0; k < targetTeas.length; k++) {
    const tea = targetTeas[k] as TeaId;
    const eligible: number[] = [];
    const mixedEligible: number[] = [];
    cups.forEach((cup, idx) => {
      if (used.has(idx)) return;
      if (constraints[idx]?.mode !== 'normal') return;
      if (cup.length !== STANDARD_CUP_CAPACITY) return; // targets start FILLED (standard vessels)
      // Reject pre-solved targets: full homogeneous of its own tea.
      if (isInFinalState(cup, { mode: 'normal', targetTeaId: tea })) return;
      eligible.push(idx);
      if (isMixedFullCup(cup)) mixedEligible.push(idx);
    });
    // Prefer mixed cups (rearrangement required), accept homogeneous-wrong.
    const pool = mixedEligible.length > 0 ? mixedEligible : eligible;
    if (pool.length === 0) return null;
    // Same pick contract as selectMysteryCup: returns the chosen cup index.
    const raw = pick(pool);
    const chosen = (pool.includes(raw) ? raw : pool[0]) as number;
    used.add(chosen);
    const slot = base + k;
    if (chosen !== slot && !used.has(slot)) {
      // Swap contents into the stable slot. The slot cup is a plain
      // filled normal (teapot/used slots are reserved above), so no role
      // data moves — only arrangement changes.
      const tmp = cups[slot] as TeaId[];
      cups[slot] = cups[chosen] as TeaId[];
      cups[chosen] = tmp;
      used.delete(chosen);
      used.add(slot);
      constraints[slot] = { mode: 'normal', targetTeaId: tea };
    } else if (chosen !== slot && used.has(slot)) {
      // Stable slot already taken (should not happen with unique targets
      // and enough vessels) — assign in place to stay sound.
      constraints[chosen] = { mode: 'normal', targetTeaId: tea };
    } else {
      constraints[slot] = { mode: 'normal', targetTeaId: tea };
    }
  }
  return constraints;
}

function dealCandidate(
  rng: () => number,
  numColors: number,
  colors: TeaId[],
  emptyCups: number,
  sourceOnlyCount = 0,
  targetTeas: TeaId[] = [],
  sinkOnlyCount = 0,
  tastingCupCount = 0,
  floatingIngredient?: FloatingIngredientId,
): DealResult | null {
  // Gauntlet 3 product constraint: sink + targets never coexist.
  if (sinkOnlyCount > 0 && targetTeas.length > 0) return null;
  if (sinkOnlyCount > 1) return null;
  if (sinkOnlyCount > emptyCups) return null;
  // Gauntlet 4 product constraints: tasting is exclusive of sink/targets,
  // at most one bowl, and needs an empty slot while keeping a buffer.
  if (tastingCupCount > 1) return null;
  if (tastingCupCount > 0 && targetTeas.length > 0) return null;
  if (tastingCupCount > 0 && sinkOnlyCount > 0) return null;
  if (tastingCupCount > emptyCups) return null;
  if (tastingCupCount > 0 && emptyCups < 2) return null;
  // Gauntlet 5 product constraints: lemon is exclusive of sink, targets
  // and tasting (request validation throws loudly first; the deal stays
  // total by returning null for bad combos).
  if (floatingIngredient !== undefined) {
    if (sinkOnlyCount > 0 || targetTeas.length > 0 || tastingCupCount > 0) return null;
  }
  const pool: TeaId[] = [];
  for (let c = 0; c < numColors; c++) {
    const color = colors[c] as TeaId;
    for (let k = 0; k < TEA_UNITS_PER_COLOR; k++) pool.push(color);
  }
  shuffleInPlace(rng, pool);

  const cups: TeaId[][] = [];
  for (let c = 0; c < numColors; c++) {
    cups.push(pool.slice(c * TEA_UNITS_PER_COLOR, (c + 1) * TEA_UNITS_PER_COLOR));
  }
  for (let e = 0; e < emptyCups; e++) cups.push([]);

  // Deal order is positional; shuffle cup positions deterministically so
  // the puzzle doesn't always group colors the same way.
  shuffleInPlace(rng, cups);

  // Gauntlet 3 helper: the guest cup REPLACES one originally-empty vessel
  // (total count unchanged) at the stable last slot. Returns null when no
  // empty normal slot exists.
  const placeSinkAtLastSlot = (constraints: CupConstraint[]): boolean => {
    if (sinkOnlyCount !== 1) return false;
    const last = cups.length - 1;
    // Candidate empty slots: truly empty cups with a normal role (never
    // the teapot slot, never a target slot).
    const emptySlots: number[] = [];
    cups.forEach((cup, idx) => {
      if (cup.length === 0 && constraints[idx]?.mode === 'normal') emptySlots.push(idx);
    });
    if (emptySlots.length === 0) return false;
    let slot = last;
    if (!emptySlots.includes(last)) {
      slot = emptySlots[Math.floor(rng() * emptySlots.length)] as number;
      const tmp = cups[last] as TeaId[];
      cups[last] = cups[slot] as TeaId[];
      cups[slot] = tmp;
      // Role swap: the moved-aside cup keeps its (normal) role; the sink
      // role lands on the last slot. If the swapped-aside slot held a
      // target role it would move — but sink+targets never coexist, so
      // every swappable role here is plain normal.
      const tmpC = constraints[last] as CupConstraint;
      constraints[last] = constraints[slot] as CupConstraint;
      constraints[slot] = tmpC;
    }
    constraints[last] = { mode: 'sink-only' };
    cups[last] = [];
    return true;
  };

  // Gauntlet 4 helper: the tasting bowl REPLACES one originally-empty
  // vessel (total count unchanged) at the stable last slot. Returns null
  // when no empty standard slot exists.
  const placeTastingAtLastSlot = (constraints: CupConstraint[]): boolean => {
    if (tastingCupCount !== 1) return false;
    const last = cups.length - 1;
    // Candidate empty slots: truly empty STANDARD normal cups (never the
    // teapot slot, never a target slot, never an existing special).
    const emptySlots: number[] = [];
    cups.forEach((cup, idx) => {
      const cc = constraints[idx] as CupConstraint | undefined;
      if (cup.length === 0 && cc?.mode === 'normal' && !isTastingCupConstraint(cc)) {
        emptySlots.push(idx);
      }
    });
    if (emptySlots.length === 0) return false;
    if (!emptySlots.includes(last)) {
      const slot = emptySlots[Math.floor(rng() * emptySlots.length)] as number;
      const tmp = cups[last] as TeaId[];
      cups[last] = cups[slot] as TeaId[];
      cups[slot] = tmp;
      // Role swap: the moved-aside cup keeps its (plain normal) role; the
      // tasting role lands on the last slot. Tasting + targets never
      // coexist, so every swappable role here is plain normal.
      const tmpC = constraints[last] as CupConstraint;
      constraints[last] = constraints[slot] as CupConstraint;
      constraints[slot] = tmpC;
    }
    constraints[last] = { mode: 'normal', capacity: TASTING_BOWL_CAPACITY, mustEndEmpty: true };
    cups[last] = [];
    return true;
  };

  // Gauntlet 5: lemon host on a full mixed plain-standard vessel.
  // Mystery exclusion happens at the caller (host must differ from the
  // Mystery cup), so this picks among all eligible hosts for now.
  const chooseDealLemonHost = (constraints: CupConstraint[]): number | null => {
    if (floatingIngredient === undefined) return null;
    const host = selectLemonHost(
      cups,
      constraints,
      (candidates) => candidates[Math.floor(rng() * candidates.length)] ?? null,
    );
    return host;
  };

  if (sourceOnlyCount <= 0) {
    const base = defaultCupConstraints(cups.length);
    if (targetTeas.length === 0) {
      if (sinkOnlyCount > 0) {
        if (!placeSinkAtLastSlot(base)) return null;
      }
      if (tastingCupCount > 0) {
        if (!placeTastingAtLastSlot(base)) return null;
      }
      const lemonHost = chooseDealLemonHost(base);
      if (floatingIngredient !== undefined && lemonHost === null) return null;
      return { cups, cupConstraints: base, lemonHost };
    }
    const withTargets = assignTargetConstraints(
      cups,
      base,
      targetTeas,
      false,
      (candidates) => candidates[Math.floor(rng() * candidates.length)] as number,
    );
    if (!withTargets) return null;
    return { cups, cupConstraints: withTargets, lemonHost: null };
  }

  // Gauntlet 1: exactly one teapot. It replaces one ordinary filled vessel
  // (total count unchanged), starts full + mixed, and sits at index 0 for
  // stable player readability. Identity travels via cupConstraints, never
  // via contents.
  if (sourceOnlyCount !== 1) {
    // Future multi-teapot configs: not implemented yet — reject loudly so
    // callers cannot silently get a weaker contract.
    return null;
  }
  const mixedFilled: number[] = [];
  cups.forEach((cup, idx) => {
    if (cup.length > 0 && isMixedFullCup(cup)) mixedFilled.push(idx);
  });
  if (mixedFilled.length === 0) return null; // no valid teapot in this deal
  const chosen = mixedFilled[Math.floor(rng() * mixedFilled.length)] as number;
  // Move the chosen cup to index 0 (stable visual slot).
  if (chosen !== 0) {
    const tmp = cups[0] as TeaId[];
    cups[0] = cups[chosen] as TeaId[];
    cups[chosen] = tmp;
  }
  const cupConstraints = defaultCupConstraints(cups.length);
  cupConstraints[0] = { mode: 'source-only' };
  if (targetTeas.length === 0) {
    if (sinkOnlyCount > 0) {
      if (!placeSinkAtLastSlot(cupConstraints)) return null;
    }
    if (tastingCupCount > 0) {
      if (!placeTastingAtLastSlot(cupConstraints)) return null;
    }
    const lemonHost = chooseDealLemonHost(cupConstraints);
    if (floatingIngredient !== undefined && lemonHost === null) return null;
    return { cups, cupConstraints, lemonHost };
  }
  const withTargets = assignTargetConstraints(
    cups,
    cupConstraints,
    targetTeas,
    true,
    (candidates) => candidates[Math.floor(rng() * candidates.length)] as number,
  );
  if (!withTargets) return null;
  return { cups, cupConstraints: withTargets, lemonHost: null };
}

/**
 * Single production gate shared by EVERY return path (normal candidates,
 * retry fallback, safety-net scan). Returns the level only when the full
 * contract A–BE holds, otherwise null (caller rejects / moves on).
 * `floatingIngredients` defaults to all-null (lemon-free levels).
 */
function finalizeCandidate(
  req: GenerateRequest,
  cups: TeaId[][],
  hiddenCounts: number[],
  seed: string,
  cupConstraints: readonly CupConstraint[],
  stats?: GenerateStats,
  floatingIngredients?: readonly FloatingIngredientSlot[],
  strainer?: StrainerState,
  sinkingIngredients?: readonly SinkingIngredientSlot[],
  iceSlots?: readonly IceSlot[],
  capacityObstacles?: readonly CapacityObstacleSlot[],
): GeneratedLevel | null {
  const normalized: CupConstraint[] = cupConstraints.map(cloneCupConstraint);
  if (normalized.length !== cups.length) return null; // K
  if (countSourceOnly(normalized) !== requestedSourceOnlyCount(req)) return null; // L
  // M: source-only initial-state invariant.
  for (let i = 0; i < normalized.length; i++) {
    if (normalized[i]?.mode === 'source-only') {
      const cup = cups[i] as TeaId[];
      if (!cup || cup.length === 0) return null;
      if (cup.length !== STANDARD_CUP_CAPACITY) return null;
      if (!isMixedFullCup(cup)) return null;
      if ((hiddenCounts[i] ?? 0) !== 0) return null; // never hide inside teapot
      if (normalized[i]?.targetTeaId !== undefined) return null; // R
    }
  }
  // N–T: named-serving invariant.
  const wantTargets = requestedTargetTeas(req);
  const actualTargets = normalized
    .filter((c) => c.targetTeaId !== undefined)
    .map((c) => c.targetTeaId as TeaId);
  if (new Set(actualTargets).size !== actualTargets.length) return null; // O
  if (actualTargets.length !== wantTargets.length) return null; // N
  for (const t of wantTargets) {
    if (!actualTargets.includes(t)) return null; // N
  }
  const palette = req.colors.slice(0, req.numColors);
  for (const t of actualTargets) {
    if (!palette.includes(t)) return null; // P
  }
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i] as CupConstraint;
    if (c.targetTeaId !== undefined) {
      if (c.mode !== 'normal') return null; // Q
      const cup = cups[i] as TeaId[];
      if (!cup || cup.length !== STANDARD_CUP_CAPACITY) return null; // S (targets are standard vessels)
      if (isInFinalState(cup, c)) return null; // T: pre-solved target
      if ((hiddenCounts[i] ?? 0) !== 0) return null; // U: never hide in target
    }
  }
  // V–AA: sink-only guest-cup invariant.
  const wantSink = requestedSinkOnlyCount(req);
  if (countSinkOnly(normalized) !== wantSink) return null; // V
  for (let i = 0; i < normalized.length; i++) {
    if (normalized[i]?.mode === 'sink-only') {
      const cup = cups[i] as TeaId[];
      if (!cup || cup.length !== 0) return null; // W: starts empty
      if (normalized[i]?.targetTeaId !== undefined) return null; // X
      if ((hiddenCounts[i] ?? 0) !== 0) return null; // Y: never Mystery
    }
  }
  if (wantSink > 0) {
    //_sink_unsupported combos are rejected at request validation; the gate
    // re-checks defensively so no weaker path can slip through.
    if (wantTargets.length > 0) return null;
    // Z: canonical production parks the sink at the stable last slot.
    if (normalized[normalized.length - 1]?.mode !== 'sink-only') return null;
    // AA: keep at least one ordinary empty buffer beside the terminal sink.
    const ordinaryEmpty = normalized.filter(
      (c, i) => c.mode === 'normal' && (cups[i] as TeaId[]).length === 0,
    ).length;
    if (ordinaryEmpty < 1) return null;
  }
  // AB–AM: tasting-bowl invariant.
  const wantTasting = requestedTastingCupCount(req);
  if (countTastingCups(normalized) !== wantTasting) return null; // AB
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i] as CupConstraint;
    if (isTastingCupConstraint(c)) {
      if (c.mode !== 'normal') return null; // AD
      if (cupCapacity(c) !== TASTING_BOWL_CAPACITY) return null; // AE
      if (!mustEndEmpty(c)) return null; // AF
      if (c.targetTeaId !== undefined) return null; // AG
      const cup = cups[i] as TeaId[];
      if (!cup || cup.length !== 0) return null; // AH: starts empty
      if ((hiddenCounts[i] ?? 0) !== 0) return null; // AI: never Mystery
    }
    if (c.targetTeaId !== undefined) {
      // Targets are standard-capacity normal vessels; a capacity-2 or
      // must-end-empty "target" is malformed (tasting + target rejected).
      if (cupCapacity(c) !== STANDARD_CUP_CAPACITY || mustEndEmpty(c)) return null;
    }
  }
  if (wantTasting > 0) {
    if (wantTasting > 1) return null; // AC: production max one
    if (wantTargets.length > 0) return null; // AM
    if (countSinkOnly(normalized) > 0) return null; // AL
    // AJ: canonical production parks the tasting bowl at the stable last slot.
    if (!isTastingCupConstraint(normalized[normalized.length - 1])) return null;
    // AK: keep at least one ordinary STANDARD-capacity empty buffer.
    const ordinaryEmpty = normalized.filter(
      (c, i) =>
        c.mode === 'normal' &&
        !isTastingCupConstraint(c) &&
        cupCapacity(c) === STANDARD_CUP_CAPACITY &&
        (cups[i] as TeaId[]).length === 0,
    ).length;
    if (ordinaryEmpty < 1) return null;
  }
  // AN: every vessel holds at most ITS OWN capacity (tasting: 2).
  for (let i = 0; i < cups.length; i++) {
    if ((cups[i] as TeaId[]).length > cupCapacity(normalized[i])) return null;
  }
  // U: mystery cup is neither teapot, guest cup, target, nor tasting bowl.
  for (let i = 0; i < hiddenCounts.length; i++) {
    if ((hiddenCounts[i] ?? 0) > 0) {
      const c = normalized[i] as CupConstraint | undefined;
      if (!c || c.mode !== 'normal' || c.targetTeaId !== undefined) return null;
      if (isTastingCupConstraint(c)) return null;
    }
  }
  // AO–BB: floating-ingredient initial-state invariant.
  const wantIngredient = requestedFloatingIngredient(req);
  const slots: FloatingIngredientSlot[] = normalizeFloatingIngredients(
    floatingIngredients,
    cups.length,
  );
  if (slots.length !== cups.length) return null; // AO
  const presentIds = slots.filter((s): s is FloatingIngredientId => s != null);
  if (wantIngredient === undefined) {
    if (presentIds.length !== 0) return null; // AP
  } else {
    const known = (FLOATING_INGREDIENT_TYPES as Record<string, { targetTeaId: TeaId } | undefined>)[
      wantIngredient
    ];
    if (!known) return null; // AQ
    const palette = req.colors.slice(0, req.numColors);
    if (!palette.includes(known.targetTeaId)) return null; // AR
    if (presentIds.length !== 1 || presentIds[0] !== wantIngredient) return null; // AS
    const host = slots.findIndex((s) => s === wantIngredient);
    const hostCup = cups[host] as TeaId[];
    const hostC = normalized[host] as CupConstraint;
    if (!hostCup || hostCup.length === 0) return null; // AT
    if (hostCup.length !== STANDARD_CUP_CAPACITY) return null; // AU
    if (!isMixedFullCup(hostCup)) return null; // AV (mixed ⇒ not pre-solved)
    if (hostC.mode !== 'normal' || hostC.targetTeaId !== undefined) return null; // AW, AX
    if (cupCapacity(hostC) !== STANDARD_CUP_CAPACITY || mustEndEmpty(hostC)) return null; // AW
    if (isTastingCupConstraint(hostC)) return null; // AY
    if ((hiddenCounts[host] ?? 0) !== 0) return null; // AZ
    if (floatingIngredientHostSatisfied(wantIngredient, hostCup, hostC)) return null; // BA
    // BB: unsupported lemon combinations absent (also enforced loudly at
    // request validation; re-checked here so no path slips through).
    if (countSinkOnly(normalized) > 0) return null;
    if (normalized.some((c) => c.targetTeaId !== undefined)) return null;
    if (countTastingCups(normalized) > 0) return null;
  }
  // BF–BO: strainer initial-state invariant (tight G6 topologies).
  const wantStrainer = requestedHasStrainer(req);
  const strainerState: StrainerState = normalizeStrainerState(strainer);
  if (!wantStrainer) {
    if (strainerState.present) return null; // BG
  } else {
    if (!strainerState.present) return null; // BH
    if (strainerState.attachedCupIndex !== null) return null; // BI
    if (strainerState.heldTea !== null) return null; // BJ
    if (presentIds.length > 0) return null; // BO (no lemon)
    if (countSinkOnly(normalized) > 0) return null; // BO
    if (normalized.some((c) => c.targetTeaId !== undefined)) return null; // BO
    if (countTastingCups(normalized) > 0) return null; // BO
    // BK–BN: exact tight vessel counts.
    const totalCups = cups.length;
    if (requestedSourceOnlyCount(req) === 0 && !req.hasMysteryLayer) {
      if (!(req.numColors === 4 && totalCups === 5 && req.emptyCups === 1)) return null; // BL
    } else if (requestedSourceOnlyCount(req) === 0 && req.hasMysteryLayer) {
      if (!(req.numColors === 5 && totalCups === 6 && req.emptyCups === 1)) return null; // BM
    } else if (requestedSourceOnlyCount(req) === 1) {
      if (!(req.numColors === 4 && totalCups === 5 && req.emptyCups === 1)) return null; // BN
    } else {
      return null;
    }
    // Strainer levels never carry honey (production rejects the combo at
    // request validation; re-checked here so no path slips through).
    if (countSinkingIngredients({ sinkingIngredients }) > 0) return null;
  }
  // CB–CO: sinking-honey initial-state invariant.
  const wantHoney = requestedSinkingIngredient(req);
  const sinkSlots: SinkingIngredientSlot[] = normalizeSinkingIngredients(sinkingIngredients, cups.length);
  if (sinkSlots.length !== cups.length) return null; // CB
  const sinkPresent = sinkSlots.filter((s): s is SinkingIngredientId => s != null);
  if (wantHoney === undefined) {
    if (sinkPresent.length !== 0) return null;
  } else {
    const known = (SINKING_INGREDIENT_TYPES as Record<string, { targetTeaId: TeaId } | undefined>)[wantHoney];
    if (!known) return null; // CD
    const honeyPalette = req.colors.slice(0, req.numColors);
    if (!honeyPalette.includes(known.targetTeaId)) return null; // CE
    if (sinkPresent.length !== 1 || sinkPresent[0] !== wantHoney) return null; // CF
    const host = sinkSlots.findIndex((s) => s === wantHoney);
    const hostCup = cups[host] as TeaId[];
    const hostC = normalized[host] as CupConstraint;
    if (!hostCup || hostCup.length === 0) return null; // CG
    if (hostCup.length !== STANDARD_CUP_CAPACITY) return null; // CH
    if (requestedSourceOnlyCount(req) === 1) {
      if (host !== 0) return null; // CM: honey starts inside the teapot
      if (normalized[0]?.mode !== 'source-only') return null; // CM: teapot at stable index 0
      if (!isMixedFullCup(hostCup)) return null; // CN
    } else {
      if (!isMixedFullCup(hostCup)) return null; // CI (mixed ⇒ first outflow stays)
      if (hostC.mode !== 'normal' || hostC.targetTeaId !== undefined) return null; // CJ
      if (cupCapacity(hostC) !== STANDARD_CUP_CAPACITY || mustEndEmpty(hostC)) return null; // CJ
      if (isTastingCupConstraint(hostC)) return null; // CJ
    }
    if (sinkingIngredientHostSatisfied(wantHoney, hostCup, hostC)) return null; // CK
    if ((hiddenCounts[host] ?? 0) !== 0) return null; // CL
    // CO: unsupported honey combinations absent (also enforced loudly at
    // request validation; re-checked here so no path slips through).
    // Gauntlet 8 interaction (lemon + exact G8 topology) allows exactly
    // one lemon; everything else still rejects.
    const isInteraction = isLemonHoneyInteractionRequest(req);
    if (presentIds.length > 0 && !isInteraction) return null;
    if (isInteraction) {
      if (presentIds.length !== 1 || presentIds[0] !== 'lemon') return null; // CX
      if (slots.findIndex((s) => s === 'lemon') === host) return null; // CZ
    }
    if (strainerState.present) return null;
    if (countSinkOnly(normalized) > 0) return null;
    if (normalized.some((c) => c.targetTeaId !== undefined)) return null;
    if (countTastingCups(normalized) > 0) return null;
  }
  // ER–FE: frozen-cup initial-state invariant (Gauntlet 9 standalone ice).
  const wantFrozen = requestedFrozenCupCount(req);
  const ice: IceSlot[] = normalizeIceSlots(iceSlots, cups.length);
  if (ice.length !== cups.length) return null; // ET
  const icePresent = ice.filter((s): s is 'ice' => s != null);
  if (wantFrozen === 0) {
    if (icePresent.length !== 0) return null;
  } else {
    if (icePresent.length !== 1 || icePresent[0] !== 'ice') return null; // EU
    const host = ice.findIndex((s) => s === 'ice');
    const hostCup = cups[host] as TeaId[];
    const hostC = normalized[host] as CupConstraint;
    if (!hostCup || hostCup.length !== 3) return null; // EX
    if (hostC.mode !== 'normal' || hostC.targetTeaId !== undefined) return null; // EV
    if (cupCapacity(hostC) !== STANDARD_CUP_CAPACITY || mustEndEmpty(hostC)) return null; // EV/EW
    if (isTastingCupConstraint(hostC)) return null; // EV
    const first = hostCup[0] as TeaId;
    if (!hostCup.some((t) => t !== first)) return null; // EY: mixed
    if (hostCup[hostCup.length - 1] !== FROZEN_CUP_TARGET_TEA) return null; // EZ: SB on top
    if (hostCup.filter((t) => t === FROZEN_CUP_TARGET_TEA).length !== 1) return null; // FA
    // FB: exact authored layer-count multiset 4,4,4,3,1,0.
    const counts = cups.map((c) => c.length).sort((a, b) => a - b);
    if (JSON.stringify(counts) !== JSON.stringify([0, 1, 3, 4, 4, 4])) return null;
    // FD: exactly one truly empty cup.
    if (cups.filter((c) => c.length === 0).length !== 1) return null;
    if ((hiddenCounts[host] ?? 0) !== 0) return null; // never hide the frozen host
    // FE: no sibling special mechanic (also enforced loudly at validation).
    if (presentIds.length > 0) return null;
    if (sinkPresent.length > 0) return null;
    if (strainerState.present) return null;
    if (countSinkOnly(normalized) > 0) return null;
    if (normalized.some((c) => c.targetTeaId !== undefined)) return null;
    if (countTastingCups(normalized) > 0) return null;
  }
  // FM–GA: thermos initial-state invariant (Gauntlet 10 standalone cap5).
  const wantThermos = requestedThermosCupCount(req);
  if (countThermosCups(normalized) !== wantThermos) return null; // FO (FM recognized at validation)
  if (wantThermos > 1) return null; // FN: production max one
  if (wantThermos > 0) {
    const host = normalized.findIndex((c) => isThermosCupConstraint(c));
    const hostCup = cups[host] as TeaId[];
    const hostC = normalized[host] as CupConstraint;
    if (hostC.mode !== 'normal') return null; // FP
    if (cupCapacity(hostC) !== THERMOS_CAPACITY) return null; // FQ
    if (!mustEndEmpty(hostC)) return null; // FR
    if (hostC.targetTeaId !== undefined) return null; // FS
    // FT: thermos is neither source-only nor sink-only (mode normal checked above).
    if (hostCup.length !== 3) return null; // FU: selected T3 starting length
    const first = hostCup[0] as TeaId;
    if (!hostCup.some((t) => t !== first)) return null; // FV: starts mixed
    const top = hostCup[hostCup.length - 1] as TeaId;
    if (hostCup.filter((t) => t === top).length !== 1) return null; // FW: top role once
    // FX: global layer multiset 4,4,3,3,2,0.
    const counts = cups.map((c) => c.length).sort((a, b) => a - b);
    if (JSON.stringify(counts) !== JSON.stringify([0, 2, 3, 3, 4, 4])) return null;
    // FY: exactly 4 units per color (checked in validateLevelStructure; re-checked defensively).
    const unitCount = new Map<TeaId, number>();
    for (const cup of cups) for (const t of cup as TeaId[]) unitCount.set(t, (unitCount.get(t) ?? 0) + 1);
    for (const [, n] of unitCount) if (n !== TEA_UNITS_PER_COLOR) return null;
    // FZ: exactly one true empty normal vessel.
    if (cups.filter((c) => c.length === 0).length !== 1) return null;
    const emptyIdx = cups.findIndex((c) => c.length === 0);
    const emptyC = normalized[emptyIdx] as CupConstraint;
    if (emptyC.mode !== 'normal' || emptyC.targetTeaId !== undefined) return null;
    if (cupCapacity(emptyC) !== STANDARD_CUP_CAPACITY || mustEndEmpty(emptyC)) return null;
    if ((hiddenCounts[host] ?? 0) !== 0) return null; // never hide thermos
    // GA: no other special.
    if (presentIds.length > 0) return null;
    if (sinkPresent.length > 0) return null;
    if (strainerState.present) return null;
    if (countSinkOnly(normalized) > 0) return null;
    if (normalized.some((c) => c.targetTeaId !== undefined)) return null;
    if (countTastingCups(normalized) > 0) return null;
    if (icePresent.length > 0) return null;
  }
  // GI–GT: cinnamon initial-state invariant (Gauntlet 11 standalone dynamic cap).
  const wantCinnamon = requestedCinnamonCupCount(req);
  const obstacles: CapacityObstacleSlot[] = normalizeCapacityObstacles(capacityObstacles, cups.length);
  if (obstacles.filter((s) => s !== null).length !== wantCinnamon) return null; // GL (GI recognized at validation)
  if (wantCinnamon > 1) return null; // GJ: production max one
  if (wantCinnamon > 0) {
    if (obstacles.filter((s) => s === 'cinnamon').length !== 1) return null; // GL
    const host = obstacles.findIndex((s) => s === 'cinnamon');
    const hostCup = cups[host] as TeaId[];
    const hostC = normalized[host] as CupConstraint;
    if (hostC.mode !== 'normal') return null; // GM
    if (cupCapacity(hostC) !== STANDARD_CUP_CAPACITY) return null; // GN: base cap 4
    if (hostC.targetTeaId !== undefined) return null; // GM: no target
    if (hostCup.length !== 2) return null; // GO: starts length 2
    const first = hostCup[0] as TeaId;
    if (!hostCup.some((t) => t !== first)) return null; // GP: starts mixed
    // GQ: global layer multiset 4,4,3,3,2,0.
    const counts = cups.map((c) => c.length).sort((a, b) => a - b);
    if (JSON.stringify(counts) !== JSON.stringify([0, 2, 3, 3, 4, 4])) return null;
    // GR: exactly 4 units per color (checked in validateLevelStructure; re-checked defensively).
    const unitCount = new Map<TeaId, number>();
    for (const cup of cups) for (const t of cup as TeaId[]) unitCount.set(t, (unitCount.get(t) ?? 0) + 1);
    for (const [, n] of unitCount) if (n !== TEA_UNITS_PER_COLOR) return null;
    // GS: exactly one true empty normal vessel.
    if (cups.filter((c) => c.length === 0).length !== 1) return null;
    const emptyIdx = cups.findIndex((c) => c.length === 0);
    const emptyC = normalized[emptyIdx] as CupConstraint;
    if (emptyC.mode !== 'normal' || emptyC.targetTeaId !== undefined) return null;
    if (cupCapacity(emptyC) !== STANDARD_CUP_CAPACITY || mustEndEmpty(emptyC)) return null;
    if ((hiddenCounts[host] ?? 0) !== 0) return null; // never hide cinnamon host
    // GT: no other special.
    if (presentIds.length > 0) return null;
    if (sinkPresent.length > 0) return null;
    if (strainerState.present) return null;
    if (countSinkOnly(normalized) > 0) return null;
    if (normalized.some((c) => c.targetTeaId !== undefined)) return null;
    if (countTastingCups(normalized) > 0) return null;
    if (icePresent.length > 0) return null;
    if (countThermosCups(normalized) > 0) return null;
  }
  if (isWonState(cups, normalized)) return null; // D
  if (isPuzzleWonState({ cups, floatingIngredients: slots, sinkingIngredients: sinkSlots, strainer: strainerState, iceSlots: ice, capacityObstacles: obstacles }, normalized)) return null; // D (lemon/honey/strainer/ice/cinnamon-aware)
  if (!wantStrainer && wantHoney === undefined && wantFrozen === 0 && wantThermos === 0 && wantCinnamon === 0) {
    if (stats) stats.solverCalls++;
    const solved = solvePuzzle(cups, {
      maxVisited: SOLVER_BUDGET_PER_CANDIDATE,
      cupConstraints: normalized,
      floatingIngredients: slots,
    });
    if (!solved.solvable || solved.truncated) return null; // BC, BD
    if (solved.minMoves === undefined) return null; // I
    if (!depthAccepted(solved.minMoves, req.phase)) return null; // BE
    const level: GeneratedLevel = {
      cups,
      hiddenCounts,
      cupConstraints: normalized,
      floatingIngredients: slots,
      sinkingIngredients: sinkSlots,
      strainer: strainerState,
      iceSlots: ice,
      seed,
      minMoves: solved.minMoves,
      visitedStates: solved.visitedStates,
    };
    if (!validateLevelStructure(level, req).ok) return null; // A–F, K–BE
    return level;
  }
  if (wantHoney !== undefined) {
    const isInteraction = isLemonHoneyInteractionRequest(req);
    // CP–CV/DI–DR: honey production gate. Honey-alone requires stay + move
    // participation (CS–CV). Unlike the strainer rescued-necessity gate,
    // honey is an additional GOAL — no without-honey unsolvability proof is
    // required. Interaction requests require TRUE differential L2
    // participation instead (DJ–DR).
    if (stats) stats.solverCalls++;
    const honeySolved = solvePuzzle(cups, {
      maxVisited: SOLVER_BUDGET_PER_CANDIDATE,
      cupConstraints: normalized,
      floatingIngredients: slots,
      sinkingIngredients: sinkSlots,
    });
    if (!honeySolved.solvable || honeySolved.truncated) return null; // CP, CQ
    if (honeySolved.minMoves === undefined) return null;
    if (isInteraction) {
      if (
        honeySolved.minMoves < LEMON_HONEY_DEPTH_ACCEPT.min ||
        honeySolved.minMoves > LEMON_HONEY_DEPTH_ACCEPT.max
      ) {
        return null; // DI
      }
    } else if (!honeyDepthAccepted(honeySolved.minMoves, req)) {
      return null; // CR
    }
    const honeySolution = (honeySolved.solution ?? []) as SolverAction[];
    if (isInteraction) {
      const trace = analyzeIngredientInteraction(cups, slots, sinkSlots, honeySolution, normalized);
      if (trace.lemonMoves < 1) return null; // DJ
      if (trace.honeyStays < 1) return null; // DK
      if (trace.honeyMoves < 1) return null; // DL
      if (trace.cohostStates < 1) return null; // DM
      if (trace.splitEvents < 1) return null; // DN
      if (!trace.finalLemonOk) return null; // DO
      if (!trace.finalHoneyOk) return null; // DP
      if (trace.finalLemonHost === trace.finalHoneyHost) return null; // DQ
      if (!trace.win) return null; // DR
    } else {
      const honeyPart = analyzeHoneyParticipation(cups, sinkSlots, honeySolution, normalized);
      if (honeyPart.stays < 1 || honeyPart.moves < 1) return null; // CS, CT
      const honeyFinal = applySolutionState(
        { cups, floatingIngredients: slots, sinkingIngredients: sinkSlots },
        honeySolution,
        normalized,
      );
      if (!honeyFinal) return null;
      const honeyFinalHost = honeyFinal.sinkingIngredients.findIndex((s) => s === wantHoney);
      if (!sinkingIngredientHostSatisfied(wantHoney, honeyFinal.cups[honeyFinalHost] as TeaId[], normalized[honeyFinalHost])) return null; // CU
      if (!isPuzzleWonState(honeyFinal, normalized)) return null; // CV
    }
    const level: GeneratedLevel = {
      cups,
      hiddenCounts,
      cupConstraints: normalized,
      floatingIngredients: slots,
      sinkingIngredients: sinkSlots,
      strainer: strainerState,
      iceSlots: ice,
      seed,
      minMoves: honeySolved.minMoves,
      visitedStates: honeySolved.visitedStates,
    };
    if (!validateLevelStructure(level, req).ok) return null;
    return level;
  }
  // FF–FL: frozen-cup production gate (Gauntlet 9). Ice is a legality
  // gate, not a rescue tool — no without-ice unsolvability proof is
  // required (§72). The optimal replay must MELT the frozen cup, later
  // SOURCE from it, clear the ice and win (L2).
  if (wantFrozen > 0) {
    if (stats) stats.solverCalls++;
    const iceSolved = solvePuzzle(cups, {
      maxVisited: SOLVER_BUDGET_PER_CANDIDATE,
      cupConstraints: normalized,
      floatingIngredients: slots,
      iceSlots: ice,
    });
    if (!iceSolved.solvable || iceSolved.truncated) return null; // FF, FG
    if (iceSolved.minMoves === undefined) return null;
    if (
      iceSolved.minMoves < FROZEN_CUP_DEPTH_ACCEPT.min ||
      iceSolved.minMoves > FROZEN_CUP_DEPTH_ACCEPT.max
    ) {
      return null; // FH
    }
    const frozenHost = ice.findIndex((s) => s === 'ice');
    const iceSolution = (iceSolved.solution ?? []) as SolverAction[];
    const part = analyzeIceParticipation(cups, ice, frozenHost, iceSolution, normalized);
    if (part.melts < 1) return null; // FI
    if (part.sourceUses < 1) return null; // FJ
    if (!part.finalIceCleared) return null; // FK
    if (!part.win) return null; // FL
    const level: GeneratedLevel = {
      cups,
      hiddenCounts,
      cupConstraints: normalized,
      floatingIngredients: slots,
      sinkingIngredients: sinkSlots,
      strainer: strainerState,
      iceSlots: ice,
      seed,
      minMoves: iceSolved.minMoves,
      visitedStates: iceSolved.visitedStates,
    };
    if (!validateLevelStructure(level, req).ok) return null;
    return level;
  }
  // GB–GG: thermos production gate (Gauntlet 10). Capacity-5 is workspace,
  // not rescue — no cap4 comparison at runtime (§74: L3 is offline curation
  // truth). The optimal replay must REACH 5/5, later DRAIN, empty fully
  // and win (L2). Happy path is exactly 1 solve (§75).
  if (wantThermos > 0) {
    if (stats) stats.solverCalls++;
    const thermosSolved = solvePuzzle(cups, {
      maxVisited: SOLVER_BUDGET_PER_CANDIDATE,
      cupConstraints: normalized,
      floatingIngredients: slots,
    });
    if (!thermosSolved.solvable || thermosSolved.truncated) return null; // GB, GC
    if (thermosSolved.minMoves === undefined) return null;
    if (
      thermosSolved.minMoves < THERMOS_DEPTH_ACCEPT.min ||
      thermosSolved.minMoves > THERMOS_DEPTH_ACCEPT.max
    ) {
      return null; // GD
    }
    const thermosHost = normalized.findIndex((c) => isThermosCupConstraint(c));
    const thermosSolution = (thermosSolved.solution ?? []) as SolverAction[];
    const tpart = analyzeThermosParticipation(cups, thermosHost, thermosSolution, normalized);
    if (tpart.fifthSlotUses < 1) return null; // GE
    if (tpart.drainsAfterFifth < 1) return null; // GF
    if (!tpart.finalThermosEmpty) return null; // GG
    if (!tpart.win) return null; // GH
    const level: GeneratedLevel = {
      cups,
      hiddenCounts,
      cupConstraints: normalized,
      floatingIngredients: slots,
      sinkingIngredients: sinkSlots,
      strainer: strainerState,
      iceSlots: ice,
      seed,
      minMoves: thermosSolved.minMoves,
      visitedStates: thermosSolved.visitedStates,
    };
    if (!validateLevelStructure(level, req).ok) return null;
    return level;
  }
  // GU–HA: cinnamon production gate (Gauntlet 11). The obstacle is
  // friction/unlock, not rescue — no plain-control comparison at runtime
  // (§111: L3 is offline curation truth). The optimal replay must UNLOCK
  // the host, later reach >=3 there (EXPANDED_USE), clear the obstacle
  // and win (L2). Happy path is exactly 1 solve (§111).
  if (wantCinnamon > 0) {
    if (stats) stats.solverCalls++;
    const cinnamonSolved = solvePuzzle(cups, {
      maxVisited: SOLVER_BUDGET_PER_CANDIDATE,
      cupConstraints: normalized,
      floatingIngredients: slots,
      capacityObstacles: obstacles,
    });
    if (!cinnamonSolved.solvable || cinnamonSolved.truncated) return null; // GU, GV
    if (cinnamonSolved.minMoves === undefined) return null;
    if (
      cinnamonSolved.minMoves < CINNAMON_DEPTH_ACCEPT.min ||
      cinnamonSolved.minMoves > CINNAMON_DEPTH_ACCEPT.max
    ) {
      return null; // GW
    }
    const cinnamonHost = obstacles.findIndex((s) => s === 'cinnamon');
    const cinnamonSolution = (cinnamonSolved.solution ?? []) as SolverAction[];
    const cpart = analyzeCinnamonParticipation(cups, obstacles, cinnamonHost, cinnamonSolution, normalized);
    if (cpart.unlocks < 1) return null; // GX
    if (cpart.firstExpandedUseDepth === null) return null; // GY
    if (!cpart.finalObstacleCleared) return null; // GZ
    if (!cpart.win) return null; // HA
    const level: GeneratedLevel = {
      cups,
      hiddenCounts,
      cupConstraints: normalized,
      floatingIngredients: slots,
      sinkingIngredients: sinkSlots,
      strainer: strainerState,
      iceSlots: ice,
      capacityObstacles: obstacles,
      seed,
      minMoves: cinnamonSolved.minMoves,
      visitedStates: cinnamonSolved.visitedStates,
    };
    if (!validateLevelStructure(level, req).ok) return null;
    return level;
  }
  // BP–CA: strainer production gate (rescued necessity standard).
  if (stats) stats.solverCalls++;
  const solved = solvePuzzle(cups, {
    maxVisited: SOLVER_BUDGET_PER_CANDIDATE,
    cupConstraints: normalized,
    floatingIngredients: slots,
    strainer: strainerState,
  });
  if (!solved.solvable || solved.truncated) return null; // BP, BQ
  if (solved.minMoves === undefined) return null;
  if (!strainerDepthAccepted(solved.minMoves, req)) return null; // BR
  // BS: WITHOUT-tool proof must be NON-TRUNCATED UNSOLVABLE (necessity).
  if (stats) stats.solverCalls++;
  const wo = solvePuzzle(cups, {
    maxVisited: SOLVER_BUDGET_PER_CANDIDATE,
    cupConstraints: normalized,
    floatingIngredients: slots,
  });
  if (wo.solvable || wo.truncated) return null; // BS
  // BT–BZ: optimal path must contain free placement + meaningful catch (m>=2)
  // with correct dest inflow (m-1), correct held layer, eventual release,
  // final hold null.
  const solution = (solved.solution ?? []) as SolverAction[];
  if (!solution.some((a) => a.kind === 'place-strainer')) return null; // BT
  let rcups = cups.map((c) => [...c]);
  let rslots = [...slots];
  let rstrainer = normalizeStrainerState(strainerState);
  let sawCatch = false;
  let sawRelease = false;
  for (const a of solution) {
    const res = applyPuzzleActionState({ cups: rcups, floatingIngredients: rslots, strainer: rstrainer }, a, normalized);
    if (!res) return null;
    if (a.kind === 'pour' && res.strained === true) {
      if ((res.transferred ?? 0) < 2) return null; // BV
      if (res.received !== (res.transferred as number) - 1) return null; // BW
      if (res.caughtTea === undefined || res.layer !== res.caughtTea) return null; // BX
      if ((rstrainer as StrainerState).heldTea !== null) return null;
      sawCatch = true; // BU
    }
    if (a.kind === 'release-strainer') sawRelease = true; // BY
    rcups = res.state.cups;
    rslots = res.state.floatingIngredients;
    rstrainer = res.state.strainer;
  }
  if (!sawCatch || !sawRelease) return null; // BU, BY
  if (rstrainer.heldTea !== null) return null; // BZ
  if (!isPuzzleWonState({ cups: rcups, floatingIngredients: rslots, strainer: rstrainer }, normalized)) return null; // CA
  const level: GeneratedLevel = {
    cups,
    hiddenCounts,
    cupConstraints: normalized,
    floatingIngredients: slots,
    sinkingIngredients: sinkSlots,
    strainer: strainerState,
    iceSlots: ice,
    seed,
    minMoves: solved.minMoves,
    visitedStates: solved.visitedStates,
  };
  if (!validateLevelStructure(level, req).ok) return null;
  return level;
}

/** Honey-specific depth acceptance (measured G7 bands; globals untouched). */
function honeyDepthAccepted(depth: number, req: GenerateRequest): boolean {
  const kind = honeyTemplateKindFor(req);
  if (!kind) {
    // Non-canonical honey requests: fall back to the phase band so
    // exotic configs stay bounded (canonical kinds use measured bands).
    return depthAccepted(depth, req.phase);
  }
  const band = HONEY_DEPTH_ACCEPT[kind];
  return depth >= band.min && depth <= band.max;
}

/** Strainer-specific depth acceptance (measured G6 bands; globals untouched). */
function strainerDepthAccepted(depth: number, req: GenerateRequest): boolean {
  const kind = strainerTemplateKindFor(req);
  if (!kind) {
    // Non-canonical strainer requests: fall back to the phase band so
    // exotic configs stay bounded (canonical kinds use measured bands).
    return depthAccepted(depth, req.phase);
  }
  const band = STRAINER_DEPTH_ACCEPT[kind];
  return depth >= band.min && depth <= band.max;
}

/**
 * Deterministic fallback layouts, verified in-band by real solver runs:
 *
 * - 3 colors (warmup/relax, band 3–9): asymmetric pair + single swap.
 *   Measured depth 5, mystery-capable ([c1,c0,c0,c0] bottom differs).
 * - 4 colors (challenge, band 5–13): asymmetric pair + single swap.
 *   Measured depth 6, mystery-capable.
 * - 5 colors (peak, band 8–18): full rotation, measured depth 16,
 *   mystery-capable.
 * - other color counts: generic rotation (then the safety-net scan).
 *
 * Source-only fallbacks (Gauntlet 1) are palette-parameterized shapes
 * with the teapot at index 0 (full + mixed, solves to empty); see
 * `primarySourceOnlyFallbackCups`. Every shape below passes through
 * `finalizeCandidate`, so only genuinely in-band layouts are returned.
 *
 * Layouts are parameterized by the request palette so any cycle palette
 * works; color counts are preserved by construction (pure permutation of
 * the 4-units-per-color pool).
 */
function primaryFallbackCups(req: GenerateRequest): TeaId[][] {
  const [c0, c1, c2, c3, c4] = req.colors as (TeaId | undefined)[];
  const n = req.numColors;
  const cups: TeaId[][] = [];
  if (n === 3 && c0 !== undefined && c1 !== undefined && c2 !== undefined) {
    cups.push([c1, c0, c0, c0], [c0, c1, c1, c2], [c2, c2, c2, c1]);
  } else if (n === 4 && c0 !== undefined && c1 !== undefined && c2 !== undefined && c3 !== undefined) {
    cups.push([c1, c0, c0, c0], [c0, c1, c1, c1], [c2, c2, c2, c3], [c3, c3, c3, c2]);
  } else if (n === 5 && c0 !== undefined && c1 !== undefined && c2 !== undefined && c3 !== undefined && c4 !== undefined) {
    const p = [c0, c1, c2, c3, c4];
    for (let i = 0; i < 5; i++) {
      cups.push([p[i] as TeaId, p[(i + 1) % 5] as TeaId, p[(i + 2) % 5] as TeaId, p[(i + 3) % 5] as TeaId]);
    }
  } else {
    return rotationCups(req);
  }
  for (let e = 0; e < req.emptyCups; e++) cups.push([]);
  return cups;
}

/**
 * Source-only fallback shapes (teapot at index 0, full + mixed).
 * Palette-parameterized; color counts preserved by construction.
 *
 * - 4 colors / challenge: teapot [c1,c0,c2,c3]-style mixed head over a
 *   near-uniform base, plus an asymmetric pair + swap among normals.
 *   Solver depth is verified at runtime via finalizeCandidate (never faked).
 * - 5 colors / peak: mixed teapot + full rotation among normals.
 */
function primarySourceOnlyFallbackCups(req: GenerateRequest): TeaId[][] | null {
  const [c0, c1, c2, c3, c4] = req.colors as (TeaId | undefined)[];
  const n = req.numColors;
  const cups: TeaId[][] = [];
  if (n === 4 && c0 !== undefined && c1 !== undefined && c2 !== undefined && c3 !== undefined) {
    // Teapot: mixed, full, bottom differs for readability.
    cups.push([c1, c2, c0, c3]);
    // Normals: asymmetric pair + single swap (challenge-flavored).
    cups.push([c0, c0, c0, c1]);
    cups.push([c1, c1, c2, c2]);
    cups.push([c3, c3, c3, c2]);
    // Note: color counts — verify: c0: teapot1 + 3 = 4 ✓; c1: teapot0? no:
    // teapot has c1×1, normals: cup1 c1×1, cup2 c1×2 → total 4 ✓;
    // c2: teapot1 + cup2×2 + cup3×1 = 4 ✓; c3: teapot1 + cup3×3 = 4 ✓.
  } else if (
    n === 5 &&
    c0 !== undefined &&
    c1 !== undefined &&
    c2 !== undefined &&
    c3 !== undefined &&
    c4 !== undefined
  ) {
    // Verified shape C1: teapot mixed full, depth 10 (peak target 10–14),
    // mystery-capable at normals[1] ([c4,c1,c1,c1] bottom differs).
    // Counts: c0: teapot1+3=4; c1: teapot1+3=4; c2: teapot1+2+1=4;
    // c3: teapot1+2+1=4; c4: 1+1+2=4. Gate re-verifies at runtime.
    cups.push([c1, c2, c0, c3]);
    cups.push([c0, c0, c0, c4]);
    cups.push([c4, c1, c1, c1]);
    cups.push([c2, c2, c3, c3]);
    cups.push([c4, c4, c2, c3]);
  } else {
    return null;
  }
  for (let e = 0; e < req.emptyCups; e++) cups.push([]);
  return cups;
}

/** Generic rotation layout for any color count (parity fallback shape). */
function rotationCups(req: GenerateRequest): TeaId[][] {
  const palette = req.colors.slice(0, req.numColors);
  const n = palette.length;
  const cups: TeaId[][] = [];
  for (let i = 0; i < n; i++) {
    const cup: TeaId[] = [];
    for (let k = 0; k < TEA_UNITS_PER_COLOR; k++) {
      cup.push(palette[(i + k) % n] as TeaId);
    }
    cups.push(cup);
  }
  for (let e = 0; e < req.emptyCups; e++) cups.push([]);
  return cups;
}

/** Source-only rotation: teapot at 0, rotation among the rest. */
function sourceOnlyRotationCups(req: GenerateRequest): TeaId[][] {
  const cups = rotationCups({ ...req, sourceOnlyCount: 0 });
  // First filled cup becomes the teapot (rotation cups are all full;
  // mixed unless numColors === 1, which never happens in production).
  return cups;
}

/**
 * Dedicated named-serving fallback shapes (Gauntlet 2), written relative
 * to the requested target teas (t0/t1) and the remaining palette (o…).
 * Solver depth is invariant under tea renaming, so one measured depth
 * holds for ANY palette requesting two targets:
 * - 4c challenge, 2 targets, no teapot → depth 10 (band 5–13, target 7–10).
 * - 4c challenge, teapot + 2 targets → depth 10.
 * - 5c peak, 2 targets, no teapot → depth 11 (band 8–18, target 10–14),
 *   mystery-capable at cup 2 ([o0,o1,o1,o1] bottom always differs).
 * Targets sit in stable slots (0,1 without teapot; 1,2 with teapot);
 * every target starts full + mixed (never pre-solved). The production
 * gate re-verifies everything at runtime — these are candidates, not
 * trusted layouts.
 */
function primaryTargetFallback(
  req: GenerateRequest,
): { cups: TeaId[][]; constraints: CupConstraint[] } | null {
  const wantTargets = requestedTargetTeas(req);
  if (wantTargets.length !== 2) return null;
  const [t0, t1] = wantTargets as [TeaId, TeaId];
  const palette = req.colors.slice(0, req.numColors);
  const others = palette.filter((c) => c !== t0 && c !== t1);
  const wantTeapot = requestedSourceOnlyCount(req) > 0;
  const plain = (): CupConstraint => ({ mode: 'normal' });
  const target = (tea: TeaId): CupConstraint => ({ mode: 'normal', targetTeaId: tea });

  if (req.numColors === 4 && others.length === 2 && !wantTeapot && !req.hasMysteryLayer) {
    const [o0, o1] = others as [TeaId, TeaId];
    return {
      cups: [
        [t0, o0, o1, t1],
        [t1, o0, o0, t0],
        [o1, o1, t0, t0],
        [t1, t1, o0, o1],
        [],
        [],
      ],
      constraints: [target(t0), target(t1), plain(), plain(), plain(), plain()],
    };
  }
  if (req.numColors === 4 && others.length === 2 && wantTeapot && !req.hasMysteryLayer) {
    const [o0, o1] = others as [TeaId, TeaId];
    return {
      cups: [
        [t0, o0, t1, o1],
        [t0, t1, t1, o0],
        [t1, o0, o0, o1],
        [t0, t0, o1, o1],
        [],
        [],
      ],
      constraints: [
        { mode: 'source-only' },
        target(t0),
        target(t1),
        plain(),
        plain(),
        plain(),
      ],
    };
  }
  if (req.numColors === 5 && others.length === 3 && !wantTeapot && req.hasMysteryLayer) {
    const [o0, o1, o2] = others as [TeaId, TeaId, TeaId];
    return {
      cups: [
        [t0, o2, o0, o1],
        [t1, o0, o0, t0],
        [o0, o1, o1, o1],
        [o2, o2, t1, t1],
        [t0, t0, o2, t1],
        [],
        [],
      ],
      constraints: [target(t0), target(t1), plain(), plain(), plain(), plain(), plain()],
    };
  }
  return null;
}

/**
 * Dedicated sink-only fallback shapes (Gauntlet 3), palette-parameterized.
 * The guest cup sits EMPTY at the stable last slot with one ordinary
 * empty spare; color counts are preserved by construction (pure
 * permutation of the 4-units-per-color pool). Every shape passes through
 * `finalizeCandidate`, so only genuinely in-band layouts are returned —
 * these are candidates, not trusted layouts.
 */
function primarySinkFallback(
  req: GenerateRequest,
): { cups: TeaId[][]; constraints: CupConstraint[] } | null {
  const wantSink = requestedSinkOnlyCount(req);
  if (wantSink !== 1) return null;
  if (requestedTargetTeas(req).length > 0) return null;
  const wantTeapot = requestedSourceOnlyCount(req) > 0;
  const [c0, c1, c2, c3, c4] = req.colors as (TeaId | undefined)[];
  const plain = (): CupConstraint => ({ mode: 'normal' });
  const sink: CupConstraint = { mode: 'sink-only' };

  if (req.numColors === 4 && !wantTeapot && !req.hasMysteryLayer && req.emptyCups === 2 &&
      c0 !== undefined && c1 !== undefined && c2 !== undefined && c3 !== undefined) {
    // Sink challenge: asymmetric pair + single swap among normals; the
    // solver routes one finished tea into the terminal guest cup.
    return {
      cups: [
        [c1, c0, c0, c0],
        [c0, c1, c1, c1],
        [c2, c2, c2, c3],
        [c3, c3, c3, c2],
        [],
        [],
      ],
      constraints: [plain(), plain(), plain(), plain(), plain(), sink],
    };
  }
  if (req.numColors === 4 && wantTeapot && !req.hasMysteryLayer && req.emptyCups === 2 &&
      c0 !== undefined && c1 !== undefined && c2 !== undefined && c3 !== undefined) {
    // Teapot + sink: mixed teapot at 0, asymmetric normals, guest last.
    return {
      cups: [
        [c1, c2, c0, c3],
        [c0, c0, c0, c1],
        [c1, c1, c2, c2],
        [c3, c3, c3, c2],
        [],
        [],
      ],
      constraints: [{ mode: 'source-only' }, plain(), plain(), plain(), plain(), sink],
    };
  }
  if (req.numColors === 5 && !wantTeapot && req.hasMysteryLayer && req.emptyCups === 2 &&
      c0 !== undefined && c1 !== undefined && c2 !== undefined && c3 !== undefined && c4 !== undefined) {
    // Sink + mystery peak: full rotation among normals, guest last.
    // Mystery-capable at cup 0 ([c0,c1,c2,c3] bottom differs from above).
    return {
      cups: [
        [c0, c1, c2, c3],
        [c1, c2, c3, c4],
        [c2, c3, c4, c0],
        [c3, c4, c0, c1],
        [c4, c0, c1, c2],
        [],
        [],
      ],
      constraints: [plain(), plain(), plain(), plain(), plain(), plain(), sink],
    };
  }
  return null;
}

/** Generic sink rotation: rotation among filled + teapot, guest cup last. */
function sinkRotationCups(req: GenerateRequest): TeaId[][] {
  const cups = rotationCups({ ...req, sourceOnlyCount: 0 });
  return cups;
}

/**
 * Pinned tasting-bowl fallback topology per canonical kind (Gauntlet 4.1).
 * Each pin is a committed bank template whose optimal production solution
 * demonstrably ENTERS the tasting bowl and later EXITS it (verified
 * offline; asserted by the direct fallback tests) — the fallback ladder
 * honors the same participation contract as the template bank.
 */
const TASTING_FALLBACK_TEMPLATE_ID: Record<TastingTemplateKind, string> = {
  'tasting-challenge': 'tasting-challenge-9-10002',
  'tasting-mystery-peak': 'tasting-mystery-peak-12-2',
  'teapot-tasting-challenge': 'teapot-tasting-challenge-9-31',
};

/**
 * Dedicated tasting-bowl fallback (Gauntlet 4.1): instantiate the pinned
 * bank topology with the identity role mapping (c_i → palette[i], a
 * bijection), so the recorded depth holds EXACTLY for any production
 * palette. The bowl sits EMPTY (capacity 2, must-end-empty) at the stable
 * last slot with one ordinary standard empty spare; color counts are
 * preserved by construction. Passes through `finalizeCandidate` like any
 * other candidate — never trusted blindly.
 */
function primaryTastingFallback(
  req: GenerateRequest,
): { cups: TeaId[][]; constraints: CupConstraint[] } | null {
  if (requestedTastingCupCount(req) !== 1) return null;
  if (requestedTargetTeas(req).length > 0) return null;
  if (requestedSinkOnlyCount(req) > 0) return null;
  const kind = tastingTemplateKindFor(req);
  if (!kind) return null;
  const tpl = TASTING_TEMPLATE_BANK[kind].find((t) => t.id === TASTING_FALLBACK_TEMPLATE_ID[kind]);
  if (!tpl) return null;
  const palette = req.colors.slice(0, req.numColors);
  if (palette.length !== req.numColors || palette.some((c) => c === undefined)) return null;
  const inst = instantiateTastingTemplate(tpl, palette, [...palette]);
  const constraints = defaultCupConstraints(inst.cups.length);
  if (inst.teapotSlot !== null) constraints[inst.teapotSlot] = { mode: 'source-only' };
  constraints[inst.tastingSlot] = {
    mode: 'normal',
    capacity: TASTING_BOWL_CAPACITY,
    mustEndEmpty: true,
  };
  return { cups: inst.cups, constraints };
}

/** Generic tasting rotation: rotation among filled + teapot, bowl last. */
function tastingRotationCups(req: GenerateRequest): TeaId[][] {
  const cups = rotationCups({ ...req, sourceOnlyCount: 0 });
  return cups;
}

/**
 * Dedicated lemon fallback (Gauntlet 5 §49): pinned participating bank
 * topology per kind (established Gauntlet 4.1 pattern). Instantiated with
 * a fixed role mapping (c0 → sea_buckthorn, others in palette order), so
 * the recorded depth holds for any production palette. Passes through
 * `finalizeCandidate` — never trusted blindly. Until the bank lands this
 * returns null and the rotation/scan shapes below cover.
 */
const LEMON_FALLBACK_TEMPLATE_ID: Record<LemonTemplateKind, string> = {
  'lemon-challenge': 'lemon-challenge-9-1023',
  'lemon-mystery-peak': 'lemon-mystery-peak-13-3',
  'teapot-lemon-challenge': 'teapot-lemon-challenge-10-22',
};

function primaryLemonFallback(
  req: GenerateRequest,
): { cups: TeaId[][]; constraints: CupConstraint[]; lemonHost: number } | null {
  if (requestedFloatingIngredient(req) === undefined) return null;
  const kind = lemonTemplateKindFor(req);
  if (!kind) return null;
  const wanted = LEMON_FALLBACK_TEMPLATE_ID[kind];
  if (!wanted) return null;
  const tpl = LEMON_TEMPLATE_BANK[kind].find((t) => t.id === wanted);
  if (!tpl) return null;
  const palette = req.colors.slice(0, req.numColors);
  if (palette.length !== req.numColors || palette.some((c) => c === undefined)) return null;
  if (!palette.includes(LEMON_TARGET_TEA)) return null;
  const others = palette.filter((t) => t !== LEMON_TARGET_TEA);
  const inst = instantiateLemonTemplate(tpl, palette, [...others]);
  const constraints = defaultCupConstraints(inst.cups.length);
  if (inst.teapotSlot !== null) constraints[inst.teapotSlot] = { mode: 'source-only' };
  return { cups: inst.cups, constraints, lemonHost: inst.lemonHost };
}

/**
 * Generic lemon rotation shape: rotation cups among filled vessels with
 * the lemon on the first eligible (full mixed plain-standard) host.
 * Deterministic backup behind the pinned topology.
 */
function lemonRotationEntry(
  req: GenerateRequest,
): { cups: TeaId[][]; constraints: CupConstraint[]; lemonHost: number } | null {
  const wantSourceOnly = requestedSourceOnlyCount(req);
  const cups = rotationCups({ ...req, sourceOnlyCount: 0 });
  const constraints = constraintsForShape(cups.length, wantSourceOnly);
  const host = selectLemonHost(cups, constraints, (candidates) => candidates[0] ?? null);
  if (host === null) return null;
  return { cups, constraints, lemonHost: host };
}

function constraintsForShape(
  totalCups: number,
  sourceOnlyCount: number,
  sinkOnlyCount = 0,
  tastingCupCount = 0,
): CupConstraint[] {
  const out = defaultCupConstraints(totalCups);
  for (let i = 0; i < sourceOnlyCount && i < totalCups; i++) {
    out[i] = { mode: 'source-only' };
  }
  if (sinkOnlyCount > 0 && totalCups > 0) {
    out[totalCups - 1] = { mode: 'sink-only' };
  }
  if (tastingCupCount > 0 && totalCups > 0) {
    out[totalCups - 1] = {
      mode: 'normal',
      capacity: TASTING_BOWL_CAPACITY,
      mustEndEmpty: true,
    };
  }
  return out;
}

/**
 * Phase-aware deterministic fallback. Tries, in order:
 *   1. primary phase layout (1 solve),
 *   2. generic rotation layout (1 solve),
 *   3. bounded seeded safety-net scan (<= FALLBACK_SCAN_ATTEMPTS solves).
 * For source-only requests, source-only variants are tried first under
 * the same ordering. Every attempt passes through finalizeCandidate, so
 * the returned level always satisfies the full contract — including the
 * mystery invariant (never "force hides" an invalid or teapot cup) and
 * the acceptance band (minMoves is the REAL solver result, never faked).
 * Throws loudly if nothing validates: that is a programming error, and
 * lying about difficulty is worse than failing fast in dev/tests.
 */
/**
 * Pinned strong strainer fallback topology per kind (drawn from the curated
 * rescued pool): plain 13 (lowest visited), peak 16 (lowest visited),
 * teapot 12. Instantiated with the identity role mapping so recorded
 * depths hold exactly. Passes through `finalizeCandidate` — never trusted
 * blindly.
 */
const STRAINER_FALLBACK_TEMPLATE_ID: Record<StrainerTemplateKind, string> = {
  'strainer-challenge': 'strainer-challenge-13-519',
  'strainer-mystery-peak': 'strainer-mystery-peak-16-406',
  'teapot-strainer-challenge': 'teapot-strainer-challenge-12-416',
};

function primaryStrainerFallback(
  req: GenerateRequest,
): { cups: TeaId[][]; constraints: CupConstraint[] } | null {
  if (!requestedHasStrainer(req)) return null;
  const kind = strainerTemplateKindFor(req);
  if (!kind) return null;
  const tpl = STRAINER_TEMPLATE_BANK[kind].find((t) => t.id === STRAINER_FALLBACK_TEMPLATE_ID[kind]);
  if (!tpl) return null;
  const palette = req.colors.slice(0, req.numColors);
  if (palette.length !== req.numColors) return null;
  const inst = instantiateStrainerTemplate(tpl, palette, [...palette]);
  const constraints = defaultCupConstraints(inst.cups.length);
  if (inst.teapotSlot !== null) constraints[inst.teapotSlot] = { mode: 'source-only' };
  return { cups: inst.cups, constraints };
}

/**
 * Pinned strong honey fallback topology per kind (drawn from the curated
 * rescued pool, sweet-spot depths): plain 12, peak 16, teapot 12.
 * Instantiated with the identity role mapping (c0 → buckwheat) so recorded
 * depths hold exactly. Passes through `finalizeCandidate` — never trusted
 * blindly.
 */
const HONEY_FALLBACK_TEMPLATE_ID: Record<HoneyTemplateKind, string> = {
  'honey-challenge': 'honey-challenge-12-27',
  'honey-mystery-peak': 'honey-mystery-peak-16-292',
  'teapot-honey-challenge': 'teapot-honey-challenge-12-178',
};

function primaryHoneyFallback(
  req: GenerateRequest,
): { cups: TeaId[][]; constraints: CupConstraint[]; honeyHost: number } | null {
  if (requestedSinkingIngredient(req) === undefined) return null;
  const kind = honeyTemplateKindFor(req);
  if (!kind) return null;
  const tpl = HONEY_TEMPLATE_BANK[kind].find((t) => t.id === HONEY_FALLBACK_TEMPLATE_ID[kind]);
  if (!tpl) return null;
  const palette = req.colors.slice(0, req.numColors);
  if (palette.length !== req.numColors || palette.some((c) => c === undefined)) return null;
  if (!palette.includes(HONEY_TARGET_TEA)) return null;
  const others = palette.filter((t) => t !== HONEY_TARGET_TEA);
  const inst = instantiateHoneyTemplate(tpl, palette, [...others]);
  const constraints = defaultCupConstraints(inst.cups.length);
  if (inst.teapotSlot !== null) constraints[inst.teapotSlot] = { mode: 'source-only' };
  return { cups: inst.cups, constraints, honeyHost: inst.honeyHost };
}

/**
 * Generic honey rotation shape: rotation cups among filled vessels with
 * honey on the first eligible (full mixed plain-standard) host, or the
 * teapot itself for teapot requests. Deterministic backup behind the
 * pinned topology.
 */
function honeyRotationEntry(
  req: GenerateRequest,
): { cups: TeaId[][]; constraints: CupConstraint[]; honeyHost: number } | null {
  const wantSourceOnly = requestedSourceOnlyCount(req);
  const cups = rotationCups({ ...req, sourceOnlyCount: 0 });
  const constraints = constraintsForShape(cups.length, wantSourceOnly);
  if (wantSourceOnly > 0) {
    if (cups[0] === undefined || !isMixedFullCup(cups[0] as TeaId[])) return null;
    return { cups, constraints, honeyHost: 0 };
  }
  const host = selectHoneyHost(cups, constraints, (candidates) => candidates[0] ?? null);
  if (host === null) return null;
  return { cups, constraints, honeyHost: host };
}

/**
 * Pinned strong L2 interaction fallback (depth 11, clear split at 5/11,
 * joint move present): instantiated with the identity c2/c3 order so the
 * recorded depth holds exactly. Passes through `finalizeCandidate` —
 * never trusted blindly.
 */
const LEMON_HONEY_FALLBACK_TEMPLATE_ID = 'lemon-honey-11-9326';

function primaryLemonHoneyFallback(
  req: GenerateRequest,
): { cups: TeaId[][]; constraints: CupConstraint[]; lemonHost: number; honeyHost: number } | null {
  if (!isLemonHoneyInteractionRequest(req)) return null;
  const kind = lemonHoneyTemplateKindFor(req);
  if (!kind) return null;
  const tpl = LEMON_HONEY_TEMPLATE_BANK[kind].find((t) => t.id === LEMON_HONEY_FALLBACK_TEMPLATE_ID);
  if (!tpl) return null;
  const palette = req.colors.slice(0, req.numColors);
  if (palette.length !== req.numColors) return null;
  if (!palette.includes(LEMON_HONEY_TARGET_TEAS.honey) || !palette.includes(LEMON_HONEY_TARGET_TEAS.lemon)) {
    return null;
  }
  const others = palette.filter(
    (t) => t !== LEMON_HONEY_TARGET_TEAS.honey && t !== LEMON_HONEY_TARGET_TEAS.lemon,
  );
  if (others.length < 2) return null;
  const inst = instantiateLemonHoneyTemplate(tpl, palette, [others[0] as TeaId, others[1] as TeaId]);
  const constraints = defaultCupConstraints(inst.cups.length);
  return { cups: inst.cups, constraints, lemonHost: inst.lemonHost, honeyHost: inst.honeyHost };
}

/**
 * Generic interaction rotation shape: rotation cups with lemon on the
 * first and honey on the second eligible mixed-full vessel. Deterministic
 * backup behind the pinned topology.
 */
function lemonHoneyRotationEntry(
  req: GenerateRequest,
): { cups: TeaId[][]; constraints: CupConstraint[]; lemonHost: number; honeyHost: number } | null {
  if (!isLemonHoneyInteractionRequest(req)) return null;
  const cups = rotationCups({ ...req, sourceOnlyCount: 0 });
  const constraints = constraintsForShape(cups.length, 0);
  const eligible: number[] = [];
  cups.forEach((cup, idx) => {
    if (cup.length === STANDARD_CUP_CAPACITY && isMixedFullCup(cup)) eligible.push(idx);
  });
  if (eligible.length < 2) return null;
  return { cups, constraints, lemonHost: eligible[0] as number, honeyHost: eligible[1] as number };
}

/**
 * Pinned strong frozen-cup fallback topology (depth 11, delayed melt):
 * instantiated with the identity role mapping (c0 → sea_buckthorn,
 * c1/c2/c3 in palette order — a full isomorphism), so the recorded depth
 * holds exactly. Passes through `finalizeCandidate` — never trusted
 * blindly. Backup pins cover the (near-impossible) miss.
 */
const FROZEN_CUP_FALLBACK_TEMPLATE_ID = 'frozen-cup-11-2165';
const FROZEN_CUP_FALLBACK_BACKUP_IDS = ['frozen-cup-10-1215', 'frozen-cup-12-4714'];

function frozenCupFallbackEntries(
  req: GenerateRequest,
): Array<{ cups: TeaId[][]; constraints: CupConstraint[]; frozenHost: number }> {
  if (frozenCupTemplateKindFor(req) === null) return [];
  const kind = frozenCupTemplateKindFor(req) as FrozenCupTemplateKind;
  const palette = req.colors.slice(0, req.numColors);
  if (palette.length !== req.numColors || palette.some((c) => c === undefined)) return [];
  if (!palette.includes(FROZEN_CUP_TARGET_TEA)) return [];
  const out: Array<{ cups: TeaId[][]; constraints: CupConstraint[]; frozenHost: number }> = [];
  for (const id of [FROZEN_CUP_FALLBACK_TEMPLATE_ID, ...FROZEN_CUP_FALLBACK_BACKUP_IDS]) {
    const tpl = FROZEN_CUP_TEMPLATE_BANK[kind].find((t) => t.id === id);
    if (!tpl) continue;
    const inst = instantiateFrozenCupTemplate(tpl, palette);
    out.push({ cups: inst.cups, constraints: defaultCupConstraints(inst.cups.length), frozenHost: inst.frozenHost });
  }
  return out;
}

/**
 * Pinned strong L2 thermos fallback topology (depth 11, L3, delayed drain):
 * instantiated with the identity role mapping (c0..c3 in palette order — a
 * full isomorphism), so the recorded depth holds exactly. Passes through
 * `finalizeCandidate` — never trusted blindly. Backup pins cover the
 * (near-impossible) miss.
 */
const THERMOS_FALLBACK_TEMPLATE_ID = 'thermos-11-100124';
const THERMOS_FALLBACK_BACKUP_IDS = ['thermos-11-101057', 'thermos-10-100171'];

function thermosFallbackEntries(
  req: GenerateRequest,
): Array<{ cups: TeaId[][]; constraints: CupConstraint[]; thermosHost: number }> {
  if (thermosTemplateKindFor(req) === null) return [];
  const kind = thermosTemplateKindFor(req) as ThermosTemplateKind;
  const palette = req.colors.slice(0, req.numColors);
  if (palette.length !== req.numColors || palette.some((c) => c === undefined)) return [];
  const out: Array<{ cups: TeaId[][]; constraints: CupConstraint[]; thermosHost: number }> = [];
  for (const id of [THERMOS_FALLBACK_TEMPLATE_ID, ...THERMOS_FALLBACK_BACKUP_IDS]) {
    const tpl = THERMOS_TEMPLATE_BANK[kind].find((t) => t.id === id);
    if (!tpl) continue;
    const inst = instantiateThermosTemplate(tpl, palette, [...palette]);
    const constraints = defaultCupConstraints(inst.cups.length);
    constraints[inst.thermosSlot] = { mode: 'normal', capacity: THERMOS_CAPACITY, mustEndEmpty: true };
    out.push({ cups: inst.cups, constraints, thermosHost: inst.thermosSlot });
  }
  return out;
}

/**
 * Pinned strong L2 cinnamon fallback topology (depth 11, delayed unlock,
 * L3B repurpose): instantiated with the identity role mapping (c0..c3 in
 * palette order — a full isomorphism), so the recorded depth holds
 * exactly. Passes through `finalizeCandidate` — never trusted blindly.
 * Backup pins cover the (near-impossible) miss.
 */
const CINNAMON_FALLBACK_TEMPLATE_ID = 'cinnamon-11-200263';
const CINNAMON_FALLBACK_BACKUP_IDS = ['cinnamon-11-200024', 'cinnamon-10-200706'];

function cinnamonFallbackEntries(
  req: GenerateRequest,
): Array<{ cups: TeaId[][]; constraints: CupConstraint[]; cinnamonHost: number }> {
  if (cinnamonTemplateKindFor(req) === null) return [];
  const kind = cinnamonTemplateKindFor(req) as CinnamonTemplateKind;
  const palette = req.colors.slice(0, req.numColors);
  if (palette.length !== req.numColors || palette.some((c) => c === undefined)) return [];
  const out: Array<{ cups: TeaId[][]; constraints: CupConstraint[]; cinnamonHost: number }> = [];
  for (const id of [CINNAMON_FALLBACK_TEMPLATE_ID, ...CINNAMON_FALLBACK_BACKUP_IDS]) {
    const tpl = CINNAMON_TEMPLATE_BANK[kind].find((t) => t.id === id);
    if (!tpl) continue;
    const inst = instantiateCinnamonTemplate(tpl, palette, [...palette]);
    out.push({ cups: inst.cups, constraints: defaultCupConstraints(inst.cups.length), cinnamonHost: inst.cinnamonHost });
  }
  return out;
}

export function fallbackLevel(req: GenerateRequest, opts: GenerateOptions = {}): GeneratedLevel {
  validateTargetRequest(req);
  validateSinkRequest(req);
  validateTastingRequest(req);
  validateFloatingIngredientRequest(req);
  validateStrainerRequest(req);
  validateSinkingIngredientRequest(req);
  validateFrozenCupRequest(req);
  validateThermosRequest(req);
  validateCinnamonRequest(req);
  const stats = opts.stats;
  const wantSourceOnly = requestedSourceOnlyCount(req);
  const wantTargets = requestedTargetTeas(req);
  const wantSink = requestedSinkOnlyCount(req);
  const wantTasting = requestedTastingCupCount(req);
  const wantIngredient = requestedFloatingIngredient(req);
  const wantStrainer = requestedHasStrainer(req);
  const wantHoney = requestedSinkingIngredient(req);
  const wantFrozen = requestedFrozenCupCount(req);
  const wantThermos = requestedThermosCupCount(req);
  const wantCinnamon = requestedCinnamonCupCount(req);
  const tag =
    `fallback:${req.phase}:${req.numColors}c${wantSourceOnly > 0 ? ':teapot' : ''}` +
    `${req.hasMysteryLayer ? ':mystery' : ''}${wantTargets.length > 0 ? `:target${wantTargets.length}` : ''}` +
    `${wantSink > 0 ? ':sink' : ''}${wantTasting > 0 ? ':tasting' : ''}` +
    `${wantIngredient !== undefined ? `:${wantIngredient}` : ''}` +
    `${wantStrainer ? ':strainer' : ''}` +
    `${wantHoney !== undefined ? `:${wantHoney}` : ''}` +
    `${wantFrozen > 0 ? ':frozen-cup' : ''}` +
    `${wantThermos > 0 ? ':thermos' : ''}` +
    `${wantCinnamon > 0 ? ':cinnamon' : ''}`;

  const shapeEntries: Array<{ cups: TeaId[][]; constraints: CupConstraint[]; lemonHost?: number | null; honeyHost?: number | null; frozenHost?: number | null; thermosHost?: number | null; cinnamonHost?: number | null }> = [];
  // Dedicated cinnamon shapes go first for cinnamon requests (identity
  // role mapping — recorded depths hold exactly).
  if (wantCinnamon > 0) {
    shapeEntries.push(...cinnamonFallbackEntries(req));
  }
  // Dedicated thermos shapes go first for thermos requests (identity role
  // mapping — recorded depths hold exactly).
  if (wantThermos > 0) {
    shapeEntries.push(...thermosFallbackEntries(req));
  }
  // Dedicated frozen-cup shapes go first for frozen requests (identity
  // role mapping — recorded depths hold exactly).
  if (wantFrozen > 0) {
    shapeEntries.push(...frozenCupFallbackEntries(req));
  }
  // Dedicated interaction shapes go first for lemon+honey requests.
  if (isLemonHoneyInteractionRequest(req)) {
    const dedicatedInteraction = primaryLemonHoneyFallback(req);
    if (dedicatedInteraction) shapeEntries.push(dedicatedInteraction);
    const interactionRot = lemonHoneyRotationEntry(req);
    if (interactionRot) shapeEntries.push(interactionRot);
  } else if (wantHoney !== undefined) {
    const dedicatedHoney = primaryHoneyFallback(req);
    if (dedicatedHoney) shapeEntries.push(dedicatedHoney);
    const honeyRot = honeyRotationEntry(req);
    if (honeyRot) shapeEntries.push(honeyRot);
  } else if (wantStrainer) {
    const dedicatedStrainer = primaryStrainerFallback(req);
    if (dedicatedStrainer) shapeEntries.push(dedicatedStrainer);
    const strainerRot = rotationCups(req);
    shapeEntries.push({
      cups: strainerRot,
      constraints: constraintsForShape(strainerRot.length, wantSourceOnly),
    });
  } else if (wantIngredient !== undefined) {
    const dedicatedLemon = primaryLemonFallback(req);
    if (dedicatedLemon) shapeEntries.push(dedicatedLemon);
    const lemonRot = lemonRotationEntry(req);
    if (lemonRot) shapeEntries.push(lemonRot);
  } else if (wantTasting > 0) {
    const dedicatedTasting = primaryTastingFallback(req);
    if (dedicatedTasting) shapeEntries.push(dedicatedTasting);
    const tastingRot = tastingRotationCups(req);
    shapeEntries.push({
      cups: tastingRot,
      constraints: constraintsForShape(tastingRot.length, wantSourceOnly, 0, wantTasting),
    });
  } else if (wantSink > 0) {
    const dedicatedSink = primarySinkFallback(req);
    if (dedicatedSink) shapeEntries.push(dedicatedSink);
    const sinkRot = sinkRotationCups(req);
    shapeEntries.push({ cups: sinkRot, constraints: constraintsForShape(sinkRot.length, wantSourceOnly, wantSink) });
  } else if (wantSourceOnly > 0) {
    const primary = primarySourceOnlyFallbackCups(req);
    if (primary) shapeEntries.push({ cups: primary, constraints: constraintsForShape(primary.length, 1) });
    const rot = sourceOnlyRotationCups(req);
    shapeEntries.push({ cups: rot, constraints: constraintsForShape(rot.length, 1) });
  } else {
    shapeEntries.push({
      cups: primaryFallbackCups(req),
      constraints: defaultCupConstraints(req.numColors + req.emptyCups),
    });
    shapeEntries.push({
      cups: rotationCups(req),
      constraints: defaultCupConstraints(req.numColors + req.emptyCups),
    });
  }

  // Dedicated named-serving shapes go first (1 solve when they hit).
  if (wantTargets.length > 0) {
    const dedicated = primaryTargetFallback(req);
    if (dedicated) shapeEntries.unshift(dedicated);
  }

  for (let s = 0; s < shapeEntries.length; s++) {
    const entry = shapeEntries[s] as {
      cups: TeaId[][];
      constraints: CupConstraint[];
      lemonHost?: number | null;
      honeyHost?: number | null;
      frozenHost?: number | null;
      cinnamonHost?: number | null;
    };
    const cups = entry.cups;
    let constraints = entry.constraints;
    // Lemon slots for this shape (all-null when no lemon requested).
    const shapeSlots: FloatingIngredientSlot[] = emptyFloatingIngredients(cups.length);
    if (wantIngredient !== undefined && entry.lemonHost !== undefined && entry.lemonHost !== null) {
      shapeSlots[entry.lemonHost] = wantIngredient;
    }
    // Honey slots for this shape (all-null when no honey requested).
    const shapeSinkSlots: SinkingIngredientSlot[] = emptySinkingIngredients(cups.length);
    if (wantHoney !== undefined && entry.honeyHost !== undefined && entry.honeyHost !== null) {
      shapeSinkSlots[entry.honeyHost] = wantHoney;
    }
    // Ice slots for this shape (all-null when no frozen cup requested).
    const shapeIceSlots: IceSlot[] = emptyIceSlots(cups.length);
    if (wantFrozen > 0 && entry.frozenHost !== undefined && entry.frozenHost !== null) {
      shapeIceSlots[entry.frozenHost] = 'ice';
    }
    // Capacity-obstacle slots for this shape (all-null when no cinnamon requested).
    const shapeObstacleSlots: CapacityObstacleSlot[] = emptyCapacityObstacles(cups.length);
    if (wantCinnamon > 0 && entry.cinnamonHost !== undefined && entry.cinnamonHost !== null) {
      shapeObstacleSlots[entry.cinnamonHost] = 'cinnamon';
    }
    // Named serving roles are assigned deterministically (first eligible
    // cup per tea); failure rejects this shape, never forces a bad role.
    // Shapes that already carry exactly the requested targets skip this.
    const alreadyHave = constraints
      .filter((c) => c.targetTeaId !== undefined)
      .map((c) => c.targetTeaId as TeaId);
    const needsAssign =
      wantTargets.length > 0 &&
      !(
        alreadyHave.length === wantTargets.length &&
        wantTargets.every((t) => alreadyHave.includes(t))
      );
    if (needsAssign) {
      const assigned = assignTargetConstraints(
        cups,
        constraints,
        wantTargets,
        wantSourceOnly > 0,
        (candidates) => candidates[0] as number,
      );
      if (!assigned) continue;
      constraints = assigned;
    }
    const hiddenCounts = cups.map(() => 0);
    if (req.hasMysteryLayer) {
      // Deterministic first-candidate pick; null => layout rejected, never forced.
      // Never inside the teapot, a target cup — or on the lemon/honey host.
      const lemonIdx = wantIngredient !== undefined ? shapeSlots.findIndex((sl) => sl !== null) : -1;
      const honeyIdx = wantHoney !== undefined ? shapeSinkSlots.findIndex((sl) => sl !== null) : -1;
      const idx = selectMysteryCup(
        cups,
        (candidates) => {
          let eligible = candidates;
          if (lemonIdx >= 0) eligible = eligible.filter((c) => c !== lemonIdx);
          if (honeyIdx >= 0) eligible = eligible.filter((c) => c !== honeyIdx);
          return eligible[0] ?? null;
        },
        constraints,
      );
      if (idx === null) continue;
      hiddenCounts[idx] = 1;
    }
    const level = finalizeCandidate(
      req,
      cups,
      hiddenCounts,
      `${tag}#${s}`,
      constraints,
      stats,
      shapeSlots,
      wantStrainer ? standStrainerState() : undefined,
      shapeSinkSlots,
      shapeIceSlots,
      shapeObstacleSlots,
    );
    if (level) {
      if (stats) stats.usedFallback = true;
      return level;
    }
  }

  // Safety net for exotic configs: bounded, seeded, still fully gated.
  const rng = createRng(tag);
  for (let i = 0; i < FALLBACK_SCAN_ATTEMPTS; i++) {
    if (stats) stats.candidatesTried++;
    const deal = dealCandidate(
      rng,
      req.numColors,
      req.colors,
      req.emptyCups,
      wantSourceOnly,
      wantTargets,
      wantSink,
      wantTasting,
      wantIngredient,
    );
    if (!deal) continue;
    // Strainer requests never produce lemon hosts; tight random deals are
    // gated by the rescued-necessity check (plain/peak hit fast at ~30%).
    if (wantStrainer && deal.lemonHost !== null) continue;
    // Honey host for this deal: teapot slot 0 when requested (deal teapots
    // are always full + mixed), else a full mixed plain-standard vessel.
    // Strainer/lemon hosts never coexist with honey (validated combos).
    if (wantHoney !== undefined && (wantStrainer || deal.lemonHost !== null)) continue;
    const hiddenCounts = deal.cups.map(() => 0);
    const scanSlots: FloatingIngredientSlot[] = emptyFloatingIngredients(deal.cups.length);
    if (deal.lemonHost !== null) scanSlots[deal.lemonHost] = wantIngredient ?? null;
    const scanSinkSlots: SinkingIngredientSlot[] = emptySinkingIngredients(deal.cups.length);
    if (wantHoney !== undefined) {
      let honeyHost: number | null = null;
      if (wantSourceOnly > 0) {
        honeyHost = deal.cups[0] !== undefined && isMixedFullCup(deal.cups[0] as TeaId[]) ? 0 : null;
      } else {
        honeyHost = selectHoneyHost(
          deal.cups,
          deal.cupConstraints,
          (candidates) => candidates[Math.floor(rng() * candidates.length)] ?? null,
        );
      }
      if (honeyHost === null) continue;
      scanSinkSlots[honeyHost] = wantHoney;
    }
    if (req.hasMysteryLayer) {
      const lemonIdx = scanSlots.findIndex((sl) => sl !== null);
      const honeyIdx = scanSinkSlots.findIndex((sl) => sl !== null);
      const idx = selectMysteryCup(
        deal.cups,
        (candidates) => {
          let eligible = candidates;
          if (lemonIdx >= 0) eligible = eligible.filter((c) => c !== lemonIdx);
          if (honeyIdx >= 0) eligible = eligible.filter((c) => c !== honeyIdx);
          // Seeded pick among the lemon/honey-safe candidates.
          const at = Math.floor(rng() * eligible.length);
          return eligible[at] ?? null;
        },
        deal.cupConstraints,
      );
      if (idx === null) continue;
      hiddenCounts[idx] = 1;
    }
    const level = finalizeCandidate(
      req,
      deal.cups,
      hiddenCounts,
      `${tag}#scan${i}`,
      deal.cupConstraints,
      stats,
      scanSlots,
      wantStrainer ? standStrainerState() : undefined,
      scanSinkSlots,
    );
    if (level) {
      if (stats) stats.usedFallback = true;
      return level;
    }
  }

  throw new Error(
    `fallbackLevel: no validated layout for phase=${req.phase} ` +
      `numColors=${req.numColors} emptyCups=${req.emptyCups} mystery=${req.hasMysteryLayer} ` +
      `sourceOnly=${wantSourceOnly} targets=[${wantTargets.join(',')}]` +
      `${wantIngredient !== undefined ? ` ingredient=${wantIngredient}` : ''}`,
  );
}

/**
 * Match a request against a template-bank kind (Gauntlet 2.1 fast path).
 * Only the three canonical production target configs qualify; any other
 * target-bearing request keeps the existing random-scan path.
 */
export function targetTemplateKindFor(req: GenerateRequest): TargetTemplateKind | null {
  if (requestedTargetTeas(req).length !== 2) return null;
  const teapot = requestedSourceOnlyCount(req);
  if (req.numColors === 4 && req.emptyCups === 2 && !req.hasMysteryLayer && teapot === 0) {
    return 'target-challenge';
  }
  if (req.numColors === 5 && req.emptyCups === 2 && req.hasMysteryLayer && teapot === 0) {
    return 'target-mystery-peak';
  }
  if (req.numColors === 4 && req.emptyCups === 2 && !req.hasMysteryLayer && teapot === 1) {
    return 'teapot-target-challenge';
  }
  return null;
}

/**
 * Match a request against a sink-bank kind (Gauntlet 3 fast path).
 * Only the three canonical production sink configs qualify; any other
 * sink-bearing request keeps the random-scan path. Sink + targets never
 * qualifies (rejected loudly at validation).
 */
export function sinkTemplateKindFor(req: GenerateRequest): SinkTemplateKind | null {
  if (requestedSinkOnlyCount(req) !== 1) return null;
  if (requestedTargetTeas(req).length > 0) return null;
  const teapot = requestedSourceOnlyCount(req);
  if (req.numColors === 4 && req.emptyCups === 2 && !req.hasMysteryLayer && teapot === 0) {
    return 'sink-challenge';
  }
  if (req.numColors === 5 && req.emptyCups === 2 && req.hasMysteryLayer && teapot === 0) {
    return 'sink-mystery-peak';
  }
  if (req.numColors === 4 && req.emptyCups === 2 && !req.hasMysteryLayer && teapot === 1) {
    return 'teapot-sink-challenge';
  }
  return null;
}

/**
 * Bounded sink fast path (Gauntlet 3 §28–29): seeded template choice →
 * palette-relative instantiation (seeded full permutation — a complete
 * puzzle isomorphism, so the bank depth is preserved) → mystery
 * assignment → single `finalizeCandidate` validation. At most
 * SINK_TEMPLATE_ATTEMPTS solver validations, never a 150-deal scan.
 * Returns null when no template validates (caller uses the fallback
 * ladder).
 */
function generateFromSinkTemplateBank(
  req: GenerateRequest,
  seedStr: string,
  rng: Rng,
  stats?: GenerateStats,
): GeneratedLevel | null {
  const kind = sinkTemplateKindFor(req);
  if (!kind) return null;
  const bank = SINK_TEMPLATE_BANK[kind];
  if (bank.length === 0) return null;
  const palette = req.colors.slice(0, req.numColors);
  for (let a = 0; a < SINK_TEMPLATE_ATTEMPTS; a++) {
    if (stats) stats.templateAttempts++;
    const tpl = bank[Math.floor(rng() * bank.length)] as (typeof bank)[number];
    // Seeded topology variation: full palette permutation (bijection, so
    // depth is preserved exactly).
    const order = [...palette];
    shuffleInPlace(rng, order);
    const inst = instantiateSinkTemplate(tpl, palette, order);
    const constraints: CupConstraint[] = defaultCupConstraints(inst.cups.length);
    if (inst.teapotSlot !== null) constraints[inst.teapotSlot] = { mode: 'source-only' };
    constraints[inst.sinkSlot] = { mode: 'sink-only' };
    const hiddenCounts = inst.cups.map(() => 0);
    if (req.hasMysteryLayer) {
      const idx = selectMysteryCup(
        inst.cups,
        (candidates) => {
          const at = Math.floor(rng() * candidates.length);
          return candidates[at] ?? null;
        },
        constraints,
      );
      if (idx === null) continue;
      hiddenCounts[idx] = 1;
    }
    const level = finalizeCandidate(
      req,
      inst.cups,
      hiddenCounts,
      `${seedStr}#sink:${tpl.id}`,
      constraints,
      stats,
    );
    if (level) return level;
  }
  return null;
}

/**
 * Match a request against a tasting-bank kind (Gauntlet 4 fast path).
 * Only the three canonical production tasting configs qualify; any other
 * tasting-bearing request keeps the random-scan path. Tasting + targets
 * or tasting + sink never qualifies (rejected loudly at validation).
 */
export function tastingTemplateKindFor(req: GenerateRequest): TastingTemplateKind | null {
  if (requestedTastingCupCount(req) !== 1) return null;
  if (requestedTargetTeas(req).length > 0) return null;
  if (requestedSinkOnlyCount(req) > 0) return null;
  const teapot = requestedSourceOnlyCount(req);
  if (req.numColors === 4 && req.emptyCups === 2 && !req.hasMysteryLayer && teapot === 0) {
    return 'tasting-challenge';
  }
  if (req.numColors === 5 && req.emptyCups === 2 && req.hasMysteryLayer && teapot === 0) {
    return 'tasting-mystery-peak';
  }
  if (req.numColors === 4 && req.emptyCups === 2 && !req.hasMysteryLayer && teapot === 1) {
    return 'teapot-tasting-challenge';
  }
  return null;
}

/**
 * Bounded tasting fast path (Gauntlet 4 §25): seeded template choice →
 * palette-relative instantiation (seeded full permutation — a complete
 * puzzle isomorphism, so the bank depth is preserved) → mystery
 * assignment → single `finalizeCandidate` validation. At most
 * TASTING_TEMPLATE_ATTEMPTS solver validations, never a 150-deal scan.
 * Returns null when no template validates (caller uses the fallback
 * ladder).
 */
function generateFromTastingTemplateBank(
  req: GenerateRequest,
  seedStr: string,
  rng: Rng,
  stats?: GenerateStats,
): GeneratedLevel | null {
  const kind = tastingTemplateKindFor(req);
  if (!kind) return null;
  const bank = TASTING_TEMPLATE_BANK[kind];
  if (bank.length === 0) return null;
  const palette = req.colors.slice(0, req.numColors);
  for (let a = 0; a < TASTING_TEMPLATE_ATTEMPTS; a++) {
    if (stats) stats.templateAttempts++;
    const tpl = bank[Math.floor(rng() * bank.length)] as (typeof bank)[number];
    // Seeded topology variation: full palette permutation (bijection, so
    // depth is preserved exactly).
    const order = [...palette];
    shuffleInPlace(rng, order);
    const inst = instantiateTastingTemplate(tpl, palette, order);
    const constraints: CupConstraint[] = defaultCupConstraints(inst.cups.length);
    if (inst.teapotSlot !== null) constraints[inst.teapotSlot] = { mode: 'source-only' };
    constraints[inst.tastingSlot] = {
      mode: 'normal',
      capacity: TASTING_BOWL_CAPACITY,
      mustEndEmpty: true,
    };
    const hiddenCounts = inst.cups.map(() => 0);
    if (req.hasMysteryLayer) {
      const idx = selectMysteryCup(
        inst.cups,
        (candidates) => {
          const at = Math.floor(rng() * candidates.length);
          return candidates[at] ?? null;
        },
        constraints,
      );
      if (idx === null) continue;
      hiddenCounts[idx] = 1;
    }
    const level = finalizeCandidate(
      req,
      inst.cups,
      hiddenCounts,
      `${seedStr}#tasting:${tpl.id}`,
      constraints,
      stats,
    );
    if (level) return level;
  }
  return null;
}

/**
 * Match a request against a lemon-bank kind (Gauntlet 5 fast path).
 * Only the three canonical production lemon configs qualify; any other
 * lemon-bearing request keeps the random-scan path. Lemon + sink /
 * targets / tasting never qualifies (rejected loudly at validation).
 */
export function lemonTemplateKindFor(req: GenerateRequest): LemonTemplateKind | null {
  if (requestedFloatingIngredient(req) === undefined) return null;
  if (requestedTargetTeas(req).length > 0) return null;
  if (requestedSinkOnlyCount(req) > 0) return null;
  if (requestedTastingCupCount(req) > 0) return null;
  // Gauntlet 8 interaction requests (lemon + honey) are served by the
  // dedicated lemon-honey bank — never silently degrade to lemon-only.
  if (requestedSinkingIngredient(req) !== undefined) return null;
  const teapot = requestedSourceOnlyCount(req);
  if (req.numColors === 4 && req.emptyCups === 2 && !req.hasMysteryLayer && teapot === 0) {
    return 'lemon-challenge';
  }
  if (req.numColors === 5 && req.emptyCups === 2 && req.hasMysteryLayer && teapot === 0) {
    return 'lemon-mystery-peak';
  }
  if (req.numColors === 4 && req.emptyCups === 2 && !req.hasMysteryLayer && teapot === 1) {
    return 'teapot-lemon-challenge';
  }
  return null;
}

/**
 * Bounded lemon fast path (Gauntlet 5 §48): seeded template choice →
 * palette-relative instantiation (c0 fixed to sea_buckthorn, other roles
 * seeded-permuted — a full isomorphism, so the bank depth is preserved)
 * → lemon placement at the template host → Mystery assignment excluding
 * the lemon host → single `finalizeCandidate` validation. At most
 * LEMON_TEMPLATE_ATTEMPTS solver validations, never a 150-deal scan.
 * Returns null when no template validates (caller uses the fallback
 * ladder).
 */
function generateFromLemonTemplateBank(
  req: GenerateRequest,
  seedStr: string,
  rng: Rng,
  stats?: GenerateStats,
): GeneratedLevel | null {
  const kind = lemonTemplateKindFor(req);
  if (!kind) return null;
  const bank = LEMON_TEMPLATE_BANK[kind];
  if (bank.length === 0) return null;
  const ingredient = requestedFloatingIngredient(req) as FloatingIngredientId;
  const palette = req.colors.slice(0, req.numColors);
  const others = palette.filter((t) => t !== LEMON_TARGET_TEA);
  for (let a = 0; a < LEMON_TEMPLATE_ATTEMPTS; a++) {
    if (stats) stats.templateAttempts++;
    const tpl = bank[Math.floor(rng() * bank.length)] as (typeof bank)[number];
    // Seeded topology variation: permute non-target roles only. c0 stays
    // bound to sea_buckthorn — permuting it away would break the goal.
    const otherOrder = [...others];
    shuffleInPlace(rng, otherOrder);
    const inst = instantiateLemonTemplate(tpl, palette, otherOrder);
    const constraints: CupConstraint[] = defaultCupConstraints(inst.cups.length);
    if (inst.teapotSlot !== null) constraints[inst.teapotSlot] = { mode: 'source-only' };
    const slots: FloatingIngredientSlot[] = emptyFloatingIngredients(inst.cups.length);
    slots[inst.lemonHost] = ingredient;
    const hiddenCounts = inst.cups.map(() => 0);
    if (req.hasMysteryLayer) {
      const idx = selectMysteryCup(
        inst.cups,
        (candidates) => {
          const eligible = candidates.filter((c) => c !== inst.lemonHost);
          const at = Math.floor(rng() * eligible.length);
          return eligible[at] ?? null;
        },
        constraints,
      );
      if (idx === null) continue;
      hiddenCounts[idx] = 1;
    }
    const level = finalizeCandidate(
      req,
      inst.cups,
      hiddenCounts,
      `${seedStr}#lemon:${tpl.id}`,
      constraints,
      stats,
      slots,
    );
    if (level) return level;
  }
  return null;
}

/**
 * Match a request against a strainer-bank kind (Gauntlet 6 tight
 * topologies only). Strainer + lemon/sink/tasting/targets never qualifies
 * (rejected loudly at validation).
 */
export function strainerTemplateKindFor(req: GenerateRequest): StrainerTemplateKind | null {
  if (!requestedHasStrainer(req)) return null;
  if (requestedTargetTeas(req).length > 0) return null;
  if (requestedSinkOnlyCount(req) > 0) return null;
  if (requestedTastingCupCount(req) > 0) return null;
  if (requestedFloatingIngredient(req) !== undefined) return null;
  const teapot = requestedSourceOnlyCount(req);
  if (req.numColors === 4 && req.emptyCups === 1 && !req.hasMysteryLayer && teapot === 0) {
    return 'strainer-challenge';
  }
  if (req.numColors === 5 && req.emptyCups === 1 && req.hasMysteryLayer && teapot === 0) {
    return 'strainer-mystery-peak';
  }
  if (req.numColors === 4 && req.emptyCups === 1 && !req.hasMysteryLayer && teapot === 1) {
    return 'teapot-strainer-challenge';
  }
  return null;
}

/**
 * Bounded strainer fast path (Gauntlet 6 §18): seeded template choice →
 * full palette permutation (a complete color isomorphism, so the rescued
 * depth is preserved) → teapot role → Mystery assignment → empty-stand
 * strainer → single `finalizeCandidate` validation (with + without solves).
 * At most STRAINER_TEMPLATE_ATTEMPTS validations, never a 150-scan.
 */
function generateFromStrainerTemplateBank(
  req: GenerateRequest,
  seedStr: string,
  rng: Rng,
  stats?: GenerateStats,
): GeneratedLevel | null {
  const kind = strainerTemplateKindFor(req);
  if (!kind) return null;
  const bank = STRAINER_TEMPLATE_BANK[kind];
  if (bank.length === 0) return null;
  const palette = req.colors.slice(0, req.numColors);
  for (let a = 0; a < STRAINER_TEMPLATE_ATTEMPTS; a++) {
    if (stats) stats.templateAttempts++;
    const tpl = bank[Math.floor(rng() * bank.length)] as (typeof bank)[number];
    const order = [...palette];
    shuffleInPlace(rng, order);
    const inst = instantiateStrainerTemplate(tpl, palette, order);
    const constraints: CupConstraint[] = defaultCupConstraints(inst.cups.length);
    if (inst.teapotSlot !== null) constraints[inst.teapotSlot] = { mode: 'source-only' };
    const hiddenCounts = inst.cups.map(() => 0);
    if (req.hasMysteryLayer) {
      const idx = selectMysteryCup(
        inst.cups,
        (candidates) => {
          const at = Math.floor(rng() * candidates.length);
          return candidates[at] ?? null;
        },
        constraints,
      );
      if (idx === null) continue;
      hiddenCounts[idx] = 1;
    }
    const level = finalizeCandidate(
      req,
      inst.cups,
      hiddenCounts,
      `${seedStr}#strainer:${tpl.id}`,
      constraints,
      stats,
      emptyFloatingIngredients(inst.cups.length),
      standStrainerState(),
    );
    if (level) return level;
  }
  return null;
}

/**
 * Match a request against a honey-bank kind (Gauntlet 7 fast path).
 * Only the three canonical production honey configs qualify; any other
 * honey-bearing request keeps the random-scan path. Honey + lemon /
 * strainer / sink / tasting / targets never qualifies (rejected loudly
 * at validation).
 */
export function honeyTemplateKindFor(req: GenerateRequest): HoneyTemplateKind | null {
  if (requestedSinkingIngredient(req) === undefined) return null;
  if (requestedTargetTeas(req).length > 0) return null;
  if (requestedSinkOnlyCount(req) > 0) return null;
  if (requestedTastingCupCount(req) > 0) return null;
  if (requestedFloatingIngredient(req) !== undefined) return null;
  if (requestedHasStrainer(req)) return null;
  const teapot = requestedSourceOnlyCount(req);
  if (req.numColors === 4 && req.emptyCups === 2 && !req.hasMysteryLayer && teapot === 0) {
    return 'honey-challenge';
  }
  if (req.numColors === 5 && req.emptyCups === 2 && req.hasMysteryLayer && teapot === 0) {
    return 'honey-mystery-peak';
  }
  if (req.numColors === 4 && req.emptyCups === 2 && !req.hasMysteryLayer && teapot === 1) {
    return 'teapot-honey-challenge';
  }
  return null;
}

/**
 * Bounded honey fast path (Gauntlet 7 §67): seeded template choice →
 * palette-relative instantiation (c0 fixed to buckwheat, other roles
 * seeded-permuted — a full isomorphism on non-target teas, so the bank
 * depth is preserved) → teapot role → Mystery assignment excluding the
 * honey host → single `finalizeCandidate` validation. At most
 * HONEY_TEMPLATE_ATTEMPTS solver validations, never a 150-deal scan.
 * Returns null when no template validates (caller uses the fallback
 * ladder).
 */
function generateFromHoneyTemplateBank(
  req: GenerateRequest,
  seedStr: string,
  rng: Rng,
  stats?: GenerateStats,
): GeneratedLevel | null {
  const kind = honeyTemplateKindFor(req);
  if (!kind) return null;
  const bank = HONEY_TEMPLATE_BANK[kind];
  if (bank.length === 0) return null;
  const palette = req.colors.slice(0, req.numColors);
  const others = palette.filter((t) => t !== HONEY_TARGET_TEA);
  for (let a = 0; a < HONEY_TEMPLATE_ATTEMPTS; a++) {
    if (stats) stats.templateAttempts++;
    const tpl = bank[Math.floor(rng() * bank.length)] as (typeof bank)[number];
    const otherOrder = [...others];
    shuffleInPlace(rng, otherOrder);
    const inst = instantiateHoneyTemplate(tpl, palette, otherOrder);
    const constraints: CupConstraint[] = defaultCupConstraints(inst.cups.length);
    if (inst.teapotSlot !== null) constraints[inst.teapotSlot] = { mode: 'source-only' };
    const sinkSlots: SinkingIngredientSlot[] = emptySinkingIngredients(inst.cups.length);
    sinkSlots[inst.honeyHost] = 'honey';
    const hiddenCounts = inst.cups.map(() => 0);
    if (req.hasMysteryLayer) {
      const idx = selectMysteryCup(
        inst.cups,
        (candidates) => {
          const eligible = candidates.filter((c) => c !== inst.honeyHost);
          const at = Math.floor(rng() * eligible.length);
          return eligible[at] ?? null;
        },
        constraints,
      );
      if (idx === null) continue;
      hiddenCounts[idx] = 1;
    }
    const level = finalizeCandidate(
      req,
      inst.cups,
      hiddenCounts,
      `${seedStr}#honey:${tpl.id}`,
      constraints,
      stats,
      emptyFloatingIngredients(inst.cups.length),
      undefined,
      sinkSlots,
    );
    if (level) return level;
  }
  return null;
}

/**
 * Bounded target fast path (Gauntlet 2.1 §9): seeded template choice →
 * palette-relative instantiation (seeded t-swap + o-permutation, both
 * full isomorphisms so the bank depth is preserved) → mystery assignment
 * → single `finalizeCandidate` validation. At most
 * TARGET_TEMPLATE_ATTEMPTS solver validations, never a 150-deal scan.
 * Returns null when no template validates (caller uses the fallback
 * ladder); null is a near-impossible programming-error signal, since
 * every bank template is validated by tests.
 */
function generateFromTemplateBank(
  req: GenerateRequest,
  seedStr: string,
  rng: Rng,
  stats?: GenerateStats,
): GeneratedLevel | null {
  const kind = targetTemplateKindFor(req);
  if (!kind) return null;
  const bank = TARGET_TEMPLATE_BANK[kind];
  const wantTargets = requestedTargetTeas(req);
  const tTeas = [wantTargets[0] as TeaId, wantTargets[1] as TeaId] as [TeaId, TeaId];
  const others = req.colors.slice(0, req.numColors).filter((c) => c !== tTeas[0] && c !== tTeas[1]);
  for (let a = 0; a < TARGET_TEMPLATE_ATTEMPTS; a++) {
    if (stats) stats.templateAttempts++;
    const tpl = bank[Math.floor(rng() * bank.length)] as (typeof bank)[number];
    // Seeded topology variation: shuffle target order (t-swap) and other
    // order (o-permutation). Both are bijections, so depth is preserved.
    const tOrder = [...tTeas] as [TeaId, TeaId];
    shuffleInPlace(rng, tOrder);
    const oOrder = [...others];
    shuffleInPlace(rng, oOrder);
    const inst = instantiateTargetTemplate(tpl, tTeas, others, tOrder, oOrder);
    const constraints: CupConstraint[] = defaultCupConstraints(inst.cups.length);
    if (inst.teapotSlot !== null) constraints[inst.teapotSlot] = { mode: 'source-only' };
    for (const [idx, tea] of inst.targetTeaBySlot) {
      constraints[idx] = { mode: 'normal', targetTeaId: tea };
    }
    const hiddenCounts = inst.cups.map(() => 0);
    if (req.hasMysteryLayer) {
      const idx = selectMysteryCup(
        inst.cups,
        (candidates) => {
          const at = Math.floor(rng() * candidates.length);
          return candidates[at] ?? null;
        },
        constraints,
      );
      if (idx === null) continue;
      hiddenCounts[idx] = 1;
    }
    const level = finalizeCandidate(
      req,
      inst.cups,
      hiddenCounts,
      `${seedStr}#tpl:${tpl.id}`,
      constraints,
      stats,
    );
    if (level) return level;
  }
  return null;
}

/**
 * Match a request against the interaction bank (Gauntlet 8). Recognized
 * ONLY for the exact production combination: lemon + honey, 4 colors, 6
 * vessels, 2 empties, no Mystery, no teapot, no third special. Anything
 * else keeps the existing paths (validation throws for bad combos).
 */
export function lemonHoneyTemplateKindFor(req: GenerateRequest): LemonHoneyTemplateKind | null {
  if (!isLemonHoneyInteractionRequest(req)) return null;
  if (requestedTargetTeas(req).length > 0) return null;
  if (requestedSinkOnlyCount(req) > 0) return null;
  if (requestedTastingCupCount(req) > 0) return null;
  if (requestedHasStrainer(req)) return null;
  if (req.numColors === 4 && req.emptyCups === 2 && !req.hasMysteryLayer && requestedSourceOnlyCount(req) === 0) {
    return 'lemon-honey-interaction';
  }
  return null;
}

/**
 * Bounded interaction fast path (Gauntlet 8 §69–70): seeded template
 * choice → c0=buckwheat, c1=sea_buckthorn, seeded c2/c3 swap (a full
 * isomorphism on non-target teas, so the bank depth is preserved) →
 * place both initial ingredients → single `finalizeCandidate` validation
 * (L2 trace inside). At most LEMON_HONEY_TEMPLATE_ATTEMPTS validations,
 * never a 150-deal scan.
 */
function generateFromLemonHoneyTemplateBank(
  req: GenerateRequest,
  seedStr: string,
  rng: Rng,
  stats?: GenerateStats,
): GeneratedLevel | null {
  const kind = lemonHoneyTemplateKindFor(req);
  if (!kind) return null;
  const bank = LEMON_HONEY_TEMPLATE_BANK[kind];
  if (bank.length === 0) return null;
  const palette = req.colors.slice(0, req.numColors);
  const others = palette.filter(
    (t) => t !== LEMON_HONEY_TARGET_TEAS.honey && t !== LEMON_HONEY_TARGET_TEAS.lemon,
  );
  for (let a = 0; a < LEMON_HONEY_TEMPLATE_ATTEMPTS; a++) {
    if (stats) stats.templateAttempts++;
    const tpl = bank[Math.floor(rng() * bank.length)] as (typeof bank)[number];
    // Seeded topology variation: swap the two non-target roles (or keep).
    // A bijection fixing both target teas — depth preserved exactly.
    const c2c3: [TeaId, TeaId] =
      rng() < 0.5
        ? [others[0] as TeaId, others[1] as TeaId]
        : [others[1] as TeaId, others[0] as TeaId];
    const inst = instantiateLemonHoneyTemplate(tpl, palette, c2c3);
    const constraints: CupConstraint[] = defaultCupConstraints(inst.cups.length);
    const floating: FloatingIngredientSlot[] = emptyFloatingIngredients(inst.cups.length);
    floating[inst.lemonHost] = 'lemon';
    const sinking: SinkingIngredientSlot[] = emptySinkingIngredients(inst.cups.length);
    sinking[inst.honeyHost] = 'honey';
    const hiddenCounts = inst.cups.map(() => 0);
    const level = finalizeCandidate(
      req,
      inst.cups,
      hiddenCounts,
      `${seedStr}#lemon-honey:${tpl.id}`,
      constraints,
      stats,
      floating,
      undefined,
      sinking,
    );
    if (level) return level;
  }
  return null;
}

/**
 * Match a request against the cinnamon bank (Gauntlet 11). Recognized
 * ONLY for the exact production combination: cinnamonCupCount 1, 4 colors,
 * 6 vessels, 2 nominal empties, no Mystery, no teapot, no sibling special.
 * Anything else keeps the existing paths (validation throws for bad combos).
 */
export function cinnamonTemplateKindFor(req: GenerateRequest): CinnamonTemplateKind | null {
  if (requestedCinnamonCupCount(req) !== 1) return null;
  if (requestedTargetTeas(req).length > 0) return null;
  if (requestedSinkOnlyCount(req) > 0) return null;
  if (requestedTastingCupCount(req) > 0) return null;
  if (requestedFloatingIngredient(req) !== undefined) return null;
  if (requestedSinkingIngredient(req) !== undefined) return null;
  if (requestedHasStrainer(req)) return null;
  if (requestedFrozenCupCount(req) > 0) return null;
  if (requestedThermosCupCount(req) > 0) return null;
  if (req.numColors === 4 && req.emptyCups === 2 && !req.hasMysteryLayer && requestedSourceOnlyCount(req) === 0) {
    return 'cinnamon';
  }
  return null;
}

/**
 * Bounded cinnamon fast path (Gauntlet 11 §107): seeded template choice →
 * seeded full permutation of c0..c3 roles (a full isomorphism, so the bank
 * depth is preserved) → one active cinnamon obstacle on the template host
 * → single `finalizeCandidate` validation (L2 trace inside). At most
 * CINNAMON_TEMPLATE_ATTEMPTS validations, never a 150-deal scan. Returns
 * null when no template validates (caller uses the fallback ladder).
 */
function generateFromCinnamonTemplateBank(
  req: GenerateRequest,
  seedStr: string,
  rng: Rng,
  stats?: GenerateStats,
): GeneratedLevel | null {
  const kind = cinnamonTemplateKindFor(req);
  if (!kind) return null;
  const bank = CINNAMON_TEMPLATE_BANK[kind];
  if (bank.length === 0) return null;
  const palette = req.colors.slice(0, req.numColors);
  if (palette.length !== req.numColors) return null;
  for (let a = 0; a < CINNAMON_TEMPLATE_ATTEMPTS; a++) {
    if (stats) stats.templateAttempts++;
    const tpl = bank[Math.floor(rng() * bank.length)] as (typeof bank)[number];
    // Seeded topology variation: full permutation of all four roles.
    // A bijection — depth preserved exactly, cinnamon profile isomorphic.
    const order = [...palette];
    shuffleInPlace(rng, order);
    const inst = instantiateCinnamonTemplate(tpl, palette, order);
    const constraints: CupConstraint[] = defaultCupConstraints(inst.cups.length);
    const obstacles: CapacityObstacleSlot[] = emptyCapacityObstacles(inst.cups.length);
    obstacles[inst.cinnamonHost] = 'cinnamon';
    const hiddenCounts = inst.cups.map(() => 0);
    const level = finalizeCandidate(
      req,
      inst.cups,
      hiddenCounts,
      `${seedStr}#cinnamon:${tpl.id}`,
      constraints,
      stats,
      emptyFloatingIngredients(inst.cups.length),
      undefined,
      emptySinkingIngredients(inst.cups.length),
      emptyIceSlots(inst.cups.length),
      obstacles,
    );
    if (level) return level;
  }
  return null;
}

/**
 * Match a request against the thermos bank (Gauntlet 10). Recognized
 * ONLY for the exact production combination: thermosCupCount 1, 4 colors,
 * 6 vessels, 2 nominal empties, no Mystery, no teapot, no sibling special.
 * Anything else keeps the existing paths (validation throws for bad combos).
 */
export function thermosTemplateKindFor(req: GenerateRequest): ThermosTemplateKind | null {
  if (requestedThermosCupCount(req) !== 1) return null;
  if (requestedTargetTeas(req).length > 0) return null;
  if (requestedSinkOnlyCount(req) > 0) return null;
  if (requestedTastingCupCount(req) > 0) return null;
  if (requestedFloatingIngredient(req) !== undefined) return null;
  if (requestedSinkingIngredient(req) !== undefined) return null;
  if (requestedHasStrainer(req)) return null;
  if (requestedFrozenCupCount(req) > 0) return null;
  if (req.numColors === 4 && req.emptyCups === 2 && !req.hasMysteryLayer && requestedSourceOnlyCount(req) === 0) {
    return 'thermos';
  }
  return null;
}

/**
 * Bounded thermos fast path (Gauntlet 10 §72): seeded template choice →
 * seeded full permutation of c0..c3 roles (a full isomorphism, so the bank
 * depth is preserved) → thermos constraint on the template host → single
 * `finalizeCandidate` validation (L2 trace inside). At most
 * THERMOS_TEMPLATE_ATTEMPTS validations, never a 150-deal scan. Returns
 * null when no template validates (caller uses the fallback ladder).
 */
function generateFromThermosTemplateBank(
  req: GenerateRequest,
  seedStr: string,
  rng: Rng,
  stats?: GenerateStats,
): GeneratedLevel | null {
  const kind = thermosTemplateKindFor(req);
  if (!kind) return null;
  const bank = THERMOS_TEMPLATE_BANK[kind];
  if (bank.length === 0) return null;
  const palette = req.colors.slice(0, req.numColors);
  if (palette.length !== req.numColors) return null;
  for (let a = 0; a < THERMOS_TEMPLATE_ATTEMPTS; a++) {
    if (stats) stats.templateAttempts++;
    const tpl = bank[Math.floor(rng() * bank.length)] as (typeof bank)[number];
    // Seeded topology variation: full permutation of all four roles.
    // A bijection — depth preserved exactly, thermos profile isomorphic.
    const order = [...palette];
    shuffleInPlace(rng, order);
    const inst = instantiateThermosTemplate(tpl, palette, order);
    const constraints: CupConstraint[] = defaultCupConstraints(inst.cups.length);
    constraints[inst.thermosSlot] = { mode: 'normal', capacity: THERMOS_CAPACITY, mustEndEmpty: true };
    const hiddenCounts = inst.cups.map(() => 0);
    const level = finalizeCandidate(
      req,
      inst.cups,
      hiddenCounts,
      `${seedStr}#thermos:${tpl.id}`,
      constraints,
      stats,
      emptyFloatingIngredients(inst.cups.length),
      undefined,
      emptySinkingIngredients(inst.cups.length),
      emptyIceSlots(inst.cups.length),
    );
    if (level) return level;
  }
  return null;
}

/**
 * Match a request against the frozen-cup bank (Gauntlet 9). Recognized
 * ONLY for the exact production combination: frozenCupCount 1, 4 colors,
 * 6 vessels, 2 nominal empties, no Mystery, no teapot, no sibling
 * special. Anything else keeps the existing paths (validation throws for
 * bad combos).
 */
export function frozenCupTemplateKindFor(req: GenerateRequest): FrozenCupTemplateKind | null {
  if (requestedFrozenCupCount(req) !== 1) return null;
  if (requestedTargetTeas(req).length > 0) return null;
  if (requestedSinkOnlyCount(req) > 0) return null;
  if (requestedTastingCupCount(req) > 0) return null;
  if (requestedFloatingIngredient(req) !== undefined) return null;
  if (requestedSinkingIngredient(req) !== undefined) return null;
  if (requestedHasStrainer(req)) return null;
  if (requestedThermosCupCount(req) > 0) return null;
  if (req.numColors === 4 && req.emptyCups === 2 && !req.hasMysteryLayer && requestedSourceOnlyCount(req) === 0) {
    return 'frozen-cup';
  }
  return null;
}

/**
 * Bounded frozen-cup fast path (Gauntlet 9 §88): seeded template choice →
 * c0 fixed to sea_buckthorn, seeded permutation of the remaining roles (a
 * full isomorphism on non-melt teas, so the bank depth is preserved) →
 * ice placed on the template frozen host → single `finalizeCandidate`
 * validation (L2 trace inside). At most FROZEN_CUP_TEMPLATE_ATTEMPTS
 * validations, never a 150-deal scan. Returns null when no template
 * validates (caller uses the fallback ladder).
 */
function generateFromFrozenCupTemplateBank(
  req: GenerateRequest,
  seedStr: string,
  rng: Rng,
  stats?: GenerateStats,
): GeneratedLevel | null {
  const kind = frozenCupTemplateKindFor(req);
  if (!kind) return null;
  const bank = FROZEN_CUP_TEMPLATE_BANK[kind];
  if (bank.length === 0) return null;
  const palette = req.colors.slice(0, req.numColors);
  if (!palette.includes(FROZEN_CUP_TARGET_TEA)) return null;
  const others = palette.filter((t) => t !== FROZEN_CUP_TARGET_TEA);
  for (let a = 0; a < FROZEN_CUP_TEMPLATE_ATTEMPTS; a++) {
    if (stats) stats.templateAttempts++;
    const tpl = bank[Math.floor(rng() * bank.length)] as (typeof bank)[number];
    // Seeded topology variation: full permutation of the non-melt roles.
    // A bijection fixing sea_buckthorn — depth preserved exactly.
    const otherOrder = [...others];
    shuffleInPlace(rng, otherOrder);
    const inst = instantiateFrozenCupTemplate(tpl, palette, otherOrder);
    const constraints: CupConstraint[] = defaultCupConstraints(inst.cups.length);
    const ice: IceSlot[] = emptyIceSlots(inst.cups.length);
    ice[inst.frozenHost] = 'ice';
    const hiddenCounts = inst.cups.map(() => 0);
    const level = finalizeCandidate(
      req,
      inst.cups,
      hiddenCounts,
      `${seedStr}#frozen-cup:${tpl.id}`,
      constraints,
      stats,
      emptyFloatingIngredients(inst.cups.length),
      undefined,
      emptySinkingIngredients(inst.cups.length),
      ice,
    );
    if (level) return level;
  }
  return null;
}

export function generateLevel(
  req: GenerateRequest,
  seed: SeedInput,
  opts: GenerateOptions = {},
): GeneratedLevel {
  validateTargetRequest(req);
  validateSinkRequest(req);
  validateTastingRequest(req);
  validateFloatingIngredientRequest(req);
  validateStrainerRequest(req);
  validateSinkingIngredientRequest(req);
  validateFrozenCupRequest(req);
  const maxRetries = opts.maxRetries ?? GENERATOR_MAX_RETRIES;
  const stats = opts.stats;
  const seedStr = String(seed);
  const rng = createRng(seedStr);
  const wantSourceOnly = requestedSourceOnlyCount(req);
  const wantTargets = requestedTargetTeas(req);
  const wantSink = requestedSinkOnlyCount(req);
  const wantTasting = requestedTastingCupCount(req);
  const wantIngredient = requestedFloatingIngredient(req);
  const wantHoney = requestedSinkingIngredient(req);

  // Canonical target configs skip the random scan entirely: the template
  // bank serves bounded, solver-validated topologies (~1 validation per
  // level). Non-canonical requests keep the existing scan below.
  // maxRetries does not apply here — template attempts are structurally
  // bounded by TARGET_TEMPLATE_ATTEMPTS, so maxRetries: 0 still yields a
  // valid level through the fast path or the fallback ladder.
  if (targetTemplateKindFor(req) !== null) {
    const fast = generateFromTemplateBank(req, seedStr, rng, stats);
    if (fast) return fast;
    return fallbackLevel(req, { stats });
  }

  // Canonical sink configs skip the random scan entirely (Gauntlet 3
  // §28–29): bounded SINK_TEMPLATE_ATTEMPTS validations, never a
  // 150-deal scan. maxRetries: 0 still yields a valid level through the
  // fast path or the validated fallback ladder.
  if (sinkTemplateKindFor(req) !== null) {
    const fast = generateFromSinkTemplateBank(req, seedStr, rng, stats);
    if (fast) return fast;
    return fallbackLevel(req, { stats });
  }

  // Canonical tasting configs skip the random scan entirely (Gauntlet 4
  // §25): bounded TASTING_TEMPLATE_ATTEMPTS validations, never a
  // 150-deal scan. maxRetries: 0 still yields a valid level through the
  // fast path or the validated fallback ladder.
  if (tastingTemplateKindFor(req) !== null) {
    const fast = generateFromTastingTemplateBank(req, seedStr, rng, stats);
    if (fast) return fast;
    return fallbackLevel(req, { stats });
  }

  // Canonical lemon configs skip the random scan entirely (Gauntlet 5
  // §48): bounded LEMON_TEMPLATE_ATTEMPTS validations, never a 150-deal
  // scan. maxRetries: 0 still yields a valid level through the fast path
  // or the validated fallback ladder.
  if (lemonTemplateKindFor(req) !== null) {
    const fast = generateFromLemonTemplateBank(req, seedStr, rng, stats);
    if (fast) return fast;
    return fallbackLevel(req, { stats });
  }

  // Canonical strainer configs skip the random scan entirely (Gauntlet 6
  // §18): bounded STRAINER_TEMPLATE_ATTEMPTS validations, never a 150-deal
  // scan. maxRetries: 0 still yields a valid level through the fast path
  // or the validated fallback ladder.
  if (strainerTemplateKindFor(req) !== null) {
    const fast = generateFromStrainerTemplateBank(req, seedStr, rng, stats);
    if (fast) return fast;
    return fallbackLevel(req, { stats });
  }

  // Canonical honey configs skip the random scan entirely (Gauntlet 7
  // §67): bounded HONEY_TEMPLATE_ATTEMPTS validations, never a 150-deal
  // scan. maxRetries: 0 still yields a valid level through the fast path
  // or the validated fallback ladder.
  if (honeyTemplateKindFor(req) !== null) {
    const fast = generateFromHoneyTemplateBank(req, seedStr, rng, stats);
    if (fast) return fast;
    return fallbackLevel(req, { stats });
  }

  // Canonical lemon+honey interaction configs skip the random scan
  // entirely (Gauntlet 8 §69–70): bounded LEMON_HONEY_TEMPLATE_ATTEMPTS
  // validations, never a 150-deal scan. Interaction is composition of the
  // existing lemon+honey fields — no new request identity.
  if (lemonHoneyTemplateKindFor(req) !== null) {
    const fast = generateFromLemonHoneyTemplateBank(req, seedStr, rng, stats);
    if (fast) return fast;
    return fallbackLevel(req, { stats });
  }

  // Canonical frozen-cup configs skip the random scan entirely (Gauntlet 9
  // §88): bounded FROZEN_CUP_TEMPLATE_ATTEMPTS validations, never a
  // 150-deal scan. maxRetries: 0 still yields a valid level through the
  // fast path or the validated fallback ladder.
  if (frozenCupTemplateKindFor(req) !== null) {
    const fast = generateFromFrozenCupTemplateBank(req, seedStr, rng, stats);
    if (fast) return fast;
    return fallbackLevel(req, { stats });
  }

  // Canonical thermos configs skip the random scan entirely (Gauntlet 10
  // §72): bounded THERMOS_TEMPLATE_ATTEMPTS validations, never a 150-deal
  // scan. maxRetries: 0 still yields a valid level through the fast path
  // or the validated fallback ladder.
  if (thermosTemplateKindFor(req) !== null) {
    const fast = generateFromThermosTemplateBank(req, seedStr, rng, stats);
    if (fast) return fast;
    return fallbackLevel(req, { stats });
  }

  // Canonical cinnamon configs skip the random scan entirely (Gauntlet 11
  // §107): bounded CINNAMON_TEMPLATE_ATTEMPTS validations, never a
  // 150-deal scan. maxRetries: 0 still yields a valid level through the
  // fast path or the validated fallback ladder.
  if (cinnamonTemplateKindFor(req) !== null) {
    const fast = generateFromCinnamonTemplateBank(req, seedStr, rng, stats);
    if (fast) return fast;
    return fallbackLevel(req, { stats });
  }

  // Closest-to-TARGET among ACCEPTED candidates only. Out-of-band deals
  // are rejected outright and never remembered.
  let bestAccepted: GeneratedLevel | null = null;
  let bestAcceptedDistance = Number.POSITIVE_INFINITY;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (stats) stats.candidatesTried++;
    const deal = dealCandidate(
      rng,
      req.numColors,
      req.colors,
      req.emptyCups,
      wantSourceOnly,
      wantTargets,
      wantSink,
      wantTasting,
      wantIngredient,
    );
    if (!deal) continue;
    if (isWonState(deal.cups, deal.cupConstraints)) continue;

    // Lemon slots for this deal (all-null when no lemon requested; the
    // gate re-validates host placement loudly).
    const dealSlots: FloatingIngredientSlot[] = emptyFloatingIngredients(deal.cups.length);
    if (deal.lemonHost !== null) dealSlots[deal.lemonHost] = wantIngredient ?? null;

    // Honey slots for non-canonical honey requests (production honey is
    // always canonical via the template bank; the gate re-validates).
    const dealSinkSlots: SinkingIngredientSlot[] = emptySinkingIngredients(deal.cups.length);
    if (wantHoney !== undefined) {
      let honeyHost: number | null = null;
      if (wantSourceOnly > 0) {
        honeyHost = deal.cups[0] !== undefined && isMixedFullCup(deal.cups[0] as TeaId[]) ? 0 : null;
      } else {
        honeyHost = selectHoneyHost(
          deal.cups,
          deal.cupConstraints,
          (candidates) => candidates[Math.floor(rng() * candidates.length)] ?? null,
        );
      }
      if (honeyHost === null) continue;
      dealSinkSlots[honeyHost] = wantHoney;
    }

    // Mystery placement uses the same rng stream (deterministic).
    // Never inside the teapot, guest cup, tasting bowl, a target cup —
    // or on the lemon/honey host.
    const hiddenCounts = deal.cups.map(() => 0);
    if (req.hasMysteryLayer) {
      const lemonIdx = dealSlots.findIndex((sl) => sl !== null);
      const honeyIdx = dealSinkSlots.findIndex((sl) => sl !== null);
      const idx = selectMysteryCup(
        deal.cups,
        (candidates) => {
          let eligible = candidates;
          if (lemonIdx >= 0) eligible = eligible.filter((c) => c !== lemonIdx);
          if (honeyIdx >= 0) eligible = eligible.filter((c) => c !== honeyIdx);
          const at = Math.floor(rng() * eligible.length);
          return eligible[at] ?? null;
        },
        deal.cupConstraints,
      );
      if (idx === null) continue; // no meaningful reveal possible — try another deal
      hiddenCounts[idx] = 1;
    }

    const level = finalizeCandidate(
      req,
      deal.cups,
      hiddenCounts,
      `${seedStr}#${attempt}`,
      deal.cupConstraints,
      stats,
      dealSlots,
      undefined,
      dealSinkSlots,
    );
    if (!level) continue;

    const dist = depthDistance(level.minMoves, req.phase);
    if (dist < bestAcceptedDistance) {
      bestAccepted = level;
      bestAcceptedDistance = dist;
    }
    if (dist === 0) return level; // sweet spot: early exit keeps latency low
  }

  if (bestAccepted) return bestAccepted;
  return fallbackLevel(req, { stats });
}

/**
 * Validate a produced level's structural invariants (production gate AND
 * test helper). Covers contract items A–F + K–AN:
 * A. correct number of cups; B. per-vessel capacity (dynamic); C. exactly
 * TEA_UNITS_PER_COLOR units per color (tea quantity is NOT vessel
 * capacity); D. not already solved; E. hiddenCounts length +
 * exactly-one-hidden iff mystery; F. mystery cup: length >= 3,
 * cup[0] !== cup[1], hiddenCount == 1, hidden cup is an untargeted NORMAL
 * (never teapot/guest/target/tasting); K. constraints length; L. exact
 * source-only count; M. teapot full + mixed + unhidden; N. exact requested
 * target TeaIds; O. no duplicate targets; P. targets in palette; Q. target
 * cups are normal; R. teapot carries no target; S. targets start full;
 * T. targets not pre-solved; U. mystery role check; V. exact sink-only
 * count; W. sink starts empty; X. sink has no target; Y. sink has no
 * Mystery; Z. sink at stable last slot; AA. at least one ordinary empty
 * beside the sink; AB. exact tasting count; AC. max one tasting; AD. tasting
 * mode normal; AE. tasting capacity 2; AF. tasting must-end-empty; AG. no
 * tasting target; AH. tasting starts empty; AI. no tasting Mystery; AJ.
 * tasting at stable last slot; AK. ordinary standard empty remains; AL. no
 * sink+tasting; AM. no target+tasting; AN. per-vessel capacity respected;
 * AO. floatingIngredients length == cups length; AP. exact requested
 * floating count; AQ. only supported ids; AR. lemon target tea in palette;
 * AS. exactly one lemon when requested; AT. host non-empty; AU. host full
 * standard; AV. host mixed; AW. host plain standard normal; AX. host
 * untargeted; AY. host not teapot/sink/tasting; AZ. host != Mystery host;
 * BA. initial lemon not already satisfied; BB. no unsupported lemon combos;
 * ER. frozenCupCount recognized (request validation); ES. production max
 * exactly 1; ET. iceSlots length == cups length; EU. exactly one ice when
 * requested; EV. ice host standard normal; EW. ice host capacity 4; EX. ice
 * host starts length 3; EY. ice host mixed; EZ. ice host top ==
 * sea_buckthorn; FA. ice host holds exactly one sea_buckthorn; FB. initial
 * layer-count multiset == 4,4,4,3,1,0; FC. total tea units per TeaId remain
 * exactly 4 (covered by C); FD. exactly one truly empty cup; FE. no
 * third/sibling special mechanic. Solver items G–J, BC–BE and FF–FL are
 * enforced by finalizeCandidate, not here.
 */
export function validateLevelStructure(
  level: GeneratedLevel,
  req: GenerateRequest,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const totalCups = req.numColors + req.emptyCups;
  if (level.cups.length !== totalCups) {
    reasons.push(`expected ${totalCups} cups, got ${level.cups.length}`);
  }
  const constraints = level.cupConstraints ?? [];
  // Normalized once for every check below (AO–BE, D): legacy levels carry
  // all-null slots, so tea-only behavior is unchanged.
  const slots: FloatingIngredientSlot[] = normalizeFloatingIngredients(
    level.floatingIngredients,
    level.cups.length,
  );
  const presentIds = slots.filter((s): s is FloatingIngredientId => s != null);
  const counts = new Map<string, number>();
  level.cups.forEach((cup, i) => {
    // AN: dynamic per-vessel capacity (a 2/2 tasting bowl is full, a 3/2
    // bowl is overfull). Tea quantity is validated separately below.
    if (cup.length > cupCapacity(constraints[i])) {
      reasons.push(`cup ${i} exceeds its own capacity ${cupCapacity(constraints[i])} (AN)`);
    }
    cup.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1));
  });
  req.colors.slice(0, req.numColors).forEach((c) => {
    if ((counts.get(c) ?? 0) !== TEA_UNITS_PER_COLOR) {
      reasons.push(`color ${c} has ${counts.get(c) ?? 0} units, expected ${TEA_UNITS_PER_COLOR}`);
    }
  });
  if (constraints.length !== level.cups.length) {
    reasons.push(
      `cupConstraints length ${constraints.length} mismatches cups ${level.cups.length}`,
    );
  }
  const wantSourceOnly = requestedSourceOnlyCount(req);
  const gotSourceOnly = constraints.filter((c) => c?.mode === 'source-only').length;
  if (gotSourceOnly !== wantSourceOnly) {
    reasons.push(`expected ${wantSourceOnly} source-only vessels, got ${gotSourceOnly}`);
  }
  const wantSinkOnly = requestedSinkOnlyCount(req);
  const gotSinkOnly = constraints.filter((c) => c?.mode === 'sink-only').length;
  if (gotSinkOnly !== wantSinkOnly) {
    reasons.push(`expected ${wantSinkOnly} sink-only vessels, got ${gotSinkOnly} (V)`);
  }
  constraints.forEach((c, i) => {
    if (c?.mode !== 'normal' && c?.mode !== 'source-only' && c?.mode !== 'sink-only') {
      reasons.push(`cup ${i} has unknown mode`);
    }
    if (c?.mode === 'source-only' && c?.targetTeaId !== undefined) {
      reasons.push(`teapot ${i} must not carry a target (R)`);
    }
    if (c?.mode === 'sink-only' && c?.targetTeaId !== undefined) {
      reasons.push(`guest cup ${i} must not carry a target (X)`);
    }
    if (c?.targetTeaId !== undefined && c?.mode !== 'normal') {
      reasons.push(`target cup ${i} must be normal (Q)`);
    }
  });
  const wantTastingOnly = requestedTastingCupCount(req);
  const gotTastingOnly = constraints.filter(isTastingCupConstraint).length;
  if (gotTastingOnly !== wantTastingOnly) {
    reasons.push(`expected ${wantTastingOnly} tasting vessels, got ${gotTastingOnly} (AB)`);
  }
  level.cups.forEach((cup, i) => {
    if (constraints[i]?.mode === 'source-only') {
      if (cup.length === 0) reasons.push(`teapot ${i} starts empty`);
      if (cup.length !== STANDARD_CUP_CAPACITY) reasons.push(`teapot ${i} must start full`);
      if (cup.length > 0 && !isMixedFullCup(cup) && cup.length === STANDARD_CUP_CAPACITY) {
        reasons.push(`teapot ${i} must contain at least 2 TeaIds`);
      }
      if ((level.hiddenCounts[i] ?? 0) !== 0) reasons.push(`teapot ${i} must not hide mystery`);
    }
    if (constraints[i]?.mode === 'sink-only') {
      if (cup.length !== 0) reasons.push(`guest cup ${i} must start empty (W)`);
      if ((level.hiddenCounts[i] ?? 0) !== 0) reasons.push(`guest cup ${i} must not hide mystery (Y)`);
    }
    if (isTastingCupConstraint(constraints[i])) {
      if (constraints[i]?.mode !== 'normal') reasons.push(`tasting bowl ${i} must be normal (AD)`);
      if (cupCapacity(constraints[i]) !== TASTING_BOWL_CAPACITY) {
        reasons.push(`tasting bowl ${i} must have capacity 2 (AE)`);
      }
      if (!mustEndEmpty(constraints[i])) reasons.push(`tasting bowl ${i} must end empty (AF)`);
      if (constraints[i]?.targetTeaId !== undefined) {
        reasons.push(`tasting bowl ${i} must not carry a target (AG)`);
      }
      if (cup.length !== 0) reasons.push(`tasting bowl ${i} must start empty (AH)`);
      if ((level.hiddenCounts[i] ?? 0) !== 0) {
        reasons.push(`tasting bowl ${i} must not hide mystery (AI)`);
      }
    }
    const target = constraints[i]?.targetTeaId;
    if (target !== undefined) {
      if (cup.length !== STANDARD_CUP_CAPACITY) reasons.push(`target cup ${i} must start full (S)`);
      if (cup.length === STANDARD_CUP_CAPACITY && isInFinalState(cup, constraints[i])) {
        reasons.push(`target cup ${i} starts already complete (T)`);
      }
      if ((level.hiddenCounts[i] ?? 0) !== 0) {
        reasons.push(`target cup ${i} must not hide mystery (U)`);
      }
      if (
        cupCapacity(constraints[i]) !== STANDARD_CUP_CAPACITY ||
        mustEndEmpty(constraints[i] as CupConstraint)
      ) {
        reasons.push(`target cup ${i} must be a standard vessel (AM)`);
      }
    }
  });
  if (wantTastingOnly > 0) {
    if (!isTastingCupConstraint(constraints[constraints.length - 1])) {
      reasons.push('tasting bowl must sit at the stable last slot (AJ)');
    }
    const ordinaryEmpty = constraints.filter(
      (c, i) =>
        c?.mode === 'normal' &&
        !isTastingCupConstraint(c) &&
        cupCapacity(c) === STANDARD_CUP_CAPACITY &&
        (level.cups[i] as TeaId[]).length === 0,
    ).length;
    if (ordinaryEmpty < 1) {
      reasons.push('tasting production must keep at least one ordinary standard empty (AK)');
    }
    if (requestedTargetTeas(req).length > 0) {
      reasons.push('tasting + targets is out of scope for Gauntlet 4 (AM)');
    }
    if (constraints.some((c) => c?.mode === 'sink-only')) {
      reasons.push('tasting + sink is out of scope for Gauntlet 4 (AL)');
    }
  }
  // N/O/P: exact requested target identities, unique, in palette.
  const wantTargets = requestedTargetTeas(req);
  const actualTargets = constraints
    .filter((c) => c?.targetTeaId !== undefined)
    .map((c) => c?.targetTeaId as TeaId);
  if (new Set(actualTargets).size !== actualTargets.length) {
    reasons.push(`duplicate targetTeaIds (O): ${actualTargets.join(',')}`);
  }
  if (
    actualTargets.length !== wantTargets.length ||
    !wantTargets.every((t) => actualTargets.includes(t))
  ) {
    reasons.push(`expected targets [${wantTargets.join(',')}], got [${actualTargets.join(',')}] (N)`);
  }
  const palette = req.colors.slice(0, req.numColors);
  for (const t of actualTargets) {
    if (!palette.includes(t)) reasons.push(`targetTeaId ${t} not in palette (P)`);
  }
  // D: not already solved (lemon/honey/ice-aware: tea-sorted with an
  // ingredient on the wrong tea — or with active ice — is NOT a solved start).
  const sinkSlotsForD: SinkingIngredientSlot[] = normalizeSinkingIngredients(
    level.sinkingIngredients,
    level.cups.length,
  );
  const sinkPresentForD = sinkSlotsForD.filter((s) => s != null);
  const iceSlotsForD: IceSlot[] = normalizeIceSlots(level.iceSlots, level.cups.length);
  const icePresentForD = iceSlotsForD.filter((s) => s != null);
  const startWon =
    presentIds.length > 0 || sinkPresentForD.length > 0 || icePresentForD.length > 0
      ? isPuzzleWonState(
          {
            cups: level.cups,
            floatingIngredients: slots,
            sinkingIngredients: sinkSlotsForD,
            strainer: level.strainer,
            iceSlots: iceSlotsForD,
          },
          constraints.length > 0 ? constraints : undefined,
        )
      : isWonState(level.cups, constraints.length > 0 ? constraints : undefined);
  if (startWon) {
    reasons.push('level is already solved');
  }
  if (level.hiddenCounts.length !== level.cups.length) {
    reasons.push('hiddenCounts length mismatch');
  } else {
    const hiddenIndices = level.hiddenCounts
      .map((h, i) => (h > 0 ? i : -1))
      .filter((i) => i >= 0);
    if (req.hasMysteryLayer) {
      if (hiddenIndices.length !== 1) {
        reasons.push(`expected exactly 1 hidden cup, got ${hiddenIndices.length}`);
      } else {
        const hiddenIdx = hiddenIndices[0] as number;
        const cup = level.cups[hiddenIdx] as TeaId[];
        if (cup.length < 3) reasons.push('mystery cup too short');
        if (cup[0] === cup[1]) reasons.push('hidden layer equals adjacent visible layer');
        if ((level.hiddenCounts[hiddenIdx] as number) !== 1) reasons.push('hiddenCount must be 1');
        if (constraints[hiddenIdx]?.mode !== 'normal') {
          reasons.push('mystery must be on a normal cup, never the teapot/guest cup');
        }
        if (constraints[hiddenIdx]?.mode === 'sink-only') {
          reasons.push('mystery must not be on the guest cup (Y)');
        }
        if (isTastingCupConstraint(constraints[hiddenIdx])) {
          reasons.push('mystery must not be in the tasting bowl (AI)');
        }
        if (constraints[hiddenIdx]?.targetTeaId !== undefined) {
          reasons.push('mystery must not be on a target cup (U)');
        }
      }
    } else if (hiddenIndices.length !== 0) {
      reasons.push(`unexpected hidden layers without mystery: ${hiddenIndices.length}`);
    }
  }
  // Z/AA: sink occupies the stable last slot with an ordinary empty spare.
  if (wantSinkOnly > 0) {
    if (constraints[constraints.length - 1]?.mode !== 'sink-only') {
      reasons.push('guest cup must sit at the stable last slot (Z)');
    }
    const ordinaryEmpty = constraints.filter(
      (c, i) => c?.mode === 'normal' && (level.cups[i] as TeaId[]).length === 0,
    ).length;
    if (ordinaryEmpty < 1) {
      reasons.push('sink production must keep at least one ordinary empty (AA)');
    }
    if (wantTargets.length > 0) {
      reasons.push('sink-only + targets is out of scope for Gauntlet 3');
    }
  }
  // AO–BB: floating-ingredient structural invariant.
  const wantIngredient = requestedFloatingIngredient(req);
  if ((level.floatingIngredients ?? []).length !== level.cups.length) {
    reasons.push(`floatingIngredients length mismatch (AO): got ${(level.floatingIngredients ?? []).length}`);
  }
  if (wantIngredient === undefined) {
    if (presentIds.length !== 0) {
      reasons.push(`unexpected floating ingredients without request (AP): ${presentIds.join(',')}`);
    }
  } else {
    const known = (FLOATING_INGREDIENT_TYPES as Record<string, { targetTeaId: TeaId } | undefined>)[
      wantIngredient
    ];
    if (!known) {
      reasons.push(`unsupported floating ingredient ${wantIngredient} (AQ)`);
    } else {
      const palette = req.colors.slice(0, req.numColors);
      if (!palette.includes(known.targetTeaId)) {
        reasons.push(`lemon target tea ${known.targetTeaId} not in palette (AR)`);
      }
      if (presentIds.length !== 1 || presentIds[0] !== wantIngredient) {
        reasons.push(`expected exactly one ${wantIngredient} (AS), got [${presentIds.join(',')}]`);
      } else {
        const host = slots.findIndex((s) => s === wantIngredient);
        const hostCup = level.cups[host] as TeaId[];
        const hostC = constraints[host] as CupConstraint | undefined;
        if (!hostCup || hostCup.length === 0) reasons.push(`lemon host ${host} starts empty (AT)`);
        if (hostCup && hostCup.length !== STANDARD_CUP_CAPACITY) {
          reasons.push(`lemon host ${host} must start full standard (AU)`);
        }
        if (hostCup && hostCup.length > 0 && !isMixedFullCup(hostCup) && hostCup.length === STANDARD_CUP_CAPACITY) {
          reasons.push(`lemon host ${host} must start mixed (AV)`);
        }
        if (!hostC || hostC.mode !== 'normal' || hostC.targetTeaId !== undefined) {
          reasons.push(`lemon host ${host} must be untargeted plain normal (AW/AX)`);
        }
        if (hostC && (cupCapacity(hostC) !== STANDARD_CUP_CAPACITY || mustEndEmpty(hostC))) {
          reasons.push(`lemon host ${host} must be a standard vessel (AW)`);
        }
        if (hostC && (hostC.mode !== 'normal' || isTastingCupConstraint(hostC))) {
          reasons.push(`lemon host ${host} must not be teapot/sink/tasting (AY)`);
        }
        if ((level.hiddenCounts[host] ?? 0) !== 0) {
          reasons.push(`lemon host ${host} must not be the Mystery cup (AZ)`);
        }
        if (
          hostC &&
          floatingIngredientHostSatisfied(wantIngredient, hostCup ?? [], hostC)
        ) {
          reasons.push(`lemon must not start already satisfied (BA)`);
        }
      }
      if (constraints.some((c) => c?.mode === 'sink-only')) {
        reasons.push('lemon + sink is out of scope for Gauntlet 5 (BB)');
      }
      if (constraints.some((c) => c?.targetTeaId !== undefined)) {
        reasons.push('lemon + targets is out of scope for Gauntlet 5 (BB)');
      }
      if (constraints.some((c) => c && isTastingCupConstraint(c))) {
        reasons.push('lemon + tasting is out of scope for Gauntlet 5 (BB)');
      }
    }
  }
  // BF–BO: strainer structural invariant (solver items BP–CA live in
  // finalizeCandidate, not here).
  const wantStrainer = requestedHasStrainer(req);
  const strainerState = normalizeStrainerState(level.strainer);
  if (!wantStrainer) {
    if (strainerState.present) reasons.push('unexpected strainer without request (BG)');
  } else {
    if (!strainerState.present) reasons.push('expected strainer present (BH)');
    if (strainerState.present && strainerState.attachedCupIndex !== null) {
      reasons.push('strainer must start on its stand (BI)');
    }
    if (strainerState.present && strainerState.heldTea !== null) {
      reasons.push('strainer must start empty (BJ)');
    }
    if (req.numColors === 4 && !req.hasMysteryLayer && requestedSourceOnlyCount(req) === 0) {
      if (!(req.numColors === 4 && level.cups.length === 5 && req.emptyCups === 1)) {
        reasons.push('strainer challenge must be 4c/5v/1e (BL)');
      }
    } else if (req.numColors === 5 && req.hasMysteryLayer && requestedSourceOnlyCount(req) === 0) {
      if (!(req.numColors === 5 && level.cups.length === 6 && req.emptyCups === 1)) {
        reasons.push('strainer peak must be 5c/6v/1e (BM)');
      }
    } else if (requestedSourceOnlyCount(req) === 1) {
      if (!(req.numColors === 4 && level.cups.length === 5 && req.emptyCups === 1)) {
        reasons.push('teapot strainer challenge must be 4c/5v/1e + teapot0 (BN)');
      }
    } else {
      reasons.push('unsupported strainer request shape (BK–BN)');
    }
    if (presentIds.length > 0) reasons.push('strainer + lemon is out of scope for Gauntlet 6 (BO)');
    if (constraints.some((c) => c?.mode === 'sink-only')) {
      reasons.push('strainer + sink is out of scope for Gauntlet 6 (BO)');
    }
    if (constraints.some((c) => c && isTastingCupConstraint(c))) {
      reasons.push('strainer + tasting is out of scope for Gauntlet 6 (BO)');
    }
    if (constraints.some((c) => c?.targetTeaId !== undefined)) {
      reasons.push('strainer + targets is out of scope for Gauntlet 6 (BO)');
    }
    const emptyStarts = level.cups.filter((c) => c.length === 0).length;
    if (emptyStarts !== 1) reasons.push(`strainer levels must start with exactly 1 empty vessel, got ${emptyStarts} (BL–BN)`);
  }
  // CB–CO: sinking-honey structural invariant (solver items CP–CV live in
  // finalizeCandidate, not here).
  const wantHoney = requestedSinkingIngredient(req);
  const sinkSlots: SinkingIngredientSlot[] = normalizeSinkingIngredients(
    level.sinkingIngredients,
    level.cups.length,
  );
  if (sinkSlots.length !== level.cups.length) {
    reasons.push(`sinkingIngredients length mismatch (CB): got ${sinkSlots.length}`);
  }
  const sinkPresentIds = sinkSlots.filter((s): s is SinkingIngredientId => s != null);
  if (wantHoney === undefined) {
    if (sinkPresentIds.length !== 0) {
      reasons.push(`unexpected sinking ingredients without request: ${sinkPresentIds.join(',')}`);
    }
  } else {
    const honeyKnown = (SINKING_INGREDIENT_TYPES as Record<string, { targetTeaId: TeaId } | undefined>)[
      wantHoney
    ];
    if (!honeyKnown) {
      reasons.push(`unsupported sinking ingredient ${wantHoney} (CD)`);
    } else {
      const honeyPalette = req.colors.slice(0, req.numColors);
      if (!honeyPalette.includes(honeyKnown.targetTeaId)) {
        reasons.push(`honey target tea ${honeyKnown.targetTeaId} not in palette (CE)`);
      }
      if (sinkPresentIds.length !== 1 || sinkPresentIds[0] !== wantHoney) {
        reasons.push(`expected exactly one ${wantHoney} (CF), got [${sinkPresentIds.join(',')}]`);
      } else {
        const host = sinkSlots.findIndex((s) => s === wantHoney);
        const hostCup = level.cups[host] as TeaId[];
        const hostC = constraints[host] as CupConstraint | undefined;
        if (!hostCup || hostCup.length === 0) reasons.push(`honey host ${host} starts empty (CG)`);
        if (hostCup && hostCup.length !== STANDARD_CUP_CAPACITY) {
          reasons.push(`honey host ${host} must start full standard (CH)`);
        }
        if (hostCup && hostCup.length > 0 && !isMixedFullCup(hostCup) && hostCup.length === STANDARD_CUP_CAPACITY) {
          reasons.push(`honey host ${host} must start mixed (CI/CN)`);
        }
        if (requestedSourceOnlyCount(req) === 1) {
          if (host !== 0) reasons.push(`teapot honey host must be index 0 (CM), got ${host}`);
          if (constraints[0]?.mode !== 'source-only') reasons.push('teapot honey requires a teapot at index 0 (CM)');
        } else {
          if (!hostC || hostC.mode !== 'normal' || hostC.targetTeaId !== undefined) {
            reasons.push(`honey host ${host} must be untargeted plain normal (CJ)`);
          }
          if (hostC && (cupCapacity(hostC) !== STANDARD_CUP_CAPACITY || mustEndEmpty(hostC))) {
            reasons.push(`honey host ${host} must be a standard vessel (CJ)`);
          }
          if (hostC && (hostC.mode !== 'normal' || isTastingCupConstraint(hostC))) {
            reasons.push(`honey host ${host} must not be teapot/sink/tasting (CJ)`);
          }
        }
        if (hostC && sinkingIngredientHostSatisfied(wantHoney, hostCup ?? [], hostC)) {
          reasons.push('honey must not start already satisfied (CK)');
        }
        if ((level.hiddenCounts[host] ?? 0) !== 0) {
          reasons.push(`honey host ${host} must not be the Mystery cup (CL)`);
        }
        if (isLemonHoneyInteractionRequest(req)) {
          const lemonHost = slots.findIndex((s) => s === 'lemon');
          if (lemonHost === host) {
            reasons.push('lemon and honey initial hosts must differ (CZ)');
          }
        }
      }
      if (presentIds.length > 0 && !isLemonHoneyInteractionRequest(req)) {
        reasons.push('honey + lemon is out of scope for Gauntlet 7 (CO)');
      }
      if (isLemonHoneyInteractionRequest(req)) {
        if (presentIds.length !== 1 || presentIds[0] !== 'lemon') {
          reasons.push(`interaction requires exactly one lemon (CX), got [${presentIds.join(',')}]`);
        }
        const lemonPalette = req.colors.slice(0, req.numColors);
        if (!lemonPalette.includes('sea_buckthorn') || !lemonPalette.includes('buckwheat')) {
          reasons.push('interaction palette must contain sea_buckthorn and buckwheat (DD/DE)');
        }
      }
      if (normalizeStrainerState(level.strainer).present) {
        reasons.push('honey + strainer is out of scope for Gauntlet 7 (CO)');
      }
      if (constraints.some((c) => c?.mode === 'sink-only')) {
        reasons.push('honey + sink is out of scope for Gauntlet 7 (CO)');
      }
      if (constraints.some((c) => c?.targetTeaId !== undefined)) {
        reasons.push('honey + targets is out of scope for Gauntlet 7 (CO)');
      }
      if (constraints.some((c) => c && isTastingCupConstraint(c))) {
        reasons.push('honey + tasting is out of scope for Gauntlet 7 (CO)');
      }
    }
  }
  // ER–FE: frozen-cup structural invariant (solver items FF–FL live in
  // finalizeCandidate, not here).
  const wantFrozen = requestedFrozenCupCount(req);
  const iceSlots: IceSlot[] = normalizeIceSlots(level.iceSlots, level.cups.length);
  if (iceSlots.length !== level.cups.length) {
    reasons.push(`iceSlots length mismatch (ET): got ${iceSlots.length}`);
  }
  const icePresentIds = iceSlots.filter((s): s is 'ice' => s != null);
  if (wantFrozen === 0) {
    if (icePresentIds.length !== 0) {
      reasons.push(`unexpected ice without request: ${icePresentIds.join(',')}`);
    }
  } else {
    if (icePresentIds.length !== 1 || icePresentIds[0] !== 'ice') {
      reasons.push(`expected exactly one ice (EU), got [${icePresentIds.join(',')}]`);
    } else {
      const host = iceSlots.findIndex((s) => s === 'ice');
      const hostCup = level.cups[host] as TeaId[];
      const hostC = constraints[host] as CupConstraint | undefined;
      if (!hostCup || hostCup.length !== 3) reasons.push(`frozen host ${host} must hold exactly 3 layers (EX)`);
      if (!hostC || hostC.mode !== 'normal' || hostC.targetTeaId !== undefined) {
        reasons.push(`frozen host ${host} must be untargeted plain normal (EV)`);
      }
      if (hostC && (cupCapacity(hostC) !== STANDARD_CUP_CAPACITY || mustEndEmpty(hostC))) {
        reasons.push(`frozen host ${host} must be a standard vessel (EV/EW)`);
      }
      if (hostC && (hostC.mode !== 'normal' || isTastingCupConstraint(hostC))) {
        reasons.push(`frozen host ${host} must not be teapot/sink/tasting (EV)`);
      }
      if (hostCup && hostCup.length > 0) {
        const first = hostCup[0] as TeaId;
        if (!hostCup.some((t) => t !== first)) reasons.push(`frozen host ${host} must start mixed (EY)`);
        if (hostCup[hostCup.length - 1] !== FROZEN_CUP_TARGET_TEA) {
          reasons.push(`frozen host ${host} top must be ${FROZEN_CUP_TARGET_TEA} (EZ)`);
        }
        if (hostCup.filter((t) => t === FROZEN_CUP_TARGET_TEA).length !== 1) {
          reasons.push(`frozen host ${host} must contain exactly one ${FROZEN_CUP_TARGET_TEA} (FA)`);
        }
      }
      if ((level.hiddenCounts[host] ?? 0) !== 0) {
        reasons.push(`frozen host ${host} must not hide mystery`);
      }
    }
    const lens = level.cups.map((c) => c.length).sort((a, b) => a - b);
    if (JSON.stringify(lens) !== JSON.stringify([0, 1, 3, 4, 4, 4])) {
      reasons.push(`frozen-cup levels must start 4,4,4,3,1,0 (FB), got [${lens.join(',')}]`);
    }
    if (level.cups.filter((c) => c.length === 0).length !== 1) {
      reasons.push('frozen-cup levels must keep exactly one truly empty cup (FD)');
    }
    if (presentIds.length > 0) reasons.push('frozen cup + lemon is out of scope for Gauntlet 9 (FE)');
    if (sinkPresentForD.length > 0) reasons.push('frozen cup + honey is out of scope for Gauntlet 9 (FE)');
    if (normalizeStrainerState(level.strainer).present) {
      reasons.push('frozen cup + strainer is out of scope for Gauntlet 9 (FE)');
    }
    if (constraints.some((c) => c?.mode === 'sink-only')) {
      reasons.push('frozen cup + sink is out of scope for Gauntlet 9 (FE)');
    }
    if (constraints.some((c) => c?.targetTeaId !== undefined)) {
      reasons.push('frozen cup + targets is out of scope for Gauntlet 9 (FE)');
    }
    if (constraints.some((c) => c && isTastingCupConstraint(c))) {
      reasons.push('frozen cup + tasting is out of scope for Gauntlet 9 (FE)');
    }
    if (requestedSourceOnlyCount(req) > 0) {
      reasons.push('frozen cup + teapot is out of scope for Gauntlet 9 (FE)');
    }
    if (req.hasMysteryLayer) {
      reasons.push('frozen cup + Mystery is out of scope for Gauntlet 9 (FE)');
    }
  }
  // FM–GH: thermos structural invariant (solver L2 items GB–GG live in
  // finalizeCandidate, not here).
  const wantThermos = requestedThermosCupCount(req);
  const gotThermos = constraints.filter(isThermosCupConstraint).length;
  if (gotThermos !== wantThermos) {
    reasons.push(`expected ${wantThermos} thermos vessels, got ${gotThermos} (FO)`);
  }
  if (wantThermos > 1) {
    reasons.push(`thermos production max one (FN), got ${wantThermos}`);
  }
  if (wantThermos > 0) {
    const host = constraints.findIndex((c) => isThermosCupConstraint(c));
    const hostCup = level.cups[host] as TeaId[];
    const hostC = constraints[host] as CupConstraint | undefined;
    if (!hostC || hostC.mode !== 'normal') reasons.push(`thermos host ${host} must be normal (FP)`);
    if (hostC && cupCapacity(hostC) !== THERMOS_CAPACITY) {
      reasons.push(`thermos host ${host} must have capacity 5 (FQ)`);
    }
    if (hostC && !mustEndEmpty(hostC)) reasons.push(`thermos host ${host} must end empty (FR)`);
    if (hostC?.targetTeaId !== undefined) reasons.push(`thermos host ${host} must not carry a target (FS)`);
    if (!hostCup || hostCup.length !== 3) reasons.push(`thermos host ${host} must hold exactly 3 layers T3 (FU)`);
    if (hostCup && hostCup.length > 0) {
      const first = hostCup[0] as TeaId;
      if (!hostCup.some((t) => t !== first)) reasons.push(`thermos host ${host} must start mixed (FV)`);
      const top = hostCup[hostCup.length - 1] as TeaId;
      if (hostCup.filter((t) => t === top).length !== 1) {
        reasons.push(`thermos host ${host} top must appear exactly once (FW)`);
      }
    }
    const lens = level.cups.map((c) => c.length).sort((a, b) => a - b);
    if (JSON.stringify(lens) !== JSON.stringify([0, 2, 3, 3, 4, 4])) {
      reasons.push(`thermos levels must start 4,4,3,3,2,0 (FX), got [${lens.join(',')}]`);
    }
    if (level.cups.filter((c) => c.length === 0).length !== 1) {
      reasons.push('thermos levels must keep exactly one truly empty normal (FZ)');
    }
    if ((level.hiddenCounts[host] ?? 0) !== 0) {
      reasons.push(`thermos host ${host} must not hide mystery`);
    }
    if (presentIds.length > 0) reasons.push('thermos + lemon is out of scope for Gauntlet 10 (GA)');
    if (sinkPresentForD.length > 0) reasons.push('thermos + honey is out of scope for Gauntlet 10 (GA)');
    if (normalizeStrainerState(level.strainer).present) {
      reasons.push('thermos + strainer is out of scope for Gauntlet 10 (GA)');
    }
    if (constraints.some((c) => c?.mode === 'sink-only')) {
      reasons.push('thermos + sink is out of scope for Gauntlet 10 (GA)');
    }
    if (constraints.some((c) => c?.targetTeaId !== undefined)) {
      reasons.push('thermos + targets is out of scope for Gauntlet 10 (GA)');
    }
    if (constraints.some((c) => c && isTastingCupConstraint(c))) {
      reasons.push('thermos + tasting is out of scope for Gauntlet 10 (GA)');
    }
    if (icePresentForD.length > 0) reasons.push('thermos + frozen cup is out of scope for Gauntlet 10 (GA)');
    if (requestedSourceOnlyCount(req) > 0) {
      reasons.push('thermos + teapot is out of scope for Gauntlet 10 (GA)');
    }
    if (req.hasMysteryLayer) {
      reasons.push('thermos + Mystery is out of scope for Gauntlet 10 (GA)');
    }
  } else {
    if (constraints.some((c) => isThermosCupConstraint(c))) {
      reasons.push('unexpected thermos without request (FM)');
    }
  }
  // GI–HA: cinnamon structural invariant (solver L2 items GU–HA live in
  // finalizeCandidate, not here).
  const wantCinnamon = requestedCinnamonCupCount(req);
  const obstacleSlots = normalizeCapacityObstacles(level.capacityObstacles, level.cups.length);
  const gotCinnamon = obstacleSlots.filter((s) => s !== null).length;
  if (gotCinnamon !== wantCinnamon) {
    reasons.push(`expected ${wantCinnamon} cinnamon obstacles, got ${gotCinnamon} (GL)`);
  }
  if (wantCinnamon > 1) {
    reasons.push(`cinnamon production max one (GJ), got ${wantCinnamon}`);
  }
  if (wantCinnamon > 0) {
    if (obstacleSlots.filter((s) => s === 'cinnamon').length !== 1) {
      reasons.push(`expected exactly one cinnamon obstacle (GL), got [${obstacleSlots.join(',')}]`);
    } else {
      const host = obstacleSlots.findIndex((s) => s === 'cinnamon');
      const hostCup = level.cups[host] as TeaId[];
      const hostC = constraints[host] as CupConstraint | undefined;
      if (!hostC || hostC.mode !== 'normal' || hostC.targetTeaId !== undefined) {
        reasons.push(`cinnamon host ${host} must be untargeted plain normal (GM)`);
      }
      if (hostC && cupCapacity(hostC) !== STANDARD_CUP_CAPACITY) {
        reasons.push(`cinnamon host ${host} must keep base capacity 4 (GN)`);
      }
      if (!hostCup || hostCup.length !== 2) reasons.push(`cinnamon host ${host} must hold exactly 2 layers (GO)`);
      if (hostCup && hostCup.length > 0) {
        const first = hostCup[0] as TeaId;
        if (!hostCup.some((t) => t !== first)) reasons.push(`cinnamon host ${host} must start mixed (GP)`);
      }
      if ((level.hiddenCounts[host] ?? 0) !== 0) {
        reasons.push(`cinnamon host ${host} must not hide mystery`);
      }
    }
    const lens = level.cups.map((c) => c.length).sort((a, b) => a - b);
    if (JSON.stringify(lens) !== JSON.stringify([0, 2, 3, 3, 4, 4])) {
      reasons.push(`cinnamon levels must start 4,4,3,3,2,0 (GQ), got [${lens.join(',')}]`);
    }
    if (level.cups.filter((c) => c.length === 0).length !== 1) {
      reasons.push('cinnamon levels must keep exactly one truly empty normal (GS)');
    }
    if (presentIds.length > 0) reasons.push('cinnamon + lemon is out of scope for Gauntlet 11 (GT)');
    if (sinkPresentForD.length > 0) reasons.push('cinnamon + honey is out of scope for Gauntlet 11 (GT)');
    if (normalizeStrainerState(level.strainer).present) {
      reasons.push('cinnamon + strainer is out of scope for Gauntlet 11 (GT)');
    }
    if (constraints.some((c) => c?.mode === 'sink-only')) {
      reasons.push('cinnamon + sink is out of scope for Gauntlet 11 (GT)');
    }
    if (constraints.some((c) => c?.targetTeaId !== undefined)) {
      reasons.push('cinnamon + targets is out of scope for Gauntlet 11 (GT)');
    }
    if (constraints.some((c) => c && isTastingCupConstraint(c))) {
      reasons.push('cinnamon + tasting is out of scope for Gauntlet 11 (GT)');
    }
    if (icePresentForD.length > 0) reasons.push('cinnamon + frozen cup is out of scope for Gauntlet 11 (GT)');
    if (constraints.some((c) => isThermosCupConstraint(c))) {
      reasons.push('cinnamon + thermos is out of scope for Gauntlet 11 (GT)');
    }
    if (requestedSourceOnlyCount(req) > 0) {
      reasons.push('cinnamon + teapot is out of scope for Gauntlet 11 (GT)');
    }
    if (req.hasMysteryLayer) {
      reasons.push('cinnamon + Mystery is out of scope for Gauntlet 11 (GT)');
    }
  } else {
    if (obstacleSlots.some((s) => s !== null)) {
      reasons.push('unexpected capacity obstacle without request (GI)');
    }
  }
  // Homogeneity helper stays referenced for future mixed-block checks.
  void isHomogeneous;
  return { ok: reasons.length === 0, reasons };
}
