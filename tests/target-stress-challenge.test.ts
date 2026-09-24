import { describe, expect, it } from 'vitest';
import { generateLevel, type GenerateRequest } from '../src/game/logic/generator';
import { checkTargetStressSeed, heartbeat } from './target-stress-shared';

const TARGET_CHALLENGE: GenerateRequest = {
  numColors: 4,
  colors: ['saffron', 'lavender', 'karkade', 'milk_oolong'],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  targetTeaIds: ['lavender', 'karkade'],
};

// 5 × 20 seeds: tasks stay well under the Vitest worker heartbeat limit.
describe('target stress: 100 seeds target challenge', () => {
  for (let part = 0; part < 5; part++) {
    it(
      `part ${part + 1}/5 valid + solver-accepted`,
      { timeout: 120_000 },
      async () => {
        const start = part * 20;
        for (let s = start; s < start + 20; s++) {
          const seed = `stress:target:challenge:${s}`;
          checkTargetStressSeed(generateLevel(TARGET_CHALLENGE, seed), TARGET_CHALLENGE, seed);
          if (s % 5 === 4) await heartbeat();
        }
        expect(true).toBe(true);
      },
    );
  }
});
