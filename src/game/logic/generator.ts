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
 *   F. mystery cup: length >= 3, cup[0] !== cup[1], hiddenCount == 1
 *   G. solver says solvable
 *   H. solver is not truncated
 *   I. minMoves exists
 *   J. depthAccepted(minMoves, phase) === true
 *
 * TARGET (desired sweet spot) and ACCEPTANCE (hard safety band) are kept
 * explicit: generation prefers candidates closest to target, but ONLY among
 * candidates inside acceptance. An out-of-band `best` is never returned.
 *
 * Bounded: at most maxRetries deals + a small fixed fallback ladder.
 * Deterministic for a given (request, seed).
 */

import { MAX_CUP_CAPACITY, TeaId } from '../types';
import { isWonState } from './rules';
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
}

export interface GeneratedLevel {
  cups: TeaId[][];
  hiddenCounts: number[];
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

/**
 * Mystery selection rule (meaningful reveal):
 * hide exactly one bottom layer in a cup with >= 3 layers where the
 * hidden layer DIFFERS from the immediately adjacent visible layer.
 * That way removing the visible top group always exposes a DIFFERENT
 * tea instead of silently pouring away one long mono block.
 */
export function selectMysteryCup(
  cups: TeaId[][],
  pick: (candidates: number[]) => number | null,
): number | null {
  const candidates: number[] = [];
  cups.forEach((cup, idx) => {
    if (cup.length >= 3 && cup[0] !== cup[1]) candidates.push(idx);
  });
  if (candidates.length === 0) return null;
  return pick(candidates);
}

function dealCandidate(
  rng: () => number,
  numColors: number,
  colors: TeaId[],
  emptyCups: number,
): TeaId[][] {
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
  return cups;
}

/**
 * Single production gate shared by EVERY return path (normal candidates,
 * retry fallback, safety-net scan). Returns the level only when the full
 * contract A–J holds, otherwise null (caller rejects / moves on).
 */
function finalizeCandidate(
  req: GenerateRequest,
  cups: TeaId[][],
  hiddenCounts: number[],
  seed: string,
): GeneratedLevel | null {
  if (isWonState(cups)) return null; // D
  const solved = solvePuzzle(cups, { maxVisited: SOLVER_BUDGET_PER_CANDIDATE });
  if (!solved.solvable || solved.truncated) return null; // G, H
  if (solved.minMoves === undefined) return null; // I
  if (!depthAccepted(solved.minMoves, req.phase)) return null; // J
  const level: GeneratedLevel = {
    cups,
    hiddenCounts,
    seed,
    minMoves: solved.minMoves,
    visitedStates: solved.visitedStates,
  };
  if (!validateLevelStructure(level, req).ok) return null; // A, B, C, E, F
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

/**
 * Phase-aware deterministic fallback. Tries, in order:
 *   1. primary phase layout (1 solve),
 *   2. generic rotation layout (1 solve),
 *   3. bounded seeded safety-net scan (<= FALLBACK_SCAN_ATTEMPTS solves).
 * Every attempt passes through finalizeCandidate, so the returned level
 * always satisfies the full contract — including the mystery invariant
 * (never "force hides" an invalid cup) and the acceptance band (minMoves
 * is the REAL solver result, never faked).
 * Throws loudly if nothing validates: that is a programming error, and
 * lying about difficulty is worse than failing fast in dev/tests.
 */
export function fallbackLevel(req: GenerateRequest): GeneratedLevel {
  const tag = `fallback:${req.phase}:${req.numColors}c`;
  const shapes: TeaId[][][] = [primaryFallbackCups(req), rotationCups(req)];

  for (let s = 0; s < shapes.length; s++) {
    const cups = shapes[s] as TeaId[][];
    const hiddenCounts = cups.map(() => 0);
    if (req.hasMysteryLayer) {
      // Deterministic first-candidate pick; null => layout rejected, never forced.
      const idx = selectMysteryCup(cups, (candidates) => candidates[0] ?? null);
      if (idx === null) continue;
      hiddenCounts[idx] = 1;
    }
    const level = finalizeCandidate(req, cups, hiddenCounts, `${tag}#${s}`);
    if (level) return level;
  }

  // Safety net for exotic configs: bounded, seeded, still fully gated.
  const rng = createRng(tag);
  for (let i = 0; i < FALLBACK_SCAN_ATTEMPTS; i++) {
    const cups = dealCandidate(rng, req.numColors, req.colors, req.emptyCups);
    const hiddenCounts = cups.map(() => 0);
    if (req.hasMysteryLayer) {
      const idx = selectMysteryCup(cups, (candidates) => {
        const at = Math.floor(rng() * candidates.length);
        return candidates[at] ?? null;
      });
      if (idx === null) continue;
      hiddenCounts[idx] = 1;
    }
    const level = finalizeCandidate(req, cups, hiddenCounts, `${tag}#scan${i}`);
    if (level) return level;
  }

  throw new Error(
    `fallbackLevel: no validated layout for phase=${req.phase} ` +
      `numColors=${req.numColors} emptyCups=${req.emptyCups} mystery=${req.hasMysteryLayer}`,
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

  // Closest-to-TARGET among ACCEPTED candidates only. Out-of-band deals
  // are rejected outright and never remembered.
  let bestAccepted: GeneratedLevel | null = null;
  let bestAcceptedDistance = Number.POSITIVE_INFINITY;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const cups = dealCandidate(rng, req.numColors, req.colors, req.emptyCups);
    if (isWonState(cups)) continue;

    // Mystery placement uses the same rng stream (deterministic).
    const hiddenCounts = cups.map(() => 0);
    if (req.hasMysteryLayer) {
      const idx = selectMysteryCup(cups, (candidates) => {
        const at = Math.floor(rng() * candidates.length);
        return candidates[at] ?? null;
      });
      if (idx === null) continue; // no meaningful reveal possible — try another deal
      hiddenCounts[idx] = 1;
    }

    const level = finalizeCandidate(req, cups, hiddenCounts, `${seedStr}#${attempt}`);
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
 * test helper). Covers contract items A–F:
 * A. correct number of cups; B. capacity; C. 4 units per color;
 * D. not already solved; E. hiddenCounts length + exactly-one-hidden iff
 * mystery; F. mystery cup: length >= 3, cup[0] !== cup[1], hiddenCount == 1.
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
  if (isWonState(level.cups)) reasons.push('level is already solved');
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
      }
    } else if (hiddenIndices.length !== 0) {
      reasons.push(`unexpected hidden layers without mystery: ${hiddenIndices.length}`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}
