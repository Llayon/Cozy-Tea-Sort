/** Gauntlet 8 §102 — 200-seed interaction-challenge production stress corpus. */
import { describe, expect, it } from 'vitest';
import type { TeaId } from '../src/game/types';
import {
  createGenerateStats,
  generateLevel,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { LEMON_HONEY_TEMPLATE_ATTEMPTS } from '../src/game/logic/lemonHoneyTemplates';
import { checkInteractionStressSeed, heartbeat } from './interaction-stress-shared';

const REQ: GenerateRequest = {
  numColors: 4,
  colors: ['buckwheat', 'sea_buckthorn', 'karkade', 'milk_oolong'] as TeaId[],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  floatingIngredient: 'lemon',
  sinkingIngredient: 'honey',
};

describe('interaction challenge stress (200 seeds)', () => {
  it('every production level is solver-valid with cohost+split L2 participation, fast-path', async () => {
    for (let s = 0; s < 200; s++) {
      const seed = `interaction-ch:${s}`;
      const stats = createGenerateStats();
      const level = generateLevel(REQ, seed, { stats });
      expect(stats.usedFallback).toBe(false);
      expect(stats.candidatesTried).toBe(0);
      expect(stats.templateAttempts).toBeGreaterThanOrEqual(1);
      expect(stats.templateAttempts).toBeLessThanOrEqual(LEMON_HONEY_TEMPLATE_ATTEMPTS);
      expect(stats.solverCalls).toBeLessThanOrEqual(LEMON_HONEY_TEMPLATE_ATTEMPTS);
      expect(level.hiddenCounts.every((h) => h === 0)).toBe(true);
      expect(level.cupConstraints.some((c) => c.mode === 'source-only')).toBe(false);
      checkInteractionStressSeed(level, REQ, seed);
      if (s % 25 === 0) await heartbeat();
    }
    expect(true).toBe(true);
  }, 120000);
});
