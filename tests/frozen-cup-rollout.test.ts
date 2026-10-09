/**
 * Gauntlet 9 §110–114 — frozen-cup rollout pins 65–72 and
 * special-mechanic invariants 1–800.
 *
 * Levels 1–64 stay behaviorally identical (spot-checked, frozen-free);
 * 65–72 introduce the frozen cup on the exact 4c/6v 4,4,4,3,1,0 challenge
 * topology (66 with the first-encounter tutorial, 70 without a repeat —
 * tutorial display itself is App-level, keyed on currentLevel 66); 1–800
 * obey max-2-specials with frozen cup counting as one standalone special,
 * forbid ice combinations and triples, keep frozen cup on challenge only,
 * and cap vessels at 7.
 */
import { describe, expect, it } from 'vitest';
import type { PuzzleState, TeaId } from '../src/game/types';
import { getLevelConfig, mechanicPlanForLevel } from '../src/utils/difficultyCurve';
import {
  analyzeIceParticipation,
  createGenerateStats,
  frozenCupTemplateKindFor,
  generateLevel,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import { isPuzzleWonState } from '../src/game/logic/rules';
import { FROZEN_CUP_DEPTH_ACCEPT } from '../src/game/logic/frozenCupTemplates';

function requestFromConfig(levelNum: number): GenerateRequest {
  const cfg = getLevelConfig(levelNum);
  return {
    numColors: cfg.numColors,
    colors: cfg.colors,
    emptyCups: cfg.emptyCups,
    hasMysteryLayer: cfg.hasMysteryLayer,
    phase: cfg.phase,
    sourceOnlyCount: cfg.hasSourceOnlyTeapot ? 1 : 0,
    sinkOnlyCount: cfg.hasSinkGuestCup ? 1 : 0,
    tastingCupCount: cfg.hasTastingBowl ? 1 : 0,
    floatingIngredient: cfg.floatingIngredient,
    hasStrainer: cfg.hasStrainer,
    sinkingIngredient: cfg.sinkingIngredient,
    frozenCupCount: cfg.hasFrozenCup ? 1 : 0,
    targetTeaIds: [...cfg.targetTeaIds],
  };
}

describe('rollout 1–64 unchanged (frozen-free spot-check)', () => {
  it('pins pre-G9 mechanics exactly and never carries ice', () => {
    const expectations: Array<[number, string, number]> = [
      [6, 'challenge', 6],
      [10, 'challenge', 6],
      [18, 'challenge', 6],
      [26, 'challenge', 6],
      [34, 'challenge', 6],
      [42, 'challenge', 5],
      [50, 'challenge', 6],
      [58, 'challenge', 6],
    ];
    for (const [lvl, phase, total] of expectations) {
      const cfg = getLevelConfig(lvl);
      expect(cfg.phase).toBe(phase);
      expect(cfg.totalCups).toBe(total);
      expect(cfg.hasFrozenCup).toBe(false);
      expect(mechanicPlanForLevel(lvl).frozen).toBe(false);
    }
    for (let lvl = 1; lvl <= 64; lvl++) {
      expect(mechanicPlanForLevel(lvl).frozen).toBe(false);
      expect(getLevelConfig(lvl).hasFrozenCup).toBe(false);
    }
  });
});

describe('rollout 65–72 (Gauntlet 9 frozen-cup introduction)', () => {
  it('pins the exact specified mechanic mix + subtitles', () => {
    const expectations: Array<[number, boolean, boolean, string, number, string]> = [
      // lvl, frozen, mystery, phase, totalCups, subtitle fragment
      [65, false, false, 'warmup', 5, 'медитативный'],
      [66, true, false, 'challenge', 6, 'Замёрзшая чашка'],
      [67, false, true, 'peak', 7, 'Лимон и таинственный настой'],
      [68, false, false, 'relax', 5, 'Выдох'],
      [69, false, false, 'warmup', 5, 'медитативный'],
      [70, true, false, 'challenge', 6, 'Замёрзшая чашка'],
      [71, false, true, 'peak', 7, 'таинственный настой'],
      [72, false, false, 'relax', 5, 'Выдох'],
    ];
    for (const [lvl, frozen, mystery, phase, total, sub] of expectations) {
      const cfg = getLevelConfig(lvl);
      expect(cfg.hasFrozenCup).toBe(frozen);
      expect(cfg.hasMysteryLayer).toBe(mystery);
      expect(cfg.phase).toBe(phase);
      expect(cfg.totalCups).toBe(total);
      expect(cfg.phaseSubtitle).toContain(sub);
      expect(cfg.hasSourceOnlyTeapot).toBe(false);
      expect(cfg.hasSinkGuestCup).toBe(false);
      expect(cfg.hasTastingBowl).toBe(false);
      expect(cfg.hasStrainer).toBe(false);
      expect(cfg.floatingIngredient).toBe(lvl === 67 ? 'lemon' : undefined);
      expect(cfg.sinkingIngredient).toBe(lvl === 71 ? 'honey' : undefined);
      expect(cfg.targetTeaIds).toEqual([]);
    }
    const CLEAN = {
      teapot: false,
      targets: false,
      sink: false,
      tasting: false,
      lemon: false,
      strainer: false,
      honey: false,
      frozen: false,
      thermos: false,
    };
    expect(mechanicPlanForLevel(65)).toEqual({ ...CLEAN });
    expect(mechanicPlanForLevel(66)).toEqual({ ...CLEAN, frozen: true });
    expect(mechanicPlanForLevel(67)).toEqual({ ...CLEAN, lemon: true });
    expect(mechanicPlanForLevel(68)).toEqual({ ...CLEAN });
    expect(mechanicPlanForLevel(69)).toEqual({ ...CLEAN });
    expect(mechanicPlanForLevel(70)).toEqual({ ...CLEAN, frozen: true });
    expect(mechanicPlanForLevel(71)).toEqual({ ...CLEAN, honey: true });
    expect(mechanicPlanForLevel(72)).toEqual({ ...CLEAN });
  });

  it('levels 66/70 are 4c/6v frozen challenges with sea_buckthorn and the product copy', () => {
    for (const lvl of [66, 70]) {
      const cfg = getLevelConfig(lvl);
      expect([cfg.numColors, cfg.totalCups, cfg.emptyCups]).toEqual([4, 6, 2]);
      expect(cfg.hasMysteryLayer).toBe(false);
      expect(cfg.hasFrozenCup).toBe(true);
      expect(cfg.colors).toContain('sea_buckthorn');
      expect(cfg.phaseSubtitle).toBe('Замёрзшая чашка • 6 сосудов');
    }
    // 66 is the FIRST frozen level, so the App-level first-encounter
    // tutorial (shown only when currentLevel === 66) fires exactly once.
    for (let lvl = 1; lvl < 66; lvl++) {
      expect(getLevelConfig(lvl).hasFrozenCup).toBe(false);
    }
    // 70 repeats the identical config — same subtitle, NO tutorial repeat
    // (suppression is App-level: the banner renders only on level 66).
    expect(getLevelConfig(70).phaseSubtitle).toBe(getLevelConfig(66).phaseSubtitle);
  });
});

describe('rollout frozen generation (levels 66/70 via getLevelConfig)', () => {
  it.each([66, 70])('level %i generates a solver-valid L2 frozen level in-band', (lvlNum) => {
    const req = requestFromConfig(lvlNum);
    expect(req.frozenCupCount).toBe(1);
    expect(frozenCupTemplateKindFor(req)).toBe('frozen-cup');
    const stats = createGenerateStats();
    const lvl = generateLevel(req, `frozen-rollout:${lvlNum}`, { stats });
    expect(stats.candidatesTried).toBe(0);
    expect(stats.usedFallback).toBe(false);
    expect(validateLevelStructure(lvl, req).ok).toBe(true);
    // Authored 4,4,4,3,1,0 shape with one SB-on-top frozen host.
    const lens = lvl.cups.map((c) => c.length).sort((a, b) => a - b);
    expect(lens).toEqual([0, 1, 3, 4, 4, 4]);
    expect((lvl.iceSlots ?? []).filter((s) => s === 'ice')).toHaveLength(1);
    const solved = solvePuzzle(lvl.cups, {
      cupConstraints: lvl.cupConstraints,
      floatingIngredients: lvl.floatingIngredients,
      iceSlots: lvl.iceSlots,
    });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated).not.toBe(true);
    expect(solved.minMoves).toBe(lvl.minMoves);
    expect(lvl.minMoves).toBeGreaterThanOrEqual(FROZEN_CUP_DEPTH_ACCEPT.min);
    expect(lvl.minMoves).toBeLessThanOrEqual(FROZEN_CUP_DEPTH_ACCEPT.max);
    const host = (lvl.iceSlots ?? []).findIndex((s) => s === 'ice');
    const trace = analyzeIceParticipation(
      lvl.cups,
      lvl.iceSlots ?? [],
      host,
      (solved.solution ?? []) as never[],
      lvl.cupConstraints,
    );
    expect(trace.melts).toBeGreaterThanOrEqual(1);
    expect(trace.sourceUses).toBeGreaterThanOrEqual(1);
    expect(trace.finalIceCleared).toBe(true);
    expect(trace.win).toBe(true);
    const final = applySolutionState(
      { cups: lvl.cups, floatingIngredients: lvl.floatingIngredients, iceSlots: lvl.iceSlots },
      solved.solution ?? [],
      lvl.cupConstraints,
    );
    expect(final).not.toBe(null);
    expect(isPuzzleWonState(final as PuzzleState, lvl.cupConstraints)).toBe(true);
    expect((final as PuzzleState).iceSlots.every((s) => s === null)).toBe(true);
  }, 120000);
});

