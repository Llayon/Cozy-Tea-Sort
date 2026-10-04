/** Gauntlet 7 §99 — 100-seed honey+mystery-peak production stress corpus. */
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
  numColors: 5,
  colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong', 'buckwheat'] as TeaId[],
  emptyCups: 2,
  hasMysteryLayer: true,
  phase: 'peak',
  sinkingIngredient: 'honey',
};

describe('honey + mystery peak stress (100 seeds)', () => {
  it('every production level is solver-valid with stay+move participation, fast-path', async () => {
    for (let s = 0; s < 100; s++) {
      const seed = `honey-peak:${s}`;
      const stats = createGenerateStats();
      const level = generateLevel(REQ, seed, { stats });
      expect(stats.usedFallback).toBe(false);
      expect(stats.candidatesTried).toBe(0);
      expect(stats.templateAttempts).toBeGreaterThanOrEqual(1);
      expect(stats.templateAttempts).toBeLessThanOrEqual(HONEY_TEMPLATE_ATTEMPTS);
      expect(stats.solverCalls).toBeLessThanOrEqual(HONEY_TEMPLATE_ATTEMPTS);
      // Mystery index valid: exactly one hidden cup on a plain normal
      // vessel, and the honey host is never the mystery host.
      const hiddenIdx = level.hiddenCounts.findIndex((h) => h > 0);
      expect(level.hiddenCounts.filter((h) => h > 0)).toHaveLength(1);
      expect(hiddenIdx).toBeGreaterThanOrEqual(0);
      expect(level.hiddenCounts[hiddenIdx]).toBe(1);
      expect(level.cupConstraints[hiddenIdx]?.mode).toBe('normal');
      expect(level.cupConstraints[hiddenIdx]?.targetTeaId).toBe(undefined);
      const honeyHost = (level.sinkingIngredients ?? []).findIndex((s) => s === 'honey');
      expect(honeyHost).toBeGreaterThanOrEqual(0);
      expect(honeyHost).not.toBe(hiddenIdx);
      checkHoneyStressSeed(level, REQ, seed);
      if (s % 25 === 0) await heartbeat();
    }
    expect(true).toBe(true);
  }, 180000);
});
