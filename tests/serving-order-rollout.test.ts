/**
 * Gauntlet 14 — rollout 105–112 + post-112 + leak (§§167-171).
 *
 * 1–104 unchanged; 105 warmup clean; 106 challenge serving tutorial;
 * 107 peak honey+mystery (familiar); 108 relax; 109 warmup; 110 challenge
 * serving (no repeat); 111 peak lemon+mystery (familiar); 112 relax.
 * Post-112 rotation serves challenge-only standalone levels. Reaction IDs
 * never leak (bounded 1–160 generation sweep in CI; 1–1300 offline DEV).
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
      serveOrderCount: cfg.hasServingOrder ? 2 : 0,
      targetTeaIds: [...cfg.targetTeaIds],
      phase: cfg.phase,
    },
  };
}

describe('levels 1–112 plan', () => {
  it('1–104 have no serving order (unchanged)', () => {
    for (let l = 1; l <= 104; l++) {
      expect(mechanicPlanForLevel(l).servingOrder).toBe(false);
      expect(getLevelConfig(l).hasServingOrder ?? false).toBe(false);
    }
  });

  it('105–112 shape: warmup/challenge/peak/relax with tutorial + familiar peaks', () => {
    expect(getLevelConfig(105).phase).toBe('warmup');
    const c106 = getLevelConfig(106);
    expect(c106.phase).toBe('challenge');
    expect(c106.hasServingOrder).toBe(true);
    expect(c106.phaseSubtitle).toBe('Порядок подачи • 6 сосудов');
    expect(c106.numColors).toBe(4);
    expect(c106.emptyCups).toBe(2);
    expect(getLevelConfig(107).phase).toBe('peak');
    expect(getLevelConfig(107).hasServingOrder ?? false).toBe(false);
    expect(getLevelConfig(108).phase).toBe('relax');
    expect(getLevelConfig(109).phase).toBe('warmup');
    const c110 = getLevelConfig(110);
    expect(c110.phase).toBe('challenge');
    expect(c110.hasServingOrder).toBe(true);
    expect(getLevelConfig(111).phase).toBe('peak');
    expect(getLevelConfig(111).hasServingOrder ?? false).toBe(false);
    expect(getLevelConfig(112).phase).toBe('relax');
  });

  it('106 vs 110 palettes carry 4 eligible teas, no reaction IDs', () => {
    for (const l of [106, 110]) {
      const colors = getLevelConfig(l).colors;
      expect(colors.length).toBe(4);
      expect(colors).not.toContain('black_tea');
      expect(colors).not.toContain('milk');
      expect(colors).not.toContain('milk_tea');
    }
  });
});

describe('serving generation through rollout helper', () => {
  it('L106 generates ordered L2-shape with recipe-free constraints', () => {
    const { req } = reqFor(106);
    const lvl = generateLevel(req as never, makeProductionSeed(106));
    expect(lvl.cupConstraints.filter((c) => c.serveOrder !== undefined).length).toBe(2);
    expect(lvl.cups.length).toBe(6);
    expect(lvl.cups.map((c) => c.length).sort((a, b) => a - b)).toEqual([0, 0, 4, 4, 4, 4]);
  });

  it('L110 generates serving without tutorial repeat (same contract)', () => {
    const { req } = reqFor(110);
    const lvl = generateLevel(req as never, makeProductionSeed(110));
    expect(lvl.cupConstraints.filter((c) => c.serveOrder !== undefined).length).toBe(2);
  });

  it('L106/L110 exact minMoves pinned (fixed seeds)', () => {
    const a = generateLevel(reqFor(106).req as never, 'g14-l106-pin').minMoves;
    expect(a).toBe(12);
    const c = generateLevel(reqFor(110).req as never, 'g14-l110-pin').minMoves;
    expect(c).toBe(13);
    console.log(`L106 minMoves=${a} L110 minMoves=${c}`);
  });
});

describe('post-112 rotation serves challenge-only standalone levels', () => {
  it('first serving challenge past 112 is well-formed', () => {
    let found = -1;
    for (let l = 113; l <= 400; l++) {
      if (mechanicPlanForLevel(l).servingOrder) { found = l; break; }
    }
    expect(found).toBeGreaterThan(112);
    const { cfg, req } = reqFor(found);
    expect(cfg.phase).toBe('challenge');
    expect(cfg.hasMysteryLayer).toBe(false);
    const lvl = generateLevel(req as never, makeProductionSeed(found));
    expect(lvl.cupConstraints.filter((c) => c.serveOrder !== undefined).length).toBe(2);
    console.log(`first post-112 serving challenge: L${found}`);
  });
});

describe('reaction-ID + serving leak (non-serving levels 1–160)', () => {
  it('no orders outside serving; no reaction IDs outside blend palettes', () => {
    for (let l = 1; l <= 160; l++) {
      const { cfg, req } = reqFor(l);
      const lvl = generateLevel(req as never, makeProductionSeed(l));
      const flat = lvl.cups.flat() as string[];
      // Reaction IDs are legitimate ONLY on blend levels (G13 domain).
      if (!cfg.hasBlend) {
        expect(flat).not.toContain('black_tea');
        expect(flat).not.toContain('milk');
        expect(flat).not.toContain('milk_tea');
      }
      const orders = lvl.cupConstraints.filter((c) => c.serveOrder !== undefined).length;
      expect(orders).toBe(cfg.hasServingOrder ? 2 : 0);
    }
  });
});
