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
 *
 * TARGET (desired sweet spot) and ACCEPTANCE (hard safety band) are kept
 * explicit: generation prefers candidates closest to target, but ONLY among
 * candidates inside acceptance. An out-of-band `best` is never returned.
 *
 * Bounded: at most maxRetries deals + a small fixed fallback ladder.
 * Deterministic for a given (request, seed).
 */

import { CupConstraint, MAX_CUP_CAPACITY, TeaId, defaultCupConstraints } from '../types';
import { isHomogeneous, isWonState } from './rules';
import { createRng, SeedInput, shuffleInPlace } from './rng';
import { solvePuzzle } from './solver';
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

/** Count source-only vessels in a constraints array. */
export function countSourceOnly(constraints: readonly CupConstraint[]): number {
  return constraints.filter((c) => c.mode === 'source-only').length;
}

/** True when a cup qualifies as a starting teapot: full + mixed. */
export function isMixedFullCup(cup: TeaId[]): boolean {
  if (cup.length === 0) return false;
  if (cup.length !== MAX_CUP_CAPACITY) return false;
  const first = cup[0];
  return cup.some((t) => t !== first);
}

/**
 * Mystery selection rule (meaningful reveal):
 * hide exactly one bottom layer in a NORMAL cup with >= 3 layers where the
 * hidden layer DIFFERS from the immediately adjacent visible layer.
 * That way removing the visible top group always exposes a DIFFERENT
 * tea instead of silently pouring away one long mono block.
 * The teapot is NEVER a mystery candidate (first combined Peak teaches
 * two mechanics without hiding the special vessel's own information).
 */
export function selectMysteryCup(
  cups: TeaId[][],
  pick: (candidates: number[]) => number | null,
  cupConstraints?: readonly CupConstraint[],
): number | null {
  const candidates: number[] = [];
  cups.forEach((cup, idx) => {
    if (cupConstraints && (cupConstraints[idx]?.mode ?? 'normal') !== 'normal') return;
    if (cup.length >= 3 && cup[0] !== cup[1]) candidates.push(idx);
  });
  if (candidates.length === 0) return null;
  return pick(candidates);
}

interface DealResult {
  cups: TeaId[][];
  cupConstraints: CupConstraint[];
}

