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
 *
 * TARGET (desired sweet spot) and ACCEPTANCE (hard safety band) are kept
 * explicit: generation prefers candidates closest to target, but ONLY among
 * candidates inside acceptance. An out-of-band `best` is never returned.
 *
 * Bounded: at most maxRetries deals + a small fixed fallback ladder.
 * Deterministic for a given (request, seed).
 */

import {
  CupConstraint,
  STANDARD_CUP_CAPACITY,
  TASTING_BOWL_CAPACITY,
  TEA_UNITS_PER_COLOR,
  TeaId,
  cloneCupConstraint,
  cupCapacity,
  defaultCupConstraints,
  isTastingCupConstraint,
  mustEndEmpty,
} from '../types';
import { isHomogeneous, isInFinalState, isWonState } from './rules';
import { createRng, Rng, SeedInput, shuffleInPlace } from './rng';
import { solvePuzzle } from './solver';
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
}

export interface GeneratedLevel {
  cups: TeaId[][];
  hiddenCounts: number[];
  /** Immutable per-vessel roles, aligned with `cups` indices. */
  cupConstraints: CupConstraint[];
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

  if (sourceOnlyCount <= 0) {
    const base = defaultCupConstraints(cups.length);
    if (targetTeas.length === 0) {
      if (sinkOnlyCount > 0) {
        if (!placeSinkAtLastSlot(base)) return null;
      }
      if (tastingCupCount > 0) {
        if (!placeTastingAtLastSlot(base)) return null;
      }
      return { cups, cupConstraints: base };
    }
    const withTargets = assignTargetConstraints(
      cups,
      base,
      targetTeas,
      false,
      (candidates) => candidates[Math.floor(rng() * candidates.length)] as number,
    );
    if (!withTargets) return null;
    return { cups, cupConstraints: withTargets };
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
    return { cups, cupConstraints };
  }
  const withTargets = assignTargetConstraints(
    cups,
    cupConstraints,
    targetTeas,
    true,
    (candidates) => candidates[Math.floor(rng() * candidates.length)] as number,
  );
  if (!withTargets) return null;
  return { cups, cupConstraints: withTargets };
}

/**
 * Single production gate shared by EVERY return path (normal candidates,
 * retry fallback, safety-net scan). Returns the level only when the full
 * contract A–U holds, otherwise null (caller rejects / moves on).
 */
function finalizeCandidate(
  req: GenerateRequest,
  cups: TeaId[][],
  hiddenCounts: number[],
  seed: string,
  cupConstraints: readonly CupConstraint[],
  stats?: GenerateStats,
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
  if (isWonState(cups, normalized)) return null; // D
  if (stats) stats.solverCalls++;
  const solved = solvePuzzle(cups, {
    maxVisited: SOLVER_BUDGET_PER_CANDIDATE,
    cupConstraints: normalized,
  });
  if (!solved.solvable || solved.truncated) return null; // G, H
  if (solved.minMoves === undefined) return null; // I
  if (!depthAccepted(solved.minMoves, req.phase)) return null; // J
  const level: GeneratedLevel = {
    cups,
    hiddenCounts,
    cupConstraints: normalized,
    seed,
    minMoves: solved.minMoves,
    visitedStates: solved.visitedStates,
  };
  if (!validateLevelStructure(level, req).ok) return null; // A–F, K–U
  return level;
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
 * Dedicated tasting-bowl fallback shapes (Gauntlet 4), palette-parameterized.
 * The bowl sits EMPTY (capacity 2, must-end-empty) at the stable last slot
 * with one ordinary standard empty spare; color counts are preserved by
 * construction (pure permutation of the TEA_UNITS_PER_COLOR pool). Every
 * shape passes through `finalizeCandidate`, so only genuinely in-band
 * layouts are returned — these are candidates, not trusted layouts.
 */
function primaryTastingFallback(
  req: GenerateRequest,
): { cups: TeaId[][]; constraints: CupConstraint[] } | null {
  const wantTasting = requestedTastingCupCount(req);
  if (wantTasting !== 1) return null;
  if (requestedTargetTeas(req).length > 0) return null;
  if (requestedSinkOnlyCount(req) > 0) return null;
  const wantTeapot = requestedSourceOnlyCount(req) > 0;
  const [c0, c1, c2, c3, c4] = req.colors as (TeaId | undefined)[];
  const plain = (): CupConstraint => ({ mode: 'normal' });
  const tasting: CupConstraint = {
    mode: 'normal',
    capacity: TASTING_BOWL_CAPACITY,
    mustEndEmpty: true,
  };

  if (req.numColors === 4 && !wantTeapot && !req.hasMysteryLayer && req.emptyCups === 2 &&
      c0 !== undefined && c1 !== undefined && c2 !== undefined && c3 !== undefined) {
    // Tasting challenge: asymmetric pair + single swap among normals; the
    // extra 2-slot buffer only ever helps solvability, and the bowl must
    // end empty (unused is fine — the gate still requires a valid solve).
    return {
      cups: [
        [c1, c0, c0, c0],
        [c0, c1, c1, c1],
        [c2, c2, c2, c3],
        [c3, c3, c3, c2],
        [],
        [],
      ],
      constraints: [plain(), plain(), plain(), plain(), plain(), tasting],
    };
  }
  if (req.numColors === 4 && wantTeapot && !req.hasMysteryLayer && req.emptyCups === 2 &&
      c0 !== undefined && c1 !== undefined && c2 !== undefined && c3 !== undefined) {
    // Teapot + tasting: mixed teapot at 0, asymmetric normals, bowl last.
    return {
      cups: [
        [c1, c2, c0, c3],
        [c0, c0, c0, c1],
        [c1, c1, c2, c2],
        [c3, c3, c3, c2],
        [],
        [],
      ],
      constraints: [{ mode: 'source-only' }, plain(), plain(), plain(), plain(), tasting],
    };
  }
  if (req.numColors === 5 && !wantTeapot && req.hasMysteryLayer && req.emptyCups === 2 &&
      c0 !== undefined && c1 !== undefined && c2 !== undefined && c3 !== undefined && c4 !== undefined) {
    // Tasting + mystery peak: full rotation among normals, bowl last.
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
      constraints: [plain(), plain(), plain(), plain(), plain(), plain(), tasting],
    };
  }
  return null;
}

