/** Gauntlet 7 §99 — 100-seed teapot+honey-challenge production stress corpus. */
import { describe, expect, it } from 'vitest';
import type { TeaId } from '../src/game/types';
import {
  createGenerateStats,
  generateLevel,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { HONEY_TEMPLATE_ATTEMPTS } from '../src/game/logic/honeyTemplates';
import { checkHoneyStressSeed, heartbeat } from './honey-stress-shared';

const REQ: GenerateRequest = {
  numColors: 4,
  colors: ['matcha', 'sea_buckthorn', 'karkade', 'buckwheat'] as TeaId[],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  sourceOnlyCount: 1,
  sinkingIngredient: 'honey',
};

describe('teapot + honey challenge stress (100 seeds)', () => {
  it('every production level is solver-valid with stay+move participation, fast-path', async () => {
    for (let s = 0; s < 100; s++) {
      const seed = `honey-teapot:${s}`;
      const stats = createGenerateStats();
      const level = generateLevel(REQ, seed, { stats });
      expect(stats.usedFallback).toBe(false);
      expect(stats.candidatesTried).toBe(0);
      expect(stats.templateAttempts).toBeGreaterThanOrEqual(1);
      expect(stats.templateAttempts).toBeLessThanOrEqual(HONEY_TEMPLATE_ATTEMPTS);
      expect(stats.solverCalls).toBeLessThanOrEqual(HONEY_TEMPLATE_ATTEMPTS);
      // Teapot at the stable slot 0, source-only, full + mixed; honey
      // starts inside the teapot (host 0).
      expect(level.cupConstraints[0]?.mode).toBe('source-only');
      expect(level.cups[0]).toHaveLength(4);
      expect(new Set(level.cups[0]).size).toBeGreaterThanOrEqual(2);
      const honeyHost = (level.sinkingIngredients ?? []).findIndex((s) => s === 'honey');
      expect(honeyHost).toBe(0);
      checkHoneyStressSeed(level, REQ, seed);
      if (s % 25 === 0) await heartbeat();
    }
    expect(true).toBe(true);
  }, 120000);
});
