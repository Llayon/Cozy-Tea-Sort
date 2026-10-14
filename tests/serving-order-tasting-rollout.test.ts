/**
 * G15 rollout (§§27-28, §35): levels 1-112 unchanged; mixed combo challenge-only
 * after standalone exposure; sweep 1-1300; no blend leak; standalone G14 intact.
 */
import { describe, expect, it } from 'vitest';
import { getLevelConfig, mechanicPlanForLevel } from '../src/utils/difficultyCurve';
import { generateLevel } from '../src/game/logic/generator';
import type { TeaId } from '../src/game/types';

function toReq(levelNum: number) {
  const cfg = getLevelConfig(levelNum);
  return {
    numColors: cfg.numColors, colors: [...cfg.colors], emptyCups: cfg.emptyCups,
    hasMysteryLayer: cfg.hasMysteryLayer, phase: cfg.phase,
    sourceOnlyCount: cfg.hasSourceOnlyTeapot ? 1 : 0,
    targetTeaIds: [...cfg.targetTeaIds],
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
  };
}

describe('levels 1-112 frozen (§27)', () => {
  it('L106 serving tutorial; L110 serving no repeat; peaks familiar', () => {
    const c106 = getLevelConfig(106);
    expect(c106.hasServingOrder).toBe(true);
    expect(c106.hasTastingBowl).toBe(false);
    expect(c106.phaseSubtitle).toBe('Порядок подачи • 6 сосудов');
    const c110 = getLevelConfig(110);
    expect(c110.hasServingOrder).toBe(true);
    expect(c110.hasTastingBowl).toBe(false);
    expect(getLevelConfig(107).hasTastingBowl).toBe(true);
    expect(getLevelConfig(111).sinkingIngredient).toBe('honey');
    for (let n = 1; n <= 112; n++) {
      const cfg = getLevelConfig(n);
      // No combo before G15: never tasting+serving together in 1-112.
      expect(cfg.hasTastingBowl && cfg.hasServingOrder).toBe(false);
    }
  });
  it('pinned 1-112 plans: 106/110 serving standalone', () => {
    expect(mechanicPlanForLevel(106)).toMatchObject({ servingOrder: true, tasting: false });
    expect(mechanicPlanForLevel(110)).toMatchObject({ servingOrder: true, tasting: false });
  });
});

describe('post-112 combo cadence (§28)', () => {
  it('first combo is challenge-only after standalone exposure (L154)', () => {
    const cfg = getLevelConfig(154);
    expect(cfg.hasServingOrder).toBe(true);
    expect(cfg.hasTastingBowl).toBe(true);
    expect(cfg.phase).toBe('challenge');
    expect(cfg.phaseSubtitle).toBe('Порядок подачи и пиала • 6 сосудов');
    expect(cfg.hasMysteryLayer).toBe(false);
  });
  it('combo recurs roughly every 80 levels (154, 234)', () => {
    expect(getLevelConfig(234).hasServingOrder && getLevelConfig(234).hasTastingBowl).toBe(true);
    // Between combos: standalone serving still recurs (e.g. L194? cycle 49 → 49%20=9 lemon).
    // Spot-check a non-combo challenge stays single-mechanic.
    const c194 = getLevelConfig(194);
    expect(c194.hasServingOrder && c194.hasTastingBowl).toBe(false);
  });
  it('warmup/relax stay clean (no combo)', () => {
    for (const n of [113, 116, 117, 120, 153, 156]) {
      const cfg = getLevelConfig(n);
      if (cfg.phase === 'warmup' || cfg.phase === 'relax') {
        expect(cfg.hasServingOrder).toBe(false);
        expect(cfg.hasTastingBowl).toBe(false);
      }
    }
  });
});

describe('sweep 1-1300 (§35)', () => {
  it('all levels generate; combos only allowed slots; no blend leak', () => {
    let comboCount = 0;
    for (let n = 1; n <= 1300; n++) {
      const cfg = getLevelConfig(n);
      const lvl = generateLevel(toReq(n), `g15-rollout-${n}`);
      expect(lvl.cups.length).toBeGreaterThan(0);
      const hasOrder = lvl.cupConstraints.some((c) => c.serveOrder !== undefined);
      const hasTaste = lvl.cupConstraints.some((c) => c.mode === 'normal' && c.capacity === 2 && c.mustEndEmpty === true);
      if (cfg.hasServingOrder && cfg.hasTastingBowl) {
        comboCount++;
        expect(cfg.phase).toBe('challenge');
        expect(hasOrder).toBe(true);
        expect(hasTaste).toBe(true);
        expect(lvl.blendRecipe).toBeUndefined();
        for (const cup of lvl.cups) for (const t of cup) expect(['black_tea', 'milk', 'milk_tea']).not.toContain(t);
      }
      if (n <= 112) {
        expect(hasOrder && hasTaste).toBe(false);
      }
      // No Order+Blend anywhere.
      expect(hasOrder && lvl.blendRecipe !== undefined).toBe(false);
    }
    expect(comboCount).toBeGreaterThanOrEqual(10);
    expect(comboCount).toBeLessThanOrEqual(20);
  }, 600000);
});
