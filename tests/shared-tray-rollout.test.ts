/**
 * Gauntlet 16 — rollout: preserved prefix ≤154, first exposure L162,
 * second exposure L242, no-combo leak (§§180-185).
 *
 * L162/L242 are challenge slots under the current rotation (both cinnamon
 * today); pinning them as shared-tray preserves all ≤154 levels
 * byte-identically. Reaction IDs never leak (bounded 1–170 generation
 * sweep in CI; 1–1500 plan sweep offline DEV).
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
      sharedTrayCount: (cfg as { hasSharedTray?: boolean }).hasSharedTray ? 1 : 0,
      targetTeaIds: [...cfg.targetTeaIds],
      phase: cfg.phase,
    },
  };
}

describe('preserved prefix: 1–154 have no shared tray', () => {
  it('1–154 plans and configs are tray-free (G15 L154 combo untouched)', () => {
    for (let l = 1; l <= 154; l++) {
      expect((mechanicPlanForLevel(l) as { sharedTray?: boolean }).sharedTray ?? false).toBe(false);
      expect((getLevelConfig(l) as { hasSharedTray?: boolean }).hasSharedTray ?? false).toBe(false);
    }
    // G15 first combo slot still serving-order+tasting.
    const c154 = getLevelConfig(154);
    expect(c154.hasServingOrder).toBe(true);
    expect(c154.hasTastingBowl).toBe(true);
  });
});

describe('first + second exposure', () => {
  it('L162 is a challenge shared-tray tutorial slot (Общий поднос • 6 сосудов)', () => {
    const plan = mechanicPlanForLevel(162) as { sharedTray?: boolean };
    expect(plan.sharedTray).toBe(true);
    const cfg = getLevelConfig(162);
    expect(cfg.phase).toBe('challenge');
    expect((cfg as { hasSharedTray?: boolean }).hasSharedTray).toBe(true);
    expect(cfg.phaseSubtitle).toBe('Общий поднос • 6 сосудов');
    expect(cfg.numColors).toBe(4);
    expect(cfg.emptyCups).toBe(2);
  });

  it('L242 is a challenge shared-tray slot without tutorial repeat', () => {
    const plan = mechanicPlanForLevel(242) as { sharedTray?: boolean };
    expect(plan.sharedTray).toBe(true);
    const cfg = getLevelConfig(242);
    expect(cfg.phase).toBe('challenge');
    expect((cfg as { hasSharedTray?: boolean }).hasSharedTray).toBe(true);
  });

  it('L162 vs L242 palettes carry 4 eligible teas, no reaction IDs', () => {
    for (const l of [162, 242]) {
      const colors = getLevelConfig(l).colors;
      expect(colors.length).toBe(4);
      expect(colors).not.toContain('black_tea');
      expect(colors).not.toContain('milk');
      expect(colors).not.toContain('milk_tea');
    }
  });
});

describe('shared generation through rollout helper', () => {
  it('L162 generates a standalone tray L2-shape', () => {
    const { req } = reqFor(162);
    const lvl = generateLevel(req as never, makeProductionSeed(162));
    expect(lvl.cupConstraints.filter((c) => c.sharedCapacityGroup === 'tea-tray').length).toBe(2);
    expect(lvl.cups.length).toBe(6);
    expect(lvl.cups.map((c) => c.length).sort((a, b) => a - b)).toEqual([0, 2, 3, 3, 4, 4]);
  });

  it('L242 generates a tray level under the same contract', () => {
    const { req } = reqFor(242);
    const lvl = generateLevel(req as never, makeProductionSeed(242));
    expect(lvl.cupConstraints.filter((c) => c.sharedCapacityGroup === 'tea-tray').length).toBe(2);
  });
});

describe('plan sweep 155–1500: tray only challenge-phase standalone', () => {
  it('every shared-tray plan past 154 is a standalone challenge slot', () => {
    const hits: number[] = [];
    for (let l = 155; l <= 1500; l++) {
      const plan = mechanicPlanForLevel(l) as unknown as Record<string, boolean | undefined>;
      if (plan.sharedTray) {
        hits.push(l);
        // Standalone: no partner mechanic on the same board.
        expect(plan.servingOrder ?? false).toBe(false);
        expect(plan.mystery ?? false).toBe(false);
        expect(plan.tasting ?? false).toBe(false);
        expect(plan.honey ?? false).toBe(false);
        expect(plan.strainer ?? false).toBe(false);
        expect(plan.blend ?? false).toBe(false);
        expect(plan.frozen ?? false).toBe(false);
        expect(plan.thermos ?? false).toBe(false);
        expect(plan.cinnamon ?? false).toBe(false);
        expect(plan.teaBloom ?? false).toBe(false);
        expect(plan.lemon ?? false).toBe(false);
        expect(plan.teapot ?? false).toBe(false);
        expect(plan.sink ?? false).toBe(false);
        expect(plan.targets ?? false).toBe(false);
        const cfg = getLevelConfig(l);
        expect(cfg.phase).toBe('challenge');
      }
    }
    expect(hits).toContain(162);
    expect(hits).toContain(242);
    console.log(`shared-tray plans 155–1500: [${hits.join(',')}]`);
  });
});

describe('tray + reaction-ID leak (levels 1–170 generation sweep)', () => {
  it('tray count matches plan; no reaction IDs outside blend palettes', () => {
    for (let l = 1; l <= 170; l++) {
      const { cfg, req } = reqFor(l);
      const lvl = generateLevel(req as never, makeProductionSeed(l));
      const flat = lvl.cups.flat() as string[];
      if (!cfg.hasBlend) {
        expect(flat).not.toContain('black_tea');
        expect(flat).not.toContain('milk');
        expect(flat).not.toContain('milk_tea');
      }
      const trayMembers = lvl.cupConstraints.filter((c) => c.sharedCapacityGroup === 'tea-tray').length;
      const wantTray = ((cfg as { hasSharedTray?: boolean }).hasSharedTray ? 2 : 0);
      expect(trayMembers).toBe(wantTray);
    }
  });
});