describe('rollout invariants 1–800', () => {
  it('warmup/relax clean; max 2 specials incl. frozen; no ice combos/triples; <=7 vessels', () => {
    for (let lvl = 1; lvl <= 800; lvl++) {
      const cfg = getLevelConfig(lvl);
      // Special categories: mystery, teapot, sink, targets (pair = ONE),
      // tasting, lemon, strainer, honey, frozen cup. Lemon+honey counts as TWO.
      const specials = [
        cfg.hasSourceOnlyTeapot,
        cfg.hasSinkGuestCup,
        cfg.targetTeaIds.length > 0,
        cfg.hasMysteryLayer,
        cfg.hasTastingBowl,
        cfg.floatingIngredient !== undefined,
        cfg.hasStrainer,
        cfg.sinkingIngredient !== undefined,
        cfg.hasFrozenCup,
      ].filter(Boolean).length;
      expect(specials).toBeLessThanOrEqual(2);
      // Frozen cup is standalone: never combined, challenge only, 6 vessels.
      if (cfg.hasFrozenCup) {
        expect(cfg.phase).toBe('challenge');
        expect(cfg.hasMysteryLayer).toBe(false);
        expect(cfg.hasSourceOnlyTeapot).toBe(false);
        expect(cfg.hasSinkGuestCup).toBe(false);
        expect(cfg.hasTastingBowl).toBe(false);
        expect(cfg.floatingIngredient).toBe(undefined);
        expect(cfg.hasStrainer).toBe(false);
        expect(cfg.sinkingIngredient).toBe(undefined);
        expect(cfg.targetTeaIds).toEqual([]);
        expect(cfg.totalCups).toBe(6);
        expect(cfg.numColors).toBe(4);
        expect(cfg.colors).toContain('sea_buckthorn');
      }
      // Interaction carve-out (G8) unchanged.
      if (cfg.floatingIngredient !== undefined && cfg.sinkingIngredient !== undefined) {
        expect(cfg.floatingIngredient).toBe('lemon');
        expect(cfg.sinkingIngredient).toBe('honey');
        expect(cfg.phase).toBe('challenge');
        expect(cfg.hasMysteryLayer).toBe(false);
        expect(cfg.hasSourceOnlyTeapot).toBe(false);
        expect(cfg.hasSinkGuestCup).toBe(false);
        expect(cfg.hasTastingBowl).toBe(false);
        expect(cfg.hasStrainer).toBe(false);
        expect(cfg.hasFrozenCup).toBe(false);
        expect(cfg.targetTeaIds).toEqual([]);
      }
      // Frozen exclusives vs every sibling mechanic.
      expect(cfg.hasFrozenCup && cfg.hasStrainer).toBe(false);
      expect(cfg.hasFrozenCup && cfg.floatingIngredient !== undefined).toBe(false);
      expect(cfg.hasFrozenCup && cfg.sinkingIngredient !== undefined).toBe(false);
      expect(cfg.hasFrozenCup && cfg.hasSinkGuestCup).toBe(false);
      expect(cfg.hasFrozenCup && cfg.hasTastingBowl).toBe(false);
      expect(cfg.hasFrozenCup && cfg.targetTeaIds.length > 0).toBe(false);
      expect(cfg.hasFrozenCup && cfg.hasSourceOnlyTeapot).toBe(false);
      expect(cfg.hasFrozenCup && cfg.hasMysteryLayer).toBe(false);
      // Pre-existing exclusives still hold.
      expect(cfg.sinkingIngredient !== undefined && cfg.hasStrainer).toBe(false);
      expect(cfg.hasStrainer && cfg.floatingIngredient !== undefined).toBe(false);
      expect(cfg.hasSinkGuestCup && cfg.targetTeaIds.length > 0).toBe(false);
      expect(cfg.floatingIngredient !== undefined && cfg.targetTeaIds.length > 0).toBe(false);
      expect(cfg.totalCups).toBeLessThanOrEqual(7);
      if (cfg.phase === 'warmup' || cfg.phase === 'relax') {
        expect(cfg.hasSourceOnlyTeapot).toBe(false);
        expect(cfg.hasSinkGuestCup).toBe(false);
        expect(cfg.hasTastingBowl).toBe(false);
        expect(cfg.floatingIngredient).toBe(undefined);
        expect(cfg.sinkingIngredient).toBe(undefined);
        expect(cfg.hasStrainer).toBe(false);
        expect(cfg.hasFrozenCup).toBe(false);
        expect(cfg.targetTeaIds).toEqual([]);
        expect(cfg.hasMysteryLayer).toBe(false);
      }
    }
  });

  it('post-72 rotation serves frozen cup on challenge without forbidden combos', () => {
    const seenChallenge = new Set<string>();
    for (let lvl = 73; lvl <= 400; lvl++) {
      const cfg = getLevelConfig(lvl);
      if (cfg.phase !== 'challenge') continue;
      const key = [
        cfg.hasSourceOnlyTeapot ? 'teapot' : '',
        cfg.hasSinkGuestCup ? 'sink' : '',
        cfg.targetTeaIds.length > 0 ? 'targets' : '',
        cfg.hasTastingBowl ? 'tasting' : '',
        cfg.floatingIngredient ?? '',
        cfg.hasStrainer ? 'strainer' : '',
        cfg.sinkingIngredient ?? '',
        cfg.hasFrozenCup ? 'frozen' : '',
      ].filter(Boolean).join('+');
      seenChallenge.add(key || 'clean');
    }
    expect(seenChallenge.has('frozen')).toBe(true);
  });
});
