/**
 * Gauntlet 10 — thermos rollout pins 73–80 and special-mechanic
 * invariants 1–900.
 *
 * Levels 1–72 stay behaviorally identical (spot-checked, thermos-free,
 * frozen 66/70 preserved); 73–80 introduce the high thermos on the exact
 * 4c/6v 4,4,3,3,2,0 challenge topology (74 with the first-encounter
 * tutorial, 78 without a repeat — tutorial display itself is App-level,
 * keyed on currentLevel 74); 1–900 obey max-2-specials with the thermos
 * counting as one standalone special, forbid thermos combinations and
 * triples, keep the thermos on challenge only, and cap vessels at 7.
 */
import { describe, expect, it } from 'vitest';
import type { PuzzleState } from '../src/game/types';
import { getLevelConfig, mechanicPlanForLevel } from '../src/utils/difficultyCurve';
import {
  analyzeThermosParticipation,
  createGenerateStats,
  thermosTemplateKindFor,
  generateLevel,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import { isPuzzleWonState } from '../src/game/logic/rules';
import { THERMOS_DEPTH_ACCEPT } from '../src/game/logic/thermosTemplates';

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
    thermosCupCount: cfg.hasThermos ? 1 : 0,
    targetTeaIds: [...cfg.targetTeaIds],
  };
}

describe('rollout 1–72 unchanged (thermos-free spot-check)', () => {
  it('pins pre-G10 mechanics exactly and never carries a thermos', () => {
    const expectations: Array<[number, string, number]> = [
      [6, 'challenge', 6],
      [10, 'challenge', 6],
      [18, 'challenge', 6],
      [26, 'challenge', 6],
      [34, 'challenge', 6],
      [42, 'challenge', 5],
      [50, 'challenge', 6],
      [58, 'challenge', 6],
      [66, 'challenge', 6],
      [70, 'challenge', 6],
    ];
    for (const [lvl, phase, total] of expectations) {
      const cfg = getLevelConfig(lvl);
      expect(cfg.phase).toBe(phase);
      expect(cfg.totalCups).toBe(total);
      expect(cfg.hasThermos).toBe(false);
      expect(mechanicPlanForLevel(lvl).thermos).toBe(false);
    }
    // Frozen introduction preserved through G10.
    expect(getLevelConfig(66).hasFrozenCup).toBe(true);
    expect(getLevelConfig(70).hasFrozenCup).toBe(true);
    for (let lvl = 1; lvl <= 72; lvl++) {
      expect(mechanicPlanForLevel(lvl).thermos).toBe(false);
      expect(getLevelConfig(lvl).hasThermos).toBe(false);
    }
  });
});

