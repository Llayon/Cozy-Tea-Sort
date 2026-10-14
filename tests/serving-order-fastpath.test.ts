/**
 * Gauntlet 14 — generator fast path + contract (§§130-134).
 *
 * Request recognized only for the exact production combo; happy path
 * 1 solver call; attempts bounded ≤4 (median 1, p95 ≤2); pinned fallback
 * validates with ORDER_PRESSURE → SERVE_1 → SERVE_2 → prefix2 → win.
 */
import { describe, expect, it } from 'vitest';
import type { TeaId } from '../src/game/types';
import { solvePuzzle } from '../src/game/logic/solver';
import {
  analyzeServingOrderParticipation,
  blendTemplateKindFor,
  createGenerateStats,
  fallbackLevel,
  generateLevel,
  servingOrderTemplateKindFor,
  validateServeOrderRequest,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { SERVING_ORDER_DEPTH_ACCEPT } from '../src/game/logic/servingOrderTemplates';
import type { SolverAction } from '../src/game/types';

const REQ: GenerateRequest = {
  numColors: 4,
  colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  serveOrderCount: 2,
};

describe('request recognition (IO/IP/IQ–IZ)', () => {
  it('recognizes exact production combo, rejects others', () => {
    expect(servingOrderTemplateKindFor(REQ)).toBe('serving-order');
    expect(blendTemplateKindFor(REQ)).toBe(null);
    expect(() => validateServeOrderRequest({ ...REQ, serveOrderCount: 1 })).toThrow();
    expect(() => validateServeOrderRequest({ ...REQ, serveOrderCount: 3 })).toThrow();
    expect(() => validateServeOrderRequest({ ...REQ, teaBudCount: 1 })).toThrow();
    expect(() => validateServeOrderRequest({ ...REQ, hasMysteryLayer: true })).toThrow();
    expect(() => validateServeOrderRequest({ ...REQ, blendRecipeId: 'milk-tea' as never })).toThrow();
    expect(() => validateServeOrderRequest({
      ...REQ, colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk'],
    })).toThrow();
  });
});

describe('fast path: 1 solver call, bounded attempts', () => {
  it('happy path returns ordered L2 in band', () => {
    const stats = createGenerateStats();
    const lvl = generateLevel(REQ, 'serve-fast-1', { stats });
    const orders = lvl.cupConstraints.filter((c) => c.serveOrder !== undefined);
    expect(orders.length).toBe(2);
    expect(stats.solverCalls).toBe(1);
    expect(stats.templateAttempts).toBeLessThanOrEqual(4);
    expect(stats.templateAttempts).toBeGreaterThanOrEqual(1);
    expect(lvl.minMoves).toBeGreaterThanOrEqual(SERVING_ORDER_DEPTH_ACCEPT.min);
    expect(lvl.minMoves).toBeLessThanOrEqual(SERVING_ORDER_DEPTH_ACCEPT.max);
    const lens = lvl.cups.map((c) => c.length).sort((a, b) => a - b);
    expect(lens).toEqual([0, 0, 4, 4, 4, 4]);
    const flat = lvl.cups.flat() as TeaId[];
    expect(flat.filter((t) => t === 'black_tea' || t === 'milk' || t === 'milk_tea').length).toBe(0);
  });

  it('attempts p95<=2 across 20 seeds (median 1)', () => {
    const attempts: number[] = [];
    for (let i = 0; i < 20; i++) {
      const stats = createGenerateStats();
      generateLevel(REQ, `serve-att-${i}`, { stats });
      attempts.push(stats.templateAttempts);
    }
    attempts.sort((a, b) => a - b);
    const median = attempts[Math.floor(attempts.length / 2)] as number;
    const p95 = attempts[Math.min(attempts.length - 1, Math.floor(0.95 * attempts.length))] as number;
    console.log(`serving attempts median=${median} p95=${p95} max=${Math.max(...attempts)}`);
    expect(median).toBe(1);
    expect(p95).toBeLessThanOrEqual(2);
  });
});

describe('fallback pinned L2 (§§133-134)', () => {
  it('fallback validates pressure → serve1 → serve2 → prefix2 → win', () => {
    const stats = createGenerateStats();
    const lvl = fallbackLevel(REQ, { stats });
    expect(stats.usedFallback).toBe(true);
    expect(lvl.cupConstraints.filter((c) => c.serveOrder !== undefined).length).toBe(2);
    // Re-derive participation on the returned level (never trust stored trace).
    const r = solvePuzzle(lvl.cups, { cupConstraints: lvl.cupConstraints, returnSolution: true });
    expect(r.solvable).toBe(true);
    expect(r.minMoves).toBe(lvl.minMoves);
    const part = analyzeServingOrderParticipation(lvl.cups, (r.solution ?? []) as SolverAction[], lvl.cupConstraints);
    expect(part.blockedCompletionCandidates).toBeGreaterThanOrEqual(1);
    expect(part.firstPressureDepth).not.toBe(null);
    expect((part.firstPressureDepth as number) < (part.serve1Depth as number)).toBe(true);
    expect((part.serve1Depth as number) < (part.serve2Depth as number)).toBe(true);
    expect(part.servedPrefixFinal).toBe(2);
    expect(part.win).toBe(true);
  });
});
