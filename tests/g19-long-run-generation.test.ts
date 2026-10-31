/**
 * G19 production generation smoke — representative Rollout V2 deck slots and
 * the persistence boundary levels all generate through the real generator.
 *
 * The exhaustive L1–2000 + stratified L2001–L10000 audit lives in
 * scripts/dev/g19-long-run-generation.ts (DEV evidence); this test keeps the
 * canonical gate bounded but still covers every deck slot and every high-level
 * persistence boundary.
 */
import { describe, expect, it } from 'vitest';
import { createGenerateStats, generateLevel } from '../src/game/logic/generator';
import { generateRequestForLevelConfig } from '../src/game/logic/productionRequest';
import { getLevelConfig, mechanicPlanForLevel } from '../src/utils/difficultyCurve';
import { tutorialForConfig } from '../src/game/ui/tutorials';
import { isThermosCupConstraint } from '../src/game/types';

const V2_DECK_LEVELS = Array.from({ length: 28 }, (_, i) => 334 + 4 * i);
const BOUNDARY_LEVELS = [999, 1000, 1001, 1600, 1601, 5000, 5002, 9999, 10000];
const ALL_LEVELS = [...new Set([...V2_DECK_LEVELS, ...BOUNDARY_LEVELS])];

function seedFor(level: number): string {
  return `g19-rollout:${level}:0`;
}

describe('G19 representative production generation', () => {
  it('every V2 deck slot and high-level boundary generates deterministically', () => {
    for (const level of ALL_LEVELS) {
      const cfg = getLevelConfig(level);
      const stats = createGenerateStats();
      const first = generateLevel(generateRequestForLevelConfig(cfg), seedFor(level), { stats });

      expect(first.cups.length, `L${level} vessels`).toBeGreaterThan(0);
      expect(first.minMoves, `L${level} minMoves`).toBeGreaterThanOrEqual(0);
      expect(first.cups.length).toBe(cfg.numColors + cfg.emptyCups);
      expect(stats.usedFallback, `L${level} fallback`).toBe(false);

      const again = generateLevel(generateRequestForLevelConfig(cfg), seedFor(level));
      expect(again.cups, `L${level} deterministic cups`).toEqual(first.cups);
      expect(again.minMoves, `L${level} deterministic depth`).toBe(first.minMoves);
      expect(again.cupConstraints, `L${level} deterministic constraints`).toEqual(
        first.cupConstraints,
      );
    }
  });

  it('V2 deck slots keep their mechanic identity in the generated board', () => {
    for (const level of V2_DECK_LEVELS) {
      const cfg = getLevelConfig(level);
      const plan = mechanicPlanForLevel(level);
      const generated = generateLevel(generateRequestForLevelConfig(cfg), seedFor(level));
      const constraints = generated.cupConstraints;

      expect(generated.cups.length, `L${level}`).toBe(cfg.totalCups);
      expect(Boolean(generated.blendRecipe), `L${level} blend`).toBe(plan.blend);
      expect(
        constraints.filter((c) => c.sharedCapacityGroup === 'tea-tray').length,
        `L${level} tray members`,
      ).toBe(plan.sharedTray ? 2 : 0);
      expect(
        constraints.filter((c) => c.pairedTeaGroup === 'tea-pair').length,
        `L${level} pair members`,
      ).toBe(plan.teaPair ? 2 : 0);
      expect(
        constraints.filter((c) => c.serveOrder !== undefined).length,
        `L${level} serving order`,
      ).toBe(plan.servingOrder ? 2 : 0);
      expect(
        (generated.floatingIngredients ?? []).filter((slot) => slot === 'lemon').length,
        `L${level} lemon`,
      ).toBe(plan.lemon ? 1 : 0);
      expect(
        (generated.sinkingIngredients ?? []).filter((slot) => slot === 'honey').length,
        `L${level} honey`,
      ).toBe(plan.honey ? 1 : 0);
      expect(
        (generated.iceSlots ?? []).filter((slot) => slot === 'ice').length,
        `L${level} frozen`,
      ).toBe(plan.frozen ? 1 : 0);
      expect(
        constraints.filter((c) => isThermosCupConstraint(c)).length,
        `L${level} thermos`,
      ).toBe(plan.thermos ? 1 : 0);
      expect(
        (generated.capacityObstacles ?? []).filter((slot) => slot === 'cinnamon').length,
        `L${level} cinnamon`,
      ).toBe(plan.cinnamon ? 1 : 0);
      expect(
        (generated.teaBudSlots ?? []).filter((slot) => slot !== null).length,
        `L${level} tea bloom`,
      ).toBe(plan.teaBloom ? 1 : 0);
      expect(tutorialForConfig(cfg), `L${level} tutorial repeat`).toBeNull();
    }
  });

  it('reaction IDs never leak outside blend boards', () => {
    for (const level of ALL_LEVELS) {
      const cfg = getLevelConfig(level);
      if (cfg.hasBlend) continue;
      const generated = generateLevel(generateRequestForLevelConfig(cfg), seedFor(level));
      const flat = generated.cups.flat();
      expect(flat, `L${level} black_tea`).not.toContain('black_tea');
      expect(flat, `L${level} milk`).not.toContain('milk');
      expect(flat, `L${level} milk_tea`).not.toContain('milk_tea');
    }
  });

  it('pinned high-level configs are valid and deterministic', () => {
    for (const level of [1000, 1600, 9999, 10000]) {
      const cfg = getLevelConfig(level);
      expect(cfg.levelNumber).toBe(level);
      expect(cfg.phase).toMatch(/^(warmup|challenge|peak|relax)$/);
      expect(cfg.totalCups).toBe(cfg.numColors + cfg.emptyCups);
      expect(getLevelConfig(level)).toEqual(cfg);
      expect(mechanicPlanForLevel(level)).toEqual(mechanicPlanForLevel(level));
    }
  });
});