describe('rollout 73–80 (Gauntlet 10 thermos introduction)', () => {
  it('pins the exact specified mechanic mix + subtitles', () => {
    const expectations: Array<[number, boolean, boolean, string, number, string]> = [
      // lvl, thermos, mystery, phase, totalCups, subtitle fragment
      [73, false, false, 'warmup', 5, 'медитативный'],
      [74, true, false, 'challenge', 6, 'Высокий термос'],
      [75, false, true, 'peak', 6, 'Ситечко'],
      [76, false, false, 'relax', 5, 'Выдох'],
      [77, false, false, 'warmup', 5, 'медитативный'],
      [78, true, false, 'challenge', 6, 'Высокий термос'],
      [79, false, true, 'peak', 7, 'Мёд'],
      [80, false, false, 'relax', 5, 'Выдох'],
    ];
    for (const [lvl, thermos, mystery, phase, total, sub] of expectations) {
      const cfg = getLevelConfig(lvl);
      expect(cfg.hasThermos).toBe(thermos);
      expect(cfg.hasMysteryLayer).toBe(mystery);
      expect(cfg.phase).toBe(phase);
      expect(cfg.totalCups).toBe(total);
      expect(cfg.phaseSubtitle).toContain(sub);
      expect(cfg.hasSourceOnlyTeapot).toBe(false);
      expect(cfg.hasSinkGuestCup).toBe(false);
      expect(cfg.hasTastingBowl).toBe(false);
      expect(cfg.floatingIngredient).toBe(undefined);
      expect(cfg.sinkingIngredient).toBe(lvl === 79 ? 'honey' : undefined);
      expect(cfg.hasFrozenCup).toBe(false);
      expect(cfg.targetTeaIds).toEqual([]);
    }
    expect(getLevelConfig(75).hasStrainer).toBe(true);
    expect(getLevelConfig(79).sinkingIngredient).toBe('honey');
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
      cinnamon: false, teaBloom: false, blend: false,
    };
    expect(mechanicPlanForLevel(73)).toEqual({ ...CLEAN });
    expect(mechanicPlanForLevel(74)).toEqual({ ...CLEAN, thermos: true });
    expect(mechanicPlanForLevel(75)).toEqual({ ...CLEAN, strainer: true });
    expect(mechanicPlanForLevel(76)).toEqual({ ...CLEAN });
    expect(mechanicPlanForLevel(77)).toEqual({ ...CLEAN });
    expect(mechanicPlanForLevel(78)).toEqual({ ...CLEAN, thermos: true });
    expect(mechanicPlanForLevel(79)).toEqual({ ...CLEAN, honey: true });
    expect(mechanicPlanForLevel(80)).toEqual({ ...CLEAN });
  });

  it('levels 74/78 are 4c/6v thermos challenges (74 first, 78 no tutorial repeat)', () => {
    for (const lvl of [74, 78]) {
      const cfg = getLevelConfig(lvl);
      expect([cfg.numColors, cfg.totalCups, cfg.emptyCups]).toEqual([4, 6, 2]);
      expect(cfg.hasMysteryLayer).toBe(false);
      expect(cfg.hasThermos).toBe(true);
      expect(cfg.phaseSubtitle).toBe('Высокий термос • 6 сосудов');
    }
    // 74 is the FIRST thermos level, so the App-level first-encounter
    // tutorial (shown only when currentLevel === 74) fires exactly once.
    for (let lvl = 1; lvl < 74; lvl++) {
      expect(getLevelConfig(lvl).hasThermos).toBe(false);
    }
    // 78 repeats the identical config — same subtitle, NO tutorial repeat
    // (suppression is App-level: the banner renders only on level 74).
    expect(getLevelConfig(78).phaseSubtitle).toBe(getLevelConfig(74).phaseSubtitle);
  });
});

describe('rollout thermos generation (levels 74/78 via getLevelConfig)', () => {
  it.each([74, 78])('level %i generates a solver-valid L2 thermos level in-band', (lvlNum) => {
    const req = requestFromConfig(lvlNum);
    expect(req.thermosCupCount).toBe(1);
    expect(thermosTemplateKindFor(req)).toBe('thermos');
    const stats = createGenerateStats();
    const lvl = generateLevel(req, `thermos-rollout:${lvlNum}`, { stats });
    expect(stats.candidatesTried).toBe(0);
    expect(stats.usedFallback).toBe(false);
    expect(validateLevelStructure(lvl, req).ok).toBe(true);
    // Authored 4,4,3,3,2,0 shape with a mixed top-once T3 thermos.
    const lens = lvl.cups.map((c) => c.length).sort((a, b) => a - b);
    expect(lens).toEqual([0, 2, 3, 3, 4, 4]);
    const host = lvl.cupConstraints.findIndex(
      (c) => c.mode === 'normal' && c.capacity === 5 && c.mustEndEmpty === true,
    );
    expect(host).toBeGreaterThanOrEqual(0);
    const hostCup = lvl.cups[host] as string[];
    expect(hostCup).toHaveLength(3);
    expect(new Set(hostCup).size).toBeGreaterThan(1);
    const solved = solvePuzzle(lvl.cups, {
      cupConstraints: lvl.cupConstraints,
      floatingIngredients: lvl.floatingIngredients,
    });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated ?? false).toBe(false);
    expect(solved.minMoves).toBe(lvl.minMoves);
    expect(lvl.minMoves).toBeGreaterThanOrEqual(THERMOS_DEPTH_ACCEPT.min);
    expect(lvl.minMoves).toBeLessThanOrEqual(THERMOS_DEPTH_ACCEPT.max);
    const trace = analyzeThermosParticipation(
      lvl.cups,
      host,
      (solved.solution ?? []) as never[],
      lvl.cupConstraints,
    );
    expect(trace.fifthSlotUses).toBeGreaterThanOrEqual(1);
    expect(trace.drainsAfterFifth).toBeGreaterThanOrEqual(1);
    expect(trace.finalThermosEmpty).toBe(true);
    expect(trace.win).toBe(true);
    const final = applySolutionState(
      { cups: lvl.cups, floatingIngredients: lvl.floatingIngredients },
      solved.solution ?? [],
      lvl.cupConstraints,
    );
    expect(final).not.toBe(null);
    expect(isPuzzleWonState(final as PuzzleState, lvl.cupConstraints)).toBe(true);
    expect((final as PuzzleState).cups[host]).toEqual([]);
  }, 120000);
});

