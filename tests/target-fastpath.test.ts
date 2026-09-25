import { describe, expect, it } from 'vitest';
import { MAX_CUP_CAPACITY } from '../src/game/types';
import {
  createGenerateStats,
  generateLevel,
  targetTemplateKindFor,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { TARGET_TEMPLATE_ATTEMPTS } from '../src/game/logic/targetTemplates';
import { solvePuzzle } from '../src/game/logic/solver';
import { depthAccepted } from '../src/game/logic/difficulty';
import { canonicalKey, isWonState } from '../src/game/logic/rules';

/**
 * Gauntlet 2.1 §32: structural performance contract for target generation.
 * No wall-clock assertions (CI hardware varies) — the gates below assert
 * bounded solver/template counts, zero random-scan candidates, fallback
 * avoidance, determinism, variety, and full validity instead.
 */

const TARGET_CHALLENGE: GenerateRequest = {
  numColors: 4,
  colors: ['saffron', 'lavender', 'karkade', 'milk_oolong'],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  targetTeaIds: ['lavender', 'karkade'],
};

const TARGET_MYSTERY_PEAK: GenerateRequest = {
  numColors: 5,
  colors: ['saffron', 'buckwheat', 'matcha', 'karkade', 'lavender'],
  emptyCups: 2,
  hasMysteryLayer: true,
  phase: 'peak',
  targetTeaIds: ['lavender', 'karkade'],
};

const TEAPOT_TARGET_CHALLENGE: GenerateRequest = {
  numColors: 4,
  colors: ['saffron', 'lavender', 'karkade', 'milk_oolong'],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  sourceOnlyCount: 1,
  targetTeaIds: ['lavender', 'karkade'],
};

const CANONICAL = [
  ['target challenge', TARGET_CHALLENGE],
  ['target + mystery peak', TARGET_MYSTERY_PEAK],
  ['teapot + target challenge', TEAPOT_TARGET_CHALLENGE],
] as Array<[string, GenerateRequest]>;

describe('target fast-path structure (§32 A–D)', () => {
  it.each(CANONICAL)('%s uses the bounded template path', (_name, req) => {
    expect(targetTemplateKindFor(req)).not.toBeNull();
    const stats = createGenerateStats();
    const level = generateLevel(req, 'fastpath:one', { stats });
    // Bounded: a few template attempts, a few solver calls, zero random
    // candidates, no fallback on the happy path.
    expect(stats.templateAttempts).toBeGreaterThanOrEqual(1);
    expect(stats.templateAttempts).toBeLessThanOrEqual(TARGET_TEMPLATE_ATTEMPTS);
    expect(stats.candidatesTried).toBe(0);
    expect(stats.solverCalls).toBeGreaterThanOrEqual(1);
    expect(stats.solverCalls).toBeLessThanOrEqual(TARGET_TEMPLATE_ATTEMPTS + 1);
    expect(stats.usedFallback).toBe(false);
    expect(validateLevelStructure(level, req).ok).toBe(true);
  });

  it('non-target generation still uses the random path (no templates)', () => {
    const req: GenerateRequest = {
      numColors: 4,
      colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'],
      emptyCups: 2,
      hasMysteryLayer: false,
      phase: 'challenge',
    };
    expect(targetTemplateKindFor(req)).toBeNull();
    const stats = createGenerateStats();
    generateLevel(req, 'fastpath:plain', { stats });
    expect(stats.templateAttempts).toBe(0);
    expect(stats.candidatesTried).toBeGreaterThanOrEqual(1);
  });

  it('non-canonical target requests keep the random path', () => {
    const req: GenerateRequest = {
      ...TARGET_CHALLENGE,
      targetTeaIds: ['lavender'], // single target: no bank kind
    };
    expect(targetTemplateKindFor(req)).toBeNull();
    const stats = createGenerateStats();
    const level = generateLevel(req, 'fastpath:exotic', { stats });
    expect(stats.templateAttempts).toBe(0);
    expect(validateLevelStructure(level, req).ok).toBe(true);
  });
});

describe('target fast-path determinism + validity (§32 E, G)', () => {
  it.each(CANONICAL)('%s: same seed identical, levels fully valid', (_name, req) => {
    const a = generateLevel(req, 'fastpath:det');
    const b = generateLevel(req, 'fastpath:det');
    expect(b.cups).toEqual(a.cups);
    expect(b.hiddenCounts).toEqual(a.hiddenCounts);
    expect(b.cupConstraints).toEqual(a.cupConstraints);
    expect(b.minMoves).toBe(a.minMoves);
    expect(isWonState(a.cups, a.cupConstraints)).toBe(false);
    const solved = solvePuzzle(a.cups, { cupConstraints: a.cupConstraints });
    expect(solved.solvable).toBe(true);
    expect(solved.minMoves).toBe(a.minMoves);
    expect(depthAccepted(a.minMoves, req.phase)).toBe(true);
  });
});

describe('target fast-path variety (§32 F, §34)', () => {
  it.each(CANONICAL)('%s: 100 seeds yield >= 8 distinct canonical layouts', (_name, req) => {
    const keys = new Set<string>();
    const seenDepths = new Set<number>();
    for (let s = 0; s < 100; s++) {
      const level = generateLevel(req, `fastpath:variety:${_name}:${s}`);
      keys.add(canonicalKey(level.cups, level.cupConstraints));
      seenDepths.add(level.minMoves);
    }
    expect(keys.size).toBeGreaterThanOrEqual(8);
  }, 120_000);
});

describe('target fast-path ignores maxRetries without scanning (§32 H)', () => {
  it.each(CANONICAL)('%s: maxRetries 0 still valid via fast path or ladder', (_name, req) => {
    const stats = createGenerateStats();
    const level = generateLevel(req, 'fastpath:exhaust', { maxRetries: 0, stats });
    expect(validateLevelStructure(level, req).ok).toBe(true);
    expect(solvePuzzle(level.cups, { cupConstraints: level.cupConstraints }).solvable).toBe(true);
    // Structural proof: never entered the 150-scan (zero random candidates
    // on the template path; ladder scan is bounded separately).
    expect(stats.candidatesTried).toBeLessThanOrEqual(25);
    expect(level.cups).toHaveLength(req.numColors + req.emptyCups);
    const counts = new Map<string, number>();
    for (const cup of level.cups) {
      expect(cup.length).toBeLessThanOrEqual(MAX_CUP_CAPACITY);
      for (const t of cup) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    for (const c of req.colors.slice(0, req.numColors)) {
      expect(counts.get(c)).toBe(MAX_CUP_CAPACITY);
    }
  });
});
