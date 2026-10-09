/**
 * Gauntlet 12 — tea-bloom generator fast path (§§93-94, §104-109).
 *
 * Request field 0/1 recognized, >1 and every sibling special rejected
 * loudly. Fast path: validate → template → permute roles → set one bud →
 * finalizeCandidate → return. Bounded attempts (<=4), median 1. Fallback is
 * strong L2 with delayed reuse. HB–HT contract enforced by finalize +
 * validateLevelStructure.
 */
import { describe, expect, it } from 'vitest';
import type { TeaId } from '../src/game/types';
import { solvePuzzle } from '../src/game/logic/solver';
import {
  TEA_BLOOM_TEMPLATE_ATTEMPTS,
} from '../src/game/logic/teaBloomTemplates';
import {
  analyzeTeaBloomParticipation,
  createGenerateStats,
  fallbackLevel,
  generateLevel,
  requestedTeaBudCount,
  teaBloomTemplateKindFor,
  validateLevelStructure,
  validateTeaBudRequest,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { emptyFloatingIngredients } from '../src/game/types';

const A: TeaId = 'matcha';
const B: TeaId = 'karkade';
const C: TeaId = 'lavender';
const D: TeaId = 'sea_buckthorn';

function budReq(over: Partial<GenerateRequest> = {}): GenerateRequest {
  return {
    numColors: 4,
    colors: [A, D, B, 'milk_oolong'],
    emptyCups: 2,
    hasMysteryLayer: false,
    phase: 'challenge',
    teaBudCount: 1,
    ...over,
  } as GenerateRequest;
}

describe('request field: 0/1 recognized, >1 and siblings rejected loudly', () => {
  it('normalization + kind matching', () => {
    expect(requestedTeaBudCount(budReq())).toBe(1);
    expect(requestedTeaBudCount({ ...budReq(), teaBudCount: 0 })).toBe(0);
    expect(requestedTeaBudCount({ ...budReq(), teaBudCount: 2 })).toBe(2);
    expect(TEA_BLOOM_TEMPLATE_ATTEMPTS).toBeLessThanOrEqual(4);
    expect(teaBloomTemplateKindFor(budReq())).toBe('tea-bloom');
    expect(teaBloomTemplateKindFor({ ...budReq(), teaBudCount: 0 })).toBe(null);
  });

  it('validateTeaBudRequest fails loudly on unsupported combos', () => {
    expect(() => validateTeaBudRequest({ ...budReq(), teaBudCount: 2 })).toThrow(/max 1/);
    expect(() => validateTeaBudRequest({ ...budReq(), numColors: 3 })).toThrow(/4 colors/);
    expect(() => validateTeaBudRequest({ ...budReq(), emptyCups: 1 })).toThrow(/4 colors/);
    expect(() => validateTeaBudRequest({ ...budReq(), hasMysteryLayer: true })).toThrow(/4 colors/);
    expect(() => validateTeaBudRequest({ ...budReq(), sourceOnlyCount: 1 })).toThrow(/4 colors/);
    expect(() => validateTeaBudRequest({ ...budReq(), targetTeaIds: [A] })).toThrow(/targets/);
    expect(() => validateTeaBudRequest({ ...budReq(), sinkOnlyCount: 1 })).toThrow(/sink/);
    expect(() => validateTeaBudRequest({ ...budReq(), tastingCupCount: 1 })).toThrow(/tasting/);
    expect(() => validateTeaBudRequest({ ...budReq(), floatingIngredient: 'lemon' })).toThrow(/lemon/);
    expect(() => validateTeaBudRequest({ ...budReq(), sinkingIngredient: 'honey' })).toThrow(/honey/);
    expect(() => validateTeaBudRequest({ ...budReq(), hasStrainer: true })).toThrow(/strainer/);
    expect(() => validateTeaBudRequest({ ...budReq(), frozenCupCount: 1 })).toThrow(/frozen/);
    expect(() => validateTeaBudRequest({ ...budReq(), thermosCupCount: 1 })).toThrow(/thermos/);
    expect(() => validateTeaBudRequest({ ...budReq(), cinnamonCupCount: 1 })).toThrow(/cinnamon/);
    expect(() => validateTeaBudRequest({ ...budReq() })).not.toThrow();
    expect(() => validateTeaBudRequest({ ...budReq(), teaBudCount: 0 })).not.toThrow();
  });
});

describe('fast path: deterministic 4c/6v/16u one-bud L2 in measured band', () => {
  it('generates a valid L2 level with one full mixed host + two empties', () => {
    const stats = createGenerateStats();
    const lvl = generateLevel(budReq(), 'fastpath-seed-1', { stats });
    expect(lvl.cups.length).toBe(6);
    expect(lvl.teaBudSlots?.filter((s) => s !== null).length).toBe(1);
    const host = (lvl.teaBudSlots as string[]).findIndex((s) => s === 'tea_bud');
    expect(lvl.cups[host]?.length).toBe(4);
    expect(new Set(lvl.cups[host] as TeaId[]).size).toBeGreaterThanOrEqual(2);
    expect(lvl.cups.filter((c) => c.length === 0).length).toBe(2);
    // HB–HT: solver solvable, non-truncated, in band, bloom + reuse + cleared + win.
    const solved = solvePuzzle(lvl.cups, {
      cupConstraints: lvl.cupConstraints,
      floatingIngredients: lvl.floatingIngredients,
      teaBudSlots: lvl.teaBudSlots,
    });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated ?? false).toBe(false);
    expect(solved.minMoves).toBe(lvl.minMoves);
    expect(lvl.minMoves).toBeGreaterThanOrEqual(10);
    expect(lvl.minMoves).toBeLessThanOrEqual(14);
    const part = analyzeTeaBloomParticipation(lvl.cups, lvl.teaBudSlots ?? [], host, solved.solution ?? [], lvl.cupConstraints);
    expect(part.blooms).toBeGreaterThanOrEqual(1);
    expect(part.firstReuseDepth).not.toBe(null);
    expect(part.finalBudCleared).toBe(true);
    expect(part.win).toBe(true);
    expect(validateLevelStructure(lvl, budReq()).ok).toBe(true);
    // Happy path is 1 solver call + <=4 template attempts, no fallback.
    expect(stats.solverCalls).toBe(1);
    expect(stats.templateAttempts).toBeLessThanOrEqual(4);
    expect(stats.usedFallback).toBe(false);
  });

  it('bounded attempts across seeds: median 1, p95 <= 2, no fallback', () => {
    const attempts: number[] = [];
    for (let i = 0; i < 20; i++) {
      const stats = createGenerateStats();
      const lvl = generateLevel(budReq(), `fastpath-seed-${i}`, { stats });
      expect(lvl.minMoves).toBeGreaterThanOrEqual(10);
      attempts.push(stats.templateAttempts);
      expect(stats.usedFallback).toBe(false);
    }
    const sorted = [...attempts].sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length / 2)] as number).toBe(1);
    expect(sorted[Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length))] as number).toBeLessThanOrEqual(2);
  });
});

describe('fallback: strong L2 with delayed reuse, exact depth', () => {
  it('fallbackLevel returns a valid L2 bud level', () => {
    const stats = createGenerateStats();
    const lvl = fallbackLevel(budReq(), { stats });
    expect(stats.usedFallback).toBe(true);
    expect(lvl.teaBudSlots?.filter((s) => s !== null).length).toBe(1);
    const host = (lvl.teaBudSlots as string[]).findIndex((s) => s === 'tea_bud');
    const solved = solvePuzzle(lvl.cups, {
      cupConstraints: lvl.cupConstraints,
      floatingIngredients: lvl.floatingIngredients,
      teaBudSlots: lvl.teaBudSlots,
    });
    expect(solved.solvable).toBe(true);
    expect(solved.minMoves).toBe(lvl.minMoves);
    const part = analyzeTeaBloomParticipation(lvl.cups, lvl.teaBudSlots ?? [], host, solved.solution ?? [], lvl.cupConstraints);
    expect(part.blooms).toBeGreaterThanOrEqual(1);
    expect(part.firstReuseDepth).not.toBe(null);
    expect(part.finalBudCleared).toBe(true);
    expect(part.win).toBe(true);
    void emptyFloatingIngredients;
  });
});