function dealCandidate(
  rng: () => number,
  numColors: number,
  colors: TeaId[],
  emptyCups: number,
  sourceOnlyCount = 0,
): DealResult | null {
  const pool: TeaId[] = [];
  for (let c = 0; c < numColors; c++) {
    const color = colors[c] as TeaId;
    for (let k = 0; k < MAX_CUP_CAPACITY; k++) pool.push(color);
  }
  shuffleInPlace(rng, pool);

  const cups: TeaId[][] = [];
  for (let c = 0; c < numColors; c++) {
    cups.push(pool.slice(c * MAX_CUP_CAPACITY, (c + 1) * MAX_CUP_CAPACITY));
  }
  for (let e = 0; e < emptyCups; e++) cups.push([]);

  // Deal order is positional; shuffle cup positions deterministically so
  // the puzzle doesn't always group colors the same way.
  shuffleInPlace(rng, cups);

  if (sourceOnlyCount <= 0) {
    return { cups, cupConstraints: defaultCupConstraints(cups.length) };
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
  return { cups, cupConstraints };
}

/**
 * Single production gate shared by EVERY return path (normal candidates,
 * retry fallback, safety-net scan). Returns the level only when the full
 * contract A–M holds, otherwise null (caller rejects / moves on).
 */
function finalizeCandidate(
  req: GenerateRequest,
  cups: TeaId[][],
  hiddenCounts: number[],
  seed: string,
  cupConstraints: readonly CupConstraint[],
): GeneratedLevel | null {
  const normalized: CupConstraint[] = cupConstraints.map((c) => ({ mode: c.mode }));
  if (normalized.length !== cups.length) return null; // K
  if (countSourceOnly(normalized) !== requestedSourceOnlyCount(req)) return null; // L
  // M: source-only initial-state invariant.
  for (let i = 0; i < normalized.length; i++) {
    if (normalized[i]?.mode === 'source-only') {
      const cup = cups[i] as TeaId[];
      if (!cup || cup.length === 0) return null;
      if (cup.length !== MAX_CUP_CAPACITY) return null;
      if (!isMixedFullCup(cup)) return null;
      if ((hiddenCounts[i] ?? 0) !== 0) return null; // never hide inside teapot
    }
  }
  if (isWonState(cups, normalized)) return null; // D
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
  if (!validateLevelStructure(level, req).ok) return null; // A, B, C, E, F, K–M
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
    for (let k = 0; k < MAX_CUP_CAPACITY; k++) {
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

function constraintsForShape(totalCups: number, sourceOnlyCount: number): CupConstraint[] {
  const out = defaultCupConstraints(totalCups);
  for (let i = 0; i < sourceOnlyCount && i < totalCups; i++) {
    out[i] = { mode: 'source-only' };
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
export function fallbackLevel(req: GenerateRequest): GeneratedLevel {
  const wantSourceOnly = requestedSourceOnlyCount(req);
  const tag = `fallback:${req.phase}:${req.numColors}c${wantSourceOnly > 0 ? ':teapot' : ''}${req.hasMysteryLayer ? ':mystery' : ''}`;

  const shapeEntries: Array<{ cups: TeaId[][]; constraints: CupConstraint[] }> = [];
  if (wantSourceOnly > 0) {
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

  for (let s = 0; s < shapeEntries.length; s++) {
    const entry = shapeEntries[s] as { cups: TeaId[][]; constraints: CupConstraint[] };
    const cups = entry.cups;
    const constraints = entry.constraints;
    const hiddenCounts = cups.map(() => 0);
    if (req.hasMysteryLayer) {
      // Deterministic first-candidate pick; null => layout rejected, never forced.
      // Never inside the teapot (constraints-aware selection).
      const idx = selectMysteryCup(
        cups,
        (candidates) => candidates[0] ?? null,
        constraints,
      );
      if (idx === null) continue;
      hiddenCounts[idx] = 1;
    }
    const level = finalizeCandidate(req, cups, hiddenCounts, `${tag}#${s}`, constraints);
    if (level) return level;
  }

  // Safety net for exotic configs: bounded, seeded, still fully gated.
  const rng = createRng(tag);
  for (let i = 0; i < FALLBACK_SCAN_ATTEMPTS; i++) {
    const deal = dealCandidate(rng, req.numColors, req.colors, req.emptyCups, wantSourceOnly);
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
    const level = finalizeCandidate(req, deal.cups, hiddenCounts, `${tag}#scan${i}`, deal.cupConstraints);
    if (level) return level;
  }

  throw new Error(
    `fallbackLevel: no validated layout for phase=${req.phase} ` +
      `numColors=${req.numColors} emptyCups=${req.emptyCups} mystery=${req.hasMysteryLayer} ` +
      `sourceOnly=${wantSourceOnly}`,
  );
}

export function generateLevel(
  req: GenerateRequest,
  seed: SeedInput,
  opts: GenerateOptions = {},
): GeneratedLevel {
  const maxRetries = opts.maxRetries ?? GENERATOR_MAX_RETRIES;
  const seedStr = String(seed);
  const rng = createRng(seedStr);
  const wantSourceOnly = requestedSourceOnlyCount(req);

  // Closest-to-TARGET among ACCEPTED candidates only. Out-of-band deals
  // are rejected outright and never remembered.
  let bestAccepted: GeneratedLevel | null = null;
  let bestAcceptedDistance = Number.POSITIVE_INFINITY;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const deal = dealCandidate(rng, req.numColors, req.colors, req.emptyCups, wantSourceOnly);
    if (!deal) continue;
    if (isWonState(deal.cups, deal.cupConstraints)) continue;

    // Mystery placement uses the same rng stream (deterministic).
    // Never inside the teapot.
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
  return fallbackLevel(req);
}

/**
 * Validate a produced level's structural invariants (production gate AND
 * test helper). Covers contract items A–F + K–M:
 * A. correct number of cups; B. capacity; C. 4 units per color;
 * D. not already solved; E. hiddenCounts length + exactly-one-hidden iff
 * mystery; F. mystery cup: length >= 3, cup[0] !== cup[1], hiddenCount == 1,
 * hidden cup is NORMAL; K. cupConstraints length; L. exact source-only
 * count; M. source-only cups full + mixed + unhidden.
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
  const counts = new Map<string, number>();
  level.cups.forEach((cup, i) => {
    if (cup.length > MAX_CUP_CAPACITY) reasons.push(`cup ${i} exceeds capacity`);
    cup.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1));
  });
  req.colors.slice(0, req.numColors).forEach((c) => {
    if ((counts.get(c) ?? 0) !== MAX_CUP_CAPACITY) {
      reasons.push(`color ${c} has ${counts.get(c) ?? 0} units, expected ${MAX_CUP_CAPACITY}`);
    }
  });
  const constraints = level.cupConstraints ?? [];
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
  constraints.forEach((c, i) => {
    if (c?.mode !== 'normal' && c?.mode !== 'source-only') {
      reasons.push(`cup ${i} has unknown mode`);
    }
  });
  level.cups.forEach((cup, i) => {
    if (constraints[i]?.mode === 'source-only') {
      if (cup.length === 0) reasons.push(`teapot ${i} starts empty`);
      if (cup.length !== MAX_CUP_CAPACITY) reasons.push(`teapot ${i} must start full`);
      if (cup.length > 0 && !isMixedFullCup(cup) && cup.length === MAX_CUP_CAPACITY) {
        reasons.push(`teapot ${i} must contain at least 2 TeaIds`);
      }
      if ((level.hiddenCounts[i] ?? 0) !== 0) reasons.push(`teapot ${i} must not hide mystery`);
    }
  });
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
          reasons.push('mystery must be on a normal cup, never the teapot');
        }
      }
    } else if (hiddenIndices.length !== 0) {
      reasons.push(`unexpected hidden layers without mystery: ${hiddenIndices.length}`);
    }
  }
  // Homogeneity helper stays referenced for future mixed-block checks.
  void isHomogeneous;
  return { ok: reasons.length === 0, reasons };
}