describe('rollout invariants 1–900', () => {
  it('warmup/relax clean; max 2 specials incl. thermos; no thermos combos/triples; <=7 vessels', () => {
    for (let lvl = 1; lvl <= 900; lvl++) {
      const cfg = getLevelConfig(lvl);
      // Special categories: mystery, teapot, sink, targets (pair = ONE),
      // tasting, lemon, strainer, honey, frozen cup, thermos.
      // Lemon+honey counts as TWO.
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
        cfg.hasThermos,
      ].filter(Boolean).length;
      expect(specials).toBeLessThanOrEqual(2);
      // Thermos is standalone: never combined, challenge only, 6 vessels.
      if (cfg.hasThermos) {
        expect(cfg.phase).toBe('challenge');
        expect(cfg.hasMysteryLayer).toBe(false);
        expect(cfg.hasSourceOnlyTeapot).toBe(false);
        expect(cfg.hasSinkGuestCup).toBe(false);
        expect(cfg.hasTastingBowl).toBe(false);
        expect(cfg.floatingIngredient).toBe(undefined);
        expect(cfg.hasStrainer).toBe(false);
        expect(cfg.sinkingIngredient).toBe(undefined);
        expect(cfg.hasFrozenCup).toBe(false);
        expect(cfg.targetTeaIds).toEqual([]);
        expect(cfg.totalCups).toBe(6);
        expect(cfg.numColors).toBe(4);
      }
      // Frozen standalone still holds through G10.
      if (cfg.hasFrozenCup) {
        expect(cfg.phase).toBe('challenge');
        expect(cfg.hasThermos).toBe(false);
        expect(cfg.totalCups).toBe(6);
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
        expect(cfg.hasThermos).toBe(false);
        expect(cfg.targetTeaIds).toEqual([]);
      }
      // Thermos exclusives vs every sibling mechanic.
      expect(cfg.hasThermos && cfg.hasStrainer).toBe(false);
      expect(cfg.hasThermos && cfg.floatingIngredient !== undefined).toBe(false);
      expect(cfg.hasThermos && cfg.sinkingIngredient !== undefined).toBe(false);
      expect(cfg.hasThermos && cfg.hasSinkGuestCup).toBe(false);
      expect(cfg.hasThermos && cfg.hasTastingBowl).toBe(false);
      expect(cfg.hasThermos && cfg.targetTeaIds.length > 0).toBe(false);
      expect(cfg.hasThermos && cfg.hasSourceOnlyTeapot).toBe(false);
      expect(cfg.hasThermos && cfg.hasMysteryLayer).toBe(false);
      expect(cfg.hasThermos && cfg.hasFrozenCup).toBe(false);
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
        expect(cfg.hasThermos).toBe(false);
        expect(cfg.targetTeaIds).toEqual([]);
        expect(cfg.hasMysteryLayer).toBe(false);
      }
    }
  });

  it('post-80 rotation serves the thermos standalone on challenge without forbidden combos', () => {
    const seenChallenge = new Set<string>();
    for (let lvl = 81; lvl <= 500; lvl++) {
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
        cfg.hasThermos ? 'thermos' : '',
      ].filter(Boolean).join('+');
      seenChallenge.add(key || 'clean');
    }
    expect(seenChallenge.has('thermos')).toBe(true);
    expect(seenChallenge.has('frozen')).toBe(true);
  });
});
