/** Gauntlet 6 §65 — 100-seed strainer+mystery-peak production stress corpus. */
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
  numColors: 5,
  colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong', 'lavender'] as TeaId[],
  emptyCups: 1,
  hasMysteryLayer: true,
  phase: 'peak',
  hasStrainer: true,
};

describe('strainer + mystery peak stress (100 seeds)', () => {
  it('every production level is rescued-necessary, solver-valid, fast-path', async () => {
    for (let s = 0; s < 100; s++) {
      const seed = `strainer-peak:${s}`;
      const stats = createGenerateStats();
      const level = generateLevel(REQ, seed, { stats });
      expect(stats.usedFallback).toBe(false);
      expect(stats.candidatesTried).toBe(0);
      expect(stats.templateAttempts).toBeGreaterThanOrEqual(1);
      expect(stats.templateAttempts).toBeLessThanOrEqual(STRAINER_TEMPLATE_ATTEMPTS);
      expect(stats.solverCalls).toBeLessThanOrEqual(STRAINER_TEMPLATE_ATTEMPTS * 2);
      // Mystery index valid: exactly one hidden cup, never the teapot
      // (peak has no teapot: hidden host is a plain normal vessel).
      const hiddenIdx = level.hiddenCounts.findIndex((h) => h > 0);
      expect(level.hiddenCounts.filter((h) => h > 0)).toHaveLength(1);
      expect(hiddenIdx).toBeGreaterThanOrEqual(0);
      expect(level.hiddenCounts[hiddenIdx]).toBe(1);
      expect(level.cupConstraints[hiddenIdx]?.mode).toBe('normal');
      expect(level.cupConstraints[hiddenIdx]?.targetTeaId).toBe(undefined);
      checkStrainerStressSeed(level, REQ, seed);
      if (s % 25 === 0) await heartbeat();
    }
    expect(true).toBe(true);
  }, 180000);
});
