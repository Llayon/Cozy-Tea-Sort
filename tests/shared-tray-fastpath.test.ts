/**
 * Gauntlet 16 — generator fast path + contract (§§134-138).
 *
 * Request recognized only for the exact production combo; happy path
 * 1 solver call; attempts bounded ≤4 (median 1, p95 ≤2); pinned fallback
 * validates with SHARED_PRESSURE → RELEASE → REFILL → win.
 */
import { describe, expect, it } from 'vitest';
import type { TeaId } from '../src/game/types';
import { solvePuzzle } from '../src/game/logic/solver';
import {
  analyzeSharedTrayParticipation,
  createGenerateStats,
  fallbackLevel,
  generateLevel,
  servingOrderTemplateKindFor,
  sharedTrayTemplateKindFor,
  validateSharedTrayRequest,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { SHARED_TRAY_DEPTH_ACCEPT } from '../src/game/logic/sharedTrayTemplates';
import type { SolverAction } from '../src/game/types';

const REQ: GenerateRequest = {
  numColors: 4,
  colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  sharedTrayCount: 1,
};

describe('request recognition (JI/JJ)', () => {
  it('recognizes exact production combo, rejects others', () => {
    expect(sharedTrayTemplateKindFor(REQ)).toBe('shared-tray');
    expect(servingOrderTemplateKindFor(REQ)).toBe(null);
    expect(() => validateSharedTrayRequest({ ...REQ, sharedTrayCount: 2 })).toThrow();
    expect(() => validateSharedTrayRequest({ ...REQ, sharedTrayCount: -1 })).toThrow();
    expect(() => validateSharedTrayRequest({ ...REQ, sharedTrayCount: 1.5 })).toThrow();
    expect(() => validateSharedTrayRequest({ ...REQ, teaBudCount: 1 })).toThrow();
    expect(() => validateSharedTrayRequest({ ...REQ, hasMysteryLayer: true })).toThrow();
    expect(sharedTrayTemplateKindFor({ ...REQ, hasMysteryLayer: true })).toBe(null);
    expect(() => validateSharedTrayRequest({ ...REQ, serveOrderCount: 2 })).toThrow();
    expect(() => validateSharedTrayRequest({ ...REQ, blendRecipeId: 'milk-tea' as never })).toThrow();
    expect(() => validateSharedTrayRequest({
      ...REQ, colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk'],
    })).toThrow();
  });
});

describe('fast path: 1 solver call, bounded attempts', () => {
  it('happy path returns tray L2 in band', () => {
    const stats = createGenerateStats();
    const lvl = generateLevel(REQ, 'tray-fast-1', { stats });
    const trayMembers = lvl.cupConstraints.filter((c) => c.sharedCapacityGroup === 'tea-tray');
    expect(trayMembers.length).toBe(2);
    expect(stats.solverCalls).toBe(1);
    expect(stats.templateAttempts).toBeLessThanOrEqual(4);
    expect(stats.templateAttempts).toBeGreaterThanOrEqual(1);
    expect(lvl.minMoves).toBeGreaterThanOrEqual(SHARED_TRAY_DEPTH_ACCEPT.min);
    expect(lvl.minMoves).toBeLessThanOrEqual(SHARED_TRAY_DEPTH_ACCEPT.max);
    const lens = lvl.cups.map((c) => c.length).sort((a, b) => a - b);
    expect(lens).toEqual([0, 2, 3, 3, 4, 4]);
    const flat = lvl.cups.flat() as TeaId[];
    expect(flat.filter((t) => t === 'black_tea' || t === 'milk' || t === 'milk_tea').length).toBe(0);
  });

  it('attempts p95<=2 across 20 seeds (median 1)', () => {
    const attempts: number[] = [];
    for (let i = 0; i < 20; i++) {
      const stats = createGenerateStats();
      generateLevel(REQ, `tray-att-${i}`, { stats });
      attempts.push(stats.templateAttempts);
    }
    attempts.sort((a, b) => a - b);
    const median = attempts[Math.floor(attempts.length / 2)] as number;
    const p95 = attempts[Math.min(attempts.length - 1, Math.floor(0.95 * attempts.length))] as number;
    console.log(`shared attempts median=${median} p95=${p95} max=${Math.max(...attempts)}`);
    expect(median).toBe(1);
    expect(p95).toBeLessThanOrEqual(2);
  });
});

describe('fallback pinned L2 (§§137-138)', () => {
  it('fallback validates pressure → release → refill → win', () => {
    const stats = createGenerateStats();
    const lvl = fallbackLevel(REQ, { stats });
    expect(stats.usedFallback).toBe(true);
    expect(lvl.cupConstraints.filter((c) => c.sharedCapacityGroup === 'tea-tray').length).toBe(2);
    // Re-derive participation on the returned level (never trust stored trace).
    const r = solvePuzzle(lvl.cups, { cupConstraints: lvl.cupConstraints, returnSolution: true });
    expect(r.solvable).toBe(true);
    expect(r.minMoves).toBe(lvl.minMoves);
    const part = analyzeSharedTrayParticipation(lvl.cups, (r.solution ?? []) as SolverAction[], lvl.cupConstraints);
    expect(part.firstPressureDepth).not.toBe(null);
    expect(part.firstReleaseDepth).not.toBe(null);
    expect(part.firstRefillDepth).not.toBe(null);
    expect((part.firstPressureDepth as number) < (part.firstReleaseDepth as number)).toBe(true);
    expect((part.firstReleaseDepth as number) < (part.firstRefillDepth as number)).toBe(true);
    expect(part.win).toBe(true);
  });
});
