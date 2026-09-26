/** Gauntlet 4 §54 — 200-seed tasting-challenge production stress corpus. */
import { describe, expect, it } from 'vitest';
import type { TeaId } from '../src/game/types';
import { generateLevel, type GenerateRequest } from '../src/game/logic/generator';
import { checkTastingStressSeed, heartbeat } from './tasting-stress-shared';

const REQ: GenerateRequest = {
  numColors: 4,
  colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'] as TeaId[],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  tastingCupCount: 1,
};

describe('tasting challenge stress (200 seeds)', () => {
  it('every production level is structure- + solver-valid and uses the bowl', async () => {
    for (let s = 0; s < 200; s++) {
      const seed = `tasting-stress-ch:${s}`;
      checkTastingStressSeed(generateLevel(REQ, seed), REQ, seed);
      if (s % 25 === 0) await heartbeat();
    }
    expect(true).toBe(true);
  }, 180000);
});
