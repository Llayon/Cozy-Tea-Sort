/**
 * Gauntlet 13 — rollout 97–104 + post-104 + leak (§§141-146).
 *
 * 1–96 unchanged; 97 warmup clean; 98 challenge blend tutorial;
 * 99 peak familiar; 100 relax clean; 101 warmup clean; 102 challenge blend
 * (no repeat); 103 peak familiar; 104 relax clean. Post-104 rotation
 * includes blend challenge-only, standalone, 6 vessels. Reaction IDs never
 * leak into non-blend levels (stress to 1200 in stress test; here to 150).
 */
import { describe, expect, it } from 'vitest';
import { getLevelConfig, mechanicPlanForLevel } from '../src/utils/difficultyCurve';
import { generateLevel } from '../src/game/logic/generator';
import { makeProductionSeed } from '../src/game/logic/rng';

function reqFor(level: number) {
  const cfg = getLevelConfig(level);
  return {
    cfg,
    req: {
      numColors: cfg.numColors,
      colors: cfg.colors,
      emptyCups: cfg.emptyCups,
      hasMysteryLayer: cfg.hasMysteryLayer,
      sourceOnlyCount: cfg.hasSourceOnlyTeapot ? 1 : 0,
      sinkOnlyCount: cfg.hasSinkGuestCup ? 1 : 0,
      tastingCupCount: cfg.hasTastingBowl ? 1 : 0,
      floatingIngredient: cfg.floatingIngredient,
      hasStrainer: cfg.hasStrainer,
      sinkingIngredient: cfg.sinkingIngredient,
      frozenCupCount: cfg.hasFrozenCup ? 1 : 0,
      thermosCupCount: cfg.hasThermos ? 1 : 0,
      cinnamonCupCount: cfg.hasCinnamon ? 1 : 0,
      teaBudCount: cfg.hasTeaBloom ? 1 : 0,
      blendRecipeId: cfg.hasBlend ? ('milk-tea' as const) : undefined,
      targetTeaIds: [...cfg.targetTeaIds],
      phase: cfg.phase,
    },
  };
}

describe('levels 1–104 plan', () => {
  it('1–96 have no blend (unchanged)', () => {
    for (let l = 1; l <= 96; l++) {
      expect(mechanicPlanForLevel(l).blend).toBe(false);
      expect(getLevelConfig(l).hasBlend ?? false).toBe(false);
    }
  });

  it('97/100/101/104 warmup-relax clean, 98/102 blend challenge, 99/103 familiar peaks', () => {
    expect(getLevelConfig(97).phase).toBe('warmup');
    expect(getLevelConfig(98).hasBlend).toBe(true);
    expect(getLevelConfig(98).phase).toBe('challenge');
    expect(getLevelConfig(98).phaseSubtitle).toBe('Молочный купаж • 6 сосудов');
    expect(getLevelConfig(99).phase).toBe('peak');
    expect(getLevelConfig(99).hasBlend ?? false).toBe(false);
    expect(getLevelConfig(100).phase).toBe('relax');
    expect(getLevelConfig(101).phase).toBe('warmup');
    expect(getLevelConfig(102).hasBlend).toBe(true);
    expect(getLevelConfig(102).phase).toBe('challenge');
    expect(getLevelConfig(103).phase).toBe('peak');
    expect(getLevelConfig(103).hasBlend ?? false).toBe(false);
    expect(getLevelConfig(104).phase).toBe('relax');
  });

  it('98 vs 102 palettes differ (tutorial vs repeat variety)', () => {
    const c98 = getLevelConfig(98).colors;
    const c102 = getLevelConfig(102).colors;
    expect(c98).toContain('black_tea');
    expect(c98).toContain('milk');
    expect(c102).toContain('black_tea');
    expect(c102).toContain('milk');
    expect(JSON.stringify([...c98].sort())).not.toBe(JSON.stringify([...c102].sort()));
  });
});

describe('blend generation through rollout helper', () => {
  it('L98 generates with recipe + 6 vessels + shape', () => {
    const { req } = reqFor(98);
    const lvl = generateLevel(req as never, makeProductionSeed(98));
    expect(lvl.blendRecipe?.id).toBe('milk-tea');
    expect(lvl.cups.length).toBe(6);
    expect(lvl.cups.map((c) => c.length).sort((a, b) => a - b)).toEqual([0, 0, 4, 4, 4, 4]);
  });

  it('L102 generates blend without tutorial repeat (same contract)', () => {
    const { req } = reqFor(102);
    const lvl = generateLevel(req as never, makeProductionSeed(102));
    expect(lvl.blendRecipe?.id).toBe('milk-tea');
  });
});

describe('reaction-ID leak (non-blend levels 1–150)', () => {
  it('no black_tea/milk/milk_tea outside blend', () => {
    for (let l = 1; l <= 150; l++) {
      const { cfg, req } = reqFor(l);
      if (cfg.hasBlend) continue;
      const lvl = generateLevel(req as never, makeProductionSeed(l));
      const flat = lvl.cups.flat() as string[];
      expect(flat).not.toContain('black_tea');
      expect(flat).not.toContain('milk');
      expect(flat).not.toContain('milk_tea');
      expect(lvl.blendRecipe).toBe(undefined);
    }
  });
});
