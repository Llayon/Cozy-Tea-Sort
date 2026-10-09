/**
 * Gauntlet 12 — tea-bloom rollout (§§134-138).
 *
 * Levels 1–88 semantically unchanged. 89 warmup clean, 90 challenge TEA
 * BLOOM (tutorial), 91 peak HONEY+mystery (familiar safe peak), 92 relax
 * clean, 93 warmup clean, 94 challenge TEA BLOOM (no repeat), 95 peak
 * LEMON+mystery (familiar peak), 96 relax clean. Post-96 rotation includes
 * tea bloom challenge-only. Stress through 1100 asserts invariants.
 */
import { describe, expect, it } from 'vitest';
import { getLevelConfig, mechanicPlanForLevel } from '../src/utils/difficultyCurve';
import { generateLevel, type GenerateRequest } from '../src/game/logic/generator';
import { solvePuzzle } from '../src/game/logic/solver';
import { analyzeTeaBloomParticipation } from '../src/game/logic/generator';

describe('levels 1–96 mechanic plan', () => {
  it('1–88 unchanged (cinnamon still at 82/86, no buds)', () => {
    expect(mechanicPlanForLevel(82).cinnamon).toBe(true);
    expect(mechanicPlanForLevel(86).cinnamon).toBe(true);
    for (const lvl of [1, 40, 66, 74, 82, 88]) {
      expect(mechanicPlanForLevel(lvl).teaBloom).toBe(false);
    }
    for (let lvl = 1; lvl <= 88; lvl++) {
      expect(mechanicPlanForLevel(lvl).teaBloom).toBe(false);
    }
  });

  it('89 warmup clean, 90 challenge bloom with tutorial, 91 honey peak, 92 relax clean', () => {
    expect(mechanicPlanForLevel(89)).toEqual(expect.objectContaining({ teaBloom: false }));
    expect(getLevelConfig(89).phase).toBe('warmup');
    expect(mechanicPlanForLevel(90).teaBloom).toBe(true);
    expect(getLevelConfig(90).phase).toBe('challenge');
    expect(getLevelConfig(90).phaseSubtitle).toBe('Чайный бутон • 6 сосудов');
    expect(getLevelConfig(90).hasTeaBloom).toBe(true);
    expect(mechanicPlanForLevel(91)).toEqual(expect.objectContaining({ honey: true, teaBloom: false }));
    expect(getLevelConfig(92).phase).toBe('relax');
    expect(mechanicPlanForLevel(92).teaBloom).toBe(false);
  });

  it('93 warmup clean, 94 challenge bloom no repeat, 95 lemon peak, 96 relax clean', () => {
    expect(getLevelConfig(93).phase).toBe('warmup');
    expect(mechanicPlanForLevel(94).teaBloom).toBe(true);
    expect(getLevelConfig(94).hasTeaBloom).toBe(true);
    expect(getLevelConfig(94).phaseSubtitle).toBe('Чайный бутон • 6 сосудов');
    expect(mechanicPlanForLevel(95)).toEqual(expect.objectContaining({ lemon: true, teaBloom: false }));
    expect(getLevelConfig(96).phase).toBe('relax');
    expect(mechanicPlanForLevel(96).teaBloom).toBe(false);
  });

  it('bloom levels are 4c/6v standalone (no second special, no mystery/teapot)', () => {
    for (const lvl of [90, 94]) {
      const cfg = getLevelConfig(lvl);
      expect(cfg.numColors).toBe(4);
      expect(cfg.emptyCups).toBe(2);
      expect(cfg.totalCups).toBe(6);
      expect(cfg.hasMysteryLayer).toBe(false);
      expect(cfg.hasSourceOnlyTeapot).toBe(false);
      expect(cfg.hasTeaBloom).toBe(true);
      const plan = mechanicPlanForLevel(lvl);
      expect(plan.cinnamon).toBe(false);
      expect(plan.thermos).toBe(false);
      expect(plan.frozen).toBe(false);
      expect(plan.lemon).toBe(false);
      expect(plan.honey).toBe(false);
      expect(plan.strainer).toBe(false);
      expect(plan.sink).toBe(false);
      expect(plan.tasting).toBe(false);
      expect(plan.targets).toBe(false);
      expect(plan.teapot).toBe(false);
    }
  });
});

