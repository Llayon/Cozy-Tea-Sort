/** Gauntlet 3 §74 — 200-seed teapot+sink-challenge production stress corpus. */
import { describe, expect, it } from 'vitest';
import type { TeaId } from '../src/game/types';
import { generateLevel, type GenerateRequest } from '../src/game/logic/generator';
import { checkSinkStressSeed, heartbeat } from './sink-stress-shared';

const REQ: GenerateRequest = {
  numColors: 4,
  colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'] as TeaId[],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  sourceOnlyCount: 1,
  sinkOnlyCount: 1,
};

describe('teapot + sink challenge stress (200 seeds)', () => {
  it('every production level is structure- + solver-valid', async () => {
    for (let s = 0; s < 200; s++) {
      const seed = `sink-stress-teapot:${s}`;
      checkSinkStressSeed(generateLevel(REQ, seed), REQ, seed);
      if (s % 25 === 0) await heartbeat();
    }
    expect(true).toBe(true);
  }, 180000);
});
