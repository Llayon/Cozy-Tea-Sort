/** Gauntlet 6 §65 — 100-seed strainer-challenge production stress corpus. */
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
  hasStrainer: true,
};

describe('strainer challenge stress (100 seeds)', () => {
  it('every production level is rescued-necessary, solver-valid, fast-path', async () => {
    for (let s = 0; s < 100; s++) {
      const seed = `strainer-ch:${s}`;
      const stats = createGenerateStats();
      const level = generateLevel(REQ, seed, { stats });
      expect(stats.usedFallback).toBe(false);
      expect(stats.candidatesTried).toBe(0);
      expect(stats.templateAttempts).toBeGreaterThanOrEqual(1);
      expect(stats.templateAttempts).toBeLessThanOrEqual(STRAINER_TEMPLATE_ATTEMPTS);
      expect(stats.solverCalls).toBeLessThanOrEqual(STRAINER_TEMPLATE_ATTEMPTS * 2);
      expect(level.hiddenCounts.every((h) => h === 0)).toBe(true);
      expect(level.cupConstraints.some((c) => c.mode === 'source-only')).toBe(false);
      checkStrainerStressSeed(level, REQ, seed);
      if (s % 25 === 0) await heartbeat();
    }
    expect(true).toBe(true);
  }, 120000);
});
