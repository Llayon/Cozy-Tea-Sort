import { describe, expect, it } from 'vitest';
import { generateLevel, type GenerateRequest } from '../src/game/logic/generator';
import { checkTargetStressSeed, heartbeat } from './target-stress-shared';

const TARGET_MYSTERY_PEAK: GenerateRequest = {
  numColors: 5,
  colors: ['saffron', 'buckwheat', 'matcha', 'karkade', 'lavender'],
  emptyCups: 2,
  hasMysteryLayer: true,
  phase: 'peak',
  targetTeaIds: ['lavender', 'karkade'],
};

// 10 × 10 seeds: peak target solves are the heaviest BFS in the suite,
// so tasks stay short enough for the Vitest worker heartbeat.
describe('target stress: 100 seeds target + mystery peak', () => {
  for (let part = 0; part < 10; part++) {
    it(
      `part ${part + 1}/10 valid + solver-accepted, mystery distinct`,
      { timeout: 120_000 },
      async () => {
        const start = part * 10;
        for (let s = start; s < start + 10; s++) {
          const seed = `stress:target:peak:${s}`;
          const level = generateLevel(TARGET_MYSTERY_PEAK, seed);
          checkTargetStressSeed(level, TARGET_MYSTERY_PEAK, seed);
          const hidIdx = level.hiddenCounts.findIndex((h) => h > 0);
          expect(hidIdx).toBeGreaterThanOrEqual(0);
          expect(level.cupConstraints[hidIdx]?.targetTeaId).toBeUndefined();
          expect(level.cupConstraints[hidIdx]?.mode).toBe('normal');
          if (s % 5 === 4) await heartbeat();
        }
        expect(true).toBe(true);
      },
    );
  }
});
