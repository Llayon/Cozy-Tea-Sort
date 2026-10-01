/** Gauntlet 6 §65 — 100-seed teapot+strainer-challenge production stress corpus. */
import { describe, expect, it } from 'vitest';
import type { TeaId } from '../src/game/types';
import {
  createGenerateStats,
  generateLevel,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { STRAINER_TEMPLATE_ATTEMPTS } from '../src/game/logic/strainerTemplates';
import { checkStrainerStressSeed, heartbeat } from './strainer-stress-shared';

const REQ: GenerateRequest = {
  numColors: 4,
  colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'] as TeaId[],
  emptyCups: 1,
  hasMysteryLayer: false,
  phase: 'challenge',
  sourceOnlyCount: 1,
  hasStrainer: true,
};

describe('teapot + strainer challenge stress (100 seeds)', () => {
  it('every production level is rescued-necessary, solver-valid, fast-path', async () => {
    for (let s = 0; s < 100; s++) {
      const seed = `strainer-teapot:${s}`;
      const stats = createGenerateStats();
      const level = generateLevel(REQ, seed, { stats });
      expect(stats.usedFallback).toBe(false);
      expect(stats.candidatesTried).toBe(0);
      expect(stats.templateAttempts).toBeGreaterThanOrEqual(1);
      expect(stats.templateAttempts).toBeLessThanOrEqual(STRAINER_TEMPLATE_ATTEMPTS);
      expect(stats.solverCalls).toBeLessThanOrEqual(STRAINER_TEMPLATE_ATTEMPTS * 2);
      // Teapot at the stable slot 0, source-only, full + mixed.
      expect(level.cupConstraints[0]?.mode).toBe('source-only');
      expect(level.cups[0]).toHaveLength(4);
      expect(new Set(level.cups[0]).size).toBeGreaterThanOrEqual(2);
      checkStrainerStressSeed(level, REQ, seed);
      if (s % 25 === 0) await heartbeat();
    }
    expect(true).toBe(true);
  }, 120000);
});
