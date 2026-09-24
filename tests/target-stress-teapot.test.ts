import { describe, expect, it } from 'vitest';
import { generateLevel, type GenerateRequest } from '../src/game/logic/generator';
import { checkTargetStressSeed, heartbeat } from './target-stress-shared';

const TEAPOT_TARGET_CHALLENGE: GenerateRequest = {
  numColors: 4,
  colors: ['saffron', 'lavender', 'karkade', 'milk_oolong'],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  sourceOnlyCount: 1,
  targetTeaIds: ['lavender', 'karkade'],
};

describe('target stress: 100 seeds teapot + target challenge', () => {
  for (let part = 0; part < 4; part++) {
    it(
      `part ${part + 1}/4 valid + solver-accepted, roles distinct`,
      { timeout: 180_000 },
      async () => {
        for (let s = part * 25; s < (part + 1) * 25; s++) {
          const seed = `stress:target:teapot:${s}`;
          const level = generateLevel(TEAPOT_TARGET_CHALLENGE, seed);
          checkTargetStressSeed(level, TEAPOT_TARGET_CHALLENGE, seed);
          const potIdx = level.cupConstraints.findIndex((c) => c.mode === 'source-only');
          expect(potIdx).toBe(0);
          const targetIdx = level.cupConstraints
            .map((c, i) => (c.targetTeaId !== undefined ? i : -1))
            .filter((i) => i >= 0);
          expect(targetIdx).toEqual([1, 2]);
          if (s % 5 === 4) await heartbeat();
        }
        expect(true).toBe(true);
      },
    );
  }
});
