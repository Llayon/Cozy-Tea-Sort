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
 * `Cup.canPourInto`, the solver, the generator and deadlock detection
 * must ALL delegate to this module so the rules cannot diverge.
 */

import { MAX_CUP_CAPACITY, TeaId } from '../types';

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

/**
 * Full legality check shared by UI, solver and generator.
 * Returns false for out-of-range indices as well.
 */
export function canPourBetween(
  cups: readonly TeaId[][],
  fromIdx: number,
  toIdx: number,
): boolean {
  if (fromIdx === toIdx) return false;
  if (fromIdx < 0 || fromIdx >= cups.length) return false;
  if (toIdx < 0 || toIdx >= cups.length) return false;
  const source = cups[fromIdx] as TeaId[];
  const target = cups[toIdx] as TeaId[];
  if (source.length === 0) return false;
  if (target.length >= MAX_CUP_CAPACITY) return false;
  // Meaningless loop: moving a finished mono cup into an empty cup.
  if (source.length === MAX_CUP_CAPACITY && isHomogeneous(source) && target.length === 0) {
    return false;
  }
  if (target.length === 0) return true;
  return topLayerOf(source) === topLayerOf(target);
}

/** Number of layers that would transfer (0 when illegal). */
export function pourCountBetween(
  cups: readonly TeaId[][],
  fromIdx: number,
  toIdx: number,
): number {
  if (!canPourBetween(cups, fromIdx, toIdx)) return 0;
  const source = cups[fromIdx] as TeaId[];
  const target = cups[toIdx] as TeaId[];
  return Math.min(topCountOf(source), MAX_CUP_CAPACITY - target.length);
}

/**
 * A move is "constructive" when it can change the partition structure.
 * Relocating a fully homogeneous stack into an empty cup only permutes
 * identical cups, so deadlock detection and the solver both ignore it.
 * This keeps `isDeadlocked == (no solver moves available && !won)`.
 */
export function isConstructiveMove(cups: readonly TeaId[][], fromIdx: number, toIdx: number): boolean {
  if (!canPourBetween(cups, fromIdx, toIdx)) return false;
  const source = cups[fromIdx] as TeaId[];
  const target = cups[toIdx] as TeaId[];
  if (target.length === 0 && isHomogeneous(source)) return false;
  return true;
}

export function listLegalMoves(cups: readonly TeaId[][], constructiveOnly = false): Array<{ from: number; to: number; count: number }> {
  const out: Array<{ from: number; to: number; count: number }> = [];
  for (let from = 0; from < cups.length; from++) {
    for (let to = 0; to < cups.length; to++) {
      if (from === to) continue;
      const ok = constructiveOnly
        ? isConstructiveMove(cups, from, to)
        : canPourBetween(cups, from, to);
      if (!ok) continue;
      out.push({ from, to, count: pourCountBetween(cups, from, to) });
    }
  }
  return out;
}

/** Pure pour: returns a fresh board or null when illegal. */
export function applyPour(
  cups: readonly TeaId[][],
  fromIdx: number,
  toIdx: number,
): { cups: TeaId[][]; transferred: number; layer: TeaId } | null {
  const count = pourCountBetween(cups, fromIdx, toIdx);
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

export function isWonState(cups: readonly TeaId[][]): boolean {
  let completed = 0;
  for (const cup of cups) {
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
 */
export function isDeadlockedState(cups: readonly TeaId[][]): boolean {
  if (isWonState(cups)) return false;
  return listLegalMoves(cups, true).length === 0;
}

/**
 * Canonical state key: cups are unlabeled, so sort cup encodings.
 * This collapses permutations of empty / identical cups and keeps
 * BFS visited sets small.
 */
export function canonicalKey(cups: readonly TeaId[][]): string {
  const parts = cups.map((c) => c.join(','));
  parts.sort();
  return parts.join('|');
}
