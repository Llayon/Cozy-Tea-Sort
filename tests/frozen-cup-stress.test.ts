/** Gauntlet 9 §117 — 200-seed frozen-cup production stress corpus. */
import { describe, expect, it } from 'vitest';
import type { TeaId } from '../src/game/types';
import {
  createGenerateStats,
  generateLevel,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { FROZEN_CUP_TEMPLATE_ATTEMPTS } from '../src/game/logic/frozenCupTemplates';
import { checkFrozenCupStressSeed, heartbeat } from './frozen-cup-stress-shared';

const REQ: GenerateRequest = {
  numColors: 4,
  colors: ['sea_buckthorn', 'matcha', 'karkade', 'milk_oolong'] as TeaId[],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  frozenCupCount: 1,
};

describe('frozen-cup challenge stress (200 seeds)', () => {
  it('every production level is solver-valid with melt→source-use participation, fast-path', async () => {
    for (let s = 0; s < 200; s++) {
      const seed = `frozen-ch:${s}`;
      const stats = createGenerateStats();
      const level = generateLevel(REQ, seed, { stats });
      expect(stats.usedFallback).toBe(false);
      expect(stats.candidatesTried).toBe(0);
      expect(stats.templateAttempts).toBeGreaterThanOrEqual(1);
      expect(stats.templateAttempts).toBeLessThanOrEqual(FROZEN_CUP_TEMPLATE_ATTEMPTS);
      expect(stats.solverCalls).toBeLessThanOrEqual(FROZEN_CUP_TEMPLATE_ATTEMPTS);
      expect(level.hiddenCounts.every((h) => h === 0)).toBe(true);
      expect(level.cupConstraints.some((c) => c.mode === 'source-only')).toBe(false);
      checkFrozenCupStressSeed(level, REQ, seed);
      if (s % 25 === 0) await heartbeat();
    }
    expect(true).toBe(true);
  }, 300000);
});