describe('bloom challenge generation: L90/L94 seed smoke', () => {
  it.each([90, 94])('level %i generates a solvable L2 bud puzzle', (lvl) => {
    const cfg = getLevelConfig(lvl);
    const req: GenerateRequest = {
      numColors: cfg.numColors,
      colors: cfg.colors,
      emptyCups: cfg.emptyCups,
      hasMysteryLayer: cfg.hasMysteryLayer,
      sourceOnlyCount: cfg.hasSourceOnlyTeapot ? 1 : 0,
      phase: cfg.phase,
      teaBudCount: 1,
    };
    const generated = generateLevel(req, `rollout-lvl-${lvl}`, {});
    expect(generated.teaBudSlots?.filter((s) => s !== null).length).toBe(1);
    const host = (generated.teaBudSlots as string[]).findIndex((s) => s === 'tea_bud');
    const solved = solvePuzzle(generated.cups, {
      cupConstraints: generated.cupConstraints,
      floatingIngredients: generated.floatingIngredients,
      teaBudSlots: generated.teaBudSlots,
    });
    expect(solved.solvable).toBe(true);
    expect(solved.minMoves).toBe(generated.minMoves);
    const part = analyzeTeaBloomParticipation(generated.cups, generated.teaBudSlots ?? [], host, solved.solution ?? [], generated.cupConstraints);
    expect(part.blooms).toBeGreaterThanOrEqual(1);
    expect(part.firstReuseDepth).not.toBe(null);
    expect(part.win).toBe(true);
  });
});

describe('rollout stress through 1100: challenge-only, one bud max, standalone, 4c/6v', () => {
  it('validates invariants without full solves (plan + config level)', () => {
    for (let lvl = 1; lvl <= 1100; lvl++) {
      const plan = mechanicPlanForLevel(lvl);
      const cfg = getLevelConfig(lvl);
      if (lvl <= 88) {
        expect(plan.teaBloom).toBe(false);
      }
      if (plan.teaBloom) {
        expect(cfg.numColors).toBe(4);
        expect(cfg.totalCups).toBe(6);
        expect(cfg.hasMysteryLayer).toBe(false);
        expect(cfg.hasSourceOnlyTeapot).toBe(false);
        expect(cfg.phase).toBe('challenge');
        expect(plan.cinnamon).toBe(false);
        expect(plan.thermos).toBe(false);
        expect(plan.frozen).toBe(false);
        expect(plan.lemon).toBe(false);
        expect(plan.honey).toBe(false);
        expect(plan.strainer).toBe(false);
        expect(plan.sink).toBe(false);
        expect(plan.tasting).toBe(false);
        expect(plan.targets).toBe(false);
        expect(plan.teapot).toBe(false);
      }
      const cycle = (lvl - 1) % 4;
      if (cycle === 0 || cycle === 3) {
        // warmup/relax always clean (no bud, no other special).
        expect(plan.teaBloom).toBe(false);
        expect(plan.cinnamon).toBe(false);
        expect(plan.thermos).toBe(false);
        expect(plan.frozen).toBe(false);
        expect(plan.honey).toBe(false);
        expect(plan.lemon).toBe(false);
        expect(plan.strainer).toBe(false);
      }
    }
  }, 30000);

  it('post-96 rotation includes tea bloom as challenge-only', () => {
    let seenBloom = false;
    for (let lvl = 97; lvl <= 200; lvl++) {
      const plan = mechanicPlanForLevel(lvl);
      if (plan.teaBloom) {
        seenBloom = true;
        expect(getLevelConfig(lvl).phase).toBe('challenge');
      }
    }
    expect(seenBloom).toBe(true);
  });
});