/** Generic tasting rotation: rotation among filled + teapot, bowl last. */
function tastingRotationCups(req: GenerateRequest): TeaId[][] {
  const cups = rotationCups({ ...req, sourceOnlyCount: 0 });
  return cups;
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
export function fallbackLevel(req: GenerateRequest, opts: GenerateOptions = {}): GeneratedLevel {
  validateTargetRequest(req);
  validateSinkRequest(req);
  validateTastingRequest(req);
  const stats = opts.stats;
  const wantSourceOnly = requestedSourceOnlyCount(req);
  const wantTargets = requestedTargetTeas(req);
  const wantSink = requestedSinkOnlyCount(req);
  const wantTasting = requestedTastingCupCount(req);
  const tag =
    `fallback:${req.phase}:${req.numColors}c${wantSourceOnly > 0 ? ':teapot' : ''}` +
    `${req.hasMysteryLayer ? ':mystery' : ''}${wantTargets.length > 0 ? `:target${wantTargets.length}` : ''}` +
    `${wantSink > 0 ? ':sink' : ''}${wantTasting > 0 ? ':tasting' : ''}`;

  const shapeEntries: Array<{ cups: TeaId[][]; constraints: CupConstraint[] }> = [];
  // Dedicated tasting-bowl shapes go first for tasting requests (1 solve on hit).
  if (wantTasting > 0) {
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
    const entry = shapeEntries[s] as { cups: TeaId[][]; constraints: CupConstraint[] };
    const cups = entry.cups;
    let constraints = entry.constraints;
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
      // Never inside the teapot or a target cup (constraints-aware selection).
      const idx = selectMysteryCup(
        cups,
        (candidates) => candidates[0] ?? null,
        constraints,
      );
      if (idx === null) continue;
      hiddenCounts[idx] = 1;
    }
    const level = finalizeCandidate(req, cups, hiddenCounts, `${tag}#${s}`, constraints, stats);
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
    );
    if (!deal) continue;
    const hiddenCounts = deal.cups.map(() => 0);
    if (req.hasMysteryLayer) {
      const idx = selectMysteryCup(
        deal.cups,
        (candidates) => {
          const at = Math.floor(rng() * candidates.length);
          return candidates[at] ?? null;
        },
        deal.cupConstraints,
      );
      if (idx === null) continue;
      hiddenCounts[idx] = 1;
    }
    const level = finalizeCandidate(req, deal.cups, hiddenCounts, `${tag}#scan${i}`, deal.cupConstraints, stats);
    if (level) {
      if (stats) stats.usedFallback = true;
      return level;
    }
  }

  throw new Error(
    `fallbackLevel: no validated layout for phase=${req.phase} ` +
      `numColors=${req.numColors} emptyCups=${req.emptyCups} mystery=${req.hasMysteryLayer} ` +
      `sourceOnly=${wantSourceOnly} targets=[${wantTargets.join(',')}]`,
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

export function generateLevel(
  req: GenerateRequest,
  seed: SeedInput,
  opts: GenerateOptions = {},
): GeneratedLevel {
  validateTargetRequest(req);
  validateSinkRequest(req);
  validateTastingRequest(req);
  const maxRetries = opts.maxRetries ?? GENERATOR_MAX_RETRIES;
  const stats = opts.stats;
  const seedStr = String(seed);
  const rng = createRng(seedStr);
  const wantSourceOnly = requestedSourceOnlyCount(req);
  const wantTargets = requestedTargetTeas(req);
  const wantSink = requestedSinkOnlyCount(req);
  const wantTasting = requestedTastingCupCount(req);

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
    );
    if (!deal) continue;
    if (isWonState(deal.cups, deal.cupConstraints)) continue;

    // Mystery placement uses the same rng stream (deterministic).
    // Never inside the teapot, guest cup, tasting bowl, or a target cup.
    const hiddenCounts = deal.cups.map(() => 0);
    if (req.hasMysteryLayer) {
      const idx = selectMysteryCup(
        deal.cups,
        (candidates) => {
          const at = Math.floor(rng() * candidates.length);
          return candidates[at] ?? null;
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
 * sink+tasting; AM. no target+tasting; AN. per-vessel capacity respected.
 * Solver items G–J are enforced by finalizeCandidate, not here.
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
  if (isWonState(level.cups, constraints.length > 0 ? constraints : undefined)) {
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
  // Homogeneity helper stays referenced for future mixed-block checks.
  void isHomogeneous;
  return { ok: reasons.length === 0, reasons };
}
