import { describe, expect, it } from 'vitest';
import { MAX_CUP_CAPACITY } from '../src/game/types';
import { generateLevel, validateLevelStructure, type GenerateRequest } from '../src/game/logic/generator';
import { solvePuzzle } from '../src/game/logic/solver';
import { depthAccepted } from '../src/game/logic/difficulty';
import { isWonState } from '../src/game/logic/rules';

/**
 * Gauntlet 1 §20: seeded stress coverage for asymmetric vessels.
 * 100 seeds × challenge teapot + 100 seeds × peak teapot+mystery.
 * Each level: deterministic, structure-valid, independently solved,
 * real depth == reported depth, hard acceptance, no special-rule violation.
 */
const CHALLENGE_TEAPOT: GenerateRequest = {
  numColors: 4,
  colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  sourceOnlyCount: 1,
};

const PEAK_TEAPOT_MYSTERY: GenerateRequest = {
  numColors: 5,
  colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong', 'lavender'],
  emptyCups: 2,
  hasMysteryLayer: true,
  phase: 'peak',
  sourceOnlyCount: 1,
};

function checkLevel(level: ReturnType<typeof generateLevel>, req: GenerateRequest, seed: string) {
  // Determinism.
  const again = generateLevel(req, seed);
  expect(again.cups).toEqual(level.cups);
  expect(again.hiddenCounts).toEqual(level.hiddenCounts);
  expect(again.cupConstraints).toEqual(level.cupConstraints);
  expect(again.minMoves).toBe(level.minMoves);

  expect(level.cups).toHaveLength(req.numColors + req.emptyCups);
  const counts = new Map<string, number>();
  for (const cup of level.cups) {
    expect(cup.length).toBeLessThanOrEqual(MAX_CUP_CAPACITY);
    for (const t of cup) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  for (const c of req.colors.slice(0, req.numColors)) {
    expect(counts.get(c)).toBe(MAX_CUP_CAPACITY);
  }
  expect(isWonState(level.cups, level.cupConstraints)).toBe(false);

  const solved = solvePuzzle(level.cups, { cupConstraints: level.cupConstraints });
  expect(solved.solvable).toBe(true);
  expect(solved.truncated ?? false).toBe(false);
  expect(solved.minMoves).toBe(level.minMoves);
  expect(depthAccepted(level.minMoves, req.phase)).toBe(true);

  const check = validateLevelStructure(level, req);
  expect(check.reasons).toEqual([]);
  expect(check.ok).toBe(true);

  // No pour into the teapot is ever legal from the start position.
  const potIdx = level.cupConstraints.findIndex((c) => c.mode === 'source-only');
  expect(potIdx).toBe(0); // stable visual slot
  expect(new Set(level.cups[potIdx] as string[]).size).toBeGreaterThanOrEqual(2);

  // Solver solution never targets the teapot.
  for (const step of solved.solution ?? []) {
    expect(step.to).not.toBe(potIdx);
  }
}

describe('teapot stress: 100 seeds challenge source-only', () => {
  it('all valid + solver-accepted', () => {
    for (let s = 0; s < 100; s++) {
      const seed = `stress:teapot:challenge:${s}`;
      checkLevel(generateLevel(CHALLENGE_TEAPOT, seed), CHALLENGE_TEAPOT, seed);
    }
  });
});

describe('teapot stress: 100 seeds peak source-only + mystery', () => {
  it('all valid + solver-accepted', () => {
    for (let s = 0; s < 100; s++) {
      const seed = `stress:teapot:peak:${s}`;
      const level = generateLevel(PEAK_TEAPOT_MYSTERY, seed);
      checkLevel(level, PEAK_TEAPOT_MYSTERY, seed);
      const hidIdx = level.hiddenCounts.findIndex((h) => h > 0);
      expect(hidIdx).toBeGreaterThanOrEqual(0);
      expect(hidIdx).not.toBe(0);
      expect(level.cupConstraints[hidIdx]).toEqual({ mode: 'normal' });
    }
  });
});
