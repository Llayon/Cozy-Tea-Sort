/** Gauntlet 5 §84 — 200-seed teapot+lemon-challenge production stress corpus. */
import { describe, expect, it } from 'vitest';
import type { TeaId } from '../src/game/types';
import { generateLevel, type GenerateRequest } from '../src/game/logic/generator';
import { checkLemonStressSeed, heartbeat } from './lemon-stress-shared';

const REQ: GenerateRequest = {
  numColors: 4,
  colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'] as TeaId[],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  sourceOnlyCount: 1,
  floatingIngredient: 'lemon',
};

describe('teapot + lemon challenge stress (200 seeds)', () => {
  it('every production level is structure- + solver-valid with lemon travel', async () => {
    for (let s = 0; s < 200; s++) {
      const seed = `lemon-stress-teapot:${s}`;
      checkLemonStressSeed(generateLevel(REQ, seed), REQ, seed);
      if (s % 25 === 0) await heartbeat();
    }
    expect(true).toBe(true);
  }, 180000);
});
