import { describe, expect, it } from 'vitest';
import { MAX_CUP_CAPACITY, TeaId } from '../src/game/types';
import {
  generateLevel,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { solvePuzzle } from '../src/game/logic/solver';
import { depthAccepted } from '../src/game/logic/difficulty';
import { isWonState } from '../src/game/logic/rules';

const CONFIGS: Array<{ name: string; req: GenerateRequest; seeds: number }> = [
  {
    name: '3 colors / 5 cups',
    req: {
      numColors: 3,
      colors: ['matcha', 'sea_buckthorn', 'karkade'],
      emptyCups: 2,
      hasMysteryLayer: false,
      phase: 'warmup',
    },
    seeds: 100,
  },
  {
    name: '4 colors / 6 cups',
    req: {
      numColors: 4,
      colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'],
      emptyCups: 2,
      hasMysteryLayer: false,
      phase: 'challenge',
    },
    seeds: 100,
  },
  {
    name: '5 colors / 7 cups',
    req: {
      numColors: 5,
      colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong', 'lavender'],
      emptyCups: 2,
      hasMysteryLayer: false,
      phase: 'peak',
    },
    seeds: 60,
  },
  {
    name: '5 colors / 7 cups + mystery',
    req: {
      numColors: 5,
      colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong', 'lavender'],
      emptyCups: 2,
      hasMysteryLayer: true,
      phase: 'peak',
    },
    seeds: 60,
  },
];

describe('generator property tests (deterministic seeds)', () => {
  for (const cfg of CONFIGS) {
    it(`${cfg.name}: ${cfg.seeds} seeds all valid + solver-accepted`, () => {
      for (let s = 0; s < cfg.seeds; s++) {
        const seed = `gauntlet0:${cfg.name}:${s}`;
        const level = generateLevel(cfg.req, seed);

        // Determinism: same seed -> identical puzzle.
        const again = generateLevel(cfg.req, seed);
        expect(again.cups).toEqual(level.cups);
        expect(again.hiddenCounts).toEqual(level.hiddenCounts);

        // Correct cup count.
        expect(level.cups).toHaveLength(cfg.req.numColors + cfg.req.emptyCups);

        // Exactly 4 units per color, capacity respected.
        const counts = new Map<string, number>();
        for (const cup of level.cups) {
          expect(cup.length).toBeLessThanOrEqual(MAX_CUP_CAPACITY);
          for (const t of cup) counts.set(t, (counts.get(t) ?? 0) + 1);
        }
        for (const c of cfg.req.colors.slice(0, cfg.req.numColors)) {
          expect(counts.get(c)).toBe(MAX_CUP_CAPACITY);
        }

        // Not already solved.
        expect(isWonState(level.cups)).toBe(false);

        // Solver validation: production levels must be solvable.
        const solved = solvePuzzle(level.cups);
        expect(solved.solvable).toBe(true);
        expect(level.minMoves).toBeGreaterThan(0);

        // Hard acceptance band: every production level is in-band.
        expect(depthAccepted(level.minMoves, cfg.req.phase)).toBe(true);

        // Structural validator agrees.
        const check = validateLevelStructure(level, cfg.req);
        expect(check.reasons).toEqual([]);
        expect(check.ok).toBe(true);

        // Mystery configs: hidden layer differs from adjacent visible layer.
        if (cfg.req.hasMysteryLayer) {
          const idx = level.hiddenCounts.findIndex((h) => h > 0);
          expect(idx).toBeGreaterThanOrEqual(0);
          const cup = level.cups[idx] as TeaId[];
          expect(cup.length).toBeGreaterThanOrEqual(3);
          expect(cup[0]).not.toBe(cup[1]);
          expect(level.hiddenCounts[idx]).toBe(1);
        } else {
          expect(level.hiddenCounts.every((h) => h === 0)).toBe(true);
        }
      }
    });
  }

  it('different seeds produce different puzzles (shuffled, not static)', () => {
    const req: GenerateRequest = {
      numColors: 3,
      colors: ['matcha', 'sea_buckthorn', 'karkade'],
      emptyCups: 2,
      hasMysteryLayer: false,
      phase: 'warmup',
    };
    const seen = new Set<string>();
    for (let s = 0; s < 20; s++) {
      const level = generateLevel(req, `variety:${s}`);
      seen.add(JSON.stringify(level.cups));
    }
    expect(seen.size).toBeGreaterThan(5);
  });

  it('fallback is solvable when retries are exhausted', () => {
    const req: GenerateRequest = {
      numColors: 5,
      colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong', 'lavender'],
      emptyCups: 2,
      hasMysteryLayer: true,
      phase: 'peak',
    };
    const level = generateLevel(req, 'any-seed', { maxRetries: 0 });
    expect(solvePuzzle(level.cups).solvable).toBe(true);
  });
});
